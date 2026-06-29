import { z } from "zod";

/**
 * Pure AI turn-evaluation contracts.
 *
 * Keep provider parsing and app decisions here; server adapters and UI copy live
 * outside this module.
 */

export const AI_EVALUATION_VERSION = "ai-eval-v1" as const;

export const aiEvaluationConfidenceSchema = z.enum(["high", "medium", "low"]);
export const aiEvaluationEnglishLanguageSchema = z.enum([
  "english",
  "non_english",
  "uncertain",
]);
export const aiEvaluationReviewReasonSchema = z.enum([
  "low_confidence",
  "ambiguous",
  "failed_schema",
  "provider_failed",
]);

export const originalTurnEvaluationSchema = z.object({
  version: z.literal(AI_EVALUATION_VERSION),
  outcome: z.enum([
    "correct",
    "needs_correction",
    "non_english",
    "teacher_review",
  ]),
  meaningUnderstood: z.boolean(),
  targetPatternAttempted: z.boolean(),
  correctionNeeded: z.boolean(),
  improvedSentence: z.string().trim().min(1).nullable(),
  englishLanguage: aiEvaluationEnglishLanguageSchema,
  confidence: aiEvaluationConfidenceSchema,
  reviewReason: aiEvaluationReviewReasonSchema.nullable(),
});

export type OriginalTurnEvaluation = z.infer<
  typeof originalTurnEvaluationSchema
>;

export const repeatTurnEvaluationSchema = z.object({
  version: z.literal(AI_EVALUATION_VERSION),
  outcome: z.enum(["repeat_accepted", "repeat_retry", "teacher_review"]),
  repeatCloseEnough: z.boolean(),
  englishLanguage: aiEvaluationEnglishLanguageSchema,
  confidence: aiEvaluationConfidenceSchema,
  reviewReason: aiEvaluationReviewReasonSchema.nullable(),
});

export type RepeatTurnEvaluation = z.infer<typeof repeatTurnEvaluationSchema>;

export type OriginalTurnDecision =
  | {
      kind: "accepted_original";
      requireRepeat: false;
      improvedSentence: null;
      reinforcement: "positive";
    }
  | {
      kind: "needs_correction";
      requireRepeat: true;
      improvedSentence: string;
    }
  | {
      kind: "retry_original";
      reason: "non_english";
      requireRepeat: false;
    }
  | {
      kind: "teacher_review";
      reviewReason: z.infer<typeof aiEvaluationReviewReasonSchema>;
      requireRepeat: false;
    };

export type RepeatTurnDecision =
  | { kind: "accepted_repeat"; repeatAccepted: true }
  | {
      kind: "retry_repeat";
      repeatAccepted: false;
      reason: "not_close_enough";
    }
  | {
      kind: "teacher_review";
      repeatAccepted: null;
      reviewReason: z.infer<typeof aiEvaluationReviewReasonSchema>;
    };

function reviewReasonFromEvaluation(
  evaluation:
    | Pick<OriginalTurnEvaluation, "confidence" | "reviewReason">
    | Pick<RepeatTurnEvaluation, "confidence" | "reviewReason">,
) {
  if (evaluation.reviewReason) return evaluation.reviewReason;
  if (evaluation.confidence === "low") return "low_confidence";
  return "ambiguous";
}

export function originalTurnSchemaFailureResult(): OriginalTurnDecision {
  return {
    kind: "teacher_review",
    reviewReason: "failed_schema",
    requireRepeat: false,
  };
}

export function originalTurnProviderFailureResult(): OriginalTurnDecision {
  return {
    kind: "teacher_review",
    reviewReason: "provider_failed",
    requireRepeat: false,
  };
}

export function decideOriginalTurnOutcome(
  evaluation: OriginalTurnEvaluation,
): OriginalTurnDecision {
  if (
    evaluation.outcome === "teacher_review" ||
    evaluation.confidence === "low" ||
    evaluation.englishLanguage === "uncertain" ||
    evaluation.reviewReason
  ) {
    return {
      kind: "teacher_review",
      reviewReason: reviewReasonFromEvaluation(evaluation),
      requireRepeat: false,
    };
  }

  if (
    evaluation.outcome === "non_english" ||
    evaluation.englishLanguage === "non_english"
  ) {
    return {
      kind: "retry_original",
      reason: "non_english",
      requireRepeat: false,
    };
  }

  if (evaluation.outcome === "needs_correction" || evaluation.correctionNeeded) {
    if (evaluation.improvedSentence) {
      return {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: evaluation.improvedSentence,
      };
    }

    return {
      kind: "teacher_review",
      reviewReason: "failed_schema",
      requireRepeat: false,
    };
  }

  return {
    kind: "accepted_original",
    requireRepeat: false,
    improvedSentence: null,
    reinforcement: "positive",
  };
}

export function repeatTurnSchemaFailureResult(): RepeatTurnDecision {
  return {
    kind: "teacher_review",
    repeatAccepted: null,
    reviewReason: "failed_schema",
  };
}

export function repeatTurnProviderFailureResult(): RepeatTurnDecision {
  return {
    kind: "teacher_review",
    repeatAccepted: null,
    reviewReason: "provider_failed",
  };
}

export function decideRepeatTurnOutcome(
  evaluation: RepeatTurnEvaluation,
): RepeatTurnDecision {
  if (
    evaluation.outcome === "teacher_review" ||
    evaluation.confidence === "low" ||
    evaluation.englishLanguage !== "english" ||
    evaluation.reviewReason
  ) {
    return {
      kind: "teacher_review",
      repeatAccepted: null,
      reviewReason: reviewReasonFromEvaluation(evaluation),
    };
  }

  if (evaluation.repeatCloseEnough) {
    return { kind: "accepted_repeat", repeatAccepted: true };
  }

  return {
    kind: "retry_repeat",
    repeatAccepted: false,
    reason: "not_close_enough",
  };
}
