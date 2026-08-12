import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/types";
import { changeAssignedHomework } from "@/server/teacher/assignment-operations";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const canRunLocally =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

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
  const ownerUser = await admin.auth.admin.createUser({ email: `assigned-homework-owner-${suffix}@example.test`, password, email_confirm: true });
  const otherUser = await admin.auth.admin.createUser({ email: `assigned-homework-other-${suffix}@example.test`, password, email_confirm: true });
  expect(ownerUser.error).toBeNull();
  expect(otherUser.error).toBeNull();

  const owner = await admin.from("teacher_profiles").insert({ auth_user_id: ownerUser.data.user!.id, display_name: `Owner ${suffix}` }).select("id").single();
  const other = await admin.from("teacher_profiles").insert({ auth_user_id: otherUser.data.user!.id, display_name: `Other ${suffix}` }).select("id").single();
  expect(owner.error).toBeNull();
  expect(other.error).toBeNull();
  const classroom = await admin.from("classes").insert({ teacher_id: owner.data!.id, name: `Assigned homework class ${suffix}`, join_code: `H${suffix}`.slice(0, 12), data_mode: "real" }).select("id").single();
  const students = await Promise.all(["First", "Second", "Third"].map((name) => admin.from("students").insert({ class_id: classroom.data!.id, display_name: `${name} ${suffix}` }).select("id").single()));
  const mission = await admin.from("missions").insert({ teacher_id: owner.data!.id, title: `Mission ${suffix}`, target_pattern: "I like cats.", topic: "pets", level: "elementary", required_turns: 1, character_id: "default-buddy" }).select("id").single();
  const assignment = await admin.from("assignments").insert({ class_id: classroom.data!.id, mission_id: mission.data!.id, title: `Assignment ${suffix}`, data_mode: "real", mission_snapshot: { turns: [] } }).select("id").single();

  const retryHomework = await admin.from("assignment_students").insert({ assignment_id: assignment.data!.id, student_id: students[0].data!.id, status: "completed" }).select("id").single();
  const retryAttempt = await admin.from("attempts").insert({ assignment_student_id: retryHomework.data!.id, status: "completed", completed_at: new Date().toISOString() }).select("id").single();
  const retryTurn = await admin.from("attempt_turns").insert({ attempt_id: retryAttempt.data!.id, turn_order: 1, original_transcript: "I like cats.", improved_sentence: "I like cats." }).select("id").single();
  await admin.from("assignment_students").update({ latest_attempt_id: retryAttempt.data!.id } as never).eq("id", retryHomework.data!.id);
  const attemptedHomework = await admin.from("assignment_students").insert({ assignment_id: assignment.data!.id, student_id: students[1].data!.id, status: "started" }).select("id").single();
  const inProgressAttempt = await admin.from("attempts").insert({ assignment_student_id: attemptedHomework.data!.id, status: "in_progress" }).select("id").single();
  await admin.from("assignment_students").update({ latest_attempt_id: inProgressAttempt.data!.id } as never).eq("id", attemptedHomework.data!.id);
  const noAttemptHomework = await admin.from("assignment_students").insert({ assignment_id: assignment.data!.id, student_id: students[2].data!.id, status: "assigned" }).select("id").single();

  for (const result of [classroom, ...students, mission, assignment, retryHomework, retryAttempt, retryTurn, attemptedHomework, inProgressAttempt, noAttemptHomework]) expect(result.error).toBeNull();
  return { admin, ownerUser: ownerUser.data.user!, otherUser: otherUser.data.user!, ownerTeacherId: owner.data!.id, otherTeacherId: other.data!.id, retryHomeworkId: retryHomework.data!.id, retryAttemptId: retryAttempt.data!.id, retryTurnId: retryTurn.data!.id, attemptedHomeworkId: attemptedHomework.data!.id, noAttemptHomeworkId: noAttemptHomework.data!.id };
}

async function cleanupFixture(fixture: Fixture) {
  await fixture.admin.from("teacher_profiles").delete().in("id", [fixture.ownerTeacherId, fixture.otherTeacherId]);
  await fixture.admin.auth.admin.deleteUser(fixture.ownerUser.id);
  await fixture.admin.auth.admin.deleteUser(fixture.otherUser.id);
}

describe("teacher assigned homework interface", () => {
  it("owns lifecycle changes and preserves retry evidence", async (context) => {
    if (!canRunLocally) return context.skip();
    const fixture = await createFixture();
    try {
      const eventsBefore = await fixture.admin.from("assignment_status_events").select("id", { count: "exact", head: true }).eq("assignment_student_id", fixture.retryHomeworkId);
      const stateBefore = await fixture.admin.from("assignment_students").select("status, latest_attempt_id").eq("id", fixture.retryHomeworkId).single();
      expect(await changeAssignedHomework({ teacherId: fixture.otherTeacherId, assignedHomeworkId: fixture.retryHomeworkId, action: "request_retry" })).toEqual({ ok: false, error: "not_found" });
      const eventsAfter = await fixture.admin.from("assignment_status_events").select("id", { count: "exact", head: true }).eq("assignment_student_id", fixture.retryHomeworkId);
      const stateAfter = await fixture.admin.from("assignment_students").select("status, latest_attempt_id").eq("id", fixture.retryHomeworkId).single();
      expect(eventsAfter.count).toBe(eventsBefore.count);
      expect(stateAfter.data).toEqual(stateBefore.data);

      expect(await changeAssignedHomework({ teacherId: fixture.ownerTeacherId, assignedHomeworkId: fixture.retryHomeworkId, action: "request_retry", reasonNote: "Please try again" })).toEqual({ ok: true });
      expect((await fixture.admin.from("assignment_students").select("status, latest_attempt_id").eq("id", fixture.retryHomeworkId).single()).data).toEqual({ status: "needs_retry", latest_attempt_id: null });
      expect((await fixture.admin.from("attempts").select("id, status").eq("id", fixture.retryAttemptId).single()).data).toEqual({ id: fixture.retryAttemptId, status: "needs_retry" });
      expect((await fixture.admin.from("attempt_turns").select("id, original_transcript").eq("id", fixture.retryTurnId).single()).data).toEqual({ id: fixture.retryTurnId, original_transcript: "I like cats." });

      for (const assignedHomeworkId of [fixture.attemptedHomeworkId, fixture.noAttemptHomeworkId]) {
        expect(await changeAssignedHomework({ teacherId: fixture.ownerTeacherId, assignedHomeworkId, action: "dismiss" })).toEqual({ ok: true });
        const dismissed = await fixture.admin.from("assignment_students").select("status, dismissed_at" as never).eq("id", assignedHomeworkId).single() as { data: { status: string; dismissed_at: string | null } | null };
        expect(dismissed.data?.dismissed_at).not.toBeNull();
        expect(dismissed.data?.status).toBe(assignedHomeworkId === fixture.attemptedHomeworkId ? "started" : "assigned");
        expect(await changeAssignedHomework({ teacherId: fixture.ownerTeacherId, assignedHomeworkId, action: "undo_dismiss" })).toEqual({ ok: true });
        expect((await fixture.admin.from("assignment_students").select("dismissed_at" as never).eq("id", assignedHomeworkId).single() as { data: { dismissed_at: string | null } | null }).data?.dismissed_at).toBeNull();
      }
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30_000);
});
