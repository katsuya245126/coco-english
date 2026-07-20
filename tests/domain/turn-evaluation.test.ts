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

describe("parroted conversation-correction guard (UAT 2026-07-16 regression)", () => {
  const needsCorrectionParrot = {
    kind: "needs_correction",
    requireRepeat: true,
    improvedSentence: "How often do you play soccer?",
  } as const;

  it("downgrades a correction that parrots the question inside a multi-sentence opener to retry_original", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardParrotedConversationCorrection(needsCorrectionParrot, {
      evaluationMode: "conversation",
      missionQuestion:
        "How often do you play soccer? I play soccer three times a week.",
    });

    expect(outcome).toEqual({
      kind: "retry_original",
      reason: "parroted_correction",
      requireRepeat: false,
    });
  });

  it("catches a parrot that differs only by case and punctuation", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardParrotedConversationCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "how often do you play soccer",
      },
      {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
      },
    );

    expect(outcome.kind).toBe("retry_original");
  });

  it("keeps a meaning-preserving correction unchanged", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I don't play soccer.",
    } as const;

    expect(
      guardParrotedConversationCorrection(decision, {
        evaluationMode: "conversation",
        missionQuestion:
          "How often do you play soccer? I play soccer three times a week.",
      }),
    ).toEqual(decision);
  });

  it("never rewrites preset-mode decisions even when the sentence echoes the question", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      guardParrotedConversationCorrection(needsCorrectionParrot, {
        evaluationMode: "preset",
        missionQuestion: "How often do you play soccer?",
      }),
    ).toEqual(needsCorrectionParrot);
  });

  it("passes non-correction decisions through untouched", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const accepted = {
      kind: "accepted_original",
      requireRepeat: false,
      improvedSentence: null,
      reinforcement: "positive",
    } as const;

    expect(
      guardParrotedConversationCorrection(accepted, {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
      }),
    ).toEqual(accepted);
  });

  it("downgrades a declarative correction with the mission question appended (UAT 2026-07-20 regression)", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardParrotedConversationCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence:
          "I don't play soccer. What games do you like to play?",
      },
      {
        evaluationMode: "conversation",
        missionQuestion: "What games do you like to play?",
      },
    );

    expect(outcome).toEqual({
      kind: "retry_original",
      reason: "parroted_correction",
      requireRepeat: false,
    });
  });

  it("keeps a correction that asks a different question back", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I like Valorant. What about you?",
    } as const;

    expect(
      guardParrotedConversationCorrection(decision, {
        evaluationMode: "conversation",
        missionQuestion: "What games do you like to play?",
      }),
    ).toEqual(decision);
  });
});
