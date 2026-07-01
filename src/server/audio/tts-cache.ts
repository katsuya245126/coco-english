/**
 * Assignment-gated, cache-first TTS service (VOICE-01, VOICE-03, T-08-02..06).
 *
 * Server-only module. Uses the service-role client, so every lookup/generation
 * is preceded by an app-level ownership check against
 * `assignment_students.id` + `student_id`. Storage object keys are internal
 * pointers, never authorization — playback is served through short-lived signed
 * URLs from the private `tts-audio` bucket (T-08-05).
 *
 * Cache key truth is server-computed from the resolved line text + character +
 * voice + provider + model + format + schema version (VOICE-03). A
 * client-supplied content hash is never trusted (T-08-03), and student
 * transcript / speech-recognition text is never forwarded to the provider
 * (D-10). Provider/storage failures are non-blocking: they return small
 * retryable errors and never write a partial cache row (D-15).
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { log } from "@/server/logging/logger";
import {
  DEFAULT_COCO_TTS_VOICE,
  TTS_MODEL,
  TTS_PROVIDER,
  TTS_RESPONSE_FORMAT,
  computeTtsContentHash,
  ttsVoiceSchema,
  type TtsVoice,
} from "@/domain/audio/tts";
import {
  generateTtsAudio as defaultGenerateTtsAudio,
  type GenerateTtsAudioResult,
} from "@/server/audio/tts-generator";

export const TTS_AUDIO_BUCKET = "tts-audio";
export const SIGNED_TTS_URL_TTL_SECONDS = 60 * 60; // 1 hour

export type GetOrCreateTtsAudioError =
  | "not_found"
  | "generation_failed"
  | "storage_failed";

export type GetOrCreateTtsAudioInput = {
  studentId: string;
  assignmentStudentId: string;
  characterId: string;
  /**
   * Requested voice. Accepted as a plain string at the boundary and coerced to
   * the bounded {@link TtsVoice} enum internally; unknown voices fall back to
   * the default Coco voice so arbitrary input can never reach the provider.
   */
  voice: string;
  text: string;
};

export type GetOrCreateTtsAudioResult =
  | { ok: true; cacheStatus: "hit" | "miss"; audioUrl: string; mimeType: string }
  | { ok: false; error: GetOrCreateTtsAudioError };

export type GetOrCreateTtsAudioDeps = {
  generateTtsAudio?: (input: {
    text: string;
    voice: TtsVoice;
  }) => Promise<GenerateTtsAudioResult>;
};

/**
 * Deterministic Storage object key for a cached line. Derived from the
 * server-computed content hash so identical lines resolve to one object.
 */
function buildObjectKey(contentHash: string): string {
  return `${TTS_PROVIDER}/${contentHash}.mp3`;
}

export async function getOrCreateTtsAudio(
  input: GetOrCreateTtsAudioInput,
  deps?: GetOrCreateTtsAudioDeps,
): Promise<GetOrCreateTtsAudioResult> {
  // Pick ONLY the trusted fields. Any forged extras (contentHash, transcript,
  // ...) on the input object are dropped here and never reach the provider or
  // the cache row (T-08-03, D-10).
  const studentId = input.studentId;
  const assignmentStudentId = input.assignmentStudentId;
  const characterId = input.characterId;
  // Coerce the boundary string to the bounded voice enum; unknown values fall
  // back to the default so arbitrary client input can never reach the provider.
  const voice: TtsVoice = ttsVoiceSchema.safeParse(input.voice).success
    ? (input.voice as TtsVoice)
    : DEFAULT_COCO_TTS_VOICE;
  const text = input.text;

  const generate = deps?.generateTtsAudio ?? defaultGenerateTtsAudio;
  const supabase = createSupabaseServiceClient();

  // 1. Ownership gate — assignment must belong to this student (T-08-04).
  const { data: assignmentStudent, error: ownershipError } = await supabase
    .from("assignment_students")
    .select("id, student_id")
    .eq("id", assignmentStudentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (ownershipError || !assignmentStudent) {
    return { ok: false, error: "not_found" };
  }

  // 2. Server-computed canonical content hash (VOICE-03, T-08-03).
  const contentHash = computeTtsContentHash({
    text,
    characterId,
    voice,
    provider: TTS_PROVIDER,
    model: TTS_MODEL,
    responseFormat: TTS_RESPONSE_FORMAT,
  });

  // 3. Cache lookup — a hit never calls the provider.
  const { data: cachedRow } = await supabase
    .from("tts_audio_cache")
    .select("id, object_key, mime_type")
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (cachedRow?.object_key) {
    const signed = await supabase.storage
      .from(TTS_AUDIO_BUCKET)
      .createSignedUrl(cachedRow.object_key, SIGNED_TTS_URL_TTL_SECONDS);

    if (signed.error || !signed.data?.signedUrl) {
      return { ok: false, error: "storage_failed" };
    }

    // Best-effort access metadata update; never blocks playback.
    await supabase
      .from("tts_audio_cache")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", cachedRow.id);

    return {
      ok: true,
      cacheStatus: "hit",
      audioUrl: signed.data.signedUrl,
      mimeType: cachedRow.mime_type ?? "audio/mpeg",
    };
  }

  // 4. Cache miss — one validated provider call (T-08-02).
  const generated = await generate({ text, voice });
  if (!generated.ok) {
    log("warn", "audio.tts_generation_failed", {
      provider: TTS_PROVIDER,
      model: TTS_MODEL,
      voice,
      error: generated.error,
    });
    return { ok: false, error: "generation_failed" };
  }

  const objectKey = buildObjectKey(contentHash);
  const byteSize = generated.audio.size;

  // 5. Upload to the private bucket. A failure writes no cache row (D-15).
  const uploadResult = await supabase.storage
    .from(TTS_AUDIO_BUCKET)
    .upload(objectKey, generated.audio, {
      contentType: generated.mimeType,
      upsert: true,
    });

  if (uploadResult.error) {
    log("warn", "audio.tts_upload_failed", {
      provider: TTS_PROVIDER,
      model: TTS_MODEL,
      voice,
    });
    return { ok: false, error: "storage_failed" };
  }

  // 6. Persist cache metadata (content_hash is server-computed only).
  await supabase.from("tts_audio_cache").upsert(
    {
      content_hash: contentHash,
      provider: TTS_PROVIDER,
      model: TTS_MODEL,
      voice,
      response_format: TTS_RESPONSE_FORMAT,
      character_id: characterId,
      object_key: objectKey,
      mime_type: generated.mimeType,
      byte_size: byteSize,
    },
    { onConflict: "content_hash" },
  );

  // 7. Signed URL from the private bucket (T-08-05).
  const signed = await supabase.storage
    .from(TTS_AUDIO_BUCKET)
    .createSignedUrl(objectKey, SIGNED_TTS_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: "storage_failed" };
  }

  return {
    ok: true,
    cacheStatus: "miss",
    audioUrl: signed.data.signedUrl,
    mimeType: generated.mimeType,
  };
}
