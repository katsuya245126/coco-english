import { describe, expect, it } from "vitest";

const baseOriginalEvaluation = {
  version: "ai-eval-v1",
  outcome: "correct",
  meaningUnderstood: true,
  targetPatternAttempted: true,
  englishLanguage: "english",
  confidence: "high",
  reviewReason: null,
} as const;

describe("original turn AI evaluation decisions (AI-01, AI-02, AI-03, AI-05)", () => {
  it("accepts correct English target responses with positive reinforcement and no repeat tax (D-01, D-02, D-03)", async () => {
    const { AI_EVALUATION_VERSION, decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = decideOriginalTurnOutcome({
      ...baseOriginalEvaluation,
      version: AI_EVALUATION_VERSION,
      correctionNeeded: false,
      improvedSentence: null,
    });

    expect(outcome).toEqual({
      kind: "accepted_original",
      requireRepeat: false,
      improvedSentence: null,
      reinforcement: "positive",
    });
  });

  it("requires repeat only when an English answer needs a better target sentence (D-01, D-03)", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = decideOriginalTurnOutcome({
      ...baseOriginalEvaluation,
      outcome: "needs_correction",
      correctionNeeded: true,
      improvedSentence: "I like playing soccer after school.",
      targetPatternAttempted: false,
    });

    expect(outcome).toEqual({
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I like playing soccer after school.",
    });
  });

  it("routes Japanese/non-English transcripts to retry and never accepts them as English practice (D-04, D-05)", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = decideOriginalTurnOutcome({
      ...baseOriginalEvaluation,
      outcome: "non_english",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      englishLanguage: "non_english",
      correctionNeeded: false,
      improvedSentence: null,
    });

    expect(outcome).toEqual({
      kind: "retry_original",
      reason: "non_english",
      requireRepeat: false,
    });
  });

  it("routes low-confidence, ambiguous, and failed-schema original outputs to teacher review (D-06, D-07)", async () => {
    const { decideOriginalTurnOutcome, originalTurnSchemaFailureResult } =
      await import("@/domain/ai/turn-evaluation");

    expect(
      decideOriginalTurnOutcome({
        ...baseOriginalEvaluation,
        outcome: "teacher_review",
        confidence: "low",
        correctionNeeded: false,
        improvedSentence: null,
        reviewReason: "low_confidence",
      }),
    ).toEqual({
      kind: "teacher_review",
      reviewReason: "low_confidence",
      requireRepeat: false,
    });

    expect(
      decideOriginalTurnOutcome({
        ...baseOriginalEvaluation,
        outcome: "teacher_review",
        confidence: "medium",
        correctionNeeded: false,
        improvedSentence: null,
        reviewReason: "ambiguous",
      }),
    ).toEqual({
      kind: "teacher_review",
      reviewReason: "ambiguous",
      requireRepeat: false,
    });

    expect(originalTurnSchemaFailureResult()).toEqual({
      kind: "teacher_review",
      reviewReason: "failed_schema",
      requireRepeat: false,
    });
  });
});

describe("repeat turn AI evaluation decisions (AI-04, AI-05)", () => {
  it("accepts close repeat attempts", async () => {
    const { decideRepeatTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideRepeatTurnOutcome({
        version: "ai-eval-v1",
        outcome: "repeat_accepted",
        repeatCloseEnough: true,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
      }),
    ).toEqual({ kind: "accepted_repeat", repeatAccepted: true });
  });

  it("asks for another repeat when English repeat is not close enough", async () => {
    const { decideRepeatTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideRepeatTurnOutcome({
        version: "ai-eval-v1",
        outcome: "repeat_retry",
        repeatCloseEnough: false,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
      }),
    ).toEqual({
      kind: "retry_repeat",
      repeatAccepted: false,
      reason: "not_close_enough",
    });
  });

  it("routes low-confidence repeat attempts to teacher review instead of pretending certainty", async () => {
    const { decideRepeatTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideRepeatTurnOutcome({
        version: "ai-eval-v1",
        outcome: "teacher_review",
        repeatCloseEnough: false,
        englishLanguage: "uncertain",
        confidence: "low",
        reviewReason: "low_confidence",
      }),
    ).toEqual({
      kind: "teacher_review",
      repeatAccepted: null,
      reviewReason: "low_confidence",
    });
  });
});
