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

type OperationArgs =
  Database["public"]["Functions"]["owned_speaking_try_operation"]["Args"];

function operationArgs(
  attemptId: string,
  assignmentStudentId: string,
  studentId: string,
  operation: string,
  payload: Json,
): OperationArgs {
  return {
    p_attempt_id: attemptId,
    p_assignment_student_id: assignmentStudentId,
    p_student_id: studentId,
    p_operation: operation,
    p_payload: payload,
  };
}

describe("owned speaking-try operation RPC", () => {
  it(
    "denies public roles, rejects foreign children, derives keys, and rejects a real status flip",
    async (context) => {
      if (!canRunLocally) {
        context.skip();
        return;
      }

      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient<Database>(
        url,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const anon = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );
      const authenticated = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false }, ...noRealtime },
      );

      const suffix = randomBytes(12).toString("hex");
      const password = "Test-Passw0rd!";
      const email = `speaking-try-rpc-${suffix}@example.test`;
      let userId: string | null = null;
      let classId: string | null = null;
      let teacherProfileId: string | null = null;

      try {
        const createdUser = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        expect(createdUser.error).toBeNull();
        userId = createdUser.data.user?.id ?? null;
        expect(userId).toBeTruthy();

        const signedIn = await authenticated.auth.signInWithPassword({
          email,
          password,
        });
        expect(signedIn.error).toBeNull();

        const deniedArgs = operationArgs(
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000000",
          "00000000-0000-0000-0000-000000000000",
          "load_conversation_turns",
          { turn_order: 1 },
        );
        expect((await anon.rpc("owned_speaking_try_operation", deniedArgs)).error).not.toBeNull();
        expect(
          (await authenticated.rpc("owned_speaking_try_operation", deniedArgs)).error,
        ).not.toBeNull();

        const teacher = await admin
          .from("teacher_profiles")
          .insert({ auth_user_id: userId, display_name: `Speaking try ${suffix}` })
          .select("id")
          .single();
        expect(teacher.error).toBeNull();
        teacherProfileId = teacher.data!.id;

        const classroom = await admin
          .from("classes")
          .insert({
            teacher_id: teacherProfileId,
            name: `Speaking try ${suffix}`,
            join_code: `S${suffix}`.slice(0, 12),
            data_mode: "real",
          })
          .select("id")
          .single();
        expect(classroom.error).toBeNull();
        classId = classroom.data!.id;

        const students = await admin
          .from("students")
          .insert([
            { class_id: classId, display_name: `Owned ${suffix}` },
            { class_id: classId, display_name: `Foreign ${suffix}` },
          ])
          .select("id");
        expect(students.error).toBeNull();

        const mission = await admin
          .from("missions")
          .insert({
            teacher_id: teacherProfileId,
            title: `Speaking try mission ${suffix}`,
            target_pattern: "I like _____.",
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
            class_id: classId,
            mission_id: mission.data!.id,
            title: `Speaking try assignment ${suffix}`,
            data_mode: "real",
            mission_snapshot: { turns: [] },
          })
          .select("id")
          .single();
        expect(assignment.error).toBeNull();

        const assignmentStudents = await admin
          .from("assignment_students")
          .insert([
            {
              assignment_id: assignment.data!.id,
              student_id: students.data![0].id,
              status: "started",
            },
            {
              assignment_id: assignment.data!.id,
              student_id: students.data![1].id,
              status: "started",
            },
          ])
          .select("id, student_id");
        expect(assignmentStudents.error).toBeNull();
        const ownedAssignmentStudent = assignmentStudents.data!.find(
          (row) => row.student_id === students.data![0].id,
        )!;
        const foreignAssignmentStudent = assignmentStudents.data!.find(
          (row) => row.student_id === students.data![1].id,
        )!;

        const attempts = await admin
          .from("attempts")
          .insert([
            {
              assignment_student_id: ownedAssignmentStudent.id,
              status: "in_progress",
            },
            {
              assignment_student_id: foreignAssignmentStudent.id,
              status: "in_progress",
            },
          ])
          .select("id, assignment_student_id");
        expect(attempts.error).toBeNull();
        const ownedAttempt = attempts.data!.find(
          (row) => row.assignment_student_id === ownedAssignmentStudent.id,
        )!;
        const foreignAttempt = attempts.data!.find(
          (row) => row.assignment_student_id === foreignAssignmentStudent.id,
        )!;

        const turns = await admin
          .from("attempt_turns")
          .insert([
            { attempt_id: ownedAttempt.id, turn_order: 1 },
            { attempt_id: foreignAttempt.id, turn_order: 1 },
          ])
          .select("id, attempt_id");
        expect(turns.error).toBeNull();
        const ownedTurn = turns.data!.find(
          (row) => row.attempt_id === ownedAttempt.id,
        )!;
        const foreignTurn = turns.data!.find(
          (row) => row.attempt_id === foreignAttempt.id,
        )!;

        const foreignClip = await admin
          .from("audio_clips")
          .insert({
            attempt_turn_id: foreignTurn.id,
            clip_kind: "original_answer",
            processing_status: "pending_upload",
          })
          .select("id")
          .single();
        expect(foreignClip.error).toBeNull();

        const ownedClip = await admin
          .from("audio_clips")
          .insert({
            attempt_turn_id: ownedTurn.id,
            clip_kind: "original_answer",
            processing_status: "pending_upload",
          })
          .select("id")
          .single();
        expect(ownedClip.error).toBeNull();

        const ownedArgs = (
          operation: string,
          payload: Json,
        ) =>
          operationArgs(
            ownedAttempt.id,
            ownedAssignmentStudent.id,
            students.data![0].id,
            operation,
            payload,
          );

        const foreignTurnInsert = await admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("insert_audio_clip", {
            attempt_turn_id: foreignTurn.id,
            clip_kind: "original_answer",
          }),
        );
        expect(foreignTurnInsert.error).toBeNull();
        expect(foreignTurnInsert.data).toEqual({
          ok: false,
          error: "not_found",
        });

        const foreignClipUpdate = await admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("update_clip", {
            audio_clip_id: foreignClip.data!.id,
            attempt_turn_id: foreignTurn.id,
            mime_type: "audio/webm",
            duration_ms: 1000,
            byte_size: 5,
            processing_status: "failed",
          }),
        );
        expect(foreignClipUpdate.error).toBeNull();
        expect(foreignClipUpdate.data).toEqual({ ok: false, error: "not_found" });

        const foreignStorage = await admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("authorize_storage_upload", {
            audio_clip_id: foreignClip.data!.id,
            attempt_turn_id: foreignTurn.id,
            turn_order: 1,
            clip_kind: "original_answer",
            mime_type: "audio/webm",
          }),
        );
        expect(foreignStorage.error).toBeNull();
        expect(foreignStorage.data).toEqual({ ok: false, error: "not_found" });

        const foreignScore = await admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("write_pronunciation_score", {
            audio_clip_id: foreignClip.data!.id,
            attempt_turn_id: foreignTurn.id,
            reference_text: "I like cats.",
            accuracy_score: 90,
            fluency_score: 90,
            completeness_score: 90,
            pronunciation_score: 90,
            star_band: 3,
            word_scores: [],
          }),
        );
        expect(foreignScore.error).toBeNull();
        expect(foreignScore.data).toEqual({ ok: false, error: "not_found" });

        const storageAuthorization = await admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("authorize_storage_upload", {
            audio_clip_id: ownedClip.data!.id,
            attempt_turn_id: ownedTurn.id,
            turn_order: 1,
            clip_kind: "original_answer",
            mime_type: "audio/webm",
          }),
        );
        expect(storageAuthorization.error).toBeNull();
        expect(storageAuthorization.data).toEqual({
          ok: true,
          value: {
            object_key: `${ownedAssignmentStudent.id}/${ownedAttempt.id}/1/original_answer-${ownedClip.data!.id}.webm`,
          },
        });

        const firstRead = await admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("load_conversation_turns", { turn_order: 2 }),
        );
        expect(firstRead.error).toBeNull();
        expect(firstRead.data).toMatchObject({ ok: true });

        const concurrentOperation = admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("initialize_turn", { turn_order: 2 }),
        );
        const concurrentStatusFlip = admin
          .from("attempts")
          .update({ status: "completed" })
          .eq("id", ownedAttempt.id)
          .eq("status", "in_progress")
          .select("id, status")
          .single();
        const [operationDuringFlip, statusFlip] = await Promise.all([
          concurrentOperation,
          concurrentStatusFlip,
        ]);
        expect(operationDuringFlip.error).toBeNull();
        expect([true, false]).toContain(
          (operationDuringFlip.data as { ok?: unknown } | null)?.ok,
        );
        expect(statusFlip.error).toBeNull();
        expect(statusFlip.data?.status).toBe("completed");

        const afterStatusFlip = await admin.rpc(
          "owned_speaking_try_operation",
          ownedArgs("load_conversation_turns", { turn_order: 2 }),
        );
        expect(afterStatusFlip.error).toBeNull();
        expect(afterStatusFlip.data).toEqual({
          ok: false,
          error: "not_found",
        });
      } finally {
        if (classId) await admin.from("classes").delete().eq("id", classId);
        if (teacherProfileId) {
          await admin
            .from("teacher_profiles")
            .delete()
            .eq("id", teacherProfileId);
        }
        if (userId) await admin.auth.admin.deleteUser(userId);
      }
    },
    30_000,
  );
});
