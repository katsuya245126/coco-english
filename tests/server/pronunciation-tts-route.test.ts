import { describe, expect, it } from "vitest";
import { resolvePronunciationFeedbackLineText } from "@/domain/pronunciation/practice";

describe("pronunciation feedback speech", () => {
  it.each([
    ["pronunciation_good", "Your fff was strong!"],
    ["pronunciation_target_weak", "Almost! Teeth on your lip — fff. Try again."],
    ["pronunciation_word_weak", "Great fff! Now say the whole word smoothly."],
    ["pronunciation_different_word", "Let's try face — listen again."],
    ["pronunciation_good_try", "Good try! Let's do the next word."],
  ] as const)("resolves %s to the approved visible feedback", (variant, expected) => {
    expect(
      resolvePronunciationFeedbackLineText(variant, {
        soundId: "f",
        word: "face",
      }),
    ).toBe(expected);
  });
});
