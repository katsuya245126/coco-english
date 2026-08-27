import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const canRunLocally =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

const noRealtime = {
  realtime: {
    transport: class {
      constructor() {}
      close() {}
    } as unknown as never,
  },
};

const execFileAsync = promisify(execFile);

async function runLocalSql(sql: string) {
  await execFileAsync("supabase", ["db", "query", "--local", sql], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024,
  });
}

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(options: {
  assignmentStatus?: Database["public"]["Enums"]["assignment_student_status"];
  attemptStatus?: Database["public"]["Enums"]["attempt_status"];
  canceled?: boolean;
} = {}) {
  const admin = await createAdminClient();
  const suffix = randomBytes(12).toString("hex");
  const teacher = await admin
    .from("teacher_profiles")
    .insert({ display_name: `Hint reveal ${suffix}` })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const classroom = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: `Hint reveal class ${suffix}`,
      join_code: `H${suffix}`.slice(0, 12),
      data_mode: "real",
    })
    .select("id")
    .single();
  const students = await admin
    .from("students")
    .insert([
      { class_id: classroom.data!.id, display_name: `Owner ${suffix}` },
      { class_id: classroom.data!.id, display_name: `Other ${suffix}` },
    ])
    .select("id");
  const mission = await admin
    .from("missions")
    .insert({
      teacher_id: teacher.data!.id,
      title: `Hint reveal mission ${suffix}`,
      target_pattern: "I like cats.",
      topic: "pets",
      level: "elementary",
      required_turns: 1,
      character_id: "default-buddy",
    })
    .select("id")
    .single();
  const assignment = await admin
    .from("assignments")
    .insert({
      class_id: classroom.data!.id,
      mission_id: mission.data!.id,
      title: `Hint reveal assignment ${suffix}`,
      data_mode: "real",
      mission_snapshot: { turns: [] },
      canceled_at: options.canceled ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  const assignmentStudent = await admin
    .from("assignment_students")
    .insert({
      assignment_id: assignment.data!.id,
      student_id: students.data![0].id,
      status: options.assignmentStatus ?? "started",
    })
    .select("id")
    .single();
  const attempt = await admin
    .from("attempts")
    .insert({
      assignment_student_id: assignmentStudent.data!.id,
      status: options.attemptStatus ?? "in_progress",
    })
    .select("id")
    .single();
  const turn = await admin
    .from("attempt_turns")
    .insert({ attempt_id: attempt.data!.id, turn_order: 1 })
    .select("id")
    .single();

  for (const result of [classroom, students, mission, assignment, assignmentStudent, attempt, turn]) {
    expect(result.error).toBeNull();
  }

  return {
    admin,
    teacherId: teacher.data!.id,
    assignmentStudentId: assignmentStudent.data!.id,
    attemptId: attempt.data!.id,
    turnId: turn.data!.id,
    ownerStudentId: students.data![0].id,
    otherStudentId: students.data![1].id,
  };
}

async function cleanupFixture(fixture: Fixture) {
  await fixture.admin
    .from("teacher_profiles")
    .delete()
    .eq("id", fixture.teacherId);
}

function hintArgs(
  fixture: Fixture,
  hintLevel: number,
  overrides: Partial<Database["public"]["Functions"]["record_hint_reveal"]["Args"]> = {},
): Database["public"]["Functions"]["record_hint_reveal"]["Args"] {
  return {
    p_student_id: fixture.ownerStudentId,
    p_assignment_student_id: fixture.assignmentStudentId,
    p_attempt_id: fixture.attemptId,
    p_turn_order: 1,
    p_hint_level: hintLevel,
    ...overrides,
  };
}

async function readLevels(fixture: Fixture) {
  const [turn, assignmentStudent] = await Promise.all([
    fixture.admin
      .from("attempt_turns")
      .select("hint_level_used")
      .eq("id", fixture.turnId)
      .single(),
    fixture.admin
      .from("assignment_students")
      .select("highest_hint_level")
      .eq("id", fixture.assignmentStudentId)
      .single(),
  ]);
  expect(turn.error).toBeNull();
  expect(assignmentStudent.error).toBeNull();
  const assignmentData = assignmentStudent.data as unknown as {
    highest_hint_level: number;
  } | null;
  return {
    turn: turn.data!.hint_level_used,
    assignment: assignmentData!.highest_hint_level,
  };
}

describe("record_hint_reveal database seam", () => {
  const denialTest = canRunLocally ? it : it.skip;

  it("raises both rollups monotonically for sequential reveals", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      for (const hintLevel of [1, 3, 2]) {
        const result = await fixture.admin.rpc(
          "record_hint_reveal",
          hintArgs(fixture, hintLevel),
        );
        expect(result.error).toBeNull();
        expect(result.data).toBe("ok");
      }
      expect(await readLevels(fixture)).toEqual({ turn: 3, assignment: 3 });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("keeps both rollups at the maximum under concurrent completion order", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    const low = await createAdminClient();
    try {
      const results = await Promise.all([
        low.rpc("record_hint_reveal", hintArgs(fixture, 1)),
        fixture.admin.rpc("record_hint_reveal", hintArgs(fixture, 3)),
      ]);
      expect(results.map(({ error }) => error)).toEqual([null, null]);
      expect(results.map(({ data }) => data)).toEqual(["ok", "ok"]);
      expect(await readLevels(fixture)).toEqual({ turn: 3, assignment: 3 });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  denialTest.each([
    ["wrong student", {}, "other"],
    ["canceled assignment", { canceled: true }, "owner"],
    ["inactive assignment", { assignmentStatus: "assigned" }, "owner"],
    ["inactive attempt", { attemptStatus: "completed" }, "owner"],
  ] as const)(
    "denies %s without changing either rollup",
    async (_name, options, student) => {
      const fixture = await createFixture(options);
      try {
        const result = await fixture.admin.rpc(
          "record_hint_reveal",
          hintArgs(fixture, 3, {
            p_student_id:
              student === "other"
                ? fixture.otherStudentId
                : fixture.ownerStudentId,
          }),
        );
        expect(result.error).toBeNull();
        expect(result.data).toBe("not_found");
        expect(await readLevels(fixture)).toEqual({ turn: 0, assignment: 0 });
      } finally {
        await cleanupFixture(fixture);
      }
    },
  );

  it("rejects invalid levels and missing turns without changing either rollup", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      for (const hintLevel of [0, 4]) {
        const result = await fixture.admin.rpc(
          "record_hint_reveal",
          hintArgs(fixture, hintLevel),
        );
        expect(result.error).toBeNull();
        expect(result.data).toBe("invalid_hint_level");
      }
      const missingTurn = await fixture.admin.rpc(
        "record_hint_reveal",
        hintArgs(fixture, 2, { p_turn_order: 2 }),
      );
      expect(missingTurn.error).toBeNull();
      expect(missingTurn.data).toBe("no_turn_row");
      expect(await readLevels(fixture)).toEqual({ turn: 0, assignment: 0 });
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("rolls back the turn update when the assignment rollup fails", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    const constraintName = `test_hint_reveal_${randomBytes(8).toString("hex")}`;
    try {
      await runLocalSql(
        `alter table public.assignment_students add constraint "${constraintName}" check (highest_hint_level <> 3)`,
      );
      const result = await fixture.admin.rpc(
        "record_hint_reveal",
        hintArgs(fixture, 3),
      );
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain(constraintName);
      expect(await readLevels(fixture)).toEqual({ turn: 0, assignment: 0 });
    } finally {
      try {
        await runLocalSql(
          `alter table public.assignment_students drop constraint if exists "${constraintName}"`,
        );
      } finally {
        await cleanupFixture(fixture);
      }
    }
  }, 30_000);

  it("is executable by service_role only", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const anon = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const denied = await anon.rpc(
        "record_hint_reveal",
        hintArgs(fixture, 3),
      );
      expect(denied.error).not.toBeNull();

      const allowed = await fixture.admin.rpc(
        "record_hint_reveal",
        hintArgs(fixture, 3),
      );
      expect(allowed.error).toBeNull();
      expect(allowed.data).toBe("ok");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);
});
