import { describe, expect, it } from "vitest";
import {
  buildTranslationSegments,
  parseTranslationHint,
  translationHintRequestSchema,
} from "@/domain/ai/translation-hint";

describe("translation hint domain contract", () => {
  const sourceText = "How often do you play soccer?";

  it("accepts zero to three exact semantic phrases in source order", () => {
    expect(
      parseTranslationHint(sourceText, {
        phrases: [
          {
            source: "How often",
            start: 0,
            end: 9,
            translation: "얼마나 자주",
          },
          {
            source: "play soccer",
            start: 17,
            end: 28,
            translation: "축구를 하다",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source: "How often",
            start: 0,
            end: 9,
            translation: "얼마나 자주",
          },
          {
            source: "play soccer",
            start: 17,
            end: 28,
            translation: "축구를 하다",
          },
        ],
      },
    });
    expect(parseTranslationHint(sourceText, { phrases: [] })).toEqual({
      ok: true,
      hint: { phrases: [] },
    });
  });

  it.each([
    {
      name: "more than three phrases",
      phrases: [
        { source: "How", start: 0, end: 3, translation: "어떻게" },
        { source: "often", start: 4, end: 9, translation: "자주" },
        { source: "play", start: 17, end: 21, translation: "하다" },
        { source: "soccer", start: 22, end: 28, translation: "축구" },
      ],
    },
    {
      name: "overlap",
      phrases: [
        { source: "How often", start: 0, end: 9, translation: "얼마나 자주" },
        { source: "often do", start: 4, end: 12, translation: "자주 하다" },
      ],
    },
    {
      name: "reordered",
      phrases: [
        { source: "soccer", start: 22, end: 28, translation: "축구" },
        { source: "How often", start: 0, end: 9, translation: "얼마나 자주" },
      ],
    },
    {
      name: "out of bounds",
      phrases: [
        { source: "soccer?", start: 22, end: 99, translation: "축구" },
      ],
    },
    {
      name: "substring mismatch",
      phrases: [
        { source: "How many", start: 0, end: 9, translation: "얼마나 많이" },
      ],
    },
    {
      name: "empty Korean",
      phrases: [
        { source: "How often", start: 0, end: 9, translation: "   " },
      ],
    },
    {
      name: "isolated function word",
      phrases: [{ source: "you", start: 13, end: 16, translation: "너" }],
    },
    {
      name: "whitespace-only source",
      phrases: [{ source: " ", start: 3, end: 4, translation: "공백" }],
    },
    {
      name: "punctuation-only source",
      phrases: [{ source: "?", start: 28, end: 29, translation: "물음표" }],
    },
  ])("rejects $name", ({ phrases }) => {
    expect(parseTranslationHint(sourceText, { phrases })).toEqual({
      ok: false,
      error: "schema_failed",
    });
  });

  it("segments English without changing spaces or punctuation", () => {
    const parsed = parseTranslationHint(sourceText, {
      phrases: [
        {
          source: "How often",
          start: 0,
          end: 9,
          translation: "얼마나 자주",
        },
      ],
    });
    if (!parsed.ok) throw new Error("fixture must be valid");

    expect(buildTranslationSegments(sourceText, parsed.hint.phrases)).toEqual([
      {
        kind: "phrase",
        text: "How often",
        phrase: parsed.hint.phrases[0],
      },
      { kind: "text", text: " do you play soccer?" },
    ]);
  });

  it("accepts only recordable Coco prompt descriptors", () => {
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "mission_prompt",
        turnOrder: 1,
      }).success,
    ).toBe(true);
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "coco_dynamic_line",
        turnOrder: 1,
      }).success,
    ).toBe(true);
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "student_transcript",
        turnOrder: 1,
      }).success,
    ).toBe(false);
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "mission_prompt",
        turnOrder: 1,
        sourceText,
      }).success,
    ).toBe(false);
  });
});
