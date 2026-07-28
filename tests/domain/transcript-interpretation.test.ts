import { describe, expect, it } from "vitest";
import {
  buildLearnerTranscript,
  validateHangulInterpretations,
} from "@/domain/audio/transcript-interpretation";

describe("learner-safe transcript interpretation", () => {
  it("replaces only validated accented-English Hangul spans", () => {
    const raw =
      "바닐라 아이스크림 is tastier than 초콜릿 아이스크림.";

    expect(
      buildLearnerTranscript(raw, [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
        {
          hangul: "아이스크림",
          kind: "accented_english",
          englishReading: "ice cream",
        },
        {
          hangul: "초콜릿",
          kind: "accented_english",
          englishReading: "chocolate",
        },
      ]),
    ).toBe("vanilla ice cream is tastier than chocolate ice cream.");
  });

  it("preserves a proper name exactly as spoken", () => {
    expect(
      buildLearnerTranscript("I'm going to 거제도.", [
        { hangul: "거제도", kind: "name", englishReading: null },
      ]),
    ).toBe("I'm going to 거제도.");
  });

  it.each(["korean_vocabulary", "uncertain"] as const)(
    "hides the whole learner transcript for %s",
    (kind) => {
      expect(
        buildLearnerTranscript("I like 축구.", [
          { hangul: "축구", kind, englishReading: null },
        ]),
      ).toBeNull();
    },
  );

  it("passes through an all-English transcript with empty metadata", () => {
    expect(buildLearnerTranscript("I like soccer.", [])).toBe(
      "I like soccer.",
    );
  });

  it.each([
    {
      name: "missing span",
      interpretations: [],
    },
    {
      name: "duplicated span",
      interpretations: [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
      ],
    },
    {
      name: "extraneous span",
      interpretations: [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
        {
          hangul: "초콜릿",
          kind: "accented_english",
          englishReading: "chocolate",
        },
      ],
    },
    {
      name: "non-English replacement",
      interpretations: [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "香草",
        },
      ],
    },
    {
      name: "replacement on a name",
      interpretations: [
        { hangul: "바닐라", kind: "name", englishReading: "vanilla" },
      ],
    },
  ] as const)("fails closed for $name", ({ interpretations }) => {
    expect(
      buildLearnerTranscript("바닐라 is good.", [...interpretations]),
    ).toBeNull();
    expect(
      validateHangulInterpretations("바닐라 is good.", [
        ...interpretations,
      ]).ok,
    ).toBe(false);
  });
});
