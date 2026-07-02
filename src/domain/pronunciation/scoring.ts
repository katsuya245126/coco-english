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
