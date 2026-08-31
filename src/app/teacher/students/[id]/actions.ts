"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  confirmPronunciationSample,
  createSignedPronunciationSampleUrlForTeacher,
  uploadPronunciationSample,
  PRONUNCIATION_SAMPLE_DURATION_ERROR,
  type PronunciationSample,
} from "@/server/teacher/pronunciation-samples";

const GENERIC_FAILURE =
  "We could not add this pronunciation sample. Please try again.";
const CONFIRM_FAILURE =
  "We could not confirm this pronunciation sample. Please try again.";

export type UploadPronunciationSampleActionResult =
  | { ok: true; sample: PronunciationSample }
  | {
      ok: false;
      error:
        | "invalid_input"
        | "duration_too_long"
        | "rate_limited"
        | "retryable"
        | "unavailable";
      message: string;
      retryAfterSeconds?: number;
    };

export async function uploadPronunciationSampleAction(
  studentId: string,
  formData: FormData,
): Promise<UploadPronunciationSampleActionResult> {
  if (!studentId.trim()) {
    return { ok: false, error: "invalid_input", message: GENERIC_FAILURE };
  }

  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return { ok: false, error: "invalid_input", message: GENERIC_FAILURE };
  }

  let profile;
  try {
    profile = await requireTeacherProfile();
  } catch {
    return { ok: false, error: "unavailable", message: GENERIC_FAILURE };
  }

  try {
    const result = await uploadPronunciationSample({
      teacherId: profile.id,
      studentId,
      file,
      mimeType: file.type,
    });

    if (result.ok) {
      revalidatePath(`/teacher/students/${studentId}`);
      return result;
    }

    if (result.error === "duration_too_long") {
      return {
        ok: false,
        error: "duration_too_long",
        message: PRONUNCIATION_SAMPLE_DURATION_ERROR,
      };
    }
    if (result.error === "invalid_audio") {
      return { ok: false, error: "invalid_input", message: GENERIC_FAILURE };
    }
    if (result.error === "rate_limited") {
      return {
        ok: false,
        error: "rate_limited",
        message: "You’ve made several AI requests. Wait a few minutes and try again.",
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    if (result.error === "unauthorized") {
      return { ok: false, error: "unavailable", message: GENERIC_FAILURE };
    }
    return { ok: false, error: "retryable", message: GENERIC_FAILURE };
  } catch {
    return { ok: false, error: "retryable", message: GENERIC_FAILURE };
  }
}

export type ConfirmPronunciationSampleActionResult =
  | { ok: true; sample: PronunciationSample }
  | {
      ok: false;
      error: "invalid_input" | "rate_limited" | "retryable" | "unavailable";
      message: string;
      retryAfterSeconds?: number;
    };

export async function confirmPronunciationSampleAction(
  sampleId: string,
  teacherConfirmedText: string,
): Promise<ConfirmPronunciationSampleActionResult> {
  if (!sampleId.trim() || !teacherConfirmedText.trim()) {
    return { ok: false, error: "invalid_input", message: CONFIRM_FAILURE };
  }

  let profile;
  try {
    profile = await requireTeacherProfile();
  } catch {
    return { ok: false, error: "unavailable", message: CONFIRM_FAILURE };
  }

  try {
    const result = await confirmPronunciationSample({
      teacherId: profile.id,
      sampleId,
      teacherConfirmedText,
    });

    if (result.ok) {
      revalidatePath(`/teacher/students/${result.sample.studentId}`);
      return result;
    }
    if (result.error === "invalid_text") {
      return { ok: false, error: "invalid_input", message: CONFIRM_FAILURE };
    }
    if (result.error === "rate_limited") {
      return {
        ok: false,
        error: "rate_limited",
        message: "You’ve made several AI requests. Wait a few minutes and try again.",
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    if (
      result.error === "not_found" ||
      result.error === "unavailable"
    ) {
      return { ok: false, error: "unavailable", message: CONFIRM_FAILURE };
    }
    return { ok: false, error: "retryable", message: CONFIRM_FAILURE };
  } catch {
    return { ok: false, error: "retryable", message: CONFIRM_FAILURE };
  }
}

export type LoadPronunciationSampleAudioUrlActionResult =
  | { ok: true; signedUrl: string }
  | { ok: false; error: "unavailable"; message: string };

export async function loadPronunciationSampleAudioUrlAction(
  sampleId: string,
): Promise<LoadPronunciationSampleAudioUrlActionResult> {
  if (!sampleId.trim()) {
    return { ok: false, error: "unavailable", message: GENERIC_FAILURE };
  }

  try {
    const profile = await requireTeacherProfile();
    const result = await createSignedPronunciationSampleUrlForTeacher({
      teacherId: profile.id,
      sampleId,
    });
    if (!result) {
      return { ok: false, error: "unavailable", message: GENERIC_FAILURE };
    }
    return { ok: true, signedUrl: result.signedUrl };
  } catch {
    return { ok: false, error: "unavailable", message: GENERIC_FAILURE };
  }
}
