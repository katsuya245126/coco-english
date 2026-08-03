import { z } from "zod";
import {
  isLowConfidenceTranscript,
  type TranscriptConfidence,
} from "@/domain/audio/transcript-confidence";
import {
  scoreToStarBand,
  type PhonemeScore,
  type PronunciationStarBand,
} from "@/domain/pronunciation/scoring";

export const PRACTICE_SOUND_IDS = ["light_l", "s", "f", "v", "z"] as const;
export const PRACTICE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const PRACTICE_TRY_OUTCOMES = [
  "passed",
  "target_weak",
  "word_weak",
  "different_word",
] as const;

export type PracticeSoundId = (typeof PRACTICE_SOUND_IDS)[number];
export type PracticeDifficulty = (typeof PRACTICE_DIFFICULTIES)[number];
export type PracticeTryOutcome = (typeof PRACTICE_TRY_OUTCOMES)[number];

export const PRACTICE_SOUNDS = {
  light_l: {
    label: "Light L",
    ipa: "l",
    arpabet: "L",
    clip: "/audio/pronunciation/sounds/v1/light-l.mp3",
  },
  s: {
    label: "S",
    ipa: "s",
    arpabet: "S",
    clip: "/audio/pronunciation/sounds/v1/s.mp3",
  },
  f: {
    label: "F",
    ipa: "f",
    arpabet: "F",
    clip: "/audio/pronunciation/sounds/v1/f.mp3",
  },
  v: {
    label: "V",
    ipa: "v",
    arpabet: "V",
    clip: "/audio/pronunciation/sounds/v1/v.mp3",
  },
  z: {
    label: "Z",
    ipa: "z",
    arpabet: "Z",
    clip: "/audio/pronunciation/sounds/v1/z.mp3",
  },
} as const;

const practiceWordSchema = z.object({
  order: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  text: z.string().trim().min(1),
  highlightStart: z.number().int().nonnegative(),
  highlightLength: z.number().int().min(1),
  source: z.enum(["verified", "custom"]),
  pronunciation: z.object({
    phones: z.array(z.string().trim().min(1)).min(1),
    targetPhoneIndex: z.number().int().nonnegative(),
    cmuVariant: z.number().int().nonnegative(),
  }),
  wordAudio: z.object({
    schemaVersion: z.literal(1),
    contentHash: z.string().trim().min(1),
    voice: z.literal("en-US-AvaNeural"),
    format: z.literal("audio-24khz-48kbitrate-mono-mp3"),
  }),
});

export const pronunciationPracticeSnapshotSchema = z.object({
  kind: z.literal("pronunciation"),
  version: z.literal(1),
  soundId: z.enum(PRACTICE_SOUND_IDS),
  difficulty: z.enum(PRACTICE_DIFFICULTIES),
  requiredWords: z.literal(5),
  soundClipVersion: z.literal("v1"),
  words: z.array(practiceWordSchema).length(5),
});

export type PronunciationPracticeSnapshot = z.infer<
  typeof pronunciationPracticeSnapshotSchema
>;

export type GradePronunciationTryInput = {
  expectedWord: string;
  targetPhoneIndex: number;
  tryNumber?: 1 | 2 | 3;
  transcript: string;
  transcriptConfidence: TranscriptConfidence | null;
  wordAccuracy: number | null;
  phonemes: ReadonlyArray<PhonemeScore> | null;
};

export type PronunciationTryGrade = {
  outcome: PracticeTryOutcome;
  starBand: PronunciationStarBand | null;
  fullWordPassed: boolean;
  targetSoundAccuracy: number | null;
  targetSoundPassed: boolean;
  feedback: string;
};

function normalizedWord(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z']/g, "");
}

function isConfidentDifferentWord(input: GradePronunciationTryInput): boolean {
  const words = input.transcript
    .toLocaleLowerCase("en-US")
    .match(/[a-z]+(?:'[a-z]+)?/g);
  return (
    words?.length === 1 &&
    words[0] !== normalizedWord(input.expectedWord) &&
    input.transcriptConfidence !== null &&
    input.transcriptConfidence.tokenCount > 0 &&
    !isLowConfidenceTranscript(input.transcriptConfidence)
  );
}

function soundLabelForFeedback(soundId: PracticeSoundId | undefined): string {
  return soundId ? PRACTICE_SOUNDS[soundId].label : "the sound";
}

export function gradePronunciationTry(
  input: GradePronunciationTryInput & { soundId?: PracticeSoundId },
): PronunciationTryGrade {
  if (isConfidentDifferentWord(input)) {
    return {
      outcome: "different_word",
      starBand: null,
      fullWordPassed: false,
      targetSoundAccuracy: null,
      targetSoundPassed: false,
      feedback:
        input.tryNumber === 3
          ? "Good try!"
          : "Try again! Say: " + input.expectedWord,
    };
  }

  const targetSoundAccuracy = input.phonemes?.[input.targetPhoneIndex]?.accuracyScore ?? null;
  const targetSoundPassed = targetSoundAccuracy !== null && targetSoundAccuracy >= 50;
  const starBand = input.wordAccuracy === null ? null : scoreToStarBand(input.wordAccuracy);
  const fullWordPassed = starBand !== null && starBand >= 2;
  const outcome: PracticeTryOutcome =
    fullWordPassed && targetSoundPassed
      ? "passed"
      : !targetSoundPassed
        ? "target_weak"
        : "word_weak";
  const feedback =
    outcome === "passed"
      ? "Good job!"
      : input.tryNumber === 3
        ? "Good try!"
        : outcome === "target_weak"
          ? `Try ${soundLabelForFeedback(input.soundId)} again!`
          : "Try again!";

  return {
    outcome,
    starBand,
    fullWordPassed,
    targetSoundAccuracy,
    targetSoundPassed,
    feedback,
  };
}

export function selectResultTry<T extends { tryNumber: number; outcome: PracticeTryOutcome }>(
  tries: readonly T[],
): T | null {
  return (
    tries.find((tryRow) => tryRow.outcome === "passed") ??
    tries.find((tryRow) => tryRow.tryNumber === 3) ??
    tries.at(-1) ??
    null
  );
}

export function nextPracticeWordOrder(input: {
  words: Array<{ order: number; passed: boolean; validTryCount: number }>;
}): number | null {
  return (
    input.words.find(
      (word) => !word.passed && word.validTryCount < 3,
    )?.order ?? null
  );
}
