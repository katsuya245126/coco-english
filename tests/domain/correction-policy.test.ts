import { describe, expect, it } from "vitest";
import {
  validateImprovedSentencePolicy,
  type ImprovedSentencePolicyInput,
} from "@/domain/ai/correction-policy";

const base: ImprovedSentencePolicyInput = {
  evaluationMode: "conversation",
  answerShape: "open",
  missionQuestion: "What games do you like to play when you swim together?",
  targetPattern: "I like to play _____",
  transcript: "My family.",
  correctionReason: "fragment_completion",
  improvedSentence: "I will swim with my family.",
};

describe("validateImprovedSentencePolicy", () => {
  it("accepts the shortest grounded complete recast", () => {
    expect(validateImprovedSentencePolicy(base)).toEqual({ ok: true });
  });

  it("rejects changing the learner's listed choice", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      evaluationMode: "preset",
      missionQuestion:
        "Which ice cream is the best: vanilla, strawberry, or chocolate?",
      targetPattern: "I think _____ is the best",
      transcript: "I think chocolate ice cream is the best.",
      correctionReason: "vocabulary",
      improvedSentence: "I think vanilla ice cream is the best.",
    });
    expect(result).toEqual({ ok: false, violations: ["open_choice_changed"] });
  });

  it("rejects pure appended embellishment", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "I like to play Jenga.",
      correctionReason: "grammar",
      improvedSentence: "I like to play Jenga when we swim together.",
    });
    expect(result).toEqual({ ok: false, violations: ["pure_embellishment"] });
  });

  it("rejects an invented location", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "On the side.",
      missionQuestion: "What games do you like to play when you swim together?",
      improvedSentence: "I like to play Jenga on the side of the pool.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_ungrounded");
  });

  it("rejects a fragment completion that adds more than five lexical tokens", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      improvedSentence: "I am going to swim with my family in the valley.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_too_long");
  });

  it("rejects copied target-pattern padding", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      targetPattern: "I'm going to _____ in the valley",
      improvedSentence: "I'm going to swim with my family in the valley.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("target_pattern_padding");
  });
});
