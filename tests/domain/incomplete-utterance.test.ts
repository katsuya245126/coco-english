import { describe, expect, it } from "vitest";
import { isIncompleteUtterance } from "@/domain/ai/incomplete-utterance";

describe("isIncompleteUtterance", () => {
  it.each(["I", " i. ", "A", "an", "the!", "and", "but.", "because", "to"])(
    "flags the syntactically dangling utterance %j",
    (transcript) => {
      expect(isIncompleteUtterance(transcript)).toBe(true);
    },
  );

  it.each([
    "I swim.",
    "I do.",
    "My family.",
    "Chocolate.",
    "On the side.",
    "Because it is fun.",
    "To school.",
    "A cat.",
  ])("does not claim a meaningful short answer is incomplete: %j", (transcript) => {
    expect(isIncompleteUtterance(transcript)).toBe(false);
  });
});
