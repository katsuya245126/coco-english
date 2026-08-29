import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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

type AdminClient = SupabaseClient<Database>;

type CompletionFixture = {
  teacherId: string;
  classId: string;
  studentId: string;
  missionId: string;
  assignmentId: string;
  assignmentStudentId: string;
  attemptId: string;
  attemptTurnId: string;
  audioClipId: string;
};

async function createAdminClient(): Promise<AdminClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

async function createFixture(
  admin: AdminClient,
  suffix: string,
): Promise<CompletionFixture> {
  const teacher = await admin
    .from("teacher_profiles")
    .insert({ display_name: `Completion teacher ${suffix}` })
    .select("id")
    .single();
  expect(teacher.error).toBeNull();

  const classroom = await admin
    .from("classes")
    .insert({
      teacher_id: teacher.data!.id,
      name: `Completion class ${suffix}`,
      join_code: `C${suffix}`.slice(0, 12),
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(classroom.error).toBeNull();

  const student = await admin
    .from("students")
    .insert({
      class_id: classroom.data!.id,
      display_name: `Completion student ${suffix}`,
    })
    .select("id")
    .single();
  expect(student.error).toBeNull();

  const mission = await admin
    .from("missions")
    .insert({
      teacher_id: teacher.data!.id,
      title: `Completion mission ${suffix}`,
      target_pattern: "I like cats.",
      topic: "pets",
      level: "elementary",
      required_turns: 1,
      character_id: "default-buddy",
    })
    .select("id")
    .single();
  expect(mission.error).toBeNull();

  const assignment = await admin
    .from("assignments")
    .insert({
      class_id: classroom.data!.id,
      mission_id: mission.data!.id,
      title: `Completion assignment ${suffix}`,
      mission_snapshot: { requiredTurns: 1, turns: [] },
      data_mode: "real",
    })
    .select("id")
    .single();
  expect(assignment.error).toBeNull();

  const assignmentStudent = await admin
    .from("assignment_students")
    .insert({
      assignment_id: assignment.data!.id,
      student_id: student.data!.id,
      status: "started",
    })
    .select("id")
    .single();
  expect(assignmentStudent.error).toBeNull();

  const attempt = await admin
    .from("attempts")
    .insert({
      assignment_student_id: assignmentStudent.data!.id,
      status: "in_progress",
    })
    .select("id")
    .single();
  expect(attempt.error).toBeNull();

  const attemptTurn = await admin
    .from("attempt_turns")
    .insert({
      attempt_id: attempt.data!.id,
      turn_order: 1,
      original_transcript: "I like cats.",
      evaluation: {
        version: "ai-eval-v1",
        outcome: "accepted_original",
        requireRepeat: false,
      },
    })
    .select("id")
    .single();
  expect(attemptTurn.error).toBeNull();

  const audioClip = await admin
    .from("audio_clips")
    .insert({
      attempt_turn_id: attemptTurn.data!.id,
      clip_kind: "original_answer",
      object_key: `test/completion/${suffix}.webm`,
      mime_type: "audio/webm",
      duration_ms: 900,
      byte_size: 100,
      processing_status: "uploaded",
    })
    .select("id")
    .single();
  expect(audioClip.error).toBeNull();

  return {
    teacherId: teacher.data!.id,
    classId: classroom.data!.id,
    studentId: student.data!.id,
    missionId: mission.data!.id,
    assignmentId: assignment.data!.id,
    assignmentStudentId: assignmentStudent.data!.id,
    attemptId: attempt.data!.id,
    attemptTurnId: attemptTurn.data!.id,
    audioClipId: audioClip.data!.id,
  };
}

async function cleanupFixture(
  admin: AdminClient,
  fixture: CompletionFixture,
): Promise<void> {
  await admin.from("assignments").delete().eq("id", fixture.assignmentId);
  await admin.from("missions").delete().eq("id", fixture.missionId);
  await admin.from("classes").delete().eq("id", fixture.classId);
  await admin.from("teacher_profiles").delete().eq("id", fixture.teacherId);
}

async function completeAttempt(
  admin: AdminClient,
  fixture: CompletionFixture,
) {
  return admin.rpc("complete_student_attempt", {
    p_student_id: fixture.studentId,
    p_assignment_student_id: fixture.assignmentStudentId,
    p_attempt_id: fixture.attemptId,
  } as never);
}

describe("completion and cancellation serialization", () => {
  it(
    "keeps cancellation-first incomplete and preserves evidence after completion-first cancellation",
    async (context) => {
      if (!canRunLocally) return context.skip();

      const admin = await createAdminClient();
      const fixtures: CompletionFixture[] = [];

      try {
        const canceledFirst = await createFixture(
          admin,
          randomBytes(12).toString("hex"),
        );
        fixtures.push(canceledFirst);

        const canceled = await admin
          .from("assignments")
          .update({ canceled_at: new Date().toISOString() })
          .eq("id", canceledFirst.assignmentId);
        expect(canceled.error).toBeNull();

        const blocked = await completeAttempt(admin, canceledFirst);
        expect(blocked.error).toBeNull();
        expect(blocked.data).toBe("not_found");

        const blockedState = await Promise.all([
          admin
            .from("assignment_students")
            .select("status")
            .eq("id", canceledFirst.assignmentStudentId)
            .single(),
          admin
            .from("attempts")
            .select("status")
            .eq("id", canceledFirst.attemptId)
            .single(),
          admin
            .from("audio_clips")
            .select("id")
            .eq("id", canceledFirst.audioClipId)
            .single(),
        ]);
        expect(blockedState[0].data?.status).toBe("started");
        expect(blockedState[1].data?.status).toBe("in_progress");
        expect(blockedState[2].data?.id).toBe(canceledFirst.audioClipId);

        const completedFirst = await createFixture(
          admin,
          randomBytes(12).toString("hex"),
        );
        fixtures.push(completedFirst);

        const completed = await completeAttempt(admin, completedFirst);
        expect(completed.error).toBeNull();
        expect(completed.data).toBe("ok");

        const canceledAfterCompletion = await admin
          .from("assignments")
          .update({ canceled_at: new Date().toISOString() })
          .eq("id", completedFirst.assignmentId);
        expect(canceledAfterCompletion.error).toBeNull();

        const preserved = await Promise.all([
          admin
            .from("assignment_students")
            .select("status")
            .eq("id", completedFirst.assignmentStudentId)
            .single(),
          admin
            .from("attempts")
            .select("status, completed_at")
            .eq("id", completedFirst.attemptId)
            .single(),
          admin
            .from("attempt_turns")
            .select("id")
            .eq("id", completedFirst.attemptTurnId)
            .single(),
          admin
            .from("audio_clips")
            .select("id")
            .eq("id", completedFirst.audioClipId)
            .single(),
        ]);
        expect(preserved[0].data?.status).toBe("completed");
        expect(preserved[1].data?.status).toBe("completed");
        expect(preserved[1].data?.completed_at).not.toBeNull();
        expect(preserved[2].data?.id).toBe(completedFirst.attemptTurnId);
        expect(preserved[3].data?.id).toBe(completedFirst.audioClipId);
      } finally {
        for (const fixture of fixtures) {
          await cleanupFixture(admin, fixture);
        }
      }
    },
    30_000,
  );

  it(
    "completes or blocks cleanly when cancellation races without deadlocking",
    async (context) => {
      if (!canRunLocally) return context.skip();

      const admin = await createAdminClient();
      const cancellationClient = await createAdminClient();
      const fixture = await createFixture(
        admin,
        randomBytes(12).toString("hex"),
      );

      try {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const operations = Promise.all([
          completeAttempt(admin, fixture),
          cancellationClient
            .from("assignments")
            .update({ canceled_at: new Date().toISOString() })
            .eq("id", fixture.assignmentId),
        ]);
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("completion/cancellation deadlocked")),
            5_000,
          );
        });

        let result: Awaited<typeof operations>;
        try {
          result = await Promise.race([operations, timeout]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        expect(result[0].error).toBeNull();
        expect(["ok", "not_found"]).toContain(result[0].data);
        expect(result[1].error).toBeNull();

        const finalState = await Promise.all([
          admin
            .from("assignments")
            .select("canceled_at")
            .eq("id", fixture.assignmentId)
            .single(),
          admin
            .from("assignment_students")
            .select("status")
            .eq("id", fixture.assignmentStudentId)
            .single(),
          admin
            .from("attempts")
            .select("status")
            .eq("id", fixture.attemptId)
            .single(),
        ]);
        expect(finalState[0].data?.canceled_at).not.toBeNull();
        expect(["started", "completed"]).toContain(finalState[1].data?.status);
        expect(["in_progress", "completed"]).toContain(finalState[2].data?.status);
      } finally {
        await cleanupFixture(admin, fixture);
      }
    },
    30_000,
  );
});
