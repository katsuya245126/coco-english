import { describe, expect, it } from "vitest";
import {
  isExactTargetMatch,
  isFillInTargetPatternMatch,
} from "@/domain/ai/fast-path";

describe("isExactTargetMatch", () => {
  it("matches identical transcripts and target examples", () => {
    expect(isExactTargetMatch("I'm fine.", "I'm fine.")).toBe(true);
  });

  it("ignores case and trailing punctuation", () => {
    expect(
      isExactTargetMatch(
        "I LIKE PLAYING SOCCER AFTER SCHOOL!",
        "I like playing soccer after school.",
      ),
    ).toBe(true);
  });

  it("collapses extra whitespace", () => {
    expect(isExactTargetMatch("Hello   there", "Hello there")).toBe(true);
  });

  it("does not match when the student adds extra words", () => {
    expect(
      isExactTargetMatch(
        "I like playing soccer with my friends after school.",
        "I like playing soccer after school.",
      ),
    ).toBe(false);
  });

  it("does not match when the student's answer is a different sentence", () => {
    expect(isExactTargetMatch("I always use my phone.", "I always use my phone!")).toBe(
      true,
    );
    expect(isExactTargetMatch("I never get up late.", "I sometimes get up late.")).toBe(
      false,
    );
  });

  it("does not match an empty transcript", () => {
    expect(isExactTargetMatch("", "Hello")).toBe(false);
    expect(isExactTargetMatch("   ", "Hello")).toBe(false);
  });

  it("does not match against a question-shaped targetPattern template", () => {
    // targetPattern strings like "How often do you ____?" are never passed
    // to this function directly (only targetExample is), but this guards the
    // normalization against ever treating a blank template as matchable.
    expect(
      isExactTargetMatch("How often do you use your phone?", "How often do you ____?"),
    ).toBe(false);
  });
});

describe("isFillInTargetPatternMatch", () => {
  it("accepts a relevant open-ended answer that fills the assigned grammar frame", () => {
    expect(
      isFillInTargetPatternMatch(
        "I am going to play games.",
        "I'm going to _____.",
      ),
    ).toBe(true);
  });

  it("preserves suffix constraints such as a required gerund", () => {
    expect(
      isFillInTargetPatternMatch("I like playing games.", "I like ___ing."),
    ).toBe(true);
    expect(
      isFillInTargetPatternMatch("I like apples.", "I like ___ing."),
    ).toBe(false);
  });

  it("does not fast-path question-shaped templates or missing slot content", () => {
    expect(
      isFillInTargetPatternMatch(
        "How often do you play games?",
        "How often do you ____?",
      ),
    ).toBe(false);
    expect(
      isFillInTargetPatternMatch(
        "How often do you play games?",
        "How often do you ____",
      ),
    ).toBe(false);
    expect(
      isFillInTargetPatternMatch("I am going to.", "I'm going to _____."),
    ).toBe(false);
  });
});
