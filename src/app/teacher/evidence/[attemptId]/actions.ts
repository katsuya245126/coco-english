"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/teacher/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { assertTransitionRequest } from "@/domain/foundation/status";
import type { AssignmentStudentStatus } from "@/domain/foundation/status";
import {
  createSignedAudioUrlForTeacher,
  teacherOwnsAudioClip,
} from "@/server/teacher/audio-evidence";
import { reprocessClipPronunciation } from "@/server/audio/pronunciation-reprocess";

export type LoadAudioClipUrlActionResult =
  | { ok: true; signedUrl: string }
  | { ok: false; error: "unavailable" };

export async function loadAudioClipUrlAction(
  audioClipId: string,
): Promise<LoadAudioClipUrlActionResult> {
  if (!audioClipId.trim()) {
    return { ok: false, error: "unavailable" };
  }

  const profile = await requireTeacherProfile();
  const signed = await createSignedAudioUrlForTeacher({
    teacherId: profile.id,
    audioClipId,
  });

  if (!signed) {
    return { ok: false, error: "unavailable" };
  }

  return { ok: true, signedUrl: signed.signedUrl };
}

// ─── Reprocess pronunciation action ───

export type ReprocessPronunciationActionResult =
  | { ok: true }
  | {
      ok: false;
      error: "unauthorized" | "already_scored" | "unavailable" | "failed";
    };

/**
 * Teacher-triggered re-score of a clip whose pronunciation scoring failed (or
 * never ran) at upload time. Ownership is enforced via teacherOwnsAudioClip
 * before the service-role reprocess path touches the clip.
 *
 * `attemptId` is used only to revalidate the evidence page so the newly-scored
 * detail shows without a manual refresh.
 */
export async function reprocessPronunciationAction(input: {
  audioClipId: string;
  attemptId: string;
}): Promise<ReprocessPronunciationActionResult> {
  if (!input.audioClipId.trim()) {
    return { ok: false, error: "unavailable" };
  }

  const profile = await requireTeacherProfile();

  const owns = await teacherOwnsAudioClip({
    teacherId: profile.id,
    audioClipId: input.audioClipId,
  });
  if (!owns) {
    return { ok: false, error: "unauthorized" };
  }

  const result = await reprocessClipPronunciation({
    audioClipId: input.audioClipId,
  });

  if (result.ok) {
    revalidatePath(`/teacher/evidence/${input.attemptId}`);
    return { ok: true };
  }

  if (result.error === "already_scored") {
    return { ok: false, error: "already_scored" };
  }
  if (
    result.error === "clip_unavailable" ||
    result.error === "not_found" ||
    result.error === "no_reference_text"
  ) {
    return { ok: false, error: "unavailable" };
  }

  return { ok: false, error: "failed" };
}

// ─── Override action ───

export type OverrideAssignmentStatusInput = {
  assignmentStudentId: string;
  nextStatus: "completed" | "needs_retry" | "teacher_review";
  reasonNote?: string;
};

export type OverrideAssignmentStatusResult =
  | { ok: true }
  | {
      ok: false;
      error: "unauthorized" | "invalid_transition" | "not_found" | "db_error";
    };

/**
 * Teacher override for assignment status (REV-06, D-08, D-09).
 *
 * Ownership model: assignmentStudentId must have come from the evidence record
 * the teacher was RLS-authorized to load (getAttemptEvidenceForTeacher teacher_id
 * filter). requireTeacherProfile() gates unauthenticated calls (T-07-06 / T-OVERRIDE-OWN).
 *
 * Security: assertTransitionRequest validates the transition and requires actorId
 * for teacher; illegal transitions return "invalid_transition" with no DB write
 * (T-07-07 / T-TRANSITION-GUARD).
 */
export async function overrideAssignmentStatusAction(
  input: OverrideAssignmentStatusInput,
): Promise<OverrideAssignmentStatusResult> {
  const profile = await requireTeacherProfile();

  const supabase = createSupabaseServiceClient();

  // 1. Load the assignment_students row
  const { data: asRow } = await supabase
    .from("assignment_students")
    .select("id, status")
    .eq("id", input.assignmentStudentId)
    .single();

  if (!asRow) {
    return { ok: false, error: "not_found" };
  }

  const previousStatus = asRow.status as AssignmentStudentStatus;
  const nowIso = new Date().toISOString();

  // 2. Validate the transition before any write (T-07-07)
  try {
    assertTransitionRequest({
      previousStatus,
      nextStatus: input.nextStatus,
      actorType: "teacher",
      actorId: profile.id,
      reasonCode: "teacher_override",
      occurredAt: nowIso,
    });
  } catch (e) {
    console.error("[override] assertTransitionRequest failed:", e);
    return { ok: false, error: "invalid_transition" };
  }

  // 3. UPDATE assignment_students.status
  //    When transitioning to needs_retry, also clear latest_attempt_id (D-10)
  const updatePayload: Record<string, unknown> = {
    status: input.nextStatus,
  };
  if (input.nextStatus === "needs_retry") {
    updatePayload.latest_attempt_id = null;
  }

  const { error: updateError } = await supabase
    .from("assignment_students")
    .update(updatePayload)
    .eq("id", input.assignmentStudentId);

  if (updateError) {
    console.error("[override] assignment_students update failed:", updateError);
    return { ok: false, error: "db_error" };
  }

  // 4. INSERT audit event
  const metadata: Record<string, unknown> = {};
  if (input.reasonNote) {
    metadata.note = input.reasonNote;
  }

  const { error: eventError } = await supabase
    .from("assignment_status_events")
    .insert({
      assignment_student_id: input.assignmentStudentId,
      previous_status: previousStatus,
      next_status: input.nextStatus,
      actor_type: "teacher",
      actor_id: profile.id,
      reason_code: "teacher_override",
      metadata: Object.keys(metadata).length > 0 ? metadata : {},
    });

  if (eventError) {
    console.error("[override] assignment_status_events insert failed:", eventError);
    return { ok: false, error: "db_error" };
  }

  return { ok: true };
}
