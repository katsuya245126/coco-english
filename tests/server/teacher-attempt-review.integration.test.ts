import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";
import { changeAttemptReview } from "@/server/teacher/assignment-operations";

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

type Fixture = Awaited<ReturnType<typeof createFixture>>;
type FixtureKind = "completed" | "eligible_review" | "unfinished_active";

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

async function createFixture(kind: FixtureKind = "completed") {
  const admin = await createAdminClient();
  const active = kind !== "completed";
  const suffix = randomBytes(12).toString("hex");
  const password = "Test-Passw0rd!";
  const ownerUser = await admin.auth.admin.createUser({
    email: `attempt-review-owner-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  const otherUser = await admin.auth.admin.createUser({
    email: `attempt-review-other-${suffix}@example.test`,
    password,
    email_confirm: true,
  });
  expect(ownerUser.error).toBeNull();
  expect(otherUser.error).toBeNull();

  const owner = await admin.from("teacher_profiles").insert({
    auth_user_id: ownerUser.data.user!.id,
    display_name: `Owner ${suffix}`,
  }).select("id").single();
  const other = await admin.from("teacher_profiles").insert({
    auth_user_id: otherUser.data.user!.id,
    display_name: `Other ${suffix}`,
  }).select("id").single();
  expect(owner.error).toBeNull();
  expect(other.error).toBeNull();

  const classroom = await admin.from("classes").insert({
    teacher_id: owner.data!.id,
    name: `Attempt review class ${suffix}`,
    join_code: `R${suffix}`.slice(0, 12),
    data_mode: "real",
  }).select("id").single();
  const student = await admin.from("students").insert({
    class_id: classroom.data!.id,
    display_name: `Student ${suffix}`,
  }).select("id").single();
  const mission = await admin.from("missions").insert({
    teacher_id: owner.data!.id,
    title: `Mission ${suffix}`,
    target_pattern: "I like cats.",
    topic: "pets",
    level: "elementary",
    required_turns: 1,
    character_id: "default-buddy",
  }).select("id").single();
  const assignment = await admin.from("assignments").insert({
    class_id: classroom.data!.id,
    mission_id: mission.data!.id,
    title: `Assignment ${suffix}`,
    data_mode: "real",
    mission_snapshot: active ? { requiredTurns: 1, turns: [] } : { turns: [] },
  }).select("id").single();
  const completedAt = new Date().toISOString();
  const assignmentStudent = await admin.from("assignment_students").insert({
    assignment_id: assignment.data!.id,
    student_id: student.data!.id,
    status: active ? "started" : "completed",
  }).select("id").single();
  const attempt = await admin.from("attempts").insert({
    assignment_student_id: assignmentStudent.data!.id,
    status: active ? "in_progress" : "completed",
    completed_at: active ? null : completedAt,
    needs_review_reason: active ? "ambiguous" : null,
  }).select("id").single();
  const reviewTurn = kind === "eligible_review"
    ? await admin.from("attempt_turns").insert({
      attempt_id: attempt.data!.id,
      turn_order: 1,
      original_transcript: "Maybe.",
      evaluation: {
        kind: "original",
        version: "ai-eval-v1",
        outcome: "teacher_review",
        requireRepeat: false,
      },
    })
    : null;
  const linked = await admin.from("assignment_students").update({
    latest_attempt_id: attempt.data!.id,
  } as never).eq("id", assignmentStudent.data!.id);

  for (const result of [classroom, student, mission, assignment, assignmentStudent, attempt, linked]) {
    expect(result.error).toBeNull();
  }
  if (reviewTurn) expect(reviewTurn.error).toBeNull();

  return {
    admin,
    password,
    ownerUser: ownerUser.data.user!,
    otherUser: otherUser.data.user!,
    ownerId: owner.data!.id,
    otherId: other.data!.id,
    assignmentStudentId: assignmentStudent.data!.id,
    attemptId: attempt.data!.id,
  };
}

async function cleanupFixture(fixture: Fixture) {
  await fixture.admin.from("teacher_profiles").delete().in("id", [
    fixture.ownerId,
    fixture.otherId,
  ]);
  await fixture.admin.auth.admin.deleteUser(fixture.ownerUser.id);
  await fixture.admin.auth.admin.deleteUser(fixture.otherUser.id);
}

describe("teacher attempt review interface", () => {
  it("owns receipt lifecycle and denies direct RPC access", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...noRealtime,
    });
    const authenticatedOwner = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...noRealtime,
    });

    try {
      expect((await authenticatedOwner.auth.signInWithPassword({
        email: fixture.ownerUser.email!,
        password: fixture.password,
      })).error).toBeNull();

      expect(await changeAttemptReview({
        teacherId: fixture.otherId,
        attemptId: fixture.attemptId,
        action: "mark_viewed",
      })).toEqual({ ok: false, error: "not_found" });

      expect(await changeAttemptReview({
        teacherId: fixture.ownerId,
        attemptId: fixture.attemptId,
        action: "mark_viewed",
      })).toEqual({ ok: true });
      const firstReceipt = await fixture.admin.from("submission_review_receipts")
        .select("first_viewed_at, reviewed_at")
        .eq("teacher_id", fixture.ownerId)
        .eq("attempt_id", fixture.attemptId)
        .single();
      expect(firstReceipt.error).toBeNull();
      expect(firstReceipt.data?.first_viewed_at).not.toBeNull();
      const firstViewedAt = firstReceipt.data!.first_viewed_at;

      expect(await changeAttemptReview({
        teacherId: fixture.ownerId,
        attemptId: fixture.attemptId,
        action: "mark_viewed",
      })).toEqual({ ok: true });
      const secondReceipt = await fixture.admin.from("submission_review_receipts")
        .select("first_viewed_at")
        .eq("teacher_id", fixture.ownerId)
        .eq("attempt_id", fixture.attemptId)
        .single();
      expect(secondReceipt.data?.first_viewed_at).toBe(firstViewedAt);

      expect(await changeAttemptReview({
        teacherId: fixture.ownerId,
        attemptId: fixture.attemptId,
        action: "mark_reviewed",
      })).toEqual({ ok: true });
      const reviewedReceipt = await fixture.admin.from("submission_review_receipts")
        .select("reviewed_at")
        .eq("teacher_id", fixture.ownerId)
        .eq("attempt_id", fixture.attemptId)
        .single();
      expect(reviewedReceipt.data?.reviewed_at).not.toBeNull();

      expect(await changeAttemptReview({
        teacherId: fixture.otherId,
        attemptId: fixture.attemptId,
        action: "reopen_review",
      })).toEqual({ ok: false, error: "not_found" });
      expect((await fixture.admin.from("submission_review_receipts")
        .select("reviewed_at")
        .eq("teacher_id", fixture.ownerId)
        .eq("attempt_id", fixture.attemptId)
        .single()).data?.reviewed_at).not.toBeNull();

      expect(await changeAttemptReview({
        teacherId: fixture.ownerId,
        attemptId: fixture.attemptId,
        action: "reopen_review",
      })).toEqual({ ok: true });
      expect((await fixture.admin.from("submission_review_receipts")
        .select("reviewed_at")
        .eq("teacher_id", fixture.ownerId)
        .eq("attempt_id", fixture.attemptId)
        .single()).data?.reviewed_at).toBeNull();
      expect((await fixture.admin.from("submission_review_receipts")
        .select("id")
        .eq("teacher_id", fixture.otherId)
        .eq("attempt_id", fixture.attemptId)).data).toHaveLength(0);

      for (const client of [anon, authenticatedOwner]) {
        expect((await client.rpc("mark_submission_viewed", {
          p_teacher_id: fixture.ownerId,
          p_attempt_id: fixture.attemptId,
        })).error).not.toBeNull();
        expect((await client.rpc("reopen_submission_review", {
          p_teacher_id: fixture.ownerId,
          p_attempt_id: fixture.attemptId,
        })).error).not.toBeNull();
      }
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);

  it("repairs an eligible stranded review but leaves unfinished active work active", async (context) => {
    if (!canRunLocally) return context.skip();
    const eligible = await createFixture("eligible_review");
    const unfinished = await createFixture("unfinished_active");

    try {
      expect(await changeAttemptReview({
        teacherId: eligible.ownerId,
        attemptId: eligible.attemptId,
        action: "mark_reviewed",
      })).toEqual({ ok: true });

      const promotedAssignment = await eligible.admin.from("assignment_students")
        .select("status")
        .eq("id", eligible.assignmentStudentId)
        .single();
      const promotedAttempt = await eligible.admin.from("attempts")
        .select("status, completed_at")
        .eq("id", eligible.attemptId)
        .single();
      expect(promotedAssignment.data?.status).toBe("completed");
      expect(promotedAttempt.data?.status).toBe("completed");
      expect(promotedAttempt.data?.completed_at).not.toBeNull();

      const events = await eligible.admin.from("assignment_status_events")
        .select("previous_status, next_status, reason_code")
        .eq("assignment_student_id", eligible.assignmentStudentId);
      expect(events.data).toEqual(expect.arrayContaining([
        expect.objectContaining({
          previous_status: "started",
          next_status: "teacher_review",
          reason_code: "ambiguous",
        }),
        expect.objectContaining({
          previous_status: "teacher_review",
          next_status: "completed",
          reason_code: "teacher_review_accepted",
        }),
      ]));

      expect(await changeAttemptReview({
        teacherId: unfinished.ownerId,
        attemptId: unfinished.attemptId,
        action: "mark_reviewed",
      })).toEqual({ ok: true });

      const unfinishedAssignment = await unfinished.admin.from("assignment_students")
        .select("status")
        .eq("id", unfinished.assignmentStudentId)
        .single();
      const unfinishedAttempt = await unfinished.admin.from("attempts")
        .select("status")
        .eq("id", unfinished.attemptId)
        .single();
      expect(unfinishedAssignment.data?.status).toBe("started");
      expect(unfinishedAttempt.data?.status).toBe("in_progress");
      const receipt = await unfinished.admin.from("submission_review_receipts")
        .select("reviewed_at")
        .eq("teacher_id", unfinished.ownerId)
        .eq("attempt_id", unfinished.attemptId)
        .single();
      expect(receipt.data?.reviewed_at).not.toBeNull();
    } finally {
      await cleanupFixture(eligible);
      await cleanupFixture(unfinished);
    }
  }, 30_000);
});
