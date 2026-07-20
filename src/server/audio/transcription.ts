/**
 * Server-only audio transcription adapter.
 *
 * Keep this module out of client components. Tests inject a fake client so no
 * automated verification calls the paid OpenAI API.
 */

import OpenAI from "openai";
import { detectNoSpeech } from "@/domain/audio/no-speech-detection";
import { log } from "@/server/logging/logger";

const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
export const TRANSCRIPTION_PROMPT =
  "The student is a Korean ESL learner speaking English. Transcribe only the English words spoken.";
const HANGUL_SCRIPT = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]+/gu;
const ENGLISH_LETTER = /[A-Za-z]/;

export type TranscriptionError =
  | "missing_api_key"
  | "empty_transcript"
  | "no_speech"
  | "transcription_failed";

export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; error: TranscriptionError };

export type TranscriptionClient = {
  audio: {
    transcriptions: {
      create(input: {
        file: File;
        model: string;
        language?: string;
        prompt?: string;
      }): Promise<{ text?: string | null }>;
    };
  };
};

export type TranscribeAudioFileInput = {
  file: Blob;
  mimeType: string;
  model?: string;
};

export type TranscribeAudioFileDeps = {
  apiKey?: string;
  model?: string;
  client?: TranscriptionClient;
};

function resolveApiKey(deps?: TranscribeAudioFileDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(input: TranscribeAudioFileInput, deps?: TranscribeAudioFileDeps) {
  return (
    input.model?.trim() ||
    deps?.model?.trim() ||
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
    DEFAULT_TRANSCRIPTION_MODEL
  );
}

function fileNameForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim();
  if (normalized === "audio/mp4" || normalized === "audio/m4a") return "answer.m4a";
  if (normalized === "audio/mpeg") return "answer.mp3";
  if (normalized === "audio/wav" || normalized === "audio/wave") return "answer.wav";
  return "answer.webm";
}

function createClient(apiKey: string): TranscriptionClient {
  return new OpenAI({ apiKey }) as TranscriptionClient;
}

export function normalizeEnglishTranscript(text: string) {
  return text
    .replace(HANGUL_SCRIPT, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasEnglishTranscript(text: string) {
  return ENGLISH_LETTER.test(text);
}

export async function transcribeAudioFile(
  input: TranscribeAudioFileInput,
  deps?: TranscribeAudioFileDeps,
): Promise<TranscriptionResult> {
  const apiKey = resolveApiKey(deps);
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  try {
    const client = deps?.client ?? createClient(apiKey);
    const transcriptFile = new File([input.file], fileNameForMimeType(input.mimeType), {
      type: input.mimeType,
    });
    const response = await client.audio.transcriptions.create({
      file: transcriptFile,
      model: resolveModel(input, deps),
      // Pins the output language so a Korean word mid-sentence doesn't cause
      // Whisper-family models to switch the whole transcript to Korean — a
      // known failure mode with code-switched/bilingual audio.
      language: "en",
      prompt: TRANSCRIPTION_PROMPT,
    });
    const text = normalizeEnglishTranscript(response.text ?? "");

    if (!text || !hasEnglishTranscript(text)) {
      log("error", "audio.transcription_failed", { error: "empty_transcript" });
      return { ok: false, error: "empty_transcript" };
    }

    const noSpeechReason = detectNoSpeech(text, TRANSCRIPTION_PROMPT);
    if (noSpeechReason) {
      log("error", "audio.transcription_failed", {
        error: "no_speech",
        reason: noSpeechReason,
      });
      return { ok: false, error: "no_speech" };
    }

    return { ok: true, text };
  } catch {
    log("error", "audio.transcription_failed", { error: "transcription_failed" });
    return { ok: false, error: "transcription_failed" };
  }
}
