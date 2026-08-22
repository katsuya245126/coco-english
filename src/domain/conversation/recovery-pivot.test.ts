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
    ]);
    expect(topicAnchorWords("I like soccer.")).toEqual(["soccer"]);
    expect(topicAnchorWords("Coffee shop scene")).toEqual(["coffee", "shop"]);
    expect(topicAnchorWords("I'd rather _____ because _____")).toEqual([]);
    expect(
      topicAnchorWords("What are you going to do during summer vacation?"),
    ).toEqual(["summer", "vacation"]);
    expect(topicAnchorWords("How often do you _____?")).toEqual([]);
    expect(topicAnchorWords("Homework 3")).toEqual([]);
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

  it("rejects an auxiliary-led scaffold without a leading WH word", () => {
    expect(
      validateRecoveryPivotQuestion("Can you tell me more about soccer?", {
        failedQuestion: "What do you like to play?",
        topicSeed: "soccer",
      }),
    ).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["missing_question_word"]),
    });
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

  it("falls back to a grammatical different-W question for other shapes", () => {
    const pivot = buildDeterministicPivotQuestion({
      failedQuestion: "Who do you like to play soccer with?",
      topicSeed: SUMMER_TOPIC,
    });
    expect(pivot).toBe(
      'What can you tell me about the topic "summer vacation"?',
    );
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
    expect(pivot).toBe("What can you tell me about your answer?");
  });

  it("uses a grammatical different-W fallback for fill-in target patterns", () => {
    const pivot = buildDeterministicPivotQuestion({
      failedQuestion: "Can I have ___, please?",
      topicSeed: "Coffee shop scene",
    });

    expect(pivot).toBe(
      'What can you tell me about the topic "coffee shop"?',
    );
    expect(pivot).not.toContain("___");
    expect(leadingQuestionWord(pivot)).toBe("what");
  });

  it("skips the failed what angle in the ordered fallback set", () => {
    const pivot = buildDeterministicPivotQuestion({
      failedQuestion: "What do you like to play?",
      topicSeed: "soccer",
    });

    expect(pivot).toBe('Who do you talk to about the topic "soccer"?');
  });

  it("skips a deterministic template already asked in recovery history", () => {
    const pivot = buildDeterministicPivotQuestion({
      failedQuestion: "Who do you like to play with?",
      topicSeed: "Coffee shop scene",
      previouslyAsked: ['What can you tell me about the topic "coffee shop"?'],
    });

    expect(pivot).toBe('When do you talk about the topic "coffee shop"?');
  });

  it("keeps searching with a validated word-count fallback when templates repeat", () => {
    const topic = 'the topic "coffee shop"';
    const previouslyAsked = [
      `What can you tell me about ${topic}?`,
      `Who do you talk to about ${topic}?`,
      `When do you talk about ${topic}?`,
      `Where do you talk about ${topic}?`,
      `Why is ${topic} interesting to you?`,
      `How do you feel about ${topic}?`,
      `What can you tell me about ${topic} in 3 words?`,
    ];
    const input = {
      failedQuestion: "Who do you like to play with?",
      topicSeed: "Coffee shop scene",
      previouslyAsked,
    };

    const pivot = buildDeterministicPivotQuestion(input);

    expect(pivot).toBe(
      'What can you tell me about the topic "coffee shop" in 4 words?',
    );
    expect(validateRecoveryPivotQuestion(pivot, input)).toEqual({ ok: true });
  });
});
