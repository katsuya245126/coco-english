/**
 * Server-only Azure word audio for pronunciation practice.
 *
 * Word audio is cache-first, stored in the private `tts-audio` bucket, and
 * signed only after the caller has resolved the word from an owned snapshot.
 */

import { createHash } from "node:crypto";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { log } from "@/server/logging/logger";

export const PRONUNCIATION_WORD_AUDIO = {
  schemaVersion: 1,
  provider: "azure_speech",
  model: "neural-tts",
  voice: "en-US-AvaNeural",
  locale: "en-US",
  format: "audio-24khz-48kbitrate-mono-mp3",
  characterId: "pronunciation-word-v1",
} as const;

export const PRONUNCIATION_WORD_AUDIO_BUCKET = "tts-audio";
export const SIGNED_PRONUNCIATION_WORD_AUDIO_TTL_SECONDS = 60 * 60;

const CMU_TO_SAPI: Record<string, string> = {
  AA: "aa",
  AE: "ae",
  AH: "ah",
  AO: "ao",
  AW: "aw",
  AY: "ay",
  B: "b",
  CH: "ch",
  D: "d",
  DH: "dh",
  EH: "eh",
  ER: "er r",
  EY: "ey",
  F: "f",
  G: "g",
  HH: "hh",
  IH: "ih",
  IY: "iy",
  JH: "jh",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ng",
  OW: "ow",
  OY: "oy",
  P: "p",
  R: "r",
  S: "s",
  SH: "sh",
  T: "t",
  TH: "th",
  UH: "uh",
  UW: "uw",
  V: "v",
  W: "w",
  Y: "y",
  Z: "z",
  ZH: "zh",
};

const CMU_VOWELS = new Set([
  "AA",
  "AE",
  "AH",
  "AO",
  "AW",
  "AY",
  "EH",
  "ER",
  "EY",
  "IH",
  "IY",
  "OW",
  "OY",
  "UH",
  "UW",
]);

export type PronunciationWordAudioInput = {
  word: string;
  phones: readonly string[];
};

export type PronunciationWordAudioSpecInput = PronunciationWordAudioInput & {
  schemaVersion?: number;
  provider?: string;
  model?: string;
  voice?: string;
  locale?: string;
  format?: string;
  characterId?: string;
};

export type PronunciationWordAudioSpec = {
  schemaVersion: number;
  provider: string;
  model: string;
  voice: string;
  locale: string;
  format: string;
  characterId: string;
  word: string;
  phones: string[];
  sapiPhones: string[];
  contentHash: string;
  objectKey: string;
  ssml: string;
};

export type PronunciationWordAudioRenderResult =
  | {
      ok: true;
      audio: Blob;
      mimeType: "audio/mpeg";
    }
  | {
      ok: false;
      error: "missing_api_key" | "provider_failed";
    };

export type PronunciationWordAudioRenderer = (input: {
  ssml: string;
  apiKey: string;
  region: string;
  voice: string;
  outputFormat: string;
}) => Promise<PronunciationWordAudioRenderResult>;

export type PronunciationWordAudioDeps = {
  render?: PronunciationWordAudioRenderer;
  apiKey?: string;
  region?: string;
};

export type GetOrCreatePronunciationWordAudioResult =
  | {
      ok: true;
      cacheStatus: "hit" | "miss";
      contentHash: string;
      objectKey: string;
      mimeType: string;
    }
  | {
      ok: false;
      error:
        | "not_found"
        | "missing_api_key"
        | "provider_failed"
        | "storage_failed"
        | "cache_failed";
    };

export type WarmPronunciationWordAudioResult = {
  ok: true;
  warmed: number;
  skipped: number;
  failed: number;
};

function xmlEscape(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => {
    const escaped: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return escaped[character] ?? character;
  });
}

function toSapiPhone(phone: string): string[] {
  const match = /^([A-Z]+)([012]?)$/u.exec(phone);
  const base = match?.[1];
  const stress = match?.[2];
  const mapped = base ? CMU_TO_SAPI[base] : undefined;
  if (!mapped) throw new Error("unsupported pronunciation phone");
  if (!stress) return mapped.split(" ");
  if (!base || !CMU_VOWELS.has(base)) {
    throw new Error("stress must follow a vowel phone");
  }
  if (stress === "0") {
    if (base === "AH") return ["ax"];
    if (base === "ER") return ["ax", "r"];
    return mapped.split(" ");
  }
  const [vowel, ...rest] = mapped.split(" ");
  return [vowel, stress, ...rest];
}

export function toSapiPhonemes(phones: readonly string[]): string[] {
  return phones.flatMap(toSapiPhone);
}

function buildSsml(input: {
  word: string;
  voice: string;
  locale: string;
  sapiPhones: string[];
}): string {
  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlEscape(input.locale)}">`,
    `<voice name="${xmlEscape(input.voice)}">`,
    `<phoneme alphabet="sapi" ph="${xmlEscape(input.sapiPhones.join(" "))}">${xmlEscape(input.word)}</phoneme>`,
    "</voice>",
    "</speak>",
  ].join("");
}

export function buildPronunciationWordAudioSpec(
  input: PronunciationWordAudioSpecInput,
): PronunciationWordAudioSpec {
  const word = input.word.trim();
  const phones = [...input.phones];
  if (!word || phones.length === 0) {
    throw new Error("word audio requires a word and pronunciation");
  }

  const render = {
    schemaVersion: input.schemaVersion ?? PRONUNCIATION_WORD_AUDIO.schemaVersion,
    provider: input.provider ?? PRONUNCIATION_WORD_AUDIO.provider,
    model: input.model ?? PRONUNCIATION_WORD_AUDIO.model,
    voice: input.voice ?? PRONUNCIATION_WORD_AUDIO.voice,
    locale: input.locale ?? PRONUNCIATION_WORD_AUDIO.locale,
    format: input.format ?? PRONUNCIATION_WORD_AUDIO.format,
    characterId: input.characterId ?? PRONUNCIATION_WORD_AUDIO.characterId,
  };
  const sapiPhones = toSapiPhonemes(phones);
  const serialized = JSON.stringify([
    render.schemaVersion,
    render.provider,
    render.model,
    render.voice,
    render.locale,
    render.format,
    render.characterId,
    word,
    phones,
  ]);
  const contentHash = createHash("sha256").update(serialized).digest("hex");

  return {
    ...render,
    word,
    phones,
    sapiPhones,
    contentHash,
    objectKey: `${render.provider}/${render.characterId}/${contentHash}.mp3`,
    ssml: buildSsml({
      word,
      voice: render.voice,
      locale: render.locale,
      sapiPhones,
    }),
  };
}

async function renderWithAzure(
  input: Parameters<PronunciationWordAudioRenderer>[0],
): Promise<PronunciationWordAudioRenderResult> {
  if (!input.apiKey.trim()) return { ok: false, error: "missing_api_key" };

  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      input.apiKey,
      input.region,
    );
    speechConfig.speechSynthesisVoiceName = input.voice;
    speechConfig.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    return await new Promise<PronunciationWordAudioRenderResult>((resolve) => {
      synthesizer.speakSsmlAsync(
        input.ssml,
        (result) => {
          synthesizer.close();
          if (
            result.reason !== sdk.ResultReason.SynthesizingAudioCompleted ||
            !result.audioData?.byteLength
          ) {
            resolve({ ok: false, error: "provider_failed" });
            return;
          }
          resolve({
            ok: true,
            audio: new Blob([result.audioData], { type: "audio/mpeg" }),
            mimeType: "audio/mpeg",
          });
        },
        () => {
          synthesizer.close();
          resolve({ ok: false, error: "provider_failed" });
        },
      );
    });
  } catch {
    log("error", "audio.pronunciation_word_render_failed", {
      provider: PRONUNCIATION_WORD_AUDIO.provider,
      model: PRONUNCIATION_WORD_AUDIO.model,
      voice: input.voice,
      error: "provider_failed",
    });
    return { ok: false, error: "provider_failed" };
  }
}

function resolveApiKey(deps?: PronunciationWordAudioDeps): string {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.AZURE_SPEECH_KEY?.trim() ?? "";
}

function resolveRegion(deps?: PronunciationWordAudioDeps): string {
  if (deps && "region" in deps) return deps.region?.trim() ?? "";
  return process.env.AZURE_SPEECH_REGION?.trim() ?? "";
}

export async function getOrCreatePronunciationWordAudio(
  input: PronunciationWordAudioInput,
  deps?: PronunciationWordAudioDeps,
): Promise<GetOrCreatePronunciationWordAudioResult> {
  let spec: PronunciationWordAudioSpec;
  try {
    spec = buildPronunciationWordAudioSpec(input);
  } catch {
    return { ok: false, error: "not_found" };
  }

  const supabase = createSupabaseServiceClient();
  const { data: cachedRow, error: lookupError } = await supabase
    .from("tts_audio_cache")
    .select("content_hash, object_key, mime_type")
    .eq("content_hash", spec.contentHash)
    .maybeSingle();

  if (lookupError) return { ok: false, error: "cache_failed" };
  if (cachedRow?.object_key) {
    await supabase
      .from("tts_audio_cache")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("content_hash", spec.contentHash);
    return {
      ok: true,
      cacheStatus: "hit",
      contentHash: spec.contentHash,
      objectKey: cachedRow.object_key,
      mimeType: cachedRow.mime_type ?? "audio/mpeg",
    };
  }

  const render = deps?.render ?? renderWithAzure;
  const generated = await render({
    ssml: spec.ssml,
    apiKey: resolveApiKey(deps),
    region: resolveRegion(deps),
    voice: spec.voice,
    outputFormat: spec.format,
  });
  if (!generated.ok) return { ok: false, error: generated.error };

  const uploaded = await supabase.storage
    .from(PRONUNCIATION_WORD_AUDIO_BUCKET)
    .upload(spec.objectKey, generated.audio, {
      contentType: generated.mimeType,
      upsert: true,
    });
  if (uploaded.error) return { ok: false, error: "storage_failed" };

  const cacheWrite = await supabase.from("tts_audio_cache").upsert(
    {
      content_hash: spec.contentHash,
      provider: spec.provider,
      model: spec.model,
      voice: spec.voice,
      response_format: spec.format,
      character_id: spec.characterId,
      object_key: spec.objectKey,
      mime_type: generated.mimeType,
      byte_size: generated.audio.size,
    },
    { onConflict: "content_hash" },
  );
  if (cacheWrite?.error) return { ok: false, error: "cache_failed" };

  return {
    ok: true,
    cacheStatus: "miss",
    contentHash: spec.contentHash,
    objectKey: spec.objectKey,
    mimeType: generated.mimeType,
  };
}

export async function warmPronunciationWordAudio(input: {
  words: PronunciationWordAudioInput[];
}, deps?: PronunciationWordAudioDeps): Promise<WarmPronunciationWordAudioResult> {
  const unique = new Map<string, PronunciationWordAudioInput>();
  let invalid = 0;
  for (const word of input.words) {
    try {
      const spec = buildPronunciationWordAudioSpec(word);
      unique.set(spec.contentHash, word);
    } catch {
      invalid += 1;
    }
  }

  let warmed = 0;
  let skipped = 0;
  let failed = invalid;
  for (const word of unique.values()) {
    const result = await getOrCreatePronunciationWordAudio(word, deps);
    if (!result.ok) failed += 1;
    else if (result.cacheStatus === "hit") skipped += 1;
    else warmed += 1;
  }
  return { ok: true, warmed, skipped, failed };
}

export async function signPronunciationWordAudio(input: {
  word: string;
  phones: readonly string[];
  /** Ignored when supplied by a browser; the hash is rebuilt from word data. */
  contentHash?: string;
}): Promise<
  | { ok: true; contentHash: string; audioUrl: string; mimeType: string }
  | { ok: false; error: "not_found" | "cache_failed" | "storage_failed" }
> {
  let spec: PronunciationWordAudioSpec;
  try {
    spec = buildPronunciationWordAudioSpec(input);
  } catch {
    return { ok: false, error: "not_found" };
  }

  const supabase = createSupabaseServiceClient();
  const { data: cacheRow, error: lookupError } = await supabase
    .from("tts_audio_cache")
    .select("content_hash, object_key, mime_type")
    .eq("content_hash", spec.contentHash)
    .maybeSingle();
  if (lookupError) return { ok: false, error: "cache_failed" };
  if (!cacheRow?.object_key) return { ok: false, error: "not_found" };

  const signed = await supabase.storage
    .from(PRONUNCIATION_WORD_AUDIO_BUCKET)
    .createSignedUrl(
      cacheRow.object_key,
      SIGNED_PRONUNCIATION_WORD_AUDIO_TTL_SECONDS,
    );
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: "storage_failed" };
  }
  return {
    ok: true,
    contentHash: spec.contentHash,
    audioUrl: signed.data.signedUrl,
    mimeType: cacheRow.mime_type ?? "audio/mpeg",
  };
}
