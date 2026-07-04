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

export type PhonemeScore = {
  /** ARPAbet phoneme code from Azure, e.g. "dh", "r", "ah". */
  phoneme: string;
  accuracyScore: number;
};

export type WordScore = {
  word: string;
  accuracyScore: number;
  errorType: string;
  /** Per-phoneme accuracy (Phoneme granularity). Optional: older rows omit it. */
  phonemes?: PhonemeScore[];
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

export type WordHighlight = {
  word: string;
  label: string;
};

const MAX_WORDS_TO_PRACTICE = 3;

/**
 * ErrorTypes that mean the student actually said the word but said it
 * imperfectly. Deliberately excludes "Omission"/"Insertion": those compare
 * the audio against the mission's target/model sentence, so a student who
 * gave a correct-but-different free-form answer would rack up "missing"
 * words they never intended to say (e.g. target-sentence vocabulary absent
 * from their own valid answer) — confusing and simply wrong to present as
 * pronunciation practice.
 */
const PRACTICE_ELIGIBLE_ERROR_TYPES = new Set(["Mispronunciation", "Monotone"]);

/** Lowercase, punctuation-stripped word tokens for transcript matching. */
function tokenizeWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z']+/i)
      .map((token) => token.replace(/^'+|'+$/g, ""))
      .filter(Boolean),
  );
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^'+|'+$/g, "");
}

/**
 * Student-facing "words to work on" (PRON-04): the subset of wordScores the
 * student actually attempted but said imperfectly, capped so a child sees a
 * short focused list rather than a full per-word transcript breakdown.
 *
 * `wordScores` come from Azure scoring the audio against the mission's TARGET
 * sentence, not against what the student said — so a word can only be surfaced
 * if it also appears in the student's own transcript. This guards against
 * showing practice words the student never uttered (e.g. target-sentence
 * vocabulary Azure flagged as "missing", or phantom words its recognizer
 * hallucinated from unclear/bilingual audio).
 */
export function wordsToPractice(
  wordScores: WordScore[] | undefined,
  transcript?: string,
): WordHighlight[] {
  if (!wordScores) return [];
  const spokenWords = transcript ? tokenizeWords(transcript) : null;
  return wordScores
    .filter((entry) => PRACTICE_ELIGIBLE_ERROR_TYPES.has(entry.errorType))
    .filter((entry) => spokenWords === null || spokenWords.has(normalizeWord(entry.word)))
    .slice(0, MAX_WORDS_TO_PRACTICE)
    .map((entry) => ({ word: entry.word, label: errorTypeToLabel(entry.errorType) }));
}

/**
 * ARPAbet (Azure's phoneme codes) -> a teacher-friendly plain label plus IPA.
 * Azure emits stress digits on vowels (e.g. "ah0", "ey1"); callers strip those
 * before lookup. Codes not in this map fall back to the raw phoneme so an
 * unmapped sound is still shown rather than dropped.
 */
const ARPABET_LABELS: Record<string, { label: string; ipa: string }> = {
  // Consonants
  b: { label: "b", ipa: "b" },
  ch: { label: "ch", ipa: "tʃ" },
  d: { label: "d", ipa: "d" },
  dh: { label: "th", ipa: "ð" },
  f: { label: "f", ipa: "f" },
  g: { label: "g", ipa: "ɡ" },
  hh: { label: "h", ipa: "h" },
  jh: { label: "j", ipa: "dʒ" },
  k: { label: "k", ipa: "k" },
  l: { label: "l", ipa: "l" },
  m: { label: "m", ipa: "m" },
  n: { label: "n", ipa: "n" },
  ng: { label: "ng", ipa: "ŋ" },
  p: { label: "p", ipa: "p" },
  r: { label: "r", ipa: "r" },
  s: { label: "s", ipa: "s" },
  sh: { label: "sh", ipa: "ʃ" },
  t: { label: "t", ipa: "t" },
  th: { label: "th", ipa: "θ" },
  v: { label: "v", ipa: "v" },
  w: { label: "w", ipa: "w" },
  y: { label: "y", ipa: "j" },
  z: { label: "z", ipa: "z" },
  zh: { label: "zh", ipa: "ʒ" },
  // Vowels
  aa: { label: "ah", ipa: "ɑ" },
  ae: { label: "a", ipa: "æ" },
  ah: { label: "uh", ipa: "ʌ" },
  ao: { label: "aw", ipa: "ɔ" },
  aw: { label: "ow", ipa: "aʊ" },
  ax: { label: "uh", ipa: "ə" },
  ay: { label: "i", ipa: "aɪ" },
  eh: { label: "e", ipa: "ɛ" },
  er: { label: "er", ipa: "ɝ" },
  ey: { label: "ay", ipa: "eɪ" },
  ih: { label: "i", ipa: "ɪ" },
  iy: { label: "ee", ipa: "i" },
  ow: { label: "oh", ipa: "oʊ" },
  oy: { label: "oy", ipa: "ɔɪ" },
  uh: { label: "uu", ipa: "ʊ" },
  uw: { label: "oo", ipa: "u" },
};

/** Strip Azure's trailing stress digit and lowercase: "AH0" -> "ah". */
function normalizePhoneme(phoneme: string): string {
  return phoneme.toLowerCase().replace(/\d+$/, "");
}

export function phonemeLabel(phoneme: string): { label: string; ipa: string } {
  const key = normalizePhoneme(phoneme);
  return ARPABET_LABELS[key] ?? { label: key, ipa: key };
}

export type SoundToWorkOn = {
  /** Plain teacher-facing label, e.g. "r" or "th". */
  label: string;
  /** IPA symbol, e.g. "r" or "θ". */
  ipa: string;
  /** A word the student actually said where this sound scored poorly. */
  exampleWord: string;
  /** Lowest observed accuracy for this sound across the student's words (0-100). */
  accuracyScore: number;
};

/** Below this per-phoneme accuracy a sound counts as needing work. */
const PHONEME_WEAK_THRESHOLD = 50;
const MAX_SOUNDS_TO_WORK_ON = 5;

/**
 * Teacher-facing "sounds to work on": aggregates the weak phonemes across the
 * words the student actually said into a short, deduplicated list of sounds.
 *
 * Like {@link wordsToPractice}, a phoneme is only considered if it comes from a
 * word present in the student's own transcript — Azure scores against the
 * target sentence, so words the student never uttered would otherwise surface
 * phantom sounds. Each sound is reported once, tagged with the lowest-scoring
 * example word so the teacher has something concrete to model.
 */
export function soundsToWorkOn(
  wordScores: WordScore[] | undefined,
  transcript?: string,
): SoundToWorkOn[] {
  if (!wordScores) return [];
  const spokenWords = transcript ? tokenizeWords(transcript) : null;

  // phoneme key -> best (lowest-accuracy) occurrence
  const worst = new Map<string, SoundToWorkOn>();

  for (const word of wordScores) {
    if (spokenWords !== null && !spokenWords.has(normalizeWord(word.word))) {
      continue;
    }
    if (!word.phonemes) continue;

    for (const phoneme of word.phonemes) {
      if (phoneme.accuracyScore >= PHONEME_WEAK_THRESHOLD) continue;
      const key = normalizePhoneme(phoneme.phoneme);
      if (!key) continue;

      const existing = worst.get(key);
      if (existing && existing.accuracyScore <= phoneme.accuracyScore) {
        continue;
      }
      const { label, ipa } = phonemeLabel(phoneme.phoneme);
      worst.set(key, {
        label,
        ipa,
        exampleWord: word.word,
        accuracyScore: phoneme.accuracyScore,
      });
    }
  }

  return [...worst.values()]
    .sort((a, b) => a.accuracyScore - b.accuracyScore)
    .slice(0, MAX_SOUNDS_TO_WORK_ON);
}
