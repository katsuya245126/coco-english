import { describe, expect, it } from "vitest";
import {
  compileOpenAnswerFrame,
  matchesOpenAnswerFrame,
} from "@/domain/ai/open-answer-frame";

describe("open answer frames", () => {
  it("matches a learner-owned multiword choice without requiring evaluator judgment", () => {
    expect(
      matchesOpenAnswerFrame(
        "I think chocolate ice cream is the best.",
        "Try using: I think _______ is the best",
      ),
    ).toBe(true);
  });

  it("is case- and punctuation-insensitive but fully anchored", () => {
    expect(matchesOpenAnswerFrame("I THINK VANILLA IS THE BEST!", "I think ___ is the best.")).toBe(
      true,
    );
    expect(matchesOpenAnswerFrame("Well, I think vanilla is the best.", "I think ___ is the best.")).toBe(
      false,
    );
  });

  it.each([
    [null, null],
    ["I think vanilla is the best", null],
    ["___ please", null],
    ["Try using: ___ is good", null],
  ] as const)("rejects an unsafe frame %j", (hint, expected) => {
    expect(compileOpenAnswerFrame(hint)).toBe(expected);
  });

  it("requires learner content in every underscore slot", () => {
    expect(matchesOpenAnswerFrame("I think is the best.", "I think ___ is the best.")).toBe(false);
  });
});
