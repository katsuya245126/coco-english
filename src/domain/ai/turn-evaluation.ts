import { z } from "zod";

/**
 * Pure AI turn-evaluation contracts.
 *
 * Keep provider parsing and app decisions here; server adapters and UI copy live
 * outside this module.
 */

export const AI_EVALUATION_VERSION = "ai-eval-v1" as const;
export const CORRECTION_POLICY_VERSION = "natural-conversation-v1" as const;

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

export const correctionSeveritySchema = z.enum(["none", "minor", "material"]);
export type CorrectionSeverity = z.infer<typeof correctionSeveritySchema>;

export const correctionReasonSchema = z.enum([
  "none",
  "fragment_completion",
  "grammar",
  "vocabulary",
]);
export type CorrectionReason = z.infer<typeof correctionReasonSchema>;

export const evaluationSourceSchema = z.enum(["model", "deterministic"]);

export const originalTurnProviderEvaluationSchema = z.object({
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
  correctionSeverity: correctionSeveritySchema,
  correctionReason: correctionReasonSchema,
  /**
   * A whitespace-only string means "no correction", so normalize it to null
   * rather than failing the whole turn.
   *
   * zodTextFormat drops Zod's .trim() transform when it builds the JSON schema
   * sent to OpenAI, and structured-output decoding ignores the surviving
   * minLength. The provider is therefore free to emit "   ", which then failed
   * local safeParse and cost the student a teacher_review on an otherwise fine
   * answer.
   *
   * This is not a loosening: a blank paired with correctionSeverity other than
   * "none" is still rejected downstream by validReasonCombination /
   * validCombination in decideOriginalTurnOutcome.
   */
  improvedSentence: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? null : value,
    z.string().trim().min(1).nullable(),
  ),
  englishLanguage: aiEvaluationEnglishLanguageSchema,
  confidence: aiEvaluationConfidenceSchema,
  reviewReason: aiEvaluationReviewReasonSchema.nullable(),
});

export const originalTurnEvaluationSchema =
  originalTurnProviderEvaluationSchema.extend({
    policyVersion: z.literal(CORRECTION_POLICY_VERSION),
    evaluationModel: z.string().trim().min(1),
    evaluationSource: evaluationSourceSchema,
    transcriptionModel: z.string().trim().min(1),
    transcriptionConfidence: z
      .object({
        minLogprob: z.number().finite(),
        tokenCount: z.number().int().nonnegative(),
      })
      .nullable(),
    runtimeVersion: z.string().trim().min(1),
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
      improvedSentence: string | null;
      reinforcement: "positive";
    }
  | {
      kind: "needs_correction";
      requireRepeat: true;
      improvedSentence: string;
    }
  | {
      kind: "retry_original";
      reason:
        | "non_english"
        | "parroted_correction"
        | "minimal_effort"
        | "incomplete_recording"
        | "unclear_meaning";
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
      requireRepeat: false;
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

function failedOriginalContract(): OriginalTurnDecision {
  return {
    kind: "teacher_review",
    reviewReason: "failed_schema",
    requireRepeat: false,
  };
}

export function decideOriginalTurnOutcome(
  evaluation: OriginalTurnEvaluation,
  evaluationMode: "preset" | "conversation" = "preset",
  missionQuestion: string | null = null,
  priorAmbiguityRetries = 0,
): OriginalTurnDecision {
  if (
    evaluationMode === "conversation" &&
    evaluation.outcome === "teacher_review" &&
    (evaluation.reviewReason === "ambiguous" ||
      evaluation.reviewReason === "low_confidence") &&
    priorAmbiguityRetries === 0
  ) {
    return {
      kind: "retry_original",
      reason: "unclear_meaning",
      requireRepeat: false,
    };
  }

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

  const validReasonCombination =
    (evaluation.correctionSeverity === "none" &&
      evaluation.correctionReason === "none" &&
      evaluation.improvedSentence === null) ||
    (evaluation.correctionSeverity !== "none" &&
      evaluation.correctionReason !== "none" &&
      evaluation.improvedSentence !== null);

  if (!validReasonCombination) return failedOriginalContract();

  if (evaluationMode === "preset") {
    if (
      evaluation.outcome === "needs_correction" ||
      evaluation.correctionNeeded
    ) {
      return evaluation.improvedSentence
        ? {
            kind: "needs_correction",
            requireRepeat: true,
            improvedSentence: evaluation.improvedSentence,
          }
        : failedOriginalContract();
    }

    return {
      kind: "accepted_original",
      requireRepeat: false,
      improvedSentence: null,
      reinforcement: "positive",
    };
  }

  const severity = evaluation.correctionSeverity;
  const improvedSentence = evaluation.improvedSentence?.trim() || null;
  const expectsCorrection = severity !== "none";
  const isParrotedQuestion =
    improvedSentence !== null &&
    isParrotedMissionQuestion(improvedSentence, missionQuestion);
  const validCombination =
    evaluation.correctionNeeded === expectsCorrection &&
    evaluation.outcome ===
      (expectsCorrection ? "needs_correction" : "correct") &&
    (expectsCorrection
      ? improvedSentence !== null
      : improvedSentence === null) &&
    (isParrotedQuestion || !improvedSentence?.includes("?"));

  if (!validCombination) return failedOriginalContract();

  if (severity === "material") {
    return {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: improvedSentence!,
    };
  }

  return {
    kind: "accepted_original",
    requireRepeat: false,
    improvedSentence: severity === "minor" ? improvedSentence : null,
    reinforcement: "positive",
  };
}

export type OriginalTurnGuardContext = {
  evaluationMode: "preset" | "conversation";
  missionQuestion: string | null;
  transcript?: string;
  priorMinimalEffortBlocks?: number;
  priorAmbiguityRetries?: number;
};

const INFORMATION_QUESTION_PATTERN = /^(?:who|what|when|where|why|how)\b/iu;
const POLAR_MINIMAL_RESPONSE_PATTERN =
  /^(?:yes|yeah|yep|yup|no|nope|nah)[.!?]?$/iu;
const POLAR_AUXILIARY_PHRASES = new Set([
  "do", "don't", "do not", "did", "didn't", "did not", "am", "am not",
  "can", "can't", "cannot", "can not", "will", "won't", "will not",
  "have", "haven't", "have not", "would", "wouldn't", "would not",
]);

function isAuxiliaryYesNoCorrection(text: string) {
  const normalized = text
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’‘]/gu, "'")
    .replace(/[,.!?]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const match = normalized.match(/^(?:yes|no) i (.+)$/u);
  return match?.[1] ? POLAR_AUXILIARY_PHRASES.has(match[1]) : false;
}

/**
 * After the two deterministic retries, the evaluator still gets one chance
 * to interpret a short answer. It must not turn a polar answer into a
 * grammatical sentence that remains semantically unrelated to an information
 * question. Ambiguous meaning is safer for teacher review than invented copy.
 */
export function guardNonsensicalMinimalEffortCorrection(
  decision: OriginalTurnDecision,
  context: OriginalTurnGuardContext,
): OriginalTurnDecision {
  if (
    context.evaluationMode !== "conversation" ||
    (context.priorMinimalEffortBlocks ?? 0) < 2 ||
    !INFORMATION_QUESTION_PATTERN.test(context.missionQuestion?.trim() ?? "") ||
    !POLAR_MINIMAL_RESPONSE_PATTERN.test(context.transcript?.trim() ?? "") ||
    decision.kind !== "needs_correction" ||
    !isAuxiliaryYesNoCorrection(decision.improvedSentence)
  ) {
    return decision;
  }

  return {
    kind: "teacher_review",
    reviewReason: "ambiguous",
    requireRepeat: false,
  };
}

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
 * Shared detector behind the "never use the missionQuestion as
 * improvedSentence" backstop (UAT 2026-07-16). Matches a correction that
 * normalizes to the whole missionQuestion, contains one of its
 * question-shaped sentences as a whole-word phrase (UAT 2026-07-20: a
 * declarative answer with the full question appended), or is a
 * question-shaped sentence contained in a multi-sentence opener.
 */
export function isParrotedMissionQuestion(
  improvedSentence: string,
  missionQuestion: string | null,
): boolean {
  const question = normalizeForParrotComparison(missionQuestion ?? "");
  const improved = normalizeForParrotComparison(improvedSentence);
  if (!question || !improved) return false;

  const containsQuestionSegment = normalizedQuestionSegments(
    missionQuestion ?? "",
  ).some(
    (segment) =>
      segment.split(" ").length >= MIN_CONTAINMENT_QUESTION_WORDS &&
      ` ${improved} `.includes(` ${segment} `),
  );

  return (
    improved === question ||
    containsQuestionSegment ||
    (improvedSentence.trim().endsWith("?") && question.includes(improved))
  );
}

/**
 * Deterministic backstop for the conversation-mode prompt rule "never use
 * the missionQuestion as improvedSentence" (UAT 2026-07-16: the provider
 * corrected "I don't" to the opener question itself despite that
 * instruction). A parroted correction would make the child repeat Coco's
 * question as their answer, so downgrade it to retry_original — the student
 * simply re-records and the parroted sentence is never shown or spoken.
 */
export function guardParrotedConversationCorrection(
  decision: OriginalTurnDecision,
  context: OriginalTurnGuardContext,
): OriginalTurnDecision {
  if (context.evaluationMode !== "conversation") return decision;
  if (
    decision.kind !== "needs_correction" &&
    !(decision.kind === "accepted_original" && decision.improvedSentence)
  ) {
    return decision;
  }

  const improvedSentence =
    decision.kind === "needs_correction" ||
    (decision.kind === "accepted_original" && decision.improvedSentence)
      ? decision.improvedSentence
      : null;
  if (!improvedSentence) return decision;

  if (!isParrotedMissionQuestion(improvedSentence, context.missionQuestion)) {
    return decision;
  }

  return decision.kind === "needs_correction"
    ? {
        kind: "retry_original",
        reason: "parroted_correction",
        requireRepeat: false,
      }
    : failedOriginalContract();
}

/**
 * Deterministic backstop for a vacuous correction. UAT 2026-07-25 (attempt
 * 103fa68e turn 2): the evaluator returned an improvedSentence byte-identical
 * to the student's transcript and still demanded a repeat, so the child
 * re-recorded the same words and was then accepted. A correction that changes
 * nothing cannot be material, so accept the original instead of taxing the
 * student with a repeat.
 *
 * Downgrades to accepted_original rather than teacher_review on purpose: the
 * student's sentence was already correct, so there is nothing for a teacher to
 * adjudicate and flagging would fill the review queue with non-problems.
 */
export function guardNoOpCorrection(
  decision: OriginalTurnDecision,
  context: OriginalTurnGuardContext,
): OriginalTurnDecision {
  if (decision.kind !== "needs_correction") return decision;

  const transcript = context.transcript?.trim();
  if (!transcript) return decision;

  const improved = normalizeForParrotComparison(decision.improvedSentence);
  const said = normalizeForParrotComparison(transcript);
  if (!improved || !said || improved !== said) return decision;

  return {
    kind: "accepted_original",
    requireRepeat: false,
    improvedSentence: null,
    reinforcement: "positive",
  };
}

export function repeatTurnSchemaFailureResult(): Extract<
  RepeatTurnDecision,
  { kind: "teacher_review" }
> {
  return {
    kind: "teacher_review",
    repeatAccepted: null,
    reviewReason: "failed_schema",
    requireRepeat: false,
  };
}

export function repeatTurnProviderFailureResult(): Extract<
  RepeatTurnDecision,
  { kind: "teacher_review" }
> {
  return {
    kind: "teacher_review",
    repeatAccepted: null,
    reviewReason: "provider_failed",
    requireRepeat: false,
  };
}

/**
 * Repeat attempts a child may be asked to make before the turn moves on.
 *
 * A repeat the evaluator keeps calling "not close enough" is, past a few
 * tries, far more likely to be an unsayable target than a child who cannot
 * say it. Turn 3 of attempt 6406e6a5 (2026-07-27) asked for the invented word
 * "Baedalranteu" and rejected five clips scoring 90/93/94/94/84 — a loop the
 * child had no way to exit. Accepting after the cap ends the loop in the
 * child's favour, which is the right direction when the fault is ours.
 */
export const MAX_REPEAT_ATTEMPTS = 3 as const;

export function decideRepeatTurnOutcome(
  evaluation: RepeatTurnEvaluation,
  /** Repeat clips already submitted for this turn, including this one. */
  attemptNumber = 1,
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
      requireRepeat: false,
    };
  }

  if (evaluation.repeatCloseEnough) {
    return { kind: "accepted_repeat", repeatAccepted: true };
  }

  // Stop asking rather than loop. The child has tried enough times that the
  // target itself is the likely problem.
  if (attemptNumber >= MAX_REPEAT_ATTEMPTS) {
    return { kind: "accepted_repeat", repeatAccepted: true };
  }

  return {
    kind: "retry_repeat",
    repeatAccepted: false,
    reason: "not_close_enough",
  };
}
