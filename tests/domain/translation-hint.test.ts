import { describe, expect, it } from "vitest";
import {
  buildTranslationSegments,
  clampPhrasesToPage,
  getFirstTranslationPhraseSegmentIndex,
  parseTranslationHint,
  toggleTranslationBubble,
  translationHintRequestSchema,
} from "@/domain/ai/translation-hint";

describe("translation hint domain contract", () => {
  const sourceText = "How often do you play soccer?";

  it("locates offset-free phrases in the source text", () => {
    expect(
      parseTranslationHint(sourceText, {
        phrases: [
          { source: "How often", translation: "얼마나 자주" },
          { source: "play soccer", translation: "축구를 하다" },
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

  it("ignores model-provided offsets and recomputes them", () => {
    expect(
      parseTranslationHint(sourceText, {
        phrases: [
          { source: "How often", start: 3, end: 7, translation: "얼마나 자주" },
          {
            source: "play soccer",
            start: 0,
            end: 99,
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
  });

  it("resolves repeated phrases to successive occurrences", () => {
    const text = "I like soccer because soccer is fun.";
    expect(
      parseTranslationHint(text, {
        phrases: [
          { source: "soccer", translation: "축구" },
          { source: "soccer is fun", translation: "축구는 재미있다" },
        ],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          { source: "soccer", start: 7, end: 13, translation: "축구" },
          {
            source: "soccer is fun",
            start: 22,
            end: 35,
            translation: "축구는 재미있다",
          },
        ],
      },
    });
  });

  it("locates phrases the model padded with whitespace", () => {
    expect(
      parseTranslationHint(sourceText, {
        phrases: [{ source: " How often ", translation: "얼마나 자주" }],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          { source: "How often", start: 0, end: 9, translation: "얼마나 자주" },
        ],
      },
    });
  });

  it.each([
    {
      name: "phrases missing from the source",
      phrases: [
        { source: "How many", translation: "얼마나 많이" },
        { source: "play soccer", translation: "축구를 하다" },
      ],
      kept: [
        {
          source: "play soccer",
          start: 17,
          end: 28,
          translation: "축구를 하다",
        },
      ],
    },
    {
      name: "phrases returned out of source order",
      phrases: [
        { source: "soccer", translation: "축구" },
        { source: "How often", translation: "얼마나 자주" },
      ],
      kept: [{ source: "soccer", start: 22, end: 28, translation: "축구" }],
    },
    {
      name: "isolated function words",
      phrases: [
        { source: "you", translation: "너" },
        { source: "How often", translation: "얼마나 자주" },
      ],
      kept: [
        { source: "How often", start: 0, end: 9, translation: "얼마나 자주" },
      ],
    },
    {
      name: "punctuation-only phrases",
      phrases: [
        { source: "?", translation: "물음표" },
        { source: "How often", translation: "얼마나 자주" },
      ],
      kept: [
        { source: "How often", start: 0, end: 9, translation: "얼마나 자주" },
      ],
    },
  ])("drops $name and keeps the rest", ({ phrases, kept }) => {
    expect(parseTranslationHint(sourceText, { phrases })).toEqual({
      ok: true,
      hint: { phrases: kept },
    });
  });

  it.each([
    {
      name: "more than three phrases",
      phrases: [
        { source: "How", translation: "어떻게" },
        { source: "often", translation: "자주" },
        { source: "play", translation: "하다" },
        { source: "soccer", translation: "축구" },
      ],
    },
    {
      name: "empty Korean",
      phrases: [{ source: "How often", translation: "   " }],
    },
    {
      name: "empty source",
      phrases: [{ source: "", translation: "빈 문자열" }],
    },
    {
      name: "non-array phrases",
      phrases: "How often",
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

  it("attaches trailing terminal punctuation to the last phrase instead of leaving it orphaned", () => {
    const text = "Great! Who do you play soccer with at school?";
    const parsed = parseTranslationHint(text, {
      phrases: [
        { source: "Who do you", translation: "누구랑" },
        { source: "play soccer", translation: "축구를 하다" },
        { source: "at school", translation: "학교에서" },
      ],
    });
    if (!parsed.ok) throw new Error("fixture must be valid");

    const segments = buildTranslationSegments(text, parsed.hint.phrases);
    const last = segments.at(-1);
    expect(last?.kind).toBe("phrase");
    expect(last).toMatchObject({ text: "at school?" });
    expect(segments.some((segment) => segment.kind === "text" && segment.text === "?")).toBe(
      false,
    );
  });

  it("finds the first translated segment and toggles its bubble", () => {
    const text = "Please play soccer today.";
    const phrases = [
      {
        source: "play soccer",
        start: 7,
        end: 18,
        translation: "축구를 하다",
      },
    ];

    const firstIndex = getFirstTranslationPhraseSegmentIndex(text, phrases);
    expect(firstIndex).toBe(1);
    expect(toggleTranslationBubble(null, firstIndex)).toBe(1);
    expect(toggleTranslationBubble(1, firstIndex)).toBeNull();
    expect(toggleTranslationBubble(2, firstIndex)).toBeNull();
    expect(getFirstTranslationPhraseSegmentIndex(text, [])).toBeNull();
    expect(toggleTranslationBubble(null, null)).toBeNull();
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

describe("clampPhrasesToPage", () => {
  // Source: "One two three four five six"
  //          0123456789...
  // Pages:  [0,14) "One two three " and [14,27) "four five six"
  const pageOne = { start: 0, end: 14, text: "One two three " };
  const pageTwo = { start: 14, end: 27, text: "four five six" };

  it("clamps a straddling phrase to per-page segments with the full translation", () => {
    const phrase = {
      source: "three four",
      start: 8,
      end: 18,
      translation: "셋 넷",
    };
    expect(clampPhrasesToPage([phrase], pageOne)).toEqual([
      { source: "three ", start: 8, end: 14, translation: "셋 넷" },
    ]);
    expect(clampPhrasesToPage([phrase], pageTwo)).toEqual([
      { source: "four", start: 0, end: 4, translation: "셋 넷" },
    ]);
  });

  it("keeps inside phrases page-relative and drops outside phrases", () => {
    const inside = { source: "two", start: 4, end: 7, translation: "둘" };
    const outside = { source: "five", start: 19, end: 23, translation: "다섯" };
    expect(clampPhrasesToPage([inside, outside], pageOne)).toEqual([
      { source: "two", start: 4, end: 7, translation: "둘" },
    ]);
    expect(clampPhrasesToPage([], pageOne)).toEqual([]);
  });
});
