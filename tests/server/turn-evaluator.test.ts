import { describe, expect, it, vi } from "vitest";
import type { TurnEvaluationResponsesClient } from "@/server/ai/turn-evaluator";

type FakeEvaluationResponsesClient = TurnEvaluationResponsesClient;

function createFakeClient(result: unknown): FakeEvaluationResponsesClient {
  return {
    responses: {
      parse: vi.fn(async () => result) as TurnEvaluationResponsesClient["responses"]["parse"],
    },
  };
}

const correctOriginalProviderResult = {
  version: "ai-eval-v1",
  outcome: "correct",
  meaningUnderstood: true,
  targetPatternAttempted: true,
  correctionNeeded: false,
  improvedSentence: null,
  englishLanguage: "english",
  confidence: "high",
  reviewReason: null,
};

describe("evaluateOriginalTurn server adapter (D-01 through D-07, D-10)", () => {
  it("uses a fake Responses client for correct English target responses without paid calls", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        transcript: "I like playing soccer after school.",
        targetPattern: "I like ___ing.",
        targetExample: "I like playing soccer after school.",
        level: "elementary",
      },
      { apiKey: "test-key", client, model: "test-evaluator" },
    );

    expect(result).toEqual({
      ok: true,
      evaluation: correctOriginalProviderResult,
    });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-evaluator" }),
    );
  });

  it("maps missing API key before creating a provider request", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        transcript: "I like soccer.",
        targetPattern: "I like ___ing.",
        targetExample: "I like playing soccer.",
        level: "beginner",
      },
      { apiKey: "", client },
    );

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
    expect(client.responses.parse).not.toHaveBeenCalled();
  });

  it("maps provider failures to teacher-reviewable adapter errors", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client: FakeEvaluationResponsesClient = {
      responses: {
        parse: vi.fn(async () => {
          throw new Error("provider unavailable");
        }) as TurnEvaluationResponsesClient["responses"]["parse"],
      },
    };

    const result = await evaluateOriginalTurn(
      {
        transcript: "I like soccer.",
        targetPattern: "I like ___ing.",
        targetExample: "I like playing soccer.",
        level: "beginner",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "provider_failed" });
  });

  it("maps malformed or failed-schema original outputs to schema_failed", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        ...correctOriginalProviderResult,
        englishLanguage: "japanese",
      },
    });

    const result = await evaluateOriginalTurn(
      {
        transcript: "サッカーが好きです。",
        targetPattern: "I like ___ing.",
        targetExample: "I like playing soccer.",
        level: "beginner",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
  });

  it("instructs the model to correct clear off-topic English instead of sending it to teacher review", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        ...correctOriginalProviderResult,
        outcome: "needs_correction",
        meaningUnderstood: true,
        targetPatternAttempted: false,
        correctionNeeded: true,
        improvedSentence: "Wow!",
      },
    });

    const result = await evaluateOriginalTurn(
      {
        missionQuestion: "Say wow.",
        transcript: "There was once a man.",
        targetPattern: "wow",
        targetExample: "Wow!",
        level: "beginner",
      },
      { apiKey: "test-key", client },
    );

    expect(result.ok).toBe(true);
    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
    };

    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("clear off-topic English"),
        expect.stringContaining("NOT teacher_review"),
        expect.stringContaining("Short target examples"),
      ]),
    );
  });
});

describe("evaluateRepeatTurn server adapter (AI-04, AI-05)", () => {
  it("accepts close repeat fixtures from a fake client", async () => {
    const { evaluateRepeatTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        version: "ai-eval-v1",
        outcome: "repeat_accepted",
        repeatCloseEnough: true,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
      },
    });

    const result = await evaluateRepeatTurn(
      {
        transcript: "I like playing soccer after school.",
        expectedSentence: "I like playing soccer after school.",
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "repeat_accepted",
        repeatCloseEnough: true,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
      },
    });
  });

  it("keeps repeat retry and review outcomes fixture-driven", async () => {
    const { evaluateRepeatTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        version: "ai-eval-v1",
        outcome: "teacher_review",
        repeatCloseEnough: false,
        englishLanguage: "uncertain",
        confidence: "low",
        reviewReason: "low_confidence",
      },
    });

    const result = await evaluateRepeatTurn(
      {
        transcript: "I like soccer.",
        expectedSentence: "I like playing soccer after school.",
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "teacher_review",
        repeatCloseEnough: false,
        englishLanguage: "uncertain",
        confidence: "low",
        reviewReason: "low_confidence",
      },
    });
  });
});
