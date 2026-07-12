"use server";
import { readStudentUnlock } from "@/app/join/actions";
import { createSignedHistoryAudioUrl } from "@/server/student-access/student-history";

export type LoadHistoryAudioResult = { ok: true; signedUrl: string } | { ok: false };
export async function loadHistoryAudioAction(audioClipId: string): Promise<LoadHistoryAudioResult> {
  const unlock = await readStudentUnlock();
  if (!unlock) return { ok: false };
  const result = await createSignedHistoryAudioUrl(unlock.studentId, audioClipId);
  return result ? { ok: true, signedUrl: result.signedUrl } : { ok: false };
}
