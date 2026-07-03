/**
 * Server-only audio transcription adapter.
 *
 * Keep this module out of client components. Tests inject a fake client so no
 * automated verification calls the paid OpenAI API.
 */

import OpenAI from "openai";
import { log } from "@/server/logging/logger";

const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

export type TranscriptionError =
  | "missing_api_key"
  | "empty_transcript"
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
      prompt: "The student is a Korean ESL learner speaking English. Transcribe only the English words spoken.",
    });
    const text = response.text?.trim() ?? "";

    if (!text) {
      log("error", "audio.transcription_failed", { error: "empty_transcript" });
      return { ok: false, error: "empty_transcript" };
    }

    return { ok: true, text };
  } catch {
    log("error", "audio.transcription_failed", { error: "transcription_failed" });
    return { ok: false, error: "transcription_failed" };
  }
}
