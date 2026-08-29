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

describe("teacher mutation ACL", () => {
  it(
    "denies destructive and evidence writes while preserving owned workflows",
    async (context) => {
      if (!canRunLocally) return context.skip();

      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient<Database>(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const owner = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const other = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );

      const suffix = randomBytes(12).toString("hex");
      const password = "Test-Passw0rd!";
      let ownerUserId: string | null = null;
      let otherUserId: string | null = null;
      let ownerProfileId: string | null = null;
      let otherProfileId: string | null = null;

      try {
        const ownerUser = await admin.auth.admin.createUser({
          email: `mutation-owner-${suffix}@example.test`,
          password,
          email_confirm: true,
        });
        const otherUser = await admin.auth.admin.createUser({
          email: `mutation-other-${suffix}@example.test`,
          password,
          email_confirm: true,
        });
        expect(ownerUser.error).toBeNull();
        expect(otherUser.error).toBeNull();
        ownerUserId = ownerUser.data.user!.id;
        otherUserId = otherUser.data.user!.id;

        const ownerProfile = await admin
          .from("teacher_profiles")
          .insert({
            auth_user_id: ownerUserId,
            display_name: `Mutation owner ${suffix}`,
          })
          .select("id")
          .single();
        const otherProfile = await admin
          .from("teacher_profiles")
          .insert({
            auth_user_id: otherUserId,
            display_name: `Mutation other ${suffix}`,
          })
          .select("id")
          .single();
        expect(ownerProfile.error).toBeNull();
        expect(otherProfile.error).toBeNull();
        ownerProfileId = ownerProfile.data!.id;
        otherProfileId = otherProfile.data!.id;

        const ownerClass = await admin
          .from("classes")
          .insert({
            teacher_id: ownerProfileId,
            name: `Owner class ${suffix}`,
            join_code: `M${suffix}`.slice(0, 12),
            data_mode: "real",
          })
          .select("id")
          .single();
        const otherClass = await admin
          .from("classes")
          .insert({
            teacher_id: otherProfileId,
            name: `Other class ${suffix}`,
            join_code: `N${suffix}`.slice(0, 12),
            data_mode: "real",
          })
          .select("id")
          .single();
        const deleteClass = await admin
          .from("classes")
          .insert({
            teacher_id: ownerProfileId,
            name: `Delete class ${suffix}`,
            join_code: `D${suffix}`.slice(0, 12),
            data_mode: "real",
          })
          .select("id")
          .single();
        expect(ownerClass.error).toBeNull();
        expect(otherClass.error).toBeNull();
        expect(deleteClass.error).toBeNull();

        const ownerStudent = await admin
          .from("students")
          .insert({
            class_id: ownerClass.data!.id,
            display_name: `Owner student ${suffix}`,
          })
          .select("id")
          .single();
        const deleteStudent = await admin
          .from("students")
          .insert({
            class_id: ownerClass.data!.id,
            display_name: `Delete student ${suffix}`,
          })
          .select("id")
          .single();
        expect(ownerStudent.error).toBeNull();
        expect(deleteStudent.error).toBeNull();

        const ownerMission = await admin
          .from("missions")
          .insert({
            teacher_id: ownerProfileId,
            title: `Owner mission ${suffix}`,
            target_pattern: "I like cats.",
            topic: "pets",
            level: "elementary",
            required_turns: 1,
            character_id: "default-buddy",
          })
          .select("id")
          .single();
        const otherMission = await admin
          .from("missions")
          .insert({
            teacher_id: otherProfileId,
            title: `Other mission ${suffix}`,
            target_pattern: "I like dogs.",
            topic: "pets",
            level: "elementary",
            required_turns: 1,
            character_id: "default-buddy",
          })
          .select("id")
          .single();
        const deleteMission = await admin
          .from("missions")
          .insert({
            teacher_id: ownerProfileId,
            title: `Delete mission ${suffix}`,
            target_pattern: "I like birds.",
            topic: "pets",
            level: "elementary",
            required_turns: 1,
            character_id: "default-buddy",
          })
          .select("id")
          .single();
        expect(ownerMission.error).toBeNull();
        expect(otherMission.error).toBeNull();
        expect(deleteMission.error).toBeNull();

        const ownerTurn = await admin
          .from("mission_turn_templates")
          .insert({
            mission_id: ownerMission.data!.id,
            turn_order: 1,
            prompt: "What do you like?",
            target_pattern: "I like cats.",
            target_example: "I like cats.",
            hint_ladder: { tier1: "I like...", tier2: "cats", tier3: "I like cats." },
            answer_shape: "fixed",
          })
          .select("id")
          .single();
        expect(ownerTurn.error).toBeNull();

        const assignment = await admin
          .from("assignments")
          .insert({
            class_id: ownerClass.data!.id,
            mission_id: ownerMission.data!.id,
            title: `Owner assignment ${suffix}`,
            data_mode: "real",
            mission_snapshot: { turns: [] },
          })
          .select("id")
          .single();
        const deleteAssignment = await admin
          .from("assignments")
          .insert({
            class_id: ownerClass.data!.id,
            mission_id: ownerMission.data!.id,
            title: `Delete assignment ${suffix}`,
            data_mode: "real",
            mission_snapshot: { turns: [] },
          })
          .select("id")
          .single();
        expect(assignment.error).toBeNull();
        expect(deleteAssignment.error).toBeNull();

        const assignmentStudent = await admin
          .from("assignment_students")
          .insert({
            assignment_id: assignment.data!.id,
            student_id: ownerStudent.data!.id,
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
        const linkedAttempt = await admin
          .from("assignment_students")
          .update({ latest_attempt_id: attempt.data!.id } as never)
          .eq("id", assignmentStudent.data!.id);
        expect(linkedAttempt.error).toBeNull();
        const attemptTurn = await admin
          .from("attempt_turns")
          .insert({
            attempt_id: attempt.data!.id,
            turn_order: 1,
            original_transcript: "I like cats.",
          })
          .select("id")
          .single();
        expect(attemptTurn.error).toBeNull();
        const audioClip = await admin
          .from("audio_clips")
          .insert({
            attempt_turn_id: attemptTurn.data!.id,
            clip_kind: "original_answer",
            object_key: `test/${suffix}.webm`,
            mime_type: "audio/webm",
            duration_ms: 900,
            byte_size: 100,
            processing_status: "uploaded",
          })
          .select("id")
          .single();
        expect(audioClip.error).toBeNull();
        const score = await admin
          .from("pronunciation_scores")
          .insert({
            audio_clip_id: audioClip.data!.id,
            reference_text: "I like cats.",
            accuracy_score: 90,
            fluency_score: 90,
            completeness_score: 90,
            pronunciation_score: 90,
            star_band: 3,
            word_scores: [],
          } as never)
          .select("audio_clip_id")
          .single();
        const receipt = await admin.from("submission_review_receipts").insert({
          teacher_id: ownerProfileId,
          attempt_id: attempt.data!.id,
          reviewed_at: new Date().toISOString(),
        });
        expect(score.error).toBeNull();
        expect(receipt.error).toBeNull();

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

        expect(
          (await owner.from("classes").delete().eq("id", deleteClass.data!.id)).error,
        ).not.toBeNull();
        expect(
          (await owner.from("students").delete().eq("id", deleteStudent.data!.id)).error,
        ).not.toBeNull();
        expect(
          (await owner.from("missions").delete().eq("id", deleteMission.data!.id)).error,
        ).not.toBeNull();
        expect(
          (await owner.from("assignments").delete().eq("id", deleteAssignment.data!.id)).error,
        ).not.toBeNull();

        for (const client of [owner, other]) {
          const evidenceInsert = await client.from("audio_clips").insert({
            attempt_turn_id: attemptTurn.data!.id,
            clip_kind: "repeat_attempt",
          });
          const evidenceUpdate = await client
            .from("audio_clips")
            .update({ processing_status: "failed" })
            .eq("id", audioClip.data!.id);
          const evidenceDelete = await client
            .from("audio_clips")
            .delete()
            .eq("id", audioClip.data!.id);
          const scoreInsert = await client.from("pronunciation_scores").insert({
            audio_clip_id: audioClip.data!.id,
            reference_text: "I like cats.",
            accuracy_score: 90,
            fluency_score: 90,
            completeness_score: 90,
            pronunciation_score: 90,
            star_band: 3,
            word_scores: [],
          } as never);
          const scoreUpdate = await client
            .from("pronunciation_scores")
            .update({ star_band: 2 } as never)
            .eq("audio_clip_id", audioClip.data!.id);
          const scoreDelete = await client
            .from("pronunciation_scores")
            .delete()
            .eq("audio_clip_id", audioClip.data!.id);

          expect(evidenceInsert.error).not.toBeNull();
          expect(evidenceUpdate.error).not.toBeNull();
          expect(evidenceDelete.error).not.toBeNull();
          expect(scoreInsert.error).not.toBeNull();
          expect(scoreUpdate.error).not.toBeNull();
          expect(scoreDelete.error).not.toBeNull();
        }

        const foreignMissionInsert = await owner.from("assignments").insert({
          class_id: ownerClass.data!.id,
          mission_id: otherMission.data!.id,
          title: `Foreign mission insert ${suffix}`,
          data_mode: "real",
          mission_snapshot: { turns: [] },
        });
        const foreignMissionUpdate = await owner
          .from("assignments")
          .update({ mission_id: otherMission.data!.id })
          .eq("id", assignment.data!.id);
        const reverseForeignInsert = await other.from("assignments").insert({
          class_id: otherClass.data!.id,
          mission_id: ownerMission.data!.id,
          title: `Reverse foreign mission insert ${suffix}`,
          data_mode: "real",
          mission_snapshot: { turns: [] },
        });
        expect(foreignMissionInsert.error).not.toBeNull();
        expect(foreignMissionUpdate.error).not.toBeNull();
        expect(reverseForeignInsert.error).not.toBeNull();

        const validDirectAssignment = await owner
          .from("assignments")
          .insert({
            class_id: ownerClass.data!.id,
            mission_id: ownerMission.data!.id,
            title: `Valid direct assignment ${suffix}`,
            data_mode: "real",
            mission_snapshot: { turns: [] },
          })
          .select("id")
          .single();
        expect(validDirectAssignment.error).toBeNull();

        const validRpcAssignment = await owner.rpc("assign_mission_to_class", {
          p_class_id: ownerClass.data!.id,
          p_mission_id: ownerMission.data!.id,
          p_mission_snapshot: { turns: [] },
          p_due_at: null,
        });
        expect(validRpcAssignment.error).toBeNull();

        const replacedTurns = await owner
          .from("mission_turn_templates")
          .delete()
          .eq("mission_id", ownerMission.data!.id);
        expect(replacedTurns.error).toBeNull();
        const replacementTurn = await owner
          .from("mission_turn_templates")
          .insert({
            mission_id: ownerMission.data!.id,
            turn_order: 1,
            prompt: "What do you like now?",
            target_pattern: "I like dogs.",
            target_example: "I like dogs.",
            hint_ladder: { tier1: "I like...", tier2: "dogs", tier3: "I like dogs." },
            answer_shape: "fixed",
          })
          .select("id")
          .single();
        expect(replacementTurn.error).toBeNull();

        const archived = await owner
          .from("missions")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", ownerMission.data!.id);
        const canceled = await owner
          .from("assignments")
          .update({ canceled_at: new Date().toISOString() })
          .eq("id", assignment.data!.id)
          .eq("mission_id", ownerMission.data!.id);
        expect(archived.error).toBeNull();
        expect(canceled.error).toBeNull();

        const [preservedAssignment, preservedStudent, preservedAttempt, preservedTurn, preservedClip, preservedScore, preservedReceipt] = await Promise.all([
          admin.from("assignments").select("id, canceled_at").eq("id", assignment.data!.id).single(),
          admin.from("assignment_students").select("id").eq("id", assignmentStudent.data!.id).single(),
          admin.from("attempts").select("id").eq("id", attempt.data!.id).single(),
          admin.from("attempt_turns").select("id").eq("id", attemptTurn.data!.id).single(),
          admin.from("audio_clips").select("id").eq("id", audioClip.data!.id).single(),
          admin.from("pronunciation_scores").select("audio_clip_id").eq("audio_clip_id", audioClip.data!.id).single(),
          admin.from("submission_review_receipts").select("attempt_id").eq("attempt_id", attempt.data!.id).single(),
        ]);
        expect(preservedAssignment.data?.id).toBe(assignment.data!.id);
        expect(preservedAssignment.data?.canceled_at).not.toBeNull();
        expect(preservedStudent.data?.id).toBe(assignmentStudent.data!.id);
        expect(preservedAttempt.data?.id).toBe(attempt.data!.id);
        expect(preservedTurn.data?.id).toBe(attemptTurn.data!.id);
        expect(preservedClip.data?.id).toBe(audioClip.data!.id);
        expect((preservedScore.data as { audio_clip_id: string } | null)?.audio_clip_id).toBe(audioClip.data!.id);
        expect(preservedReceipt.data?.attempt_id).toBe(attempt.data!.id);
      } finally {
        if (ownerProfileId || otherProfileId) {
          await admin
            .from("teacher_profiles")
            .delete()
            .in("id", [ownerProfileId, otherProfileId].filter(Boolean) as string[]);
        }
        if (ownerUserId) await admin.auth.admin.deleteUser(ownerUserId);
        if (otherUserId) await admin.auth.admin.deleteUser(otherUserId);
      }
    },
    30_000,
  );
});
