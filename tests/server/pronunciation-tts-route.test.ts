import { describe, expect, it } from "vitest";
import { resolvePronunciationFeedbackLineText } from "@/app/student/missions/[assignmentStudentId]/tts/route";

describe("pronunciation feedback speech", () => {
  it.each([
    ["pronunciation_target_weak", "Try S again!"],
    ["pronunciation_word_weak", "Try again!"],
    ["pronunciation_different_word", "Try again! Say: fish"],
    ["pronunciation_good_try", "Good try!"],
  ] as const)("resolves %s to the approved visible feedback", (variant, expected) => {
    expect(
      resolvePronunciationFeedbackLineText(variant, {
        soundId: "s",
        word: "fish",
      }),
    ).toBe(expected);
  });
});
