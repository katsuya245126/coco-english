import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database, Json } from "@/lib/db/types";

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

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(options: {
  status?: Database["public"]["Enums"]["assignment_student_status"];
  canceled?: boolean;
  snapshot?: unknown;
} = {}) {
  const admin = await createAdminClient();
  const suffix = randomBytes(12).toString("hex");
  const teacher = await admin
    .from("teacher_profiles")
    .insert({ display_name: `Attempt start ${suffix}` })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const classroom = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: `Attempt start class ${suffix}`,
      join_code: `A${suffix}`.slice(0, 12),
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(classroom.error).toBeNull();

  const students = await admin
    .from("students")
    .insert([
      { class_id: classroom.data!.id, display_name: `Owner ${suffix}` },
      { class_id: classroom.data!.id, display_name: `Other ${suffix}` },
    ])
    .select("id");
  expect(students.error).toBeNull();

  const mission = await admin
    .from("missions")
    .insert({
      teacher_id: teacher.data!.id,
      title: `Attempt start mission ${suffix}`,
      target_pattern: "I like _____.",
      topic: "pets",
      level: "elementary",
      required_turns: 1,
      character_id: "default-buddy",
    })
    .select("id")
    .single();
  expect(mission.error).toBeNull();

  const snapshot =
    options.snapshot ?? {
      missionId: mission.data!.id,
      title: `Attempt start mission ${suffix}`,
      level: "elementary",
      requiredTurns: 1,
      characterId: "default-buddy",
      conversationMode: false,
      requireCompleteSentenceAnswers: true,
      turns: [
        {
          turnOrder: 1,
          prompt: "What do you like?",
          targetPattern: "I like _____.",
          targetExample: "I like cats.",
          hintLadder: {
            tier1: "I like ...",
            tier2: "cats, dogs, pizza",
            tier3: "I like cats.",
          },
          answerShape: "open",
        },
      ],
    };

  const assignment = await admin
    .from("assignments")
    .insert({
      class_id: classroom.data!.id,
      mission_id: mission.data!.id,
      title: `Attempt start assignment ${suffix}`,
      data_mode: "real",
      mission_snapshot: snapshot as Json,
      canceled_at: options.canceled ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  expect(assignment.error).toBeNull();

  const assignmentStudent = await admin
    .from("assignment_students")
    .insert({
      assignment_id: assignment.data!.id,
      student_id: students.data![0].id,
      status: options.status ?? "assigned",
    })
    .select("id")
    .single();
  expect(assignmentStudent.error).toBeNull();

  return {
    admin,
    teacherId: teacher.data!.id,
    assignmentStudentId: assignmentStudent.data!.id,
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

async function readState(fixture: Fixture) {
  const state = await fixture.admin
    .from("assignment_students")
    .select("status, latest_attempt_id, attempt_count")
    .eq("id", fixture.assignmentStudentId)
    .single();
  expect(state.error).toBeNull();
  return state.data!;
}

describe("start_student_attempt RPC", () => {
  it("creates and links one attempt with one audit event, then resumes it idempotently", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const first = await fixture.admin.rpc("start_student_attempt", {
        p_student_id: fixture.ownerStudentId,
        p_assignment_student_id: fixture.assignmentStudentId,
      });
      expect(first.error).toBeNull();
      expect(first.data).toHaveLength(1);
      const firstRow = first.data![0];
      expect(firstRow).toMatchObject({ outcome: "ok", is_resume: false });
      expect(firstRow.attempt_id).toEqual(expect.any(String));

      expect(await readState(fixture)).toMatchObject({
        status: "started",
        latest_attempt_id: firstRow.attempt_id,
        attempt_count: 1,
      });
      const attempts = await fixture.admin
        .from("attempts")
        .select("id, status")
        .eq("assignment_student_id", fixture.assignmentStudentId);
      const events = await fixture.admin
        .from("assignment_status_events")
        .select("previous_status, next_status, actor_type, reason_code")
        .eq("assignment_student_id", fixture.assignmentStudentId);
      expect(attempts.error).toBeNull();
      expect(events.error).toBeNull();
      expect(attempts.data).toEqual([
        { id: firstRow.attempt_id, status: "in_progress" },
      ]);
      expect(events.data).toEqual([
        {
          previous_status: "assigned",
          next_status: "started",
          actor_type: "student_session",
          reason_code: "mission_started",
        },
      ]);

      const resumed = await fixture.admin.rpc("start_student_attempt", {
        p_student_id: fixture.ownerStudentId,
        p_assignment_student_id: fixture.assignmentStudentId,
      });
      expect(resumed.error).toBeNull();
      expect(resumed.data).toEqual([
        { outcome: "ok", attempt_id: firstRow.attempt_id, is_resume: true },
      ]);
      expect(await readState(fixture)).toMatchObject({ attempt_count: 1 });
      expect(
        (
          await fixture.admin
            .from("assignment_status_events")
            .select("id", { count: "exact", head: true })
            .eq("assignment_student_id", fixture.assignmentStudentId)
        ).count,
      ).toBe(1);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("serializes concurrent valid starts to one attempt, count, and event", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const results = await Promise.all(
        [0, 1].map(() =>
          fixture.admin.rpc("start_student_attempt", {
            p_student_id: fixture.ownerStudentId,
            p_assignment_student_id: fixture.assignmentStudentId,
          }),
        ),
      );
      expect(results.every(({ error }) => error === null)).toBe(true);
      const rows = results.map(({ data }) => data?.[0]);
      expect(new Set(rows.map((row) => row?.attempt_id)).size).toBe(1);
      expect(rows.filter((row) => row?.is_resume === false)).toHaveLength(1);
      expect(rows.filter((row) => row?.is_resume === true)).toHaveLength(1);
      expect(await readState(fixture)).toMatchObject({
        status: "started",
        latest_attempt_id: rows[0]?.attempt_id,
        attempt_count: 1,
      });
      expect(
        (
          await fixture.admin
            .from("attempts")
            .select("id", { count: "exact", head: true })
            .eq("assignment_student_id", fixture.assignmentStudentId)
        ).count,
      ).toBe(1);
      expect(
        (
          await fixture.admin
            .from("assignment_status_events")
            .select("id", { count: "exact", head: true })
            .eq("assignment_student_id", fixture.assignmentStudentId)
        ).count,
      ).toBe(1);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  async function expectDenied(
    context: { skip: () => void },
    fixture: Fixture,
    studentId: string,
    outcome: "not_found" | "not_assigned_or_started",
  ) {
    if (!canRunLocally) return context.skip();
    const before = await readState(fixture);
    const result = await fixture.admin.rpc("start_student_attempt", {
      p_student_id: studentId,
      p_assignment_student_id: fixture.assignmentStudentId,
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { outcome, attempt_id: null, is_resume: false },
    ]);
    expect(await readState(fixture)).toEqual(before);
    expect(
      (
        await fixture.admin
          .from("attempts")
          .select("id", { count: "exact", head: true })
          .eq("assignment_student_id", fixture.assignmentStudentId)
      ).count,
    ).toBe(0);
    expect(
      (
        await fixture.admin
          .from("assignment_status_events")
          .select("id", { count: "exact", head: true })
          .eq("assignment_student_id", fixture.assignmentStudentId)
      ).count,
    ).toBe(0);
  }

  it("leaves state unchanged for a wrong student", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      await expectDenied(context, fixture, fixture.otherStudentId, "not_found");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("leaves state unchanged for a canceled assignment", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture({ canceled: true });
    try {
      await expectDenied(context, fixture, fixture.ownerStudentId, "not_found");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("leaves state unchanged for an ineligible status", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture({ status: "completed" });
    try {
      await expectDenied(
        context,
        fixture,
        fixture.ownerStudentId,
        "not_assigned_or_started",
      );
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("leaves state unchanged for an incomplete snapshot", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture({
      snapshot: { requiredTurns: 1, turns: [] },
    });
    try {
      await expectDenied(context, fixture, fixture.ownerStudentId, "not_found");
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("rolls back the inserted attempt when the attempt count overflows", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const updated = await fixture.admin
        .from("assignment_students")
        .update({ attempt_count: 2147483647 } as never)
        .eq("id", fixture.assignmentStudentId);
      expect(updated.error).toBeNull();

      const result = await fixture.admin.rpc("start_student_attempt", {
        p_student_id: fixture.ownerStudentId,
        p_assignment_student_id: fixture.assignmentStudentId,
      });
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
      expect(await readState(fixture)).toMatchObject({
        status: "assigned",
        latest_attempt_id: null,
        attempt_count: 2147483647,
      });
      expect(
        (
          await fixture.admin
            .from("attempts")
            .select("id", { count: "exact", head: true })
            .eq("assignment_student_id", fixture.assignmentStudentId)
        ).count,
      ).toBe(0);
      expect(
        (
          await fixture.admin
            .from("assignment_status_events")
            .select("id", { count: "exact", head: true })
            .eq("assignment_student_id", fixture.assignmentStudentId)
        ).count,
      ).toBe(0);
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("rejects anon RPC calls while allowing the service-role call", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const anon = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      });
      const denied = await anon.rpc("start_student_attempt", {
        p_student_id: fixture.ownerStudentId,
        p_assignment_student_id: fixture.assignmentStudentId,
      });
      expect(denied.error).not.toBeNull();
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);
});
