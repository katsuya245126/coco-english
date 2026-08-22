import { describe, expect, it, vi } from "vitest";
import type {
  EvaluateOriginalTurnInput,
  OriginalTurnEvaluationResult,
} from "@/server/ai/turn-evaluator";
import {
  evaluateOriginalTurnAnswer,
  evaluateRepeatTurnAnswer,
  MAX_LOW_CONFIDENCE_AUDIO_RETRIES,
} from "@/server/ai/answer-evaluation";

// Deterministic tests for the extracted answer-evaluation pipeline (issue
// #66). Every case crosses only the module interface — no storage, no route
// plumbing, no paid provider calls: the evaluator is always a fake.

const LOW_CONFIDENCE = { minLogprob: -1.5, tokenCount: 7 };

function evaluationInput(
  overrides: Partial<EvaluateOriginalTurnInput> = {},
): EvaluateOriginalTurnInput {
  return {
    evaluationMode: "conversation",
    missionQuestion: "What do you like to do after school?",
    targetPattern: "I like __ing ___.",
    targetExample: null,
    level: "elementary",
    turnOrder: 1,
    transcript: "I want to read many cartoons.",
    answerShape: "open",
    transcriptionEvidence: { model: "test-transcriber", confidence: null },
    ...overrides,
  };
}

function providerEvaluation(overrides: Record<string, unknown> = {}) {
  return {
    version: "ai-eval-v1" as const,
    outcome: "correct" as const,
    meaningUnderstood: true,
    targetPatternAttempted: true,
    correctionNeeded: false,
    correctionSeverity: "none" as const,
    correctionReason: "none" as const,
    improvedSentence: null,
    englishLanguage: "english" as const,
    confidence: "high" as const,
    reviewReason: null,
    hangulInterpretations: [],
    ...overrides,
  };
}

function okResult(evaluation: Record<string, unknown>): OriginalTurnEvaluationResult {
  return { ok: true, evaluation } as unknown as OriginalTurnEvaluationResult;
}

describe("evaluateOriginalTurnAnswer", () => {
  it("never demands a repeat when the correction is identical to what the student said (UAT 2026-07-25)", async () => {
    // The recorded defect: the provider echoes the student's own sentence
    // back as a "material" correction and demands a repeat.
    const evaluate = vi.fn(async () =>
      okResult(
        providerEvaluation({
          outcome: "needs_correction",
          correctionNeeded: true,
          correctionSeverity: "material",
          correctionReason: "grammar",
          improvedSentence: "I want to read many cartoons.",
        }),
      ),
    );

    const outcome = await evaluateOriginalTurnAnswer(
      { evaluationInput: evaluationInput(), priorTurnEvaluation: {}, audioClipId: "clip-1" },
      { evaluate },
    );

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(outcome.decision.evaluation).toMatchObject({
      outcome: "accepted_original",
      improvedSentence: null,
      requireRepeat: false,
    });
  });

  it("repairs a contract-violating verdict exactly once and keeps going", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(
        okResult(
          providerEvaluation({
            outcome: "teacher_review",
            meaningUnderstood: true,
            confidence: "low",
          }),
        ),
      )
      .mockResolvedValueOnce(
        okResult(
          providerEvaluation({
            outcome: "teacher_review",
            meaningUnderstood: false,
            confidence: "low",
          }),
        ),
      );

    const outcome = await evaluateOriginalTurnAnswer(
      { evaluationInput: evaluationInput(), priorTurnEvaluation: {}, audioClipId: "clip-1" },
      { evaluate },
    );

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(outcome.stageMs.evaluationRepairMs).toBeGreaterThanOrEqual(0);
    expect(outcome.decision.evaluation.outcome).toBe("teacher_review");
  });

  it("labels an unrepairable contract rejection instead of failed_schema", async () => {
    const violating = providerEvaluation({
      outcome: "teacher_review",
      meaningUnderstood: true,
      confidence: "low",
    });
    const evaluate = vi.fn(async () => okResult(violating));

    const outcome = await evaluateOriginalTurnAnswer(
      { evaluationInput: evaluationInput(), priorTurnEvaluation: {}, audioClipId: "clip-1" },
      { evaluate },
    );

    // Exactly one policy repair, then the deterministic fallback.
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(outcome.decision.evaluation).toMatchObject({
      outcome: "teacher_review",
      reviewReason: "contract_rejected",
      contractViolations: expect.arrayContaining([
        "teacher_review_meaning_understood",
      ]),
    });
  });

  it("gates a garbled low-confidence transcript behind a free say-it-again retry before any evaluation call", async () => {
    const evaluate = vi.fn();

    const outcome = await evaluateOriginalTurnAnswer(
      {
        evaluationInput: evaluationInput({
          transcriptionEvidence: {
            model: "test-transcriber",
            confidence: LOW_CONFIDENCE,
          },
        }),
        priorTurnEvaluation: {},
        audioClipId: "clip-1",
      },
      { evaluate },
    );

    expect(evaluate).not.toHaveBeenCalled();
    expect(outcome.lowConfidenceGateRetryApplied).toBe(true);
    expect(outcome.gateRetryDetail).toMatchObject({
      minLogprob: -1.5,
      tokenCount: 7,
      retriesAfter: 1,
    });
    expect(outcome.fastPathUsed).toBe(false);
    expect(outcome.decision.evaluation).toMatchObject({
      outcome: "retry_original",
      retryReason: "unclear_meaning",
      lowConfidenceAudioRetries: 1,
      ambiguityRetries: 0,
    });
  });

  it("falls through to the evaluator once the gate budget is exhausted", async () => {
    const evaluate = vi.fn(async () => okResult(providerEvaluation()));

    const outcome = await evaluateOriginalTurnAnswer(
      {
        evaluationInput: evaluationInput({
          transcriptionEvidence: {
            model: "test-transcriber",
            confidence: LOW_CONFIDENCE,
          },
        }),
        priorTurnEvaluation: { lowConfidenceAudioRetries: MAX_LOW_CONFIDENCE_AUDIO_RETRIES },
        audioClipId: "clip-1",
      },
      { evaluate },
    );

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(outcome.lowConfidenceGateRetryApplied).toBe(false);
    expect(outcome.decision.evaluation.lowConfidenceAudioRetries).toBe(
      MAX_LOW_CONFIDENCE_AUDIO_RETRIES,
    );
  });

  it("takes the deterministic fast path on an exact authored-target match", async () => {
    const evaluate = vi.fn();

    const outcome = await evaluateOriginalTurnAnswer(
      {
        evaluationInput: evaluationInput({
          transcript: "I like playing soccer.",
          targetExample: "I like playing soccer.",
        }),
        priorTurnEvaluation: {},
        audioClipId: "clip-1",
      },
      { evaluate },
    );

    expect(evaluate).not.toHaveBeenCalled();
    expect(outcome.fastPathUsed).toBe(true);
    expect(outcome.decision.evaluation).toMatchObject({
      outcome: "accepted_original",
      requireRepeat: false,
      confidence: "high",
      evaluationSource: "deterministic",
    });
  });
});

describe("evaluateRepeatTurnAnswer", () => {
  it("accepts a verbatim repeat without any provider call", async () => {
    const evaluate = vi.fn();

    const outcome = await evaluateRepeatTurnAnswer(
      {
        repeatTarget: "I like playing soccer.",
        originalTranscript: "I like soccer.",
        transcript: "I like playing soccer.",
        koreanSpans: [],
        targetPattern: "I like __ing ___.",
        level: "elementary",
        attemptNumber: 1,
      },
      { evaluate },
    );

    expect(evaluate).not.toHaveBeenCalled();
    expect(outcome.fastPathUsed).toBe(true);
    expect(outcome.evaluation).toMatchObject({
      outcome: "accepted_repeat",
      repeatCloseEnough: true,
      repeatAccepted: true,
      requireRepeat: false,
    });
  });

  it("stops asking at the repeat cap while keeping closeness evidence auditable", async () => {
    const evaluate = vi.fn(async () => ({
      ok: true as const,
      evaluation: {
        version: "ai-eval-v1" as const,
        outcome: "repeat_retry" as const,
        repeatCloseEnough: false,
        englishLanguage: "english" as const,
        confidence: "high" as const,
        reviewReason: null,
        hangulInterpretations: [],
      },
    }));

    const outcome = await evaluateRepeatTurnAnswer(
      {
        repeatTarget: "I like playing soccer.",
        originalTranscript: "I like soccer.",
        transcript: "I like play soccer.",
        koreanSpans: [],
        targetPattern: "I like __ing ___.",
        level: "elementary",
        attemptNumber: 3,
      },
      { evaluate },
    );

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        improvedSentence: "I like playing soccer.",
        repeatTranscript: "I like play soccer.",
      }),
    );
    expect(outcome.evaluation).toMatchObject({
      outcome: "repeat_limit_reached",
      repeatAccepted: false,
      repeatCloseEnough: false,
      requireRepeat: false,
    });
  });
});
