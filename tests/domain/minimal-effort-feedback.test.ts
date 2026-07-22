import { describe, expect, it } from "vitest";
import {
  classifyMinimalEffortFeedback,
  resolveMinimalEffortRetryExample,
} from "@/domain/ai/minimal-effort-feedback";

describe("minimal-effort feedback metadata", () => {
  it.each([
    "I don't know.",
    "I dont know",
    "don't know",
    "I dunno",
    "dunno",
    "idk",
    "I don’t know.",
  ])("classifies %j as unsure", (transcript) => {
    expect(classifyMinimalEffortFeedback(transcript)).toBe("dont_know");
  });

  it.each(["yes", "No.", "yeah", "okay", "maybe..."])(
    "classifies %j as a short answer",
    (transcript) => {
      expect(classifyMinimalEffortFeedback(transcript)).toBe("short_answer");
    },
  );

  it.each(["", "with my friend", "I don't know how to swim."])(
    "does not classify non-blocked answer %j",
    (transcript) => {
      expect(classifyMinimalEffortFeedback(transcript)).toBeNull();
    },
  );

  it("uses an answer-shaped preset example", () => {
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "preset",
        missionQuestion: "How often do you play soccer?",
        targetExample: "I play soccer twice a week.",
      }),
    ).toBe("I play soccer twice a week.");
  });

  it("rejects question-shaped and minimal preset examples", () => {
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "preset",
        missionQuestion: "How often do you play soccer?",
        targetExample: "How often do you play soccer?",
      }),
    ).toBeNull();
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "preset",
        missionQuestion: "Do you play soccer?",
        targetExample: "Yes.",
      }),
    ).toBeNull();
  });

  it("builds a bounded answer example for a conversation frequency question", () => {
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        targetExample: null,
      }),
    ).toBe("I play soccer sometimes.");
  });

  it("changes second-person pronouns in a frequency question to the student's voice", () => {
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "conversation",
        missionQuestion: "How often do you ride your bike outside?",
      }),
    ).toBe("I ride my bike outside sometimes.");
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "conversation",
        missionQuestion: "How often do you ask your teacher to help you?",
      }),
    ).toBeNull();
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "conversation",
        missionQuestion: "How often do you say you are tired?",
      }),
    ).toBeNull();
  });

  it("falls back instead of inventing examples for other dynamic questions", () => {
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "conversation",
        missionQuestion: "Who do you swim with?",
        targetExample: null,
      }),
    ).toBeNull();
  });

  it("extracts the trailing question from a reaction-plus-question opener", () => {
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "conversation",
        missionQuestion:
          "I play soccer three times a week. How often do you play soccer?",
        targetExample: null,
      }),
    ).toBe("I play soccer sometimes.");
  });

  it("extracts the trailing question from a dynamic follow-up with pronoun swap", () => {
    expect(
      resolveMinimalEffortRetryExample({
        evaluationMode: "conversation",
        missionQuestion:
          "Swimming together is fun! How often do you swim with your friend?",
        targetExample: null,
      }),
    ).toBe("I swim with my friend sometimes.");
  });
});
