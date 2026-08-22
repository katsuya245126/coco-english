import { describe, expect, it } from "vitest";
import {
  buildDeterministicPivotQuestion,
  leadingQuestionWord,
  pickRecoveryPivotWord,
  topicAnchorWords,
  validateRecoveryPivotQuestion,
} from "@/domain/conversation/recovery-pivot";

describe("leadingQuestionWord", () => {
  it("detects each WH word case-insensitively", () => {
    expect(leadingQuestionWord("What are you going to do?")).toBe("what");
    expect(leadingQuestionWord("where do you play?")).toBe("where");
    expect(leadingQuestionWord("Who is coming?")).toBe("who");
  });

  it("returns null for auxiliary-led or non-questions", () => {
    expect(leadingQuestionWord("Can you tell me more?")).toBeNull();
    expect(leadingQuestionWord("I like games.")).toBeNull();
  });
});

describe("pickRecoveryPivotWord", () => {
  it("never repeats the failed question's word", () => {
    expect(pickRecoveryPivotWord("what")).toBe("where");
    expect(pickRecoveryPivotWord("where")).toBe("who");
    expect(pickRecoveryPivotWord(null)).toBe("where");
  });
});

describe("topicAnchorWords", () => {
  it("extracts lowercased content words from teacher-authored text", () => {
    expect(topicAnchorWords("Summer Vacation Free Talking Homework")).toEqual([
      "summer",
      "vacation",
      "free",
      "talking",
      "homework",
    ]);
    expect(topicAnchorWords(null)).toEqual([]);
  });
});

const SUMMER_OPENER = "What are you going to do during summer vacation?";
const SUMMER_TOPIC = "Summer Vacation Free Talking Homework";

describe("validateRecoveryPivotQuestion", () => {
  const validInput = {
    failedQuestion: SUMMER_OPENER,
    topicSeed: SUMMER_TOPIC,
    previouslyAsked: [SUMMER_OPENER, "Who are you going with during summer vacation?"],
  };

  it("accepts a WH pivot on a different angle and topic", () => {
    expect(
      validateRecoveryPivotQuestion("Where are you going during summer vacation?", validInput),
    ).toEqual({ ok: true });
  });

  it("accepts an auxiliary-led scaffold, which recovery policy allows", () => {
    expect(
      validateRecoveryPivotQuestion("Can you tell me one more thing about summer vacation?", validInput),
    ).toEqual({ ok: true });
  });

  it("rejects a candidate that is not a question", () => {
    expect(
      validateRecoveryPivotQuestion("Tell me about summer vacation", validInput),
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["not_question"]),
    });
  });

  it("rejects a non-question with no interrogative shape", () => {
    expect(
      validateRecoveryPivotQuestion("summer vacation sounds nice?", validInput),
    ).toMatchObject({ ok: false, reasons: ["missing_question_word"] });
  });

  it("rejects pivots that reuse the failed question's W word", () => {
    expect(
      validateRecoveryPivotQuestion(
        "What do you want to do during summer vacation?",
        validInput,
      ),
    ).toMatchObject({ ok: false, reasons: ["same_question_word"] });
  });

  it("rejects verbatim repeats of any already-asked question", () => {
    expect(
      validateRecoveryPivotQuestion(`${SUMMER_OPENER}`, validInput),
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["repeats_asked_question"]),
    });
    expect(
      validateRecoveryPivotQuestion(
        "who are you going WITH during summer vacation?",
        validInput,
      ),
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["repeats_asked_question"]),
    });
  });

  it("rejects questions that drift off the mission topic", () => {
    expect(
      validateRecoveryPivotQuestion("Where do you want to eat dinner?", {
        ...validInput,
        previouslyAsked: [],
      }),
    ).toMatchObject({ ok: false, reasons: ["off_topic"] });
  });
});

describe("buildDeterministicPivotQuestion", () => {
  it("builds a grammar-safe Where pivot from the future-plan opener", () => {
    const pivot = buildDeterministicPivotQuestion({
      failedQuestion: SUMMER_OPENER,
      topicSeed: SUMMER_TOPIC,
    });
    expect(pivot).toBe("Where are you going during summer vacation?");
    expect(
      validateRecoveryPivotQuestion(pivot, {
        failedQuestion: SUMMER_OPENER,
        topicSeed: SUMMER_TOPIC,
        previouslyAsked: [SUMMER_OPENER],
      }),
    ).toEqual({ ok: true });
  });

  it("falls back to a topic-seeded scaffold for other question shapes", () => {
    const pivot = buildDeterministicPivotQuestion({
      failedQuestion: "Who do you like to play soccer with?",
      topicSeed: SUMMER_TOPIC,
    });
    expect(pivot).toBe("Can you tell me one more thing about Summer vacation?");
    expect(
      validateRecoveryPivotQuestion(pivot, {
        failedQuestion: "Who do you like to play soccer with?",
        topicSeed: SUMMER_TOPIC,
        previouslyAsked: ["Who do you like to play soccer with?"],
      }),
    ).toEqual({ ok: true });
  });

  it("stays answerable without any topic seed", () => {
    const pivot = buildDeterministicPivotQuestion({
      failedQuestion: "Who do you like to play soccer with?",
    });
    expect(pivot).toBe("Can you tell me one more thing about that?");
  });
});
