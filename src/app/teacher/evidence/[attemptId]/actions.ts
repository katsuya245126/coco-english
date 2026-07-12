"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/teacher/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { dismissAssignmentStudent, markSubmissionReviewed, requestSubmissionRetry, undoDismiss } from "@/server/teacher/assignment-operations";
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
  const { data: asRow, error: loadError } = await supabase
    .from("assignment_students")
    .select("id, status, latest_attempt_id, assignments!inner(classes!inner(teacher_id))")
    .eq("id", input.assignmentStudentId)
    .eq("assignments.classes.teacher_id", profile.id)
    .single();

  if (loadError || !asRow || !asRow.latest_attempt_id) {
    return { ok: false, error: "not_found" };
  }
  if (input.nextStatus === "needs_retry") {
    return requestSubmissionRetry({ teacherId: profile.id, attemptId: asRow.latest_attempt_id, reasonNote: input.reasonNote });
  }
  if (input.nextStatus === "completed") {
    return markSubmissionReviewed({ teacherId: profile.id, attemptId: asRow.latest_attempt_id });
  }
  return { ok: false, error: "invalid_transition" };
}

export async function markSubmissionReviewedAction(attemptId: string) {
  const profile = await requireTeacherProfile();
  return markSubmissionReviewed({ teacherId: profile.id, attemptId });
}

export async function requestSubmissionRetryAction(input: {
  attemptId: string;
  reasonNote?: string;
}) {
  const profile = await requireTeacherProfile();
  return requestSubmissionRetry({ teacherId: profile.id, ...input });
}

export async function dismissAssignmentStudentAction(input: { attemptId: string; reason?: string }) {
  const profile = await requireTeacherProfile();
  return dismissAssignmentStudent({ teacherId: profile.id, attemptId: input.attemptId, reason: input.reason });
}

export async function undoDismissAction(attemptId: string) {
  const profile = await requireTeacherProfile();
  return undoDismiss({ teacherId: profile.id, attemptId });
}
