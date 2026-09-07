import { describe, expect, it } from "vitest";
import {
  PRACTICE_SOUND_IDS,
  PRACTICE_SOUNDS,
  gradePronunciationTry,
  nextPracticeWordOrder,
  pronunciationPracticeSnapshotSchema,
  selectResultTry,
} from "@/domain/pronunciation/practice";

describe("gradePronunciationTry", () => {
  it("passes when the word and target sound pass", () => {
    expect(
      gradePronunciationTry({
        expectedWord: "fish",
        soundId: "f",
        targetPhoneIndex: 0,
        transcript: "fish",
        transcriptConfidence: null,
        wordAccuracy: 81,
        phonemes: [{ phoneme: "f", accuracyScore: 70 }],
      }),
    ).toMatchObject({
      outcome: "passed",
      starBand: 3,
      fullWordPassed: true,
      targetSoundPassed: true,
      feedback: "Your fff was strong!",
    });
  });

  it("uses a confident different word outcome without stars", () => {
    expect(
      gradePronunciationTry({
        expectedWord: "face",
        soundId: "f",
        targetPhoneIndex: 0,
        transcript: "ship",
        transcriptConfidence: { minLogprob: -0.01, tokenCount: 1 },
        wordAccuracy: null,
        phonemes: null,
      }),
    ).toMatchObject({
      outcome: "different_word",
      starBand: null,
      feedback: "Let's try face — listen again.",
    });
  });

  it("prioritizes a weak target sound over a weak word", () => {
    expect(
      gradePronunciationTry({
        expectedWord: "fish",
        soundId: "f",
        targetPhoneIndex: 0,
        transcript: "fish",
        transcriptConfidence: null,
        wordAccuracy: 80,
        phonemes: [{ phoneme: "f", accuracyScore: 49 }],
      }),
    ).toMatchObject({
      outcome: "target_weak",
      starBand: 3,
      fullWordPassed: true,
      targetSoundPassed: false,
      feedback: "Almost! Teeth on your lip — fff. Try again.",
    });
  });

  it("praises a clear target sound when the word is weak", () => {
    expect(
      gradePronunciationTry({
        expectedWord: "face",
        soundId: "f",
        targetPhoneIndex: 0,
        transcript: "face",
        transcriptConfidence: null,
        wordAccuracy: 59,
        phonemes: [{ phoneme: "f", accuracyScore: 80 }],
      }),
    ).toMatchObject({
      outcome: "word_weak",
      feedback: "Great fff! Now say the whole word smoothly.",
    });
  });

  it("passes at the two score boundaries", () => {
    expect(
      gradePronunciationTry({
        expectedWord: "fish",
        targetPhoneIndex: 0,
        transcript: "fish",
        transcriptConfidence: null,
        wordAccuracy: 60,
        phonemes: [{ phoneme: "f", accuracyScore: 50 }],
      }),
    ).toMatchObject({ outcome: "passed", starBand: 2 });
  });

  it("uses Good try after a third different-word try", () => {
    expect(
      gradePronunciationTry({
        expectedWord: "fish",
        targetPhoneIndex: 0,
        transcript: "dish",
        transcriptConfidence: { minLogprob: -0.01, tokenCount: 1 },
        wordAccuracy: null,
        phonemes: null,
        tryNumber: 3,
      }),
    ).toMatchObject({
      outcome: "different_word",
      feedback: "Good try! Let's do the next word.",
    });
  });

  it.each([
    [
      "target_weak",
      {
        transcript: "fish",
        transcriptConfidence: null,
        wordAccuracy: 80,
        phonemes: [{ phoneme: "f", accuracyScore: 49 }],
      },
    ],
    [
      "word_weak",
      {
        transcript: "fish",
        transcriptConfidence: null,
        wordAccuracy: 59,
        phonemes: [{ phoneme: "f", accuracyScore: 80 }],
      },
    ],
    [
      "different_word",
      {
        transcript: "dish",
        transcriptConfidence: { minLogprob: -0.01, tokenCount: 1 },
        wordAccuracy: null,
        phonemes: null,
      },
    ],
  ] as const)("uses Good try for a third %s result", (_expectedOutcome, input) => {
    expect(
      gradePronunciationTry({
        expectedWord: "fish",
        soundId: "f",
        targetPhoneIndex: 0,
        tryNumber: 3,
        ...input,
        phonemes: input.phonemes?.map((phoneme) => ({ ...phoneme })) ?? null,
      }),
    ).toMatchObject({
      outcome: _expectedOutcome,
      feedback: "Good try! Let's do the next word.",
    });
  });

  it("does not classify an unclear different transcript as a different word", () => {
    expect(
      gradePronunciationTry({
        expectedWord: "fish",
        targetPhoneIndex: 0,
        transcript: "dish",
        transcriptConfidence: { minLogprob: -0.2, tokenCount: 1 },
        wordAccuracy: 60,
        phonemes: [{ phoneme: "f", accuracyScore: 50 }],
      }),
    ).toMatchObject({ outcome: "passed" });
  });
});

describe("PRACTICE_SOUNDS", () => {
  it("provides the approved tip for every supported sound", () => {
    expect(
      PRACTICE_SOUND_IDS.map((soundId) => [soundId, PRACTICE_SOUNDS[soundId].tip]),
    ).toEqual([
      ["light_l", "Touch your tongue behind your top teeth"],
      ["s", "Keep your teeth close and let air hiss"],
      ["f", "Teeth on your lip"],
      ["v", "Teeth on your lip and turn your voice on"],
      ["z", "Keep your teeth close and turn your voice on"],
    ]);
  });
});

describe("selectResultTry", () => {
  it("selects the first try that passes both checks", () => {
    expect(
      selectResultTry([
        { tryNumber: 1, outcome: "word_weak" },
        { tryNumber: 2, outcome: "passed" },
      ]),
    ).toMatchObject({ tryNumber: 2 });
  });

  it("uses try three when no try passes", () => {
    expect(
      selectResultTry([
        { tryNumber: 1, outcome: "different_word" },
        { tryNumber: 2, outcome: "target_weak" },
        { tryNumber: 3, outcome: "different_word" },
      ]),
    ).toMatchObject({ tryNumber: 3 });
  });
});

describe("pronunciationPracticeSnapshotSchema", () => {
  it("accepts the immutable five-word snapshot shape", () => {
    const result = pronunciationPracticeSnapshotSchema.safeParse({
      kind: "pronunciation",
      version: 1,
      soundId: "f",
      difficulty: "easy",
      requiredWords: 5,
      soundClipVersion: "v1",
      words: [1, 2, 3, 4, 5].map((order) => ({
        order,
        text: "fish",
        highlightStart: 0,
        highlightLength: 1,
        source: "verified",
        pronunciation: {
          phones: ["F", "IH1", "SH"],
          targetPhoneIndex: 0,
          cmuVariant: 1,
        },
        wordAudio: {
          schemaVersion: 1,
          contentHash: "hash",
          voice: "en-US-AvaNeural",
          format: "audio-24khz-48kbitrate-mono-mp3",
        },
      })),
    });

    expect(result.success).toBe(true);
  });
});

describe("nextPracticeWordOrder", () => {
  it("opens the first unfinished word", () => {
    expect(
      nextPracticeWordOrder({
        words: [
          { order: 1, passed: true, validTryCount: 1 },
          { order: 2, passed: false, validTryCount: 2 },
          { order: 3, passed: false, validTryCount: 0 },
        ],
      }),
    ).toBe(2);
  });
});
