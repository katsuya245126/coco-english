import { describe, expect, it } from "vitest";
import {
  isMinimalEffortAnswer,
  MAX_MINIMAL_EFFORT_BLOCKS,
} from "@/domain/ai/minimal-effort-detection";

describe("isMinimalEffortAnswer", () => {
  it.each([
    "yes",
    "Yes.",
    "YES!",
    "no",
    "No.",
    "yeah",
    "Yep",
    "yup",
    "nope",
    "nah",
    "ok",
    "Okay.",
    "maybe",
    "Maybe...",
    "I don't know",
    "I don't know.",
    "I dont know",
    "i dunno",
    "dunno",
    "idk",
    "I don’t know.", // curly apostrophe from mobile keyboards
  ])("flags %j as minimal effort", (transcript) => {
    expect(isMinimalEffortAnswer(transcript)).toBe(true);
  });

  it.each([
    "Yes, I like pizza.",
    "No, I don't play soccer.",
    "I don't know how to swim.",
    "I like playing soccer after school.",
    "with my friend", // real accepted UAT answer — must not be flagged
    "I'm fine.",
    "Okay, let's go to the park.",
    "",
    "   ",
  ])("does not flag %j", (transcript) => {
    expect(isMinimalEffortAnswer(transcript)).toBe(false);
  });

  it("caps blocks at 2 per turn", () => {
    expect(MAX_MINIMAL_EFFORT_BLOCKS).toBe(2);
  });
});
