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
  correctionSeverity: "none",
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
        evaluationMode: "preset",
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

  it("treats an open-ended target example as one valid slot answer, not the required content", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "preset",
        missionQuestion: "What are you going to do after school?",
        transcript: "I am going to play games.",
        targetPattern: "I'm going to _____.",
        targetExample: "I'm going to do my homework.",
        level: "elementary",
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
        expect.stringContaining("targetExample is only one possible answer"),
        expect.stringContaining("open-ended question"),
        expect.stringContaining("I am going to play games"),
      ]),
    );
  });

  it("grounds a dynamic turn on its real Coco line without fabricating an example", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "That sounds fun! What will you do next?",
        transcript: "I will play soccer with my friends.",
        targetPattern: "I will _____.",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      evaluation: correctOriginalProviderResult,
    });
    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      missionQuestion?: string | null;
      targetExample?: string | null;
      targetPattern?: string;
      instructions?: string[];
    };

    expect(prompt).toMatchObject({
      missionQuestion: "That sounds fun! What will you do next?",
      targetExample: null,
      targetPattern: "I will _____.",
    });
    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("relevant response to missionQuestion"),
        expect.stringContaining("preserve the student's intended meaning"),
        // Fragments like "I don't" must be expanded into a full-sentence
        // answer, never "corrected" to the question itself (UAT 2026-07-16).
        expect.stringContaining("understandable meaning"),
      ]),
    );
  });

  it("rejects a dynamic turn without a real Coco line before provider invocation", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: " ",
        transcript: "I will play soccer with my friends.",
        targetPattern: "I will _____.",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
    expect(client.responses.parse).not.toHaveBeenCalled();
  });

  it("maps missing API key before creating a provider request", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "preset",
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
        evaluationMode: "preset",
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
        evaluationMode: "preset",
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
        correctionSeverity: "material",
        improvedSentence: "Wow!",
      },
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "preset",
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

  it("accepts a premise-disagreeing free-talk answer without requiring the target pattern", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        transcript: "I don't play soccer.",
        targetPattern: "How often do you _____?",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: true,
      evaluation: correctOriginalProviderResult,
    });

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      evaluationMode?: string;
      targetExample?: string | null;
      instructions?: string[];
    };

    expect(prompt).toMatchObject({
      evaluationMode: "conversation",
      targetExample: null,
    });
    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("relevant and grammatically valid English"),
        expect.stringContaining("does not use the targetPattern"),
        expect.stringContaining("disagrees with the question's premise"),
        expect.stringContaining("I don't play soccer"),
      ]),
    );
    expect(prompt.instructions?.join(" ")).not.toContain(
      "target pattern appears anywhere",
    );
  });

  it("instructs conversation correction to preserve meaning instead of parroting Coco's question", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        ...correctOriginalProviderResult,
        outcome: "needs_correction",
        targetPatternAttempted: false,
        correctionNeeded: true,
        correctionSeverity: "material",
        improvedSentence: "I don't play soccer.",
      },
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        transcript: "I no play soccer.",
        targetPattern: "How often do you _____?",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "needs_correction",
        improvedSentence: "I don't play soccer.",
      },
    });

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
    };
    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("preserve the student's intended meaning"),
        expect.stringContaining("Never use the missionQuestion as improvedSentence"),
        expect.stringContaining("I no play soccer"),
        expect.stringContaining("I don't play soccer"),
      ]),
    );
  });

  it("requires a meaning-preserving complete sentence for an understandable fragment when enabled", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        ...correctOriginalProviderResult,
        outcome: "needs_correction",
        targetPatternAttempted: false,
        correctionNeeded: true,
        correctionSeverity: "material",
        improvedSentence: "I like to play soccer at school.",
      },
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "Where do you like to play soccer?",
        transcript: "School.",
        targetPattern: "I like to play soccer at _____.",
        targetExample: null,
        level: "elementary",
        requireCompleteSentenceAnswers: true,
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "needs_correction",
        improvedSentence: "I like to play soccer at school.",
      },
    });
    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      requireCompleteSentenceAnswers?: boolean;
      instructions?: string[];
    };
    expect(prompt.requireCompleteSentenceAnswers).toBe(true);
    expect(prompt.instructions?.join(" ")).toContain(
      "Where do you like to play soccer?",
    );
    expect(prompt.instructions?.join(" ")).toContain("School.");
    expect(prompt.instructions?.join(" ")).toContain(
      "I like to play soccer at school.",
    );
  });

  it("allows a relevant fragment when complete sentences are disabled", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "Where do you like to play soccer?",
        transcript: "School.",
        targetPattern: "I like to play soccer at _____.",
        targetExample: null,
        level: "elementary",
        requireCompleteSentenceAnswers: false,
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      requireCompleteSentenceAnswers?: boolean;
      instructions?: string[];
    };
    expect(prompt.requireCompleteSentenceAnswers).toBe(false);
    expect(prompt.instructions?.join(" ")).toContain(
      "accept a relevant understandable fragment",
    );
  });

  it("forbids polar fragment expansion for open information questions", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        ...correctOriginalProviderResult,
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      },
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        transcript: "Yes.",
        targetPattern: "I play soccer _____.",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
    };
    const instructions = prompt.instructions?.join(" ") ?? "";

    expect(instructions).toContain("information question");
    expect(instructions).toContain("auxiliary yes/no sentence");
    expect(instructions).toContain("teacher_review");
    expect(instructions).toContain("do not invent");
  });

  it("describes fragment expansion without an imitable literal answer and forbids appended questions", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "What games do you like to play?",
        transcript: "I don't",
        targetPattern: "What games do you _____?",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
    };

    const fragmentRule = prompt.instructions?.find((line) =>
      line.includes("understandable meaning"),
    );
    expect(fragmentRule).toBeDefined();
    expect(fragmentRule).not.toContain("I don't play soccer");
    expect(fragmentRule).toContain("student's own words");

    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("single declarative student answer"),
        expect.stringContaining(
          "never copy an example sentence from these instructions",
        ),
      ]),
    );
  });

  it("teaches the exact minor/material severity boundary with required examples in conversation mode", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "Where are you going?",
        transcript: "I'm going to library",
        targetPattern: "I'm going to _____.",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
    };
    const instructions = prompt.instructions?.join(" ") ?? "";

    expect(instructions).toContain("Always set correctionSeverity");
    expect(instructions).toContain("I'm going to library");
    expect(instructions).toContain("I'm going to the library.");
    expect(instructions).toContain("I want read cartoon");
    expect(instructions).toContain("I want to read cartoons.");
    expect(instructions).toContain("I will go to the exercise");
    expect(instructions).toContain("I will exercise.");
    expect(instructions).toContain("wrong destination-noun category");
    expect(instructions).toContain("Never classify by edit distance");
  });

  it("reports preset-compatible severity without changing preset acceptance rules", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "preset",
        transcript: "I like playing soccer after school.",
        targetPattern: "I like ___ing.",
        targetExample: "I like playing soccer after school.",
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
    };
    const instructions = prompt.instructions?.join(" ") ?? "";

    expect(instructions).toContain("preset output compatibility");
    expect(instructions).not.toContain("I'm going to library");
  });

  it.each([true, false])(
    "keeps severity instructions present regardless of requireCompleteSentenceAnswers=%s",
    async (requireCompleteSentenceAnswers) => {
      const { evaluateOriginalTurn } = await import(
        "@/server/ai/turn-evaluator"
      );
      const client = createFakeClient({
        output_parsed: correctOriginalProviderResult,
      });

      await evaluateOriginalTurn(
        {
          evaluationMode: "conversation",
          missionQuestion: "Where do you like to play soccer?",
          transcript: "School.",
          targetPattern: "I like to play soccer at _____.",
          targetExample: null,
          level: "elementary",
          requireCompleteSentenceAnswers,
        },
        { apiKey: "test-key", client },
      );

      const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
      const userMessage = request?.input.find(
        (message) => message.role === "user",
      );
      const prompt = JSON.parse(userMessage?.content ?? "{}") as {
        instructions?: string[];
      };
      const instructions = prompt.instructions?.join(" ") ?? "";

      expect(instructions).toContain("Always set correctionSeverity");
    },
  );
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
