/**
 * Server-only OpenAI speech (TTS) adapter (VOICE-01, T-08-01).
 *
 * Keep this module out of client components: `openai` is imported ONLY here.
 * Tests inject a fake `SpeechClient`, so automated verification never calls the
 * paid API. Missing key and provider failures return small app-owned errors and
 * never leak provider exception text toward the route/client.
 */

import OpenAI from "openai";
import { log } from "@/server/logging/logger";
import {
  DEFAULT_COCO_TTS_VOICE,
  TTS_MODEL,
  TTS_PROVIDER,
  TTS_RESPONSE_FORMAT,
  type TtsVoice,
} from "@/domain/audio/tts";

/**
 * Bounded, supportive delivery guidance for Coco's classroom-safe voice. This
 * shapes tone only; it is not spoken and contains no student text.
 */
const COCO_TTS_INSTRUCTIONS =
  "Speak as Coco, a warm, friendly, encouraging elementary ESL classmate. " +
  "Use a gentle, clear, upbeat tone at a slightly slow pace so a young English " +
  "learner can follow every word. Keep it supportive and never harsh.";

export type TtsGeneratorError = "missing_api_key" | "provider_failed";

export type GenerateTtsAudioResult =
  | { ok: true; audio: Blob; mimeType: "audio/mpeg" }
  | { ok: false; error: TtsGeneratorError };

/**
 * Minimal structural type around `client.audio.speech.create`. The concrete
 * OpenAI SDK client is assignable to this; fake clients in tests implement just
 * this surface.
 */
export type SpeechClient = {
  audio: {
    speech: {
      create(input: {
        model: string;
        voice: string;
        input: string;
        response_format: string;
        instructions?: string;
      }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
};

export type GenerateTtsAudioInput = {
  text: string;
  voice?: TtsVoice;
  model?: string;
};

export type GenerateTtsAudioDeps = {
  apiKey?: string;
  model?: string;
  voice?: TtsVoice;
  client?: SpeechClient;
};

function resolveApiKey(deps?: GenerateTtsAudioDeps): string {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(
  input: GenerateTtsAudioInput,
  deps?: GenerateTtsAudioDeps,
): string {
  return (
    input.model?.trim() ||
    deps?.model?.trim() ||
    process.env.OPENAI_TTS_MODEL?.trim() ||
    TTS_MODEL
  );
}

function resolveVoice(
  input: GenerateTtsAudioInput,
  deps?: GenerateTtsAudioDeps,
): TtsVoice {
  return input.voice ?? deps?.voice ?? DEFAULT_COCO_TTS_VOICE;
}

function createClient(apiKey: string): SpeechClient {
  return new OpenAI({ apiKey }) as unknown as SpeechClient;
}

/**
 * Generate spoken Coco audio via OpenAI speech.
 *
 * On success returns mp3 bytes as a `Blob` tagged `audio/mpeg`. On missing key
 * the provider is never called. On any provider exception the error is logged
 * with provider/model/voice metadata only (never the spoken text) and a generic
 * `provider_failed` is returned.
 */
export async function generateTtsAudio(
  input: GenerateTtsAudioInput,
  deps?: GenerateTtsAudioDeps,
): Promise<GenerateTtsAudioResult> {
  const apiKey = resolveApiKey(deps);
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  const model = resolveModel(input, deps);
  const voice = resolveVoice(input, deps);

  try {
    const client = deps?.client ?? createClient(apiKey);
    const response = await client.audio.speech.create({
      model,
      voice,
      input: input.text,
      response_format: TTS_RESPONSE_FORMAT,
      instructions: COCO_TTS_INSTRUCTIONS,
    });

    const buffer = await response.arrayBuffer();
    const audio = new Blob([buffer], { type: "audio/mpeg" });

    return { ok: true, audio, mimeType: "audio/mpeg" };
  } catch {
    log("error", "audio.tts_failed", {
      provider: TTS_PROVIDER,
      model,
      voice,
      error: "provider_failed",
    });
    return { ok: false, error: "provider_failed" };
  }
}
