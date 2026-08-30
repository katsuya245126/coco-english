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

export type PhonemeCandidate = {
  /** Provider-ranked phoneme candidate. Candidate scores are rankings, not probabilities. */
  phoneme: string;
  score: number;
};

export type PhonemeScore = {
  /** ARPAbet phoneme code from Azure, e.g. "dh", "r", "ah". */
  phoneme: string;
  accuracyScore: number;
  /** Optional provider-ranked alternatives, in provider order. */
  candidates?: PhonemeCandidate[];
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

function differingTopCandidate(
  expectedKey: string,
  candidates: PhonemeCandidate[] | undefined,
): PhonemeCandidate | undefined {
  const candidate = candidates?.[0];
  if (!candidate) return undefined;
  const candidateKey = normalizePhoneme(candidate.phoneme);
  return candidateKey !== "" && candidateKey !== expectedKey
    ? candidate
    : undefined;
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
  /** The provider's top-ranked alternative, when it differs from the expected sound. */
  candidate?: {
    label: string;
    ipa: string;
  };
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
      const topCandidate = differingTopCandidate(key, phoneme.candidates);
      const candidate =
        topCandidate ? phonemeLabel(topCandidate.phoneme) : undefined;
      worst.set(key, {
        label,
        ipa,
        exampleWord: word.word,
        accuracyScore: phoneme.accuracyScore,
        ...(candidate ? { candidate } : {}),
      });
    }
  }

  return [...worst.values()]
    .sort((a, b) => a.accuracyScore - b.accuracyScore)
    .slice(0, MAX_SOUNDS_TO_WORK_ON);
}

export type StudentClipScore = {
  /** All word scores Azure returned for the clip. */
  wordScores: WordScore[];
  /** The clip's transcript — "what the student actually said". */
  transcript: string;
};

export type StudentSoundWeakness = {
  /** Plain teacher-facing label, e.g. "th". */
  label: string;
  /** IPA symbol, e.g. "θ". */
  ipa: string;
  /** Attempted words containing this phoneme that scored below threshold. */
  weakCount: number;
  /** Attempted words containing this phoneme (weak or not). */
  totalCount: number;
  /** Mean accuracy across all occurrences (0-100), rounded. */
  averageAccuracy: number;
  /** A real word the student said where this sound scored weakest. */
  exampleWord: string;
  /** Most recurring provider-ranked alternative among weak observations, if any. */
  candidate?: SoundConfusionCandidate;
};

export type SoundConfusionCandidate = {
  label: string;
  ipa: string;
  /** Number of clips with a weak expected sound whose top candidate was this sound. */
  count: number;
  /** Words from weak observations that produced this candidate. */
  exampleWords: string[];
};

/**
 * Minimum times a phoneme must be observed across a student's attempted words
 * before it can be reported as a weakness. Guards against a single bad-audio
 * clip (Azure scores many sounds near-zero when it can't hear) branding a
 * student as weak in sounds they only "failed" once. See design doc.
 */
export const MIN_PHONEME_OBSERVATIONS = 5;
const MIN_RECURRING_CANDIDATE_SUPPORT = 2;

type PhonemeTally = {
  weakCount: number;
  totalCount: number;
  sumAccuracy: number;
  lowestAccuracy: number;
  exampleWord: string;
  label: string;
  ipa: string;
  candidates: Map<string, { count: number; exampleWords: string[] }>;
};

/**
 * Teacher-facing per-student "sounds to work on", accumulated across all of a
 * student's scored clips. Unlike the per-clip {@link soundsToWorkOn} (which
 * dedups to the single worst occurrence in one clip), this tallies frequency
 * and average accuracy per phoneme over time and only surfaces a sound once it
 * has been observed at least {@link MIN_PHONEME_OBSERVATIONS} times.
 *
 * Transcript scoping is applied PER CLIP: within each clip only phonemes from
 * words present in that clip's transcript are counted, because Azure scores
 * against the mission's target sentence, not what the student said. A word
 * counts only for the clip(s) where the student actually uttered it.
 */
export function studentSoundProfile(
  clips: StudentClipScore[],
): StudentSoundWeakness[] {
  const tallies = new Map<string, PhonemeTally>();

  for (const clip of clips) {
    const spokenWords = tokenizeWords(clip.transcript);
    const candidatePairsSeenInClip = new Set<string>();

    for (const word of clip.wordScores) {
      if (!spokenWords.has(normalizeWord(word.word))) continue;
      if (!word.phonemes) continue;

      for (const phoneme of word.phonemes) {
        const key = normalizePhoneme(phoneme.phoneme);
        if (!key) continue;

        let tally = tallies.get(key);
        if (!tally) {
          const { label, ipa } = phonemeLabel(phoneme.phoneme);
          tally = {
            weakCount: 0,
            totalCount: 0,
            sumAccuracy: 0,
            lowestAccuracy: Infinity,
            exampleWord: word.word,
            label,
            ipa,
            candidates: new Map(),
          };
          tallies.set(key, tally);
        }

        tally.totalCount += 1;
        tally.sumAccuracy += phoneme.accuracyScore;

        if (phoneme.accuracyScore < PHONEME_WEAK_THRESHOLD) {
          tally.weakCount += 1;
          if (phoneme.accuracyScore < tally.lowestAccuracy) {
            tally.lowestAccuracy = phoneme.accuracyScore;
            tally.exampleWord = word.word;
          }

          const topCandidate = differingTopCandidate(key, phoneme.candidates);
          if (topCandidate) {
            const candidateKey = normalizePhoneme(topCandidate.phoneme);
            const candidate = tally.candidates.get(candidateKey) ?? {
              count: 0,
              exampleWords: [],
            };
            const pairKey = `${key}\u0000${candidateKey}`;
            if (!candidatePairsSeenInClip.has(pairKey)) {
              candidate.count += 1;
              candidatePairsSeenInClip.add(pairKey);
            }
            if (!candidate.exampleWords.includes(word.word)) {
              candidate.exampleWords.push(word.word);
            }
            tally.candidates.set(candidateKey, candidate);
          }
        }
      }
    }
  }

  return [...tallies.values()]
    .filter(
      (t) => t.totalCount >= MIN_PHONEME_OBSERVATIONS && t.weakCount > 0,
    )
    .map((t) => {
      const topCandidate = [...t.candidates.entries()]
        .filter(
          ([, evidence]) =>
            evidence.count >= MIN_RECURRING_CANDIDATE_SUPPORT,
        )
        .sort(([, a], [, b]) => b.count - a.count)[0];
      const candidate = topCandidate
        ? (() => {
            const [phoneme, evidence] = topCandidate;
            const { label, ipa } = phonemeLabel(phoneme);
            return {
              label,
              ipa,
              count: evidence.count,
              exampleWords: evidence.exampleWords,
            } satisfies SoundConfusionCandidate;
          })()
        : undefined;

      return {
        ...(candidate ? { candidate } : {}),
        label: t.label,
        ipa: t.ipa,
        weakCount: t.weakCount,
        totalCount: t.totalCount,
        averageAccuracy: Math.round(t.sumAccuracy / t.totalCount),
        exampleWord: t.exampleWord,
      };
    })
    .sort((a, b) => {
      const ratioA = a.weakCount / a.totalCount;
      const ratioB = b.weakCount / b.totalCount;
      if (ratioB !== ratioA) return ratioB - ratioA; // weaker ratio first
      return a.averageAccuracy - b.averageAccuracy; // then lower average first
    })
    .slice(0, MAX_SOUNDS_TO_WORK_ON);
}
