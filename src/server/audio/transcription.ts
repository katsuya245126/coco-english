/**
 * Server-only audio transcription adapter.
 *
 * Keep this module out of client components. Tests inject a fake client so no
 * automated verification calls the paid OpenAI API.
 */

import OpenAI from "openai";
import {
  detectHangulSpans,
  HANGUL_PATTERN,
  type HangulSpan,
} from "@/domain/audio/hangul-romanization";
import { detectNoSpeech } from "@/domain/audio/no-speech-detection";
import {
  isLowConfidenceTranscript,
  summarizeTranscriptConfidence,
  type TranscriptConfidence,
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
      model: string;
      confidence: TranscriptConfidence | null;
    }
  | { ok: false; error: TranscriptionError };

export type TranscriptionEvidence = {
  model: string;
  confidence: TranscriptConfidence | null;
};

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
  /**
   * Mission-derived vocabulary appended to the decode prompt so lesson
   * phrases ("I'd rather", destination names) stop being misheard
   * (issue #64). Teacher-authored content only; must be composed via
   * buildTranscriptionVocabularyHint. The SAME effective prompt string is
   * passed to detectNoSpeech, which catches the transcriber echoing the
   * prompt back on silent recordings — changing one without the other
   * silently weakens that guard.
   */
  vocabularyHint?: string;
};

export type TranscribeAudioFileDeps = {
  apiKey?: string;
  model?: string;
  client?: TranscriptionClient;
  /** Overrides REJECT_LOW_CONFIDENCE_TRANSCRIPTS. See `rejectsLowConfidence`. */
  rejectLowConfidence?: boolean;
};

function resolveApiKey(deps?: TranscribeAudioFileDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

/**
 * Whether a low-confidence transcript is actually rejected, or merely logged.
 *
 * **Defaults to shadow mode (log only).** Enabling rejection on 2026-07-24
 * blocked real students from progressing: good answers were repeatedly told
 * "Hmm... Can you say it again?" with no way past. The -0.1 threshold had been
 * measured on six clips from one adult in a quiet room, and real classroom
 * audio does not resemble that.
 *
 * Shadow mode keeps the measurement running — every clip still logs its
 * confidence and whether it *would* have been blocked — so the threshold can
 * be re-set on real data before anything is turned back on. Do not flip this
 * default; set REJECT_LOW_CONFIDENCE_TRANSCRIPTS=true once the logged
 * distribution justifies a specific threshold.
 */
function rejectsLowConfidence(deps?: TranscribeAudioFileDeps) {
  if (deps && "rejectLowConfidence" in deps) {
    return deps.rejectLowConfidence === true;
  }
  return process.env.REJECT_LOW_CONFIDENCE_TRANSCRIPTS?.trim() === "true";
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
 * An all-Hangul transcript is **also** kept verbatim (UAT 2026-07-25). Blanking
 * it here was the third rejected approach: a child answering the bare English
 * word "Bananas." is transcribed "바나나스", which has no Latin letter, so the
 * blank turned into `empty_transcript` and the student was told "I didn't hear
 * you. Try again." with no way past.
 *
 * Rewording TRANSCRIPTION_PROMPT was measured and rejected as the fix — across
 * four real clips it never stopped producing "바나나스", and every candidate
 * that softened the Korean framing broke code-switch retention (김밥 became
 * "kimbap", 민준 became "Min-jun").
 *
 * Whether all-Hangul text is accented English or a genuinely Korean answer is
 * the syntactic judgement the NOTE in `hangul-romanization.ts` assigns to the
 * evaluator, which already owns both halves: the phonetic rule that reads
 * "Bananaseu" as *bananas*, and the `non_english` path that sends a real
 * Korean answer back for a retry. This layer must not pre-empt either.
 */
export function normalizeEnglishTranscript(text: string): NormalizedTranscript {
  const normalized = text
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return { text: normalized, koreanSpans: detectHangulSpans(normalized) };
}

/**
 * Whether a transcript carries any content worth evaluating.
 *
 * Latin letters OR Hangul both count. This deliberately no longer means "has
 * English": an all-Hangul transcript may be accented English the transcriber
 * mis-scripted ("바나나스" for *bananas*), and only the evaluator can tell that
 * apart from a genuinely Korean answer. See `normalizeEnglishTranscript`.
 */
export function hasEnglishTranscript(text: string) {
  return ENGLISH_LETTER.test(text) || HANGUL_PATTERN.test(text);
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
    const model = resolveModel(input, deps);
    const hint = input.vocabularyHint?.trim() ?? "";
    const effectivePrompt = hint
      ? `${TRANSCRIPTION_PROMPT} ${hint}`
      : TRANSCRIPTION_PROMPT;
    const transcriptFile = new File([input.file], fileNameForMimeType(input.mimeType), {
      type: input.mimeType,
    });
    const response = await client.audio.transcriptions.create({
      file: transcriptFile,
      model,
      // Pins the output language so a Korean word mid-sentence doesn't cause
      // Whisper-family models to switch the whole transcript to Korean — a
      // known failure mode with code-switched/bilingual audio.
      language: "en",
      prompt: effectivePrompt,
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

    const noSpeechReason = detectNoSpeech(text, effectivePrompt);
    if (noSpeechReason) {
      log("error", "audio.transcription_failed", {
        error: "no_speech",
        reason: noSpeechReason,
      });
      return { ok: false, error: "no_speech" };
    }

    const confidence = summarizeTranscriptConfidence(response.logprobs);
    if (confidence) {
      const lowConfidence = isLowConfidenceTranscript(confidence);

      // Numbers only: the transcript is student content, and on the
      // low-confidence path it is quite possibly not what the child said.
      // `blocked` distinguishes a real rejection from a shadow-mode hit, so
      // the two are countable separately in the logs.
      log(lowConfidence ? "warn" : "info", "audio.transcript_confidence", {
        minLogprob: confidence.minLogprob,
        tokenCount: confidence.tokenCount,
        lowConfidence,
        blocked: lowConfidence && rejectsLowConfidence(deps),
      });

      if (lowConfidence && rejectsLowConfidence(deps)) {
        log("error", "audio.transcription_failed", {
          error: "low_confidence",
          minLogprob: confidence.minLogprob,
          tokenCount: confidence.tokenCount,
        });
        return { ok: false, error: "low_confidence" };
      }
    }

    if (koreanSpans.length > 0) {
      // Span count only: the words themselves are student content and stay
      // out of logs.
      log("info", "audio.transcript_code_switched", {
        spanCount: koreanSpans.length,
      });
    }

    return { ok: true, text, koreanSpans, model, confidence };
  } catch {
    log("error", "audio.transcription_failed", { error: "transcription_failed" });
    return { ok: false, error: "transcription_failed" };
  }
}
