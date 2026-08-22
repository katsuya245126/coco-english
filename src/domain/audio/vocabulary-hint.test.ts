import { describe, expect, it } from "vitest";
import { buildTranscriptionVocabularyHint } from "@/domain/audio/vocabulary-hint";

describe("buildTranscriptionVocabularyHint", () => {
  it("composes teacher-authored mission text into labeled segments", () => {
    expect(
      buildTranscriptionVocabularyHint({
        title: "Summer Vacation Free Talking",
        targetPattern: "I'm going to ________",
        activePrompt: "What are you going to do this summer vacation?",
        targetExample: "I'm going to go camping.",
      }),
    ).toBe(
      "Lesson topic: Summer Vacation Free Talking. Target sentence: I'm going to. " +
        "Example answer: I'm going to go camping. " +
        "Question: What are you going to do this summer vacation",
    );
  });

  it("drops an example identical to the pattern", () => {
    const hint = buildTranscriptionVocabularyHint({
      title: "Coffee shop scene",
      targetPattern: "Can I have ___, please?",
      targetExample: "Can I have ___, please?",
    });
    expect(hint).toBe(
      "Lesson topic: Coffee shop scene. Target sentence: Can I have , please",
    );
  });

  it("returns an empty string when nothing is authored", () => {
    expect(buildTranscriptionVocabularyHint({})).toBe("");
    expect(
      buildTranscriptionVocabularyHint({ title: null, targetPattern: "  " }),
    ).toBe("");
  });

  it("caps the hint at a bounded length", () => {
    const hint = buildTranscriptionVocabularyHint({
      title: "Word ".repeat(200),
    });
    expect(hint.length).toBeLessThanOrEqual(400);
  });
});
