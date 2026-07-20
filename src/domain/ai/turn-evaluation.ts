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
      reason: "non_english" | "parroted_correction";
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

export type OriginalTurnGuardContext = {
  evaluationMode: "preset" | "conversation";
  missionQuestion: string | null;
};

function normalizeForParrotComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coco's dynamic lines often prepend a reaction sentence ("That's cool! What
 * games do you like to play?"), so leakage must be matched per question-shaped
 * sentence, not only against the whole line. Very short questions ("Why?")
 * are excluded from containment matching because their words appear in
 * legitimate answers; the whole-string equality check still covers them.
 */
const MIN_CONTAINMENT_QUESTION_WORDS = 3;

function normalizedQuestionSegments(missionQuestion: string): string[] {
  return missionQuestion
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.endsWith("?"))
    .map(normalizeForParrotComparison)
    .filter((segment) => segment.length > 0);
}

/**
 * Deterministic backstop for the conversation-mode prompt rule "never use
 * the missionQuestion as improvedSentence" (UAT 2026-07-16: the provider
 * corrected "I don't" to the opener question itself despite that
 * instruction). A parroted correction would make the child repeat Coco's
 * question as their answer, so downgrade it to retry_original — the student
 * simply re-records and the parroted sentence is never shown or spoken.
 * Flags a correction that normalizes to the whole missionQuestion, contains
 * one of its question-shaped sentences as a whole-word phrase (UAT
 * 2026-07-20: a declarative answer with the full question appended), or is a
 * question-shaped sentence contained in a multi-sentence opener.
 */
export function guardParrotedConversationCorrection(
  decision: OriginalTurnDecision,
  context: OriginalTurnGuardContext,
): OriginalTurnDecision {
  if (context.evaluationMode !== "conversation") return decision;
  if (decision.kind !== "needs_correction") return decision;

  const question = normalizeForParrotComparison(context.missionQuestion ?? "");
  const improved = normalizeForParrotComparison(decision.improvedSentence);
  if (!question || !improved) return decision;

  const containsQuestionSegment = normalizedQuestionSegments(
    context.missionQuestion ?? "",
  ).some(
    (segment) =>
      segment.split(" ").length >= MIN_CONTAINMENT_QUESTION_WORDS &&
      ` ${improved} `.includes(` ${segment} `),
  );

  const parroted =
    improved === question ||
    containsQuestionSegment ||
    (decision.improvedSentence.trim().endsWith("?") &&
      question.includes(improved));
  if (!parroted) return decision;

  return {
    kind: "retry_original",
    reason: "parroted_correction",
    requireRepeat: false,
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
