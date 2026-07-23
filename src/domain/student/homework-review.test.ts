import { describe, expect, it } from "vitest";
import { buildImprovedSentenceParts } from "./homework-review";

describe("Homework Review improved-sentence diff", () => {
  it("marks only an added article", () => {
    expect(
      buildImprovedSentenceParts(
        "I'm going to library",
        "I'm going to the library.",
      ),
    ).toEqual([
      { text: "I'm", changed: false },
      { text: " ", changed: false },
      { text: "going", changed: false },
      { text: " ", changed: false },
      { text: "to", changed: false },
      { text: " ", changed: false },
      { text: "the", changed: true },
      { text: " ", changed: false },
      { text: "library", changed: false },
      { text: ".", changed: false },
    ]);
  });

  it("marks replacement words and preserves spaces and punctuation", () => {
    const parts = buildImprovedSentenceParts(
      "I go exercise.",
      "I will exercise.",
    );
    expect(parts.filter((part) => part.changed).map((part) => part.text)).toEqual([
      "will",
    ]);
    expect(parts.map((part) => part.text).join("")).toBe("I will exercise.");
  });

  it("uses a safe whole-sentence correction when lexical diff is unavailable", () => {
    expect(buildImprovedSentenceParts("", "I am ready.")).toEqual([
      { text: "I am ready.", changed: true },
    ]);
  });
});
