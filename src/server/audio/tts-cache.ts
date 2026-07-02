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

export type WarmTtsAudioCacheInput = {
  characterId: string;
  voice: string;
  texts: string[];
};

export type WarmTtsAudioCacheResult = {
  ok: true;
  warmed: number;
  skipped: number;
  failed: number;
};

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

async function getOrCreateCachedTtsObject(
  input: {
    characterId: string;
    voice: string;
    text: string;
  },
  deps?: GetOrCreateTtsAudioDeps,
): Promise<
  | { ok: true; cacheStatus: "hit" | "miss"; objectKey: string; mimeType: string }
  | { ok: false; error: Exclude<GetOrCreateTtsAudioError, "not_found"> }
> {
  const characterId = input.characterId;
  const voice: TtsVoice = ttsVoiceSchema.safeParse(input.voice).success
    ? (input.voice as TtsVoice)
    : DEFAULT_COCO_TTS_VOICE;
  const text = input.text;
  const generate = deps?.generateTtsAudio ?? defaultGenerateTtsAudio;
  const supabase = createSupabaseServiceClient();

  const contentHash = computeTtsContentHash({
    text,
    characterId,
    voice,
    provider: TTS_PROVIDER,
    model: TTS_MODEL,
    responseFormat: TTS_RESPONSE_FORMAT,
  });

  const { data: cachedRow } = await supabase
    .from("tts_audio_cache")
    .select("id, object_key, mime_type")
    .eq("content_hash", contentHash)
    .maybeSingle();

  if (cachedRow?.object_key) {
    await supabase
      .from("tts_audio_cache")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", cachedRow.id);

    return {
      ok: true,
      cacheStatus: "hit",
      objectKey: cachedRow.object_key,
      mimeType: cachedRow.mime_type ?? "audio/mpeg",
    };
  }

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

  return {
    ok: true,
    cacheStatus: "miss",
    objectKey,
    mimeType: generated.mimeType,
  };
}

export async function warmTtsAudioCache(
  input: WarmTtsAudioCacheInput,
  deps?: GetOrCreateTtsAudioDeps,
): Promise<WarmTtsAudioCacheResult> {
  const uniqueTexts = Array.from(
    new Set(input.texts.map((text) => text.trim()).filter(Boolean)),
  );

  let warmed = 0;
  let skipped = 0;
  let failed = 0;

  for (const text of uniqueTexts) {
    const result = await getOrCreateCachedTtsObject({
      characterId: input.characterId,
      voice: input.voice,
      text,
    }, deps);

    if (!result.ok) {
      failed += 1;
    } else if (result.cacheStatus === "hit") {
      skipped += 1;
    } else {
      warmed += 1;
    }
  }

  return { ok: true, warmed, skipped, failed };
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

  const cached = await getOrCreateCachedTtsObject({
    characterId,
    voice,
    text,
  }, deps);

  if (!cached.ok) {
    return { ok: false, error: cached.error };
  }

  const signed = await supabase.storage
    .from(TTS_AUDIO_BUCKET)
    .createSignedUrl(cached.objectKey, SIGNED_TTS_URL_TTL_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: "storage_failed" };
  }

  return {
    ok: true,
    cacheStatus: cached.cacheStatus,
    audioUrl: signed.data.signedUrl,
    mimeType: cached.mimeType,
  };
}
