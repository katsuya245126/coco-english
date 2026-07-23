/**
 * Server-only audio transcription adapter.
 *
 * Keep this module out of client components. Tests inject a fake client so no
 * automated verification calls the paid OpenAI API.
 */

import OpenAI from "openai";
import {
  detectHangulSpans,
  isEntirelyNonEnglish,
  type HangulSpan,
} from "@/domain/audio/hangul-romanization";
import { detectNoSpeech } from "@/domain/audio/no-speech-detection";
import {
  isLowConfidenceTranscript,
  summarizeTranscriptConfidence,
  type TranscriptLogprob,
} from "@/domain/audio/transcript-confidence";
import { log } from "@/server/logging/logger";

const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
/**
 * NOTE: this string is also the reference input to `detectNoSpeech`, which
 * catches the transcriber echoing the prompt back on a silent recording.
 * Changing it silently weakens that guard — update the pinned assertion in
 * tests/server/transcription.test.ts in the same edit.
 */
export const TRANSCRIPTION_PROMPT =
  "The student is a Korean ESL learner speaking English. Transcribe the English words spoken. If the student says a Korean word, write it in Hangul exactly as spoken.";
const ENGLISH_LETTER = /[A-Za-z]/;

export type TranscriptionError =
  | "missing_api_key"
  | "empty_transcript"
  | "no_speech"
  /**
   * Clean-reading English decoded from audio the model was not confident
   * about — a hallucination the text itself cannot betray. Callers treat every
   * failure alike (a retry prompt), so this exists to separate the two in
   * logs while the threshold is still provisional.
   */
  | "low_confidence"
  | "transcription_failed";

export type TranscriptionResult =
  | {
      ok: true;
      text: string;
      /**
       * Korean words the learner code-switched, with romanizations, reported
       * alongside a transcript that still contains them verbatim. Non-empty
       * means the evaluator must classify each span as a proper noun to
       * accept or ordinary vocabulary to teach.
       */
      koreanSpans: HangulSpan[];
    }
  | { ok: false; error: TranscriptionError };

export type TranscriptionClient = {
  audio: {
    transcriptions: {
      create(input: {
        file: File;
        model: string;
        language?: string;
        prompt?: string;
        response_format?: string;
        include?: string[];
      }): Promise<{ text?: string | null; logprobs?: TranscriptLogprob[] | null }>;
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

export type NormalizedTranscript = {
  text: string;
  koreanSpans: HangulSpan[];
};

/**
 * Normalize provider text for storage and evaluation.
 *
 * Korean spans are **kept verbatim** and reported separately. Two earlier
 * approaches were rejected:
 *
 * - Deleting them yielded a fluent sentence with the answer missing ("I'm
 *   going to this summer vacation") that nothing downstream could detect as
 *   damaged.
 * - Romanizing them in place wrote English the child never said into
 *   `original_transcript`, fabricating the evidence record a teacher reads
 *   and erasing the chance to teach the word.
 *
 * A fully Korean answer is left for the caller's `hasEnglishTranscript` check
 * to reject, so "the student answered in Korean" still routes to a retry.
 */
export function normalizeEnglishTranscript(text: string): NormalizedTranscript {
  if (isEntirelyNonEnglish(text)) {
    return { text: "", koreanSpans: [] };
  }

  const normalized = text
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return { text: normalized, koreanSpans: detectHangulSpans(normalized) };
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
      // Token logprobs are the only signal that separates a hallucinated
      // decode from a real answer — see domain/audio/transcript-confidence.
      // `include` requires response_format "json" on gpt-4o-mini-transcribe;
      // "verbose_json" is a whisper-1 shape and is rejected with a 400.
      response_format: "json",
      include: ["logprobs"],
    });
    const { text, koreanSpans } = normalizeEnglishTranscript(
      response.text ?? "",
    );

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

    const confidence = summarizeTranscriptConfidence(response.logprobs);
    if (confidence) {
      // Numbers only, on both branches: the transcript is student content, and
      // on the rejection path it is very likely not what the child said at all.
      if (isLowConfidenceTranscript(confidence)) {
        log("error", "audio.transcription_failed", {
          error: "low_confidence",
          minLogprob: confidence.minLogprob,
          tokenCount: confidence.tokenCount,
        });
        return { ok: false, error: "low_confidence" };
      }

      // The accepted side of the distribution. The threshold was set on six
      // clips from one adult speaker in a quiet room; these logs are how it
      // gets re-tuned against real students, and how a false positive on a
      // quiet or far-from-mic answer would first become visible.
      log("info", "audio.transcript_confidence", {
        minLogprob: confidence.minLogprob,
        tokenCount: confidence.tokenCount,
      });
    }

    if (koreanSpans.length > 0) {
      // Span count only: the words themselves are student content and stay
      // out of logs.
      log("info", "audio.transcript_code_switched", {
        spanCount: koreanSpans.length,
      });
    }

    return { ok: true, text, koreanSpans };
  } catch {
    log("error", "audio.transcription_failed", { error: "transcription_failed" });
    return { ok: false, error: "transcription_failed" };
  }
}
