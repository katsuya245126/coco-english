import { randomBytes } from "node:crypto";
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

describe("RPC-owned assigned-homework workflow tables", () => {
  it("preserves owned reads and denies direct authenticated writes", async (context) => {
    if (!canRunLocally) return context.skip();

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient<Database>(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      },
    );
    const owner = createClient<Database>(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      },
    );
    const other = createClient<Database>(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        ...noRealtime,
      },
    );
    const suffix = randomBytes(12).toString("hex");
    const password = "Test-Passw0rd!";
    const ownerUser = await admin.auth.admin.createUser({
      email: `workflow-owner-${suffix}@example.test`,
      password,
      email_confirm: true,
    });
    const otherUser = await admin.auth.admin.createUser({
      email: `workflow-other-${suffix}@example.test`,
      password,
      email_confirm: true,
    });
    expect(ownerUser.error).toBeNull();
    expect(otherUser.error).toBeNull();

    const ownerProfile = await admin
      .from("teacher_profiles")
      .insert({
        auth_user_id: ownerUser.data.user!.id,
        display_name: "Workflow owner",
      })
      .select("id")
      .single();
    const otherProfile = await admin
      .from("teacher_profiles")
      .insert({
        auth_user_id: otherUser.data.user!.id,
        display_name: "Workflow other",
      })
      .select("id")
      .single();
    expect(ownerProfile.error).toBeNull();
    expect(otherProfile.error).toBeNull();

    try {
      const classroom = await admin
        .from("classes")
        .insert({
          teacher_id: ownerProfile.data!.id,
          name: `Workflow ${suffix}`,
          join_code: `W${suffix}`.slice(0, 12),
          data_mode: "real",
        })
        .select("id")
        .single();
      const students = await admin
        .from("students")
        .insert(
          ["Update", "Insert", "Delete"].map((name) => ({
            class_id: classroom.data!.id,
            display_name: `${name} ${suffix}`,
          })),
        )
        .select("id");
      const mission = await admin
        .from("missions")
        .insert({
          teacher_id: ownerProfile.data!.id,
          title: `Workflow mission ${suffix}`,
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
          title: `Workflow assignment ${suffix}`,
          data_mode: "real",
          mission_snapshot: { turns: [] },
        })
        .select("id")
        .single();
      expect(classroom.error).toBeNull();
      expect(students.error).toBeNull();
      expect(mission.error).toBeNull();
      expect(assignment.error).toBeNull();

      const assigned = await admin
        .from("assignment_students")
        .insert([
          {
            assignment_id: assignment.data!.id,
            student_id: students.data![0].id,
            status: "completed",
          },
          {
            assignment_id: assignment.data!.id,
            student_id: students.data![2].id,
            status: "assigned",
          },
        ])
        .select("id, student_id");
      expect(assigned.error).toBeNull();
      const updateAssignedId = assigned.data!.find(
        (row) => row.student_id === students.data![0].id,
      )!.id;
      const deleteAssignedId = assigned.data!.find(
        (row) => row.student_id === students.data![2].id,
      )!.id;

      const attempts = await admin
        .from("attempts")
        .insert([
          { assignment_student_id: updateAssignedId, status: "completed" },
          { assignment_student_id: updateAssignedId, status: "in_progress" },
          { assignment_student_id: updateAssignedId, status: "in_progress" },
        ])
        .select("id");
      expect(attempts.error).toBeNull();
      const [updateAttempt, deleteAttempt, receiptAttempt] = attempts.data!;
      const linked = await admin
        .from("assignment_students")
        .update({ latest_attempt_id: updateAttempt.id } as never)
        .eq("id", updateAssignedId);
      expect(linked.error).toBeNull();
      const receipt = await admin.from("submission_review_receipts").insert({
        teacher_id: ownerProfile.data!.id,
        attempt_id: updateAttempt.id,
        reviewed_at: new Date().toISOString(),
      });
      expect(receipt.error).toBeNull();
      const event = await admin.from("assignment_status_events").insert({
        assignment_student_id: updateAssignedId,
        next_status: "completed",
        actor_type: "job",
        reason_code: "fixture_completed",
      });
      expect(event.error).toBeNull();

      expect(
        (
          await owner.auth.signInWithPassword({
            email: ownerUser.data.user!.email!,
            password,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await other.auth.signInWithPassword({
            email: otherUser.data.user!.email!,
            password,
          })
        ).error,
      ).toBeNull();

      for (const table of [
        "assignment_students",
        "attempts",
        "assignment_status_events",
        "submission_review_receipts",
      ] as const) {
        const owned = await owner.from(table).select("id");
        const hidden = await other.from(table).select("id");
        expect(owned.error).toBeNull();
        expect(owned.data!.length).toBeGreaterThan(0);
        expect(hidden.error).toBeNull();
        expect(hidden.data).toHaveLength(0);
      }

      const writes = [
        await owner.from("assignment_students").insert({
          assignment_id: assignment.data!.id,
          student_id: students.data![1].id,
        }),
        await owner
          .from("assignment_students")
          .update({ status: "needs_retry" })
          .eq("id", updateAssignedId),
        await owner
          .from("assignment_students")
          .delete()
          .eq("id", deleteAssignedId),
        await owner
          .from("attempts")
          .insert({ assignment_student_id: updateAssignedId }),
        await owner
          .from("attempts")
          .update({ status: "needs_retry" })
          .eq("id", updateAttempt.id),
        await owner.from("attempts").delete().eq("id", deleteAttempt.id),
        await owner.from("assignment_status_events").insert({
          assignment_student_id: updateAssignedId,
          previous_status: "completed",
          next_status: "needs_retry",
          actor_type: "teacher",
          actor_id: ownerProfile.data!.id,
          reason_code: "direct_authenticated_write",
        }),
        await owner.from("submission_review_receipts").insert({
          teacher_id: ownerProfile.data!.id,
          attempt_id: receiptAttempt.id,
        }),
        await owner
          .from("submission_review_receipts")
          .update({ reviewed_at: null })
          .eq("teacher_id", ownerProfile.data!.id)
          .eq("attempt_id", updateAttempt.id),
      ];

      expect(writes.map(({ error }) => error === null)).toEqual(
        Array(writes.length).fill(false),
      );

      const assignedThroughRpc = await owner.rpc("assign_mission_to_class", {
        p_class_id: classroom.data!.id,
        p_mission_id: mission.data!.id,
        p_mission_snapshot: { turns: [] },
        p_due_at: null,
      });
      expect(assignedThroughRpc.error).toBeNull();
      expect(assignedThroughRpc.data?.[0]?.out_active_student_count).toBe(3);

      const retriedThroughRpc = await admin.rpc("request_submission_retry", {
        p_teacher_id: ownerProfile.data!.id,
        p_attempt_id: updateAttempt.id,
        p_reason_note: "integration verification",
      });
      expect(retriedThroughRpc.error).toBeNull();
      expect(retriedThroughRpc.data).toBe("ok");
      expect(
        (
          await admin
            .from("assignment_students")
            .select("status, latest_attempt_id")
            .eq("id", updateAssignedId)
            .single()
        ).data,
      ).toEqual({ status: "needs_retry", latest_attempt_id: null });
    } finally {
      await admin
        .from("teacher_profiles")
        .delete()
        .in("id", [ownerProfile.data!.id, otherProfile.data!.id]);
      await admin.auth.admin.deleteUser(ownerUser.data.user!.id);
      await admin.auth.admin.deleteUser(otherUser.data.user!.id);
    }
  }, 30_000);
});
