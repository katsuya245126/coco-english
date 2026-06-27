"use server";

import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { createSignedAudioUrlForTeacher } from "@/server/teacher/audio-evidence";

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
