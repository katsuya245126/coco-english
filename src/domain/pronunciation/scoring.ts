/**
 * Pure pronunciation-scoring domain mapping.
 *
 * Single source of truth for the Azure pronunciation score -> 1-3 star band
 * mapping and student/teacher-facing copy. No Azure SDK import, no
 * process.env read, no server-only code — safe to import from both server
 * and client modules (e.g. StepAiEvaluationFeedback.tsx).
 *
 * Thresholds below are RESEARCH.md placeholders and are explicitly
 * calibration-owned: the 09-05 manual spot-check (D-04) against this app's
 * own stored student audio will retune STAR_BAND_THRESHOLDS before the
 * student-facing star UI is enabled.
 */

export type PronunciationStarBand = 1 | 2 | 3;

export type WordScore = {
  word: string;
  accuracyScore: number;
  errorType: string;
};

export const STAR_BAND_THRESHOLDS = {
  great: 80,
  good: 60,
} as const;

/**
 * Star-band weighting (calibration-owned, D-04 checkpoint 2026-07-03).
 *
 * Azure's blended `PronNScore` lets a very low fluency drag an otherwise
 * accurate read down to the 1-star "you failed" band — e.g. a child who said
 * the words correctly but haltingly (accuracy 85 / fluency 40) scored 58.8 and
 * banded 1-star. For young non-native kids doing drill homework, accuracy is
 * the lesson and fluency mostly reflects reading pace/nerves, so we lead on
 * accuracy but still let fluency count. Verified against 12 real pre-app
 * student samples: 60/40 gives a 2/9/1 distribution and holds only genuinely
 * unintelligible reads at 1-star.
 *
 * Tunable: change the split and re-run the calibration script to re-check the
 * distribution before shipping student-facing stars.
 */
export const STAR_BAND_WEIGHTS = {
  accuracy: 0.6,
  fluency: 0.4,
} as const;

/**
 * Blend accuracy and fluency into the score used for star banding.
 * When fluency is unavailable, falls back to accuracy alone.
 */
export function computeBandScore(
  accuracyScore: number,
  fluencyScore: number | null | undefined,
): number {
  if (fluencyScore === null || fluencyScore === undefined) {
    return accuracyScore;
  }
  return (
    STAR_BAND_WEIGHTS.accuracy * accuracyScore +
    STAR_BAND_WEIGHTS.fluency * fluencyScore
  );
}

export function scoreToStarBand(pronScore: number): PronunciationStarBand {
  if (pronScore >= STAR_BAND_THRESHOLDS.great) return 3;
  if (pronScore >= STAR_BAND_THRESHOLDS.good) return 2;
  return 1;
}

export const STAR_BAND_COPY: Record<PronunciationStarBand, string> = {
  3: "Great job!",
  2: "Good try!",
  1: "Keep practicing!",
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  None: "Clear",
  Omission: "Skipped",
  Insertion: "Extra word",
  Mispronunciation: "Mispronounced",
  UnexpectedBreak: "Pause",
  MissingBreak: "Pause",
  Monotone: "Flat tone",
};

export function errorTypeToLabel(errorType: string | undefined): string {
  if (!errorType) return "Clear";
  return ERROR_TYPE_LABELS[errorType] ?? "Clear";
}
