/**
 * Student audio upload service (T-05-04..T-05-07).
 *
 * Server-only module. Uses the service-role client, so every write is preceded
 * by app-level ownership checks against assignment_students.student_id and the
 * attempt's assignment_student_id. Storage object keys are internal evidence
 * pointers, never authorization.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";

const DEFAULT_AUDIO_BUCKET = "student-audio";

export type AudioClipKind = Database["public"]["Enums"]["audio_clip_kind"];

export type UploadAttemptAudioClipInput = {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  clipKind: AudioClipKind;
  file: Blob;
  mimeType: string;
  durationMs: number;
  byteSize: number;
};

export type UploadAttemptAudioClipResult =
  | {
      ok: true;
      audioClipId: string;
      processingStatus: "uploaded";
    }
  | {
      ok: false;
      error:
        | "not_found"
        | "invalid_audio"
        | "upload_failed_retryable"
        | "db_error";
      retryable: boolean;
    };

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim();
  if (normalized === "audio/mp4" || normalized === "audio/m4a") return "m4a";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/wav" || normalized === "audio/wave") return "wav";
  return "webm";
}

function buildObjectKey(input: {
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  clipKind: AudioClipKind;
  audioClipId: string;
  mimeType: string;
}) {
  const ext = extensionForMimeType(input.mimeType);
  return [
    input.assignmentStudentId,
    input.attemptId,
    String(input.turnOrder),
    `${input.clipKind}-${input.audioClipId}.${ext}`,
  ].join("/");
}

function isValidInput(input: UploadAttemptAudioClipInput) {
  return (
    Number.isInteger(input.turnOrder) &&
    input.turnOrder > 0 &&
    Number.isInteger(input.durationMs) &&
    input.durationMs >= 0 &&
    Number.isInteger(input.byteSize) &&
    input.byteSize > 0 &&
    input.mimeType.trim().startsWith("audio/")
  );
}

export async function uploadAttemptAudioClip(
  input: UploadAttemptAudioClipInput,
): Promise<UploadAttemptAudioClipResult> {
  if (!isValidInput(input)) {
    return { ok: false, error: "invalid_audio", retryable: false };
  }

  try {
    const supabase = createSupabaseServiceClient();

    const { data: assignmentStudent, error: assignmentError } = await supabase
      .from("assignment_students")
      .select("id, student_id")
      .eq("id", input.assignmentStudentId)
      .eq("student_id", input.studentId)
      .maybeSingle();

    if (assignmentError) {
      return { ok: false, error: "db_error", retryable: true };
    }
    if (!assignmentStudent) {
      return { ok: false, error: "not_found", retryable: false };
    }

    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("id, assignment_student_id")
      .eq("id", input.attemptId)
      .eq("assignment_student_id", input.assignmentStudentId)
      .maybeSingle();

    if (attemptError) {
      return { ok: false, error: "db_error", retryable: true };
    }
    if (!attempt) {
      return { ok: false, error: "not_found", retryable: false };
    }

    const { data: turn, error: turnError } = await supabase
      .from("attempt_turns")
      .upsert(
        {
          attempt_id: input.attemptId,
          turn_order: input.turnOrder,
        },
        { onConflict: "attempt_id,turn_order" },
      )
      .select("id")
      .single();

    if (turnError || !turn) {
      return { ok: false, error: "db_error", retryable: true };
    }

    const { data: audioClip, error: clipError } = await supabase
      .from("audio_clips")
      .insert({
        attempt_turn_id: turn.id,
        clip_kind: input.clipKind,
        processing_status: "pending_upload",
      })
      .select("id")
      .single();

    if (clipError || !audioClip) {
      return { ok: false, error: "db_error", retryable: true };
    }

    const objectKey = buildObjectKey({
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
      turnOrder: input.turnOrder,
      clipKind: input.clipKind,
      audioClipId: audioClip.id,
      mimeType: input.mimeType,
    });

    const { error: uploadError } = await supabase.storage
      .from(getStudentAudioBucketId())
      .upload(objectKey, input.file, {
        contentType: input.mimeType,
        upsert: false,
      });

    if (uploadError) {
      await supabase
        .from("audio_clips")
        .update({
          processing_status: "failed",
          mime_type: input.mimeType,
          duration_ms: input.durationMs,
          byte_size: input.byteSize,
        })
        .eq("id", audioClip.id);

      return {
        ok: false,
        error: "upload_failed_retryable",
        retryable: true,
      };
    }

    const { error: updateError } = await supabase
      .from("audio_clips")
      .update({
        object_key: objectKey,
        mime_type: input.mimeType,
        duration_ms: input.durationMs,
        byte_size: input.byteSize,
        processing_status: "uploaded",
      })
      .eq("id", audioClip.id);

    if (updateError) {
      return { ok: false, error: "db_error", retryable: true };
    }

    return {
      ok: true,
      audioClipId: audioClip.id,
      processingStatus: "uploaded",
    };
  } catch {
    return { ok: false, error: "db_error", retryable: true };
  }
}
