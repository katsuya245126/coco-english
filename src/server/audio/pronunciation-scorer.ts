/**
 * Server-only Azure pronunciation-assessment adapter.
 *
 * Keep this module out of client components. Tests inject a fake recognizer
 * factory and a fake transcode function so no automated verification calls
 * the paid Azure Speech API.
 */

import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { z } from "zod";
import { log } from "@/server/logging/logger";
import { transcodeToWav as defaultTranscodeToWav, type TranscodeResult } from "@/server/audio/audio-transcode";
import {
  computeBandScore,
  scoreToStarBand,
  type PronunciationStarBand,
  type WordScore,
} from "@/domain/pronunciation/scoring";

const MAX_PRONUNCIATION_AUDIO_MS = 60_000;
const MAX_CANDIDATE_AUDIO_MS = 30_000;
const N_BEST_PHONEME_COUNT = 5;

export type PronunciationScoreError =
  | "missing_api_key"
  | "transcode_failed"
  | "provider_failed"
  | "audio_too_long";

export type PronunciationScoreDetail = {
  accuracyScore: number;
  fluencyScore: number | null;
  completenessScore: number | null;
  pronunciationScore: number;
  starBand: PronunciationStarBand;
  referenceText: string;
  wordScores: WordScore[];
};

export type PronunciationScoreResult =
  | { ok: true; score: PronunciationScoreDetail }
  | { ok: false; error: PronunciationScoreError };

/**
 * Raw shape returned by the recognizer factory: the assessed accuracy/
 * fluency/completeness/pronunciation scores plus the per-word breakdown.
 * The default factory populates this from
 * `PronunciationAssessmentResult.fromResult()` + the raw NBest[0].Words[]
 * JSON; tests inject a fake factory that resolves this shape directly.
 */
export type PronunciationRecognitionRaw = {
  accuracyScore: number;
  fluencyScore?: number | null;
  completenessScore?: number | null;
  pronunciationScore: number;
  words: WordScore[];
};

export type PronunciationRecognizerFactory = (input: {
  wav: Buffer;
  referenceText: string;
  apiKey: string;
  region: string;
  includeCandidates?: boolean;
}) => Promise<PronunciationRecognitionRaw>;

export type ScorePronunciationInput = {
  file: Blob;
  referenceText: string;
  durationMs: number;
};

export type PronunciationScorerDeps = {
  apiKey?: string;
  region?: string;
  client?: PronunciationRecognizerFactory;
  transcodeToWav?: (blob: Blob) => Promise<TranscodeResult>;
};

function resolveApiKey(deps?: PronunciationScorerDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.AZURE_SPEECH_KEY?.trim() ?? "";
}

function resolveRegion(deps?: PronunciationScorerDeps) {
  if (deps && "region" in deps) return deps.region?.trim() ?? "";
  return process.env.AZURE_SPEECH_REGION?.trim() ?? "";
}

/** Read the duration of the transcoder's 16 kHz mono 16-bit PCM WAV output. */
function readPcmWavDurationMs(wav: Buffer): number | null {
  if (
    wav.length < 12 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  let format: { sampleRate: number; blockAlign: number } | null = null;
  let offset = 12;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt ") {
      if (chunkSize < 16 || chunkDataOffset + 16 > wav.length) return null;
      const audioFormat = wav.readUInt16LE(chunkDataOffset);
      const channels = wav.readUInt16LE(chunkDataOffset + 2);
      const sampleRate = wav.readUInt32LE(chunkDataOffset + 4);
      const blockAlign = wav.readUInt16LE(chunkDataOffset + 12);
      const bitsPerSample = wav.readUInt16LE(chunkDataOffset + 14);
      if (
        audioFormat !== 1 ||
        channels !== 1 ||
        sampleRate !== 16_000 ||
        blockAlign !== 2 ||
        bitsPerSample !== 16
      ) {
        return null;
      }
      format = { sampleRate, blockAlign };
    }

    if (chunkId === "data") {
      if (!format) return null;
      const pcmByteLength = wav.length - chunkDataOffset;
      if (pcmByteLength <= 0 || pcmByteLength % format.blockAlign !== 0) {
        return null;
      }
      return (pcmByteLength / format.blockAlign / format.sampleRate) * 1_000;
    }

    const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2);
    if (nextOffset <= offset || nextOffset > wav.length) return null;
    offset = nextOffset;
  }

  return null;
}

const providerScoreSchema = z.number().finite().min(0).max(100);
const providerCandidateSchema = z.object({
  Phoneme: z.string().trim().min(1),
  Score: providerScoreSchema,
});
const providerResponseSchema = z.object({
  NBest: z.array(z.object({
    Words: z.array(z.object({
      Word: z.string().trim().min(1),
      PronunciationAssessment: z.object({
        AccuracyScore: providerScoreSchema,
        ErrorType: z.string().optional(),
      }),
      Phonemes: z.array(z.object({
        Phoneme: z.string().trim().min(1),
        PronunciationAssessment: z.object({
          AccuracyScore: providerScoreSchema,
          NBestPhonemes: z.array(providerCandidateSchema).optional(),
        }),
      })).optional(),
    })),
  })).min(1),
});

const normalizedRecognitionSchema = z.object({
  accuracyScore: providerScoreSchema,
  fluencyScore: providerScoreSchema.nullish(),
  completenessScore: providerScoreSchema.nullish(),
  pronunciationScore: providerScoreSchema,
  words: z.array(z.object({
    word: z.string().trim().min(1),
    accuracyScore: providerScoreSchema,
    errorType: z.string(),
    phonemes: z.array(z.object({
      phoneme: z.string().trim().min(1),
      accuracyScore: providerScoreSchema,
      candidates: z.array(z.object({
        phoneme: z.string().trim().min(1),
        score: providerScoreSchema,
      })).optional(),
    })).optional(),
  })),
});

/**
 * Parse the provider's raw NBest response. The SDK's typed result does not
 * retain candidate scores, so this boundary owns the JSON shape and rejects
 * malformed candidate evidence instead of filling in guessed values.
 */
export function parsePronunciationAssessmentJson(
  value: unknown,
): WordScore[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const words = providerResponseSchema.parse(parsed).NBest[0].Words;

  return words.map((word) => {
    const phonemes = word.Phonemes?.map((phoneme) => ({
      phoneme: phoneme.Phoneme,
      accuracyScore: phoneme.PronunciationAssessment.AccuracyScore,
      ...(phoneme.PronunciationAssessment.NBestPhonemes?.length
        ? {
            candidates: phoneme.PronunciationAssessment.NBestPhonemes.map(
              (candidate) => ({
                phoneme: candidate.Phoneme,
                score: candidate.Score,
              }),
            ),
          }
        : {}),
    }));
    return {
      word: word.Word,
      accuracyScore: word.PronunciationAssessment.AccuracyScore,
      errorType: word.PronunciationAssessment.ErrorType ?? "None",
      ...(phonemes?.length ? { phonemes } : {}),
    } satisfies WordScore;
  });
}

/** Runtime validation for both injected recognizers and the SDK adapter. */
export function validatePronunciationRecognitionRaw(
  value: unknown,
  includeCandidates = true,
): PronunciationRecognitionRaw {
  const raw = normalizedRecognitionSchema.parse(value);
  const words = includeCandidates
    ? raw.words
    : raw.words.map((word) => ({
        ...word,
        phonemes: word.phonemes?.map(({ candidates: _candidates, ...phoneme }) => phoneme),
      }));

  return {
    accuracyScore: raw.accuracyScore,
    fluencyScore: raw.fluencyScore ?? null,
    completenessScore: raw.completenessScore ?? null,
    pronunciationScore: raw.pronunciationScore,
    words,
  };
}

function createRecognizerFactory(): PronunciationRecognizerFactory {
  return (input) =>
    new Promise((resolve, reject) => {
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(input.apiKey, input.region);
        speechConfig.speechRecognitionLanguage = "en-US";

        const audioConfig = sdk.AudioConfig.fromWavFileInput(input.wav);

        const pronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig(
          input.referenceText,
          sdk.PronunciationAssessmentGradingSystem.HundredMark,
          sdk.PronunciationAssessmentGranularity.Phoneme,
          false,
        );
        if (input.includeCandidates) {
          pronunciationAssessmentConfig.phonemeAlphabet = "IPA";
          pronunciationAssessmentConfig.nbestPhonemeCount =
            N_BEST_PHONEME_COUNT;
        }

        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        pronunciationAssessmentConfig.applyTo(recognizer);

        recognizer.recognizeOnceAsync(
          (result) => {
            try {
              const pronunciationResult = sdk.PronunciationAssessmentResult.fromResult(result);
              const jsonResult = result.properties.getProperty(
                sdk.PropertyId.SpeechServiceResponse_JsonResult,
              );
              const words = parsePronunciationAssessmentJson(jsonResult ?? {});

              resolve({
                accuracyScore: pronunciationResult.accuracyScore,
                fluencyScore: pronunciationResult.fluencyScore ?? null,
                completenessScore: pronunciationResult.completenessScore ?? null,
                pronunciationScore: pronunciationResult.pronunciationScore,
                words,
              });
            } catch (parseError) {
              reject(parseError);
            } finally {
              recognizer.close();
            }
          },
          (error: string) => {
            recognizer.close();
            reject(new Error(error));
          },
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
}

export async function scorePronunciation(
  input: ScorePronunciationInput,
  deps?: PronunciationScorerDeps,
): Promise<PronunciationScoreResult> {
  const apiKey = resolveApiKey(deps);
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  if (input.durationMs > MAX_PRONUNCIATION_AUDIO_MS) {
    return { ok: false, error: "audio_too_long" };
  }

  const transcode = deps?.transcodeToWav ?? defaultTranscodeToWav;
  const transcoded = await transcode(input.file);
  if (!transcoded.ok) {
    return { ok: false, error: "transcode_failed" };
  }

  try {
    const region = resolveRegion(deps);
    const client = deps?.client ?? createRecognizerFactory();
    const actualDurationMs = readPcmWavDurationMs(transcoded.wav);
    const includeCandidates =
      input.durationMs <= MAX_CANDIDATE_AUDIO_MS &&
      actualDurationMs !== null &&
      actualDurationMs <= MAX_CANDIDATE_AUDIO_MS;
    const raw = await client({
      wav: transcoded.wav,
      referenceText: input.referenceText,
      apiKey,
      region,
      includeCandidates,
    });
    const normalized = validatePronunciationRecognitionRaw(raw, includeCandidates);

    const bandScore = computeBandScore(
      normalized.accuracyScore,
      normalized.fluencyScore,
    );
    const starBand = scoreToStarBand(bandScore);

    return {
      ok: true,
      score: {
        accuracyScore: normalized.accuracyScore,
        fluencyScore: normalized.fluencyScore ?? null,
        completenessScore: normalized.completenessScore ?? null,
        pronunciationScore: normalized.pronunciationScore,
        starBand,
        referenceText: input.referenceText,
        wordScores: normalized.words,
      },
    };
  } catch {
    log("error", "audio.pronunciation_scoring_failed", { error: "provider_failed" });
    return { ok: false, error: "provider_failed" };
  }
}
