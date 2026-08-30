import { describe, expect, it } from "vitest";
import {
  computeBandScore,
  errorTypeToLabel,
  MIN_PHONEME_OBSERVATIONS,
  phonemeLabel,
  scoreToStarBand,
  soundsToWorkOn,
  STAR_BAND_COPY,
  studentSoundProfile,
  wordsToPractice,
} from "@/domain/pronunciation/scoring";

describe("scoreToStarBand", () => {
  it("maps high scores to 3 stars", () => {
    expect(scoreToStarBand(85)).toBe(3);
  });

  it("maps mid scores to 2 stars", () => {
    expect(scoreToStarBand(70)).toBe(2);
  });

  it("maps low scores to 1 star", () => {
    expect(scoreToStarBand(40)).toBe(1);
  });

  it("resolves the >=80 boundary to 3 stars", () => {
    expect(scoreToStarBand(80)).toBe(3);
  });

  it("resolves the >=60 boundary to 2 stars", () => {
    expect(scoreToStarBand(60)).toBe(2);
  });

  it("resolves just below the 60 boundary to 1 star", () => {
    expect(scoreToStarBand(59.9)).toBe(1);
  });

  it("never returns 0 or a failure state for a zero score", () => {
    expect(scoreToStarBand(0)).toBe(1);
  });

  it("never returns 0 or a failure state for a negative score", () => {
    expect(scoreToStarBand(-5)).toBe(1);
  });
});

describe("computeBandScore", () => {
  it("blends accuracy and fluency 60/40", () => {
    // 0.6*85 + 0.4*40 = 67
    expect(computeBandScore(85, 40)).toBeCloseTo(67, 5);
  });

  it("lifts a well-pronounced but halting read (acc 85 / flu 40) to a 2-star band", () => {
    expect(scoreToStarBand(computeBandScore(85, 40))).toBe(2);
  });

  it("keeps a genuinely unintelligible read (acc 52 / flu 32) at 1 star", () => {
    // 0.6*52 + 0.4*32 = 44
    expect(scoreToStarBand(computeBandScore(52, 32))).toBe(1);
  });

  it("falls back to accuracy alone when fluency is null", () => {
    expect(computeBandScore(72, null)).toBe(72);
  });

  it("falls back to accuracy alone when fluency is undefined", () => {
    expect(computeBandScore(72, undefined)).toBe(72);
  });
});

describe("STAR_BAND_COPY", () => {
  it("maps 3 stars to encouraging copy", () => {
    expect(STAR_BAND_COPY[3]).toBe("Great job!");
  });

  it("maps 2 stars to encouraging copy", () => {
    expect(STAR_BAND_COPY[2]).toBe("Good try!");
  });

  it("maps 1 star to encouraging copy, never a failure word", () => {
    expect(STAR_BAND_COPY[1]).toBe("Keep practicing!");
  });
});

describe("errorTypeToLabel", () => {
  it("maps None to Clear", () => {
    expect(errorTypeToLabel("None")).toBe("Clear");
  });

  it("maps Omission to Skipped", () => {
    expect(errorTypeToLabel("Omission")).toBe("Skipped");
  });

  it("maps Insertion to Extra word", () => {
    expect(errorTypeToLabel("Insertion")).toBe("Extra word");
  });

  it("maps Mispronunciation to Mispronounced", () => {
    expect(errorTypeToLabel("Mispronunciation")).toBe("Mispronounced");
  });

  it("maps UnexpectedBreak to Pause", () => {
    expect(errorTypeToLabel("UnexpectedBreak")).toBe("Pause");
  });

  it("maps MissingBreak to Pause", () => {
    expect(errorTypeToLabel("MissingBreak")).toBe("Pause");
  });

  it("maps Monotone to Flat tone", () => {
    expect(errorTypeToLabel("Monotone")).toBe("Flat tone");
  });

  it("defaults an unknown ErrorType to Clear", () => {
    expect(errorTypeToLabel("SomeUnknownType")).toBe("Clear");
  });

  it("defaults an undefined ErrorType to Clear", () => {
    expect(errorTypeToLabel(undefined)).toBe("Clear");
  });
});

describe("wordsToPractice", () => {
  it("includes Mispronunciation entries", () => {
    expect(
      wordsToPractice([
        { word: "cat", accuracyScore: 40, errorType: "Mispronunciation" },
      ]),
    ).toEqual([{ word: "cat", label: "Mispronounced" }]);
  });

  it("includes Monotone entries", () => {
    expect(
      wordsToPractice([{ word: "cat", accuracyScore: 90, errorType: "Monotone" }]),
    ).toEqual([{ word: "cat", label: "Flat tone" }]);
  });

  it("excludes None entries", () => {
    expect(
      wordsToPractice([{ word: "cat", accuracyScore: 100, errorType: "None" }]),
    ).toEqual([]);
  });

  it("excludes Omission entries — target-sentence words the student never said should not appear as practice words", () => {
    expect(
      wordsToPractice([{ word: "games", accuracyScore: 0, errorType: "Omission" }]),
    ).toEqual([]);
  });

  it("excludes Insertion entries", () => {
    expect(
      wordsToPractice([{ word: "um", accuracyScore: 0, errorType: "Insertion" }]),
    ).toEqual([]);
  });

  it("filters a mixed list down to only pronunciation-eligible words", () => {
    expect(
      wordsToPractice([
        { word: "I", accuracyScore: 100, errorType: "None" },
        { word: "games", accuracyScore: 0, errorType: "Omission" },
        { word: "cat", accuracyScore: 40, errorType: "Mispronunciation" },
      ]),
    ).toEqual([{ word: "cat", label: "Mispronounced" }]);
  });

  it("caps the result at 3 words", () => {
    const result = wordsToPractice([
      { word: "a", accuracyScore: 40, errorType: "Mispronunciation" },
      { word: "b", accuracyScore: 40, errorType: "Mispronunciation" },
      { word: "c", accuracyScore: 40, errorType: "Mispronunciation" },
      { word: "d", accuracyScore: 40, errorType: "Mispronunciation" },
    ]);
    expect(result).toHaveLength(3);
  });

  it("returns an empty array for undefined wordScores", () => {
    expect(wordsToPractice(undefined)).toEqual([]);
  });

  it("only surfaces mispronounced words the student actually said (transcript intersection)", () => {
    // Azure scored against the TARGET sentence "I am going to Seoul and eat
    // ramen" and flagged target words the student never uttered. The student
    // actually said "I am Seoul and eat ramen" — so "going" must not appear.
    expect(
      wordsToPractice(
        [
          { word: "going", accuracyScore: 30, errorType: "Mispronunciation" },
          { word: "ramen", accuracyScore: 40, errorType: "Mispronunciation" },
        ],
        "I am Seoul and eat ramen.",
      ),
    ).toEqual([{ word: "ramen", label: "Mispronounced" }]);
  });

  it("drops a phantom word absent from the transcript even when Azure flagged it", () => {
    expect(
      wordsToPractice(
        [{ word: "play", accuracyScore: 20, errorType: "Mispronunciation" }],
        "I am Seoul and eat ramen.",
      ),
    ).toEqual([]);
  });

  it("matches transcript words case-insensitively and ignores punctuation", () => {
    expect(
      wordsToPractice(
        [{ word: "Ramen", accuracyScore: 40, errorType: "Mispronunciation" }],
        "I eat RAMEN!",
      ),
    ).toEqual([{ word: "Ramen", label: "Mispronounced" }]);
  });

  it("keeps all mispronounced words when no transcript is provided (backward compatible)", () => {
    expect(
      wordsToPractice([
        { word: "cat", accuracyScore: 40, errorType: "Mispronunciation" },
      ]),
    ).toEqual([{ word: "cat", label: "Mispronounced" }]);
  });
});

describe("phonemeLabel", () => {
  it("maps ARPAbet consonants to plain label + IPA", () => {
    expect(phonemeLabel("dh")).toEqual({ label: "th", ipa: "ð" });
    expect(phonemeLabel("r")).toEqual({ label: "r", ipa: "r" });
    expect(phonemeLabel("th")).toEqual({ label: "th", ipa: "θ" });
  });

  it("strips Azure stress digits and is case-insensitive", () => {
    expect(phonemeLabel("AH0")).toEqual({ label: "uh", ipa: "ʌ" });
    expect(phonemeLabel("EY1")).toEqual({ label: "ay", ipa: "eɪ" });
  });

  it("falls back to the raw phoneme when unmapped", () => {
    expect(phonemeLabel("xx")).toEqual({ label: "xx", ipa: "xx" });
  });
});

describe("soundsToWorkOn", () => {
  it("surfaces weak phonemes with an example word and IPA", () => {
    const result = soundsToWorkOn(
      [
        {
          word: "friends",
          accuracyScore: 9,
          errorType: "Mispronunciation",
          phonemes: [
            { phoneme: "f", accuracyScore: 12 },
            { phoneme: "r", accuracyScore: 14 },
            { phoneme: "eh", accuracyScore: 80 },
          ],
        },
      ],
      "I play with my friends",
    );

    expect(result).toEqual([
      { label: "f", ipa: "f", exampleWord: "friends", accuracyScore: 12 },
      { label: "r", ipa: "r", exampleWord: "friends", accuracyScore: 14 },
    ]);
  });

  it("ignores phonemes at or above the weak threshold", () => {
    expect(
      soundsToWorkOn([
        {
          word: "cat",
          accuracyScore: 90,
          errorType: "None",
          phonemes: [
            { phoneme: "k", accuracyScore: 90 },
            { phoneme: "ae", accuracyScore: 50 },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("deduplicates a sound to its lowest-scoring occurrence", () => {
    const result = soundsToWorkOn([
      {
        word: "red",
        accuracyScore: 30,
        errorType: "Mispronunciation",
        phonemes: [{ phoneme: "r", accuracyScore: 40 }],
      },
      {
        word: "car",
        accuracyScore: 20,
        errorType: "Mispronunciation",
        phonemes: [{ phoneme: "r", accuracyScore: 10 }],
      },
    ]);

    expect(result).toEqual([
      { label: "r", ipa: "r", exampleWord: "car", accuracyScore: 10 },
    ]);
  });

  it("only counts phonemes from words the student actually said", () => {
    // "playground" is in the target but NOT the transcript -> its weak sounds
    // must not surface.
    const result = soundsToWorkOn(
      [
        {
          word: "playground",
          accuracyScore: 19,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: 5 }],
        },
        {
          word: "the",
          accuracyScore: 60,
          errorType: "None",
          phonemes: [{ phoneme: "dh", accuracyScore: 18 }],
        },
      ],
      "the",
    );

    expect(result).toEqual([
      { label: "th", ipa: "ð", exampleWord: "the", accuracyScore: 18 },
    ]);
  });

  it("returns [] when no phoneme data is present", () => {
    expect(
      soundsToWorkOn([
        { word: "cat", accuracyScore: 40, errorType: "Mispronunciation" },
      ]),
    ).toEqual([]);
    expect(soundsToWorkOn(undefined)).toEqual([]);
  });
});

describe("studentSoundProfile", () => {
  // Helper: build N clips each containing one word with one weak `r`, so a
  // phoneme can be pushed over the MIN_PHONEME_OBSERVATIONS gate concisely.
  function weakRClips(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      wordScores: [
        {
          word: "red",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: 20 + i }],
        },
      ],
      transcript: "red",
    }));
  }

  it("returns [] for no clips", () => {
    expect(studentSoundProfile([])).toEqual([]);
  });

  it("excludes a phoneme observed fewer than MIN_PHONEME_OBSERVATIONS times", () => {
    expect(studentSoundProfile(weakRClips(MIN_PHONEME_OBSERVATIONS - 1))).toEqual(
      [],
    );
  });

  it("reports a phoneme once it clears the observation gate", () => {
    const result = studentSoundProfile(weakRClips(MIN_PHONEME_OBSERVATIONS));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: "r",
      ipa: "r",
      weakCount: MIN_PHONEME_OBSERVATIONS,
      totalCount: MIN_PHONEME_OBSERVATIONS,
      exampleWord: "red",
    });
  });

  it("computes averageAccuracy across all occurrences (weak and non-weak)", () => {
    const accuracies = [10, 20, 30, 40, 90];
    const clips = accuracies.map((a) => ({
      wordScores: [
        {
          word: "car",
          accuracyScore: a,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: a }],
        },
      ],
      transcript: "car",
    }));
    const result = studentSoundProfile(clips);
    expect(result[0]).toMatchObject({
      totalCount: 5,
      weakCount: 4,
      averageAccuracy: 38,
    });
  });

  it("picks the lowest-scoring occurrence as the example word", () => {
    const clips = [
      ...weakRClips(MIN_PHONEME_OBSERVATIONS),
      {
        wordScores: [
          {
            word: "grrr",
            accuracyScore: 3,
            errorType: "Mispronunciation",
            phonemes: [{ phoneme: "r", accuracyScore: 3 }],
          },
        ],
        transcript: "grrr",
      },
    ];
    expect(studentSoundProfile(clips)[0].exampleWord).toBe("grrr");
  });

  it("scopes per-clip: a word never spoken in a clip contributes nothing", () => {
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, () => ({
      wordScores: [
        {
          word: "playground",
          accuracyScore: 5,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "r", accuracyScore: 5 }],
        },
      ],
      transcript: "the",
    }));
    expect(studentSoundProfile(clips)).toEqual([]);
  });

  it("excludes phonemes that are never weak even if observed enough", () => {
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, () => ({
      wordScores: [
        {
          word: "cat",
          accuracyScore: 90,
          errorType: "None",
          phonemes: [{ phoneme: "k", accuracyScore: 90 }],
        },
      ],
      transcript: "cat",
    }));
    expect(studentSoundProfile(clips)).toEqual([]);
  });

  it("ranks by weak ratio desc, then average accuracy asc, capped at MAX", () => {
    const codes = ["r", "th", "f", "s", "l", "v"];
    const clips = codes.flatMap((code, idx) =>
      Array.from({ length: MIN_PHONEME_OBSERVATIONS }, () => ({
        wordScores: [
          {
            word: code,
            accuracyScore: 10 + idx,
            errorType: "Mispronunciation",
            phonemes: [{ phoneme: code, accuracyScore: 10 + idx }],
          },
        ],
        transcript: code,
      })),
    );
    const result = studentSoundProfile(clips);
    expect(result).toHaveLength(5); // MAX_SOUNDS_TO_WORK_ON
    expect(result.map((r) => r.label)).toEqual(["r", "th", "f", "s", "l"]);
    expect(result.map((r) => r.label)).not.toContain("v");
  });

  it("ignores words without phoneme data without throwing", () => {
    expect(
      studentSoundProfile([
        {
          wordScores: [
            { word: "cat", accuracyScore: 40, errorType: "Mispronunciation" },
          ],
          transcript: "cat",
        },
      ]),
    ).toEqual([]);
  });

  it("reports the most recurring differing top candidate for a gated weak sound", () => {
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, (_, index) => ({
      wordScores: [
        {
          word: "fan",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [
            {
              phoneme: "f",
              accuracyScore: 20,
              candidates:
                index < 4
                  ? [
                      { phoneme: "p", score: 0.8 },
                      { phoneme: "f", score: 0.2 },
                    ]
                  : [{ phoneme: "f", score: 0.9 }],
            },
          ],
        },
      ],
      transcript: "fan",
    }));

    expect(studentSoundProfile(clips)[0]).toMatchObject({
      label: "f",
      candidate: {
        label: "p",
        ipa: "p",
        count: 4,
        exampleWords: ["fan"],
      },
    });
  });

  it("counts an expected/alternative pair once per clip while collecting unique example words", () => {
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, (_, index) => ({
      wordScores:
        index === 0
          ? [
              {
                word: "fan",
                accuracyScore: 20,
                errorType: "Mispronunciation",
                phonemes: [
                  {
                    phoneme: "f",
                    accuracyScore: 20,
                    candidates: [{ phoneme: "p", score: 0.8 }],
                  },
                ],
              },
              {
                word: "food",
                accuracyScore: 20,
                errorType: "Mispronunciation",
                phonemes: [
                  {
                    phoneme: "f",
                    accuracyScore: 20,
                    candidates: [{ phoneme: "p", score: 0.8 }],
                  },
                ],
              },
            ]
          : [
              {
                word: "fan",
                accuracyScore: 20,
                errorType: "Mispronunciation",
                phonemes: [
                  {
                    phoneme: "f",
                    accuracyScore: 20,
                    candidates: [{ phoneme: "p", score: 0.8 }],
                  },
                ],
              },
            ],
      transcript: index === 0 ? "fan food" : "fan",
    }));

    expect(studentSoundProfile(clips)[0]).toMatchObject({
      candidate: {
        count: MIN_PHONEME_OBSERVATIONS,
        exampleWords: ["fan", "food"],
      },
    });
  });

  it("omits an alternative that only has one supporting clip", () => {
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, (_, index) => ({
      wordScores: [
        {
          word: "fan",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [
            {
              phoneme: "f",
              accuracyScore: 20,
              candidates:
                index === 0
                  ? [{ phoneme: "p", score: 0.8 }]
                  : [{ phoneme: "f", score: 0.9 }],
            },
          ],
        },
      ],
      transcript: "fan",
    }));

    expect(studentSoundProfile(clips)[0]).not.toHaveProperty("candidate");
  });

  it("omits confusion detail when weak candidates are absent or match the expected phoneme", () => {
    const clips = Array.from({ length: MIN_PHONEME_OBSERVATIONS }, () => ({
      wordScores: [
        {
          word: "fan",
          accuracyScore: 20,
          errorType: "Mispronunciation",
          phonemes: [
            {
              phoneme: "f",
              accuracyScore: 20,
              candidates: [{ phoneme: "f", score: 0.9 }],
            },
          ],
        },
      ],
      transcript: "fan",
    }));

    expect(studentSoundProfile(clips)[0]).not.toHaveProperty("candidate");
  });
});
