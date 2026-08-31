"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { changeAttemptReview } from "@/server/teacher/assignment-operations";
import { createSignedAudioUrlForTeacher } from "@/server/teacher/audio-evidence";
import {
  clarifyMissionAudio,
  reprocessClipPronunciation,
} from "@/server/audio/pronunciation-reprocess";

const CLARIFICATION_FAILURE =
  "We could not save the teacher-confirmed wording. Please try again.";
const CLARIFICATION_UNAVAILABLE =
  "This recording is no longer available for clarification.";
const CLARIFICATION_RATE_LIMITED =
  "You’ve made several AI requests. Wait a few minutes and try again.";

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
      error:
        | "unauthorized"
        | "already_scored"
        | "unavailable"
        | "failed"
        | "rate_limited";
    };

/**
 * Teacher-triggered re-score of a clip whose pronunciation scoring failed (or
 * never ran) at upload time.
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
  const result = await reprocessClipPronunciation({
    teacherId: profile.id,
    audioClipId: input.audioClipId,
  });

  if (result.ok) {
    revalidatePath(`/teacher/evidence/${input.attemptId}`);
    return { ok: true };
  }

  return result;
}

export type ClarifyMissionAudioActionResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid_input" | "unavailable" | "rate_limited" | "retryable";
      message: string;
    };

/** Save a teacher-confirmed reference and publish its replacement score. */
export async function clarifyMissionAudioAction(input: {
  audioClipId: string;
  attemptId: string;
  teacherConfirmedText: string;
}): Promise<ClarifyMissionAudioActionResult> {
  if (
    typeof input?.audioClipId !== "string" ||
    !input.audioClipId.trim() ||
    typeof input?.attemptId !== "string" ||
    !input.attemptId.trim() ||
    typeof input?.teacherConfirmedText !== "string" ||
    !input.teacherConfirmedText.trim()
  ) {
    return { ok: false, error: "invalid_input", message: CLARIFICATION_FAILURE };
  }

  const profile = await requireTeacherProfile();

  let result;
  try {
    result = await clarifyMissionAudio({
      teacherId: profile.id,
      audioClipId: input.audioClipId,
      teacherConfirmedText: input.teacherConfirmedText.trim(),
    });
  } catch {
    return { ok: false, error: "retryable", message: CLARIFICATION_FAILURE };
  }

  if (result.ok) {
    revalidatePath(`/teacher/evidence/${input.attemptId}`);
    return { ok: true };
  }

  if (result.error === "invalid_text") {
    return { ok: false, error: "invalid_input", message: CLARIFICATION_FAILURE };
  }
  if (result.error === "rate_limited") {
    return {
      ok: false,
      error: "rate_limited",
      message: CLARIFICATION_RATE_LIMITED,
    };
  }
  if (result.error === "unauthorized" || result.error === "unavailable") {
    return { ok: false, error: "unavailable", message: CLARIFICATION_UNAVAILABLE };
  }
  return { ok: false, error: "retryable", message: CLARIFICATION_FAILURE };
}

export async function markSubmissionReviewedAction(attemptId: string) {
  const profile = await requireTeacherProfile();
  return changeAttemptReview({ teacherId: profile.id, attemptId, action: "mark_reviewed" });
}
