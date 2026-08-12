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

async function createAdminClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...noRealtime,
  });
}

async function createFixture() {
  const admin = await createAdminClient();
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
    mission_snapshot: { turns: [] },
  }).select("id").single();
  const completedAt = new Date().toISOString();
  const assignmentStudent = await admin.from("assignment_students").insert({
    assignment_id: assignment.data!.id,
    student_id: student.data!.id,
    status: "completed",
  }).select("id").single();
  const attempt = await admin.from("attempts").insert({
    assignment_student_id: assignmentStudent.data!.id,
    status: "completed",
    completed_at: completedAt,
  }).select("id").single();
  const linked = await admin.from("assignment_students").update({
    latest_attempt_id: attempt.data!.id,
  } as never).eq("id", assignmentStudent.data!.id);

  for (const result of [classroom, student, mission, assignment, assignmentStudent, attempt, linked]) {
    expect(result.error).toBeNull();
  }

  return {
    admin,
    password,
    ownerUser: ownerUser.data.user!,
    otherUser: otherUser.data.user!,
    ownerId: owner.data!.id,
    otherId: other.data!.id,
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
});
