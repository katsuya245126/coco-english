"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/teacher/auth";
import { changeAttemptReview } from "@/server/teacher/assignment-operations";
import { createSignedAudioUrlForTeacher } from "@/server/teacher/audio-evidence";
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

export async function markSubmissionReviewedAction(attemptId: string) {
  const profile = await requireTeacherProfile();
  return changeAttemptReview({ teacherId: profile.id, attemptId, action: "mark_reviewed" });
}
