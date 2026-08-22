import { describe, expect, it } from "vitest";
import type { HangulInterpretation } from "@/domain/audio/transcript-interpretation";

const baseOriginalEvaluation = {
  version: "ai-eval-v1",
  outcome: "correct",
  meaningUnderstood: true,
  targetPatternAttempted: true,
  correctionNeeded: false,
  englishLanguage: "english",
  confidence: "high",
  reviewReason: null,
  correctionSeverity: "none",
  correctionReason: "none",
  improvedSentence: null,
  policyVersion: "natural-conversation-v1",
  evaluationModel: "gpt-4.1-mini",
  evaluationSource: "model",
  transcriptionModel: "gpt-4o-mini-transcribe",
  transcriptionConfidence: null,
  runtimeVersion: "test-runtime",
  hangulInterpretations: [] as HangulInterpretation[],
} as const;

describe("original evaluation schema and correction intent", () => {
  it("requires a typed correction reason and provenance", async () => {
    const { AI_EVALUATION_VERSION, originalTurnEvaluationSchema } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const result = originalTurnEvaluationSchema.safeParse({
      version: AI_EVALUATION_VERSION,
      outcome: "correct",
      meaningUnderstood: true,
      targetPatternAttempted: false,
      correctionNeeded: false,
      correctionSeverity: "none",
      correctionReason: "none",
      improvedSentence: null,
      englishLanguage: "english",
      confidence: "high",
      reviewReason: null,
      policyVersion: "natural-conversation-v1",
      evaluationModel: "gpt-4.1-mini",
      evaluationSource: "model",
      transcriptionModel: "gpt-4o-mini-transcribe",
      transcriptionConfidence: { minLogprob: -0.01, tokenCount: 4 },
      runtimeVersion: "local-dev",
      hangulInterpretations: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        correctionReason: "none",
        policyVersion: "natural-conversation-v1",
        evaluationModel: "gpt-4.1-mini",
        evaluationSource: "model",
        transcriptionModel: "gpt-4o-mini-transcribe",
        transcriptionConfidence: { minLogprob: -0.01, tokenCount: 4 },
        runtimeVersion: "local-dev",
      });
    }
  });

  it("rejects none with an improved sentence", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideOriginalTurnOutcome(
        {
          ...baseOriginalEvaluation,
          improvedSentence: "I like Jenga when we swim.",
        },
        "conversation",
      ).kind,
    ).toBe("teacher_review");
  });
});

describe("original turn AI evaluation decisions (AI-01, AI-02, AI-03, AI-05)", () => {
  it("uses recovery 1 for the first coherent ambiguity", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideOriginalTurnOutcome(
        {
          ...baseOriginalEvaluation,
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          reviewReason: "ambiguous",
        },
        "conversation",
        "What will you do at the beach?",
        0,
      ),
    ).toEqual({
      kind: "retry_original",
      reason: "unclear_meaning",
      requireRepeat: false,
    });
  });

  it("uses recovery 2 for the second same-turn ambiguity", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideOriginalTurnOutcome(
        {
          ...baseOriginalEvaluation,
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          reviewReason: "ambiguous",
        },
        "conversation",
        "What will you do at the beach?",
        1,
      ),
    ).toEqual({
      kind: "retry_original",
      reason: "unclear_meaning",
      requireRepeat: false,
    });
  });

  it("sends a third same-turn ambiguity to teacher review", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideOriginalTurnOutcome(
        {
          ...baseOriginalEvaluation,
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          reviewReason: "ambiguous",
        },
        "conversation",
        "What will you do at the beach?",
        2,
      ),
    ).toMatchObject({
      kind: "teacher_review",
      reviewReason: "ambiguous",
      requireRepeat: false,
    });
  });

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
      correctionSeverity: "material",
      correctionReason: "grammar",
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

  it("accepts a minor article recast without a repeat", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      decideOriginalTurnOutcome(
        {
          ...baseOriginalEvaluation,
          outcome: "needs_correction",
          correctionNeeded: true,
          correctionSeverity: "minor",
          correctionReason: "grammar",
          improvedSentence: "I'm going to the library.",
        },
        "conversation",
      ),
    ).toEqual({
      kind: "accepted_original",
      requireRepeat: false,
      improvedSentence: "I'm going to the library.",
      reinforcement: "positive",
    });
  });

  it.each([
    ["I want to read cartoons.", "missing infinitive structure"],
    ["I will exercise.", "wrong word category"],
  ])(
    "requires a repeat for material correction: %s (%s)",
    async (improvedSentence) => {
      const { decideOriginalTurnOutcome } = await import(
        "@/domain/ai/turn-evaluation"
      );

      expect(
        decideOriginalTurnOutcome(
          {
            ...baseOriginalEvaluation,
            outcome: "needs_correction",
            correctionNeeded: true,
            correctionSeverity: "material",
            correctionReason: "grammar",
            improvedSentence,
          },
          "conversation",
        ),
      ).toEqual({
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence,
      });
    },
  );

  it.each([
    {
      correctionSeverity: "minor" as const,
      correctionReason: "none" as const,
      correctionNeeded: true,
      improvedSentence: null,
    },
    {
      correctionSeverity: "material" as const,
      correctionReason: "none" as const,
      correctionNeeded: true,
      improvedSentence: "Where do you play soccer?",
    },
    {
      correctionSeverity: "none" as const,
      correctionReason: "none" as const,
      correctionNeeded: true,
      improvedSentence: null,
    },
  ])(
    "routes inconsistent conversation severity to teacher review",
    async (fields) => {
      const { decideOriginalTurnOutcome } = await import(
        "@/domain/ai/turn-evaluation"
      );

      expect(
        decideOriginalTurnOutcome(
          {
            ...baseOriginalEvaluation,
            outcome:
              fields.correctionSeverity === "none"
                ? "correct"
                : "needs_correction",
            ...fields,
          },
          "conversation",
        ),
      ).toEqual({
        kind: "teacher_review",
        reviewReason: "failed_schema",
        requireRepeat: false,
      });
    },
  );

  it("keeps preset correction behavior independent of conversation severity", async () => {
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );
    const evaluation = {
      ...baseOriginalEvaluation,
      outcome: "needs_correction" as const,
      correctionNeeded: true,
      correctionSeverity: "minor" as const,
      correctionReason: "grammar" as const,
      improvedSentence: "I play soccer.",
    };

    expect(decideOriginalTurnOutcome(evaluation, "preset")).toEqual({
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I play soccer.",
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
        hangulInterpretations: [],
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
        hangulInterpretations: [],
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
        hangulInterpretations: [],
      }),
    ).toEqual({
      kind: "teacher_review",
      repeatAccepted: null,
      reviewReason: "low_confidence",
      requireRepeat: false,
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

  it("catches an appended question when Coco's line has a lead-in sentence", async () => {
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
        missionQuestion: "That's cool! What games do you like to play?",
      },
    );

    expect(outcome).toEqual({
      kind: "retry_original",
      reason: "parroted_correction",
      requireRepeat: false,
    });
  });

  it("does not flag a correction containing a very short Coco question as a word", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "That's why I like it.",
    } as const;

    expect(
      guardParrotedConversationCorrection(decision, {
        evaluationMode: "conversation",
        missionQuestion: "Why?",
      }),
    ).toEqual(decision);
  });

  it("still downgrades a correction that IS the short question verbatim", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardParrotedConversationCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "Why?",
      },
      {
        evaluationMode: "conversation",
        missionQuestion: "Why?",
      },
    );

    expect(outcome.kind).toBe("retry_original");
  });

  it("matches across curly and straight apostrophes", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardParrotedConversationCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "I like puzzle games. What games don't you like?",
      },
      {
        evaluationMode: "conversation",
        missionQuestion: "What games don’t you like?",
      },
    );

    expect(outcome.kind).toBe("retry_original");
  });
});

describe("post-cap minimal-effort correction guard (phone UAT 2026-07-21)", () => {
  const polarCorrection = {
    kind: "needs_correction",
    requireRepeat: true,
    improvedSentence: "Yes, I do.",
  } as const;

  it("routes a nonsensical polar correction for an information question to review", async () => {
    const { guardNonsensicalMinimalEffortCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      guardNonsensicalMinimalEffortCorrection(polarCorrection, {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        transcript: "Yes.",
        priorMinimalEffortBlocks: 2,
      }),
    ).toEqual({
      kind: "teacher_review",
      reviewReason: "ambiguous",
      requireRepeat: false,
    });
  });

  it.each([
    ["Yeah.", "Yes, I do."],
    ["Yep!", "Yes, I do."],
    ["Yup", "Yes, I do."],
    ["Nope.", "No, I don’t."],
    ["Nah", "No, I don't."],
    ["No.", "No, I do not."],
    ["Nah.", "No, I cannot."],
  ])("covers post-cap polar variant %s and correction %s", async (transcript, improvedSentence) => {
    const { guardNonsensicalMinimalEffortCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      guardNonsensicalMinimalEffortCorrection(
        { ...polarCorrection, improvedSentence },
        {
          evaluationMode: "conversation",
          missionQuestion: "How often do you play soccer?",
          transcript,
          priorMinimalEffortBlocks: 2,
        },
      ),
    ).toMatchObject({ kind: "teacher_review", reviewReason: "ambiguous" });
  });

  it("does not alter pre-cap, preset, polar-question, or meaningful corrections", async () => {
    const { guardNonsensicalMinimalEffortCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      guardNonsensicalMinimalEffortCorrection(polarCorrection, {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        transcript: "Yes.",
        priorMinimalEffortBlocks: 1,
      }),
    ).toEqual(polarCorrection);
    expect(
      guardNonsensicalMinimalEffortCorrection(polarCorrection, {
        evaluationMode: "preset",
        missionQuestion: "How often do you play soccer?",
        transcript: "Yes.",
        priorMinimalEffortBlocks: 2,
      }),
    ).toEqual(polarCorrection);
    expect(
      guardNonsensicalMinimalEffortCorrection(polarCorrection, {
        evaluationMode: "conversation",
        missionQuestion: "Do you play soccer?",
        transcript: "Yes.",
        priorMinimalEffortBlocks: 2,
      }),
    ).toEqual(polarCorrection);

    const meaningfulCorrection = {
      ...polarCorrection,
      improvedSentence: "I play soccer sometimes.",
    } as const;
    expect(
      guardNonsensicalMinimalEffortCorrection(meaningfulCorrection, {
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        transcript: "Yes.",
        priorMinimalEffortBlocks: 2,
      }),
    ).toEqual(meaningfulCorrection);
  });
});

describe("no-op correction guard (attempt 103fa68e turn 2 regression)", () => {
  const context = {
    evaluationMode: "conversation",
    missionQuestion: "What books do you want to read there?",
  } as const;

  it("accepts the original when the correction is identical to the transcript", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardNoOpCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "I want to read many cartoons.",
      },
      { ...context, transcript: "I want to read many cartoons." },
    );

    expect(outcome).toEqual({
      kind: "accepted_original",
      requireRepeat: false,
      improvedSentence: null,
      reinforcement: "positive",
    });
  });

  it("treats case and punctuation differences as a no-op", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardNoOpCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "I want to read many cartoons.",
      },
      { ...context, transcript: "i want to read many cartoons" },
    );

    expect(outcome.kind).toBe("accepted_original");
  });

  it("leaves a genuine correction untouched", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I like adventure cartoons.",
    } as const;

    const outcome = guardNoOpCorrection(decision, {
      ...context,
      transcript: "I like adventure cartoon.",
    });

    expect(outcome).toEqual(decision);
  });

  it("applies in preset mode too", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardNoOpCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "I think chocolate ice cream is the best.",
      },
      {
        evaluationMode: "preset",
        missionQuestion: null,
        transcript: "I think chocolate ice cream is the best.",
      },
    );

    expect(outcome.kind).toBe("accepted_original");
  });

  it("leaves non-correction decisions untouched when no transcript is supplied", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I want to read many cartoons.",
    } as const;

    expect(guardNoOpCorrection(decision, context)).toEqual(decision);
  });
});

describe("blank improvedSentence tolerance (attempt 4c1f229e, 2026-07-27)", () => {
  it.each([["   "], [""], ["\n\t"]])(
    "normalizes a blank improvedSentence %j to null instead of failing the turn",
    async (blank) => {
      const { originalTurnProviderEvaluationSchema } = await import(
        "@/domain/ai/turn-evaluation"
      );

      const result = originalTurnProviderEvaluationSchema.safeParse({
        version: "ai-eval-v1",
        outcome: "correct",
        meaningUnderstood: true,
        targetPatternAttempted: true,
        correctionNeeded: false,
        correctionSeverity: "none",
        correctionReason: "none",
        improvedSentence: blank,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
        hangulInterpretations: [],
      });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.improvedSentence).toBeNull();
    },
  );

  it("accepts the original turn when a blank correction meant no correction", async () => {
    const { decideOriginalTurnOutcome, originalTurnProviderEvaluationSchema } =
      await import("@/domain/ai/turn-evaluation");

    const parsed = originalTurnProviderEvaluationSchema.safeParse({
      ...baseOriginalEvaluation,
      improvedSentence: "   ",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const decision = decideOriginalTurnOutcome({
      ...baseOriginalEvaluation,
      improvedSentence: parsed.data.improvedSentence,
    });

    expect(decision).toMatchObject({ kind: "accepted_original" });
  });

  it("still refuses a blank correction that claims a material fix", async () => {
    // The safety net must survive the loosening: blank + needs_correction is
    // unusable and has to stay a teacher_review.
    const { decideOriginalTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = decideOriginalTurnOutcome({
      ...baseOriginalEvaluation,
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: null,
    });

    expect(decision).toMatchObject({
      kind: "teacher_review",
      reviewReason: "failed_schema",
    });
  });
});

describe("repeat attempt cap (attempt 6406e6a5, 2026-07-27)", () => {
  const notCloseEnough = {
    version: "ai-eval-v1",
    outcome: "repeat_retry",
    repeatCloseEnough: false,
    englishLanguage: "english",
    confidence: "high",
    reviewReason: null,
    hangulInterpretations: [] as HangulInterpretation[],
  } as const;

  it("stops asking after the cap instead of looping the child", async () => {
    const { decideRepeatTurnOutcome, MAX_REPEAT_ATTEMPTS } = await import(
      "@/domain/ai/turn-evaluation"
    );

    // Turn 3 rejected five clips scoring 90/93/94/94/84 against an invented
    // target. Past the cap the target is the likely fault, so the child moves on
    // without rewriting the negative closeness evidence as acceptance.
    expect(
      decideRepeatTurnOutcome(notCloseEnough, MAX_REPEAT_ATTEMPTS),
    ).toEqual({
      kind: "repeat_limit_reached",
      repeatAccepted: false,
      requireRepeat: false,
    });
  });

  it("still asks again on earlier attempts", async () => {
    const { decideRepeatTurnOutcome } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(decideRepeatTurnOutcome(notCloseEnough, 1).kind).toBe("retry_repeat");
    expect(decideRepeatTurnOutcome(notCloseEnough, 2).kind).toBe("retry_repeat");
  });
});

describe("Hangul interpretation metadata on evaluation schemas", () => {
  it("accepts an original evaluation carrying accented-English span metadata", async () => {
    const { originalTurnProviderEvaluationSchema } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      originalTurnProviderEvaluationSchema.safeParse({
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
        hangulInterpretations: [
          {
            hangul: "바닐라",
            kind: "accented_english",
            englishReading: "vanilla",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts a repeat evaluation carrying accented-English span metadata", async () => {
    const { repeatTurnEvaluationSchema } = await import(
      "@/domain/ai/turn-evaluation"
    );

    expect(
      repeatTurnEvaluationSchema.safeParse({
        version: "ai-eval-v1",
        outcome: "repeat_accepted",
        repeatCloseEnough: true,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
        hangulInterpretations: [
          {
            hangul: "아이스크림",
            kind: "accented_english",
            englishReading: "ice cream",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("requires the field rather than defaulting it, so an all-English turn states it explicitly", async () => {
    const {
      originalTurnProviderEvaluationSchema,
      repeatTurnEvaluationSchema,
    } = await import("@/domain/ai/turn-evaluation");

    expect(
      originalTurnProviderEvaluationSchema.safeParse({
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
      }).success,
    ).toBe(false);

    expect(
      repeatTurnEvaluationSchema.safeParse({
        version: "ai-eval-v1",
        outcome: "repeat_accepted",
        repeatCloseEnough: true,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
      }).success,
    ).toBe(false);
  });

  it("keeps the evaluation envelope version unchanged", async () => {
    const { AI_EVALUATION_VERSION } = await import(
      "@/domain/ai/turn-evaluation"
    );
    expect(AI_EVALUATION_VERSION).toBe("ai-eval-v1");
  });
});
