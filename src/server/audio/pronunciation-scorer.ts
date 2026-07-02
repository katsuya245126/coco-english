/**
 * Server-only Azure pronunciation-assessment adapter.
 *
 * Keep this module out of client components. Tests inject a fake recognizer
 * factory and a fake transcode function so no automated verification calls
 * the paid Azure Speech API.
 */

import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { log } from "@/server/logging/logger";
import { transcodeToWav as defaultTranscodeToWav, type TranscodeResult } from "@/server/audio/audio-transcode";
import { scoreToStarBand, type PronunciationStarBand, type WordScore } from "@/domain/pronunciation/scoring";

const MAX_PRONUNCIATION_AUDIO_MS = 30_000;

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

        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        pronunciationAssessmentConfig.applyTo(recognizer);

        recognizer.recognizeOnceAsync(
          (result) => {
            try {
              const pronunciationResult = sdk.PronunciationAssessmentResult.fromResult(result);
              const jsonResult = result.properties.getProperty(
                sdk.PropertyId.SpeechServiceResponse_JsonResult,
              );
              const parsed = jsonResult ? JSON.parse(jsonResult) : null;
              const rawWords = parsed?.NBest?.[0]?.Words ?? [];

              const words: WordScore[] = rawWords.map((word: Record<string, unknown>) => ({
                word: typeof word.Word === "string" ? word.Word : "",
                accuracyScore:
                  typeof (word.PronunciationAssessment as Record<string, unknown> | undefined)
                    ?.AccuracyScore === "number"
                    ? ((word.PronunciationAssessment as Record<string, unknown>).AccuracyScore as number)
                    : 0,
                errorType:
                  typeof (word.PronunciationAssessment as Record<string, unknown> | undefined)
                    ?.ErrorType === "string"
                    ? ((word.PronunciationAssessment as Record<string, unknown>).ErrorType as string)
                    : "None",
              }));

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
    const raw = await client({
      wav: transcoded.wav,
      referenceText: input.referenceText,
      apiKey,
      region,
    });

    const starBand = scoreToStarBand(raw.pronunciationScore);

    return {
      ok: true,
      score: {
        accuracyScore: raw.accuracyScore,
        fluencyScore: raw.fluencyScore ?? null,
        completenessScore: raw.completenessScore ?? null,
        pronunciationScore: raw.pronunciationScore,
        starBand,
        referenceText: input.referenceText,
        wordScores: raw.words,
      },
    };
  } catch {
    log("error", "audio.pronunciation_scoring_failed", { error: "provider_failed" });
    return { ok: false, error: "provider_failed" };
  }
}
