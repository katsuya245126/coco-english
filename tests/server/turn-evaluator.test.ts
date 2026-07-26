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
  correctionReason: "none",
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

    expect(result).toMatchObject({
      ok: true,
      evaluation: correctOriginalProviderResult,
    });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-evaluator" }),
    );
  });

  it("stores evaluator and transcription provenance with the parsed result", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "What do you like?",
        transcript: "I like chocolate.",
        targetPattern: "I like _____.",
        targetExample: null,
        level: "elementary",
        transcriptionEvidence: {
          model: "test-transcriber",
          confidence: { minLogprob: -0.02, tokenCount: 3 },
        },
        runtimeVersion: "test-runtime",
      },
      { apiKey: "test-key", client, model: "test-evaluator" },
    );

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        correctionReason: "none",
        policyVersion: "natural-conversation-v1",
        evaluationModel: "test-evaluator",
        evaluationSource: "model",
        transcriptionModel: "test-transcriber",
        transcriptionConfidence: { minLogprob: -0.02, tokenCount: 3 },
        runtimeVersion: "test-runtime",
      },
    });
  });

  it("sends deterministic correction-policy violations on a repair request", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "preset",
        transcript: "I think chocolate is the best.",
        targetPattern: "I think _____ is the best.",
        targetExample: "I think vanilla is the best.",
        level: "elementary",
        transcriptionEvidence: {
          model: "test-transcriber",
          confidence: null,
        },
        policyRepair: { violations: ["open_choice_changed"] },
      },
      { apiKey: "test-key", client, model: "test-evaluator" },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const systemMessage = request?.input.find((message) => message.role === "system");
    expect(JSON.parse(userMessage?.content ?? "{}")).toMatchObject({
      policyRepair: {
        violations: ["open_choice_changed"],
      },
    });
    expect(systemMessage?.content).toContain("open_choice_changed");
    expect(systemMessage?.content).toContain("one replacement evaluation");
  });

  function promptFor(client: ReturnType<typeof createFakeClient>) {
    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    return JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
      koreanSpans?: Array<{ hangul: string; romanized: string }>;
    };
  }

  it("asks the evaluator to classify each Korean word as a name or vocabulary", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    const result = await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "Where are you going this summer vacation?",
        transcript: "I'm going to 거제도 this summer vacation.",
        targetPattern: "I'm going to _____.",
        targetExample: null,
        level: "elementary",
        koreanSpans: [{ hangul: "거제도", romanized: "Geojedo" }],
      },
      { apiKey: "test-key", client },
    );

    expect(result.ok).toBe(true);
    const prompt = promptFor(client);

    expect(prompt.koreanSpans).toEqual([
      { hangul: "거제도", romanized: "Geojedo" },
    ]);
    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        // Both scripts reach the model: Hangul to match the transcript, the
        // romanization so it can be read aloud.
        expect.stringContaining("거제도"),
        expect.stringContaining("Geojedo"),
        expect.stringContaining("Classify each remaining Korean word"),
        expect.stringContaining("NAME"),
        expect.stringContaining("VOCABULARY"),
      ]),
    );
  });

  it("pins the classifier rules a live probe proved load-bearing", async () => {
    // Measured 2026-07-24 against the real API, 3 runs x 16 spans. Dropping
    // either rule regressed the probe to 14/16:
    //  - without the category rule, 초등학교/선생님 were read as a school and
    //    a person and wrongly accepted;
    //  - without the geographic-suffix rule, 제주도 went unstable and
    //    서울초등학교 got split into a name plus a common noun — the same
    //    failure that sank the discarded decompose approach at 13/16.
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "Where are you going this summer vacation?",
        transcript: "I'm going to 제주도 this summer vacation.",
        targetPattern: "I'm going to _____.",
        targetExample: null,
        level: "elementary",
        koreanSpans: [{ hangul: "제주도", romanized: "Jejudo" }],
      },
      { apiKey: "test-key", client },
    );

    const instructions = promptFor(client).instructions ?? [];

    expect(instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("name one particular thing"),
        expect.stringContaining("keeps its Korean geographic ending"),
        expect.stringContaining("Do not split such a word"),
        expect.stringContaining("ordinary institution word"),
      ]),
    );
  });

  it("lets the evaluator decide code-switch vs Korean-answer instead of asserting either (UAT 2026-07-24)", async () => {
    // The transcript legitimately contains Hangul, so the blanket non_english
    // rule would discard a valid answer via retry_original. The first fix
    // over-corrected: it asserted the answer was NOT non_english, which let
    // "초콜릿 is better than 바닐라." — every content word Korean — be graded as
    // English practice. The prompt must offer BOTH readings and let the
    // evaluator judge, since no string heuristic separates them.
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "Where are you going this summer vacation?",
        transcript: "I'm going to 거제도 this summer vacation.",
        targetPattern: "I'm going to _____.",
        targetExample: null,
        level: "elementary",
        koreanSpans: [{ hangul: "거제도", romanized: "Geojedo" }],
      },
      { apiKey: "test-key", client },
    );

    const instructions = promptFor(client).instructions ?? [];

    const mixedLanguageInstruction = instructions.find((instruction) =>
      instruction.includes("mixes Korean and English"),
    );

    // Both readings must be on the table: the code-switch escape hatch AND
    // the Korean-answer-in-an-English-frame verdict.
    expect(mixedLanguageInstruction).toBeDefined();
    expect(mixedLanguageInstruction).toContain("is NOT non_english");
    expect(mixedLanguageInstruction).toContain(
      "Set englishLanguage to non_english",
    );
    // The decision rule must be semantic, not a word count.
    expect(mixedLanguageInstruction).toContain(
      "not by counting words",
    );
    expect(instructions).not.toEqual(
      expect.arrayContaining([
        "Treat non-English transcripts as non_english and not successful practice.",
      ]),
    );
    // Case (c), added 2026-07-25. Once all-Hangul transcripts stopped being
    // rejected at the transcription layer, they started arriving here — and
    // an instruction opening "This transcript mixes Korean and English" has
    // no branch for a transcript with no English in it at all. Live-probed:
    // without this, "나는 방과 후에 축구를 좋아해요." came back englishLanguage
    // "english" with a silent rewrite instead of non_english.
    expect(mixedLanguageInstruction).toContain("entirely Korean");
  });

  it("tells the evaluator to read accented-English spans by phonetic resemblance, not from a list (UAT 2026-07-24)", async () => {
    // A Korean-accented "chocolate"/"vanilla" is transcribed in Hangul, but
    // the child said English. There is deliberately NO hardcoded map: the
    // prompt hands the evaluator the romanization and tells it to sound the
    // word out — if it resembles an English word, that IS the word the child
    // said, correct content and never Korean to teach or retry.
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion:
          "Which ice cream is the best: vanilla, strawberry, or chocolate?",
        transcript: "초콜릿 is better than 바닐라.",
        targetPattern: "I think _____ is the best.",
        targetExample: null,
        level: "elementary",
        koreanSpans: [
          { hangul: "초콜릿", romanized: "Chokolrit" },
          { hangul: "바닐라", romanized: "Banilra" },
        ],
      },
      { apiKey: "test-key", client },
    );

    const instructions = promptFor(client).instructions ?? [];
    const phoneticInstruction = instructions.find((instruction) =>
      instruction.includes("say its romanization aloud"),
    );

    expect(phoneticInstruction).toBeDefined();
    // The rule is phonetic resemblance, not a fixed lookup table.
    expect(phoneticInstruction).toContain("sounds like an English word");
    // And it must frame such a span as correct English content, never a
    // Korean word to teach or retry.
    expect(phoneticInstruction).toContain("never non_english");
    expect(phoneticInstruction).toContain("never VOCABULARY to teach");
  });

  it("keeps the vocabulary path open for a span that does not sound like English", async () => {
    // The phonetic instruction is always present when spans exist, but it must
    // route a native word like 축구/Chukgu (which sounds nothing like "soccer")
    // to the NAME/VOCABULARY classifier rather than accepting it as English.
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "What do you like after school?",
        transcript: "I like 축구.",
        targetPattern: "I like _____.",
        targetExample: null,
        level: "elementary",
        koreanSpans: [{ hangul: "축구", romanized: "Chukgu" }],
      },
      { apiKey: "test-key", client },
    );

    const instructions = promptFor(client).instructions ?? [];
    const fallbackInstruction = instructions.find((instruction) =>
      instruction.includes("does NOT sound like an English word"),
    );

    expect(fallbackInstruction).toBeDefined();
    // The fallback must name the classifier the non-loanword span falls through
    // to, and cite a native word that must NOT be read as accented English.
    expect(fallbackInstruction).toContain("classify it as NAME or VOCABULARY");
    expect(fallbackInstruction).toContain(
      "Chukgu does not sound like soccer",
    );
  });

  it("omits the Korean-span instructions for an all-English answer", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "Where are you going this summer vacation?",
        transcript: "I'm going to the beach.",
        targetPattern: "I'm going to _____.",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    const prompt = promptFor(client);

    expect(prompt.koreanSpans).toEqual([]);
    expect(prompt.instructions).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Classify each Korean word")]),
    );
    // The plain non_english rule stays in force for all-English answers.
    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        "Treat non-English transcripts as non_english and not successful practice.",
      ]),
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
        answerShape: "fixed",
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

    expect(result).toMatchObject({
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
        answerShape: "fixed",
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

    expect(result).toMatchObject({
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

describe("buildOriginalPrompt answerShape branch", () => {
  const base = {
    evaluationMode: "preset" as const,
    missionQuestion:
      "Which ice cream is the best: vanilla, strawberry, or chocolate?",
    targetPattern: "I think ___ is the best.",
    targetExample: "I think vanilla ice cream is the best.",
    level: "elementary" as const,
    transcript: "I think chocolate ice cream is the best.",
  };

  function bodyFor(client: ReturnType<typeof createFakeClient>) {
    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    return JSON.stringify(request);
  }

  it("open turn sends scaffolding-only instructions (never replace the child's choice)", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      { ...base, answerShape: "open" },
      { apiKey: "test-key", client },
    );

    const body = bodyFor(client);
    expect(body).toContain(
      "Never use needs_correction to replace the child's choice",
    );
    expect(body).toContain("frame");
    // must NOT tell the model the example is required content
    expect(body).not.toContain(
      "Mark as correct (outcome: 'correct') if the target pattern appears",
    );
  });

  it("fixed turn sends target-matching instructions", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        ...base,
        answerShape: "fixed",
        targetExample: "Hello.",
        missionQuestion: "How do you say hello?",
      },
      { apiKey: "test-key", client },
    );

    const body = bodyFor(client);
    expect(body).toContain("target pattern appears anywhere");
  });

  it("missing answerShape defaults to the open branch", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(base, { apiKey: "test-key", client });

    const body = bodyFor(client);
    expect(body).toContain(
      "Never use needs_correction to replace the child's choice",
    );
  });

  // Guards the 2026-07-24 UAT bug: a child answered "chocolate" and the
  // evaluator rewrote it to the authored example's "vanilla". A prompt-only
  // fix (b9a165cb) did not hold — attempt 038f325a coerced again hours later.
  it("regression: chocolate answer is never coerced toward the vanilla example (open turn)", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      { ...base, answerShape: "open" },
      { apiKey: "test-key", client },
    );

    const body = bodyFor(client);
    // Open branch must forbid swapping in the example's choice.
    expect(body).toContain(
      "Never use needs_correction to replace the child's choice",
    );
    // The fixed-mode "wrong answer -> targetExample" band-aid must NOT appear
    // on the open branch.
    expect(body).not.toContain(
      "provide the assigned targetExample as the improvedSentence",
    );
  });
});
