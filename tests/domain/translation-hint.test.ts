import { describe, expect, it } from "vitest";
import {
  buildTranslationSegments,
  clampPhrasesToPage,
  parseTranslationHint,
  translationHintRequestSchema,
} from "@/domain/ai/translation-hint";
import { paginateDialogueText } from "@/domain/conversation/dialogue-pagination";

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

  it("accepts enough ordered phrase spans to cover a full Coco line", () => {
    const text =
      "That sounds fun! What do you like to play with your friends after school?";

    expect(
      parseTranslationHint(text, {
        phrases: [
          { source: "That sounds fun", translation: "재미있겠다" },
          {
            source: "What do you like to play",
            translation: "너는 무엇을 하는 것을 좋아해?",
          },
          { source: "with your friends", translation: "친구들과 함께" },
          { source: "after school", translation: "방과 후에" },
        ],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source: "That sounds fun",
            start: 0,
            end: 15,
            translation: "재미있겠다",
          },
          {
            source: "What do you like to play",
            start: 17,
            end: 41,
            translation: "너는 무엇을 하는 것을 좋아해?",
          },
          {
            source: "with your friends",
            start: 42,
            end: 59,
            translation: "친구들과 함께",
          },
          {
            source: "after school",
            start: 60,
            end: 72,
            translation: "방과 후에",
          },
        ],
      },
    });
  });

  it("drops a complete long sentence span so hints stay phrase-sized", () => {
    const text = "What game do you like to play after school?";

    expect(
      parseTranslationHint(text, {
        phrases: [
          {
            source: "What game do you like to play after school",
            translation: "너는 방과 후에 어떤 게임을 하는 것을 좋아해?",
          },
          { source: "What game", translation: "어떤 게임" },
          {
            source: "do you like to play",
            translation: "하는 것을 좋아해?",
          },
          { source: "after school", translation: "방과 후에" },
        ],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          { source: "What game", start: 0, end: 9, translation: "어떤 게임" },
          {
            source: "do you like to play",
            start: 10,
            end: 29,
            translation: "하는 것을 좋아해?",
          },
          {
            source: "after school",
            start: 30,
            end: 42,
            translation: "방과 후에",
          },
        ],
      },
    });
  });

  it("keeps a complete long question when no smaller provider spans are available", () => {
    const text = "What will you do at the beach?";

    expect(
      parseTranslationHint(text, {
        phrases: [
          {
            source: "What will you do at the beach",
            translation: "너는 해변에서 무엇을 할 거니?",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source: "What will you do at the beach",
            start: 0,
            end: 29,
            translation: "너는 해변에서 무엇을 할 거니?",
          },
        ],
      },
    });
  });

  it("keeps a whole-line fallback when smaller spans do not cover the second sentence", () => {
    const text =
      "The beach is fun in summer. What will you do at the beach?";

    expect(
      parseTranslationHint(text, {
        phrases: [
          {
            source:
              "The beach is fun in summer. What will you do at the beach",
            translation:
              "여름에는 해변이 재미있어. 너는 해변에서 무엇을 할 거니?",
          },
          {
            source: "The beach is fun in summer",
            translation: "여름에는 해변이 재미있어",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source:
              "The beach is fun in summer. What will you do at the beach",
            start: 0,
            end: 57,
            translation:
              "여름에는 해변이 재미있어. 너는 해변에서 무엇을 할 거니?",
          },
        ],
      },
    });
  });

  it.each([
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

  it("keeps translated question coverage on the second dialogue page", () => {
    const text =
      "That sounds fun because games with friends are exciting. What game do you like to play after school with Minju?";
    const parsed = parseTranslationHint(text, {
      phrases: [
        { source: "That sounds fun", translation: "재미있겠다" },
        {
          source: "because games with friends are exciting",
          translation: "친구들과 하는 게임은 신나니까",
        },
        {
          source: "What game do you like to play",
          translation: "너는 어떤 게임을 하는 것을 좋아해?",
        },
        { source: "after school", translation: "방과 후에" },
        { source: "with Minju", translation: "민주와 함께" },
      ],
    });
    if (!parsed.ok) throw new Error("fixture must be valid");

    const pages = paginateDialogueText(text);
    expect(pages.length).toBeGreaterThan(1);
    const pageTwo = pages[1];
    const pageTwoPhrases = clampPhrasesToPage(parsed.hint.phrases, pageTwo);

    expect(pageTwo.text).toContain("What game");
    expect(pageTwoPhrases.map((phrase) => phrase.source).join(" ")).toContain(
      "What game do you like to play",
    );
    expect(pageTwoPhrases.map((phrase) => phrase.translation)).toEqual(
      expect.arrayContaining([
        "너는 어떤 게임을 하는 것을 좋아해?",
        "방과 후에",
        "민주와 함께",
      ]),
    );
  });

  it("clamps a whole-line fallback onto the second-page beach question", () => {
    const text =
      "The beach is fun in summer. What will you do at the beach?";
    const parsed = parseTranslationHint(text, {
      phrases: [
        {
          source: "The beach is fun in summer. What will you do at the beach",
          translation:
            "여름에는 해변이 재미있어. 너는 해변에서 무엇을 할 거니?",
        },
        {
          source: "The beach is fun in summer",
          translation: "여름에는 해변이 재미있어",
        },
      ],
    });
    if (!parsed.ok) throw new Error("fixture must be valid");

    const pages = paginateDialogueText(text);
    expect(pages[1]?.text).toContain("What will you do at the beach?");
    expect(clampPhrasesToPage(parsed.hint.phrases, pages[1])).toEqual([
      {
        source: "What will you do at the beach",
        start: 0,
        end: 29,
        translation:
          "여름에는 해변이 재미있어. 너는 해변에서 무엇을 할 거니?",
      },
    ]);
  });
});
