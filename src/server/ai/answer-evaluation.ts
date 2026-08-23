/**
 * Answer-evaluation pipeline (extracted from the student-audio upload
 * service; architecture issue #66).
 *
 * Server-only module. Owns everything between a validated transcript and a
 * stored turn outcome: the deterministic fast path, the low-confidence-audio
 * gate (issue #64), the provider call with exactly one policy-repair round
 * trip (issue #65), guard-chain composition, ambiguity-ladder bookkeeping,
 * provider/schema failure fallbacks, and stored-evidence shaping — for
 * original answers and repeat clips alike.
 *
 * The module owns no persistence, ownership checks, budgeting, or storage:
 * callers persist exactly what these functions return. Guard ordering is an
 * implementation invariant enforced and tested here — never re-compose the
 * guards at a call site. Repair caps and retry budgets (one contract repair,
 * MAX_AMBIGUITY_RETRIES, MAX_LOW_CONFIDENCE_AUDIO_RETRIES,
 * MAX_MINIMAL_EFFORT_BLOCKS interplay) are UAT-bound product decisions; do
 * not tune them without an explicit product decision.
 */

import {
  isExactTargetMatch,
} from "@/domain/ai/fast-path";
import {
  canonicalizeNoOpOriginalEvaluation,
  validateOriginalEvaluationContract,
  type OriginalEvaluationViolation,
} from "@/domain/ai/original-evaluation-contract";
import {
  AI_EVALUATION_VERSION,
  CORRECTION_POLICY_VERSION,
  MAX_AMBIGUITY_RETRIES,
  decideOriginalTurnOutcome,
  decideRepeatTurnOutcome,
  guardNonsensicalMinimalEffortCorrection,
  guardNoOpCorrection,
  guardParrotedConversationCorrection,
  originalTurnProviderFailureResult,
  originalTurnSchemaFailureResult,
  repeatTurnProviderFailureResult,
  repeatTurnSchemaFailureResult,
  type OriginalTurnGuardContext,
} from "@/domain/ai/turn-evaluation";
import {
  isMinimalEffortAnswer,
  MAX_MINIMAL_EFFORT_BLOCKS,
} from "@/domain/ai/minimal-effort-detection";
import {
  classifyMinimalEffortFeedback,
  resolveMinimalEffortRetryExample,
} from "@/domain/ai/minimal-effort-feedback";
import { isIncompleteUtterance } from "@/domain/ai/incomplete-utterance";
import {
  isLowConfidenceTranscript,
  isTranscriptConfidenceBelowGate,
} from "@/domain/audio/transcript-confidence";
import type { TranscriptionEvidence } from "@/server/audio/transcription";
import {
  evaluateOriginalTurn,
  evaluateRepeatTurn,
  resolveEvaluationModel,
  resolveEvaluationRuntimeVersion,
  type EvaluateOriginalTurnInput,
  type EvaluateRepeatTurnInput,
  type OriginalTurnEvaluationResult,
  type RepeatTurnEvaluationResult,
} from "@/server/ai/turn-evaluator";
import { log } from "@/server/logging/logger";
import type {
  StoredEvaluationProvenance,
  StoredOriginalTurnEvaluation,
  StoredRepeatTurnEvaluation,
} from "@/domain/ai/stored-evaluation";

const FAILED_SCHEMA_REVIEW_REASON = "failed_schema";
/**
 * Review reason for a well-formed provider verdict rejected by a
 * deterministic contract check when policy repair could not fix it
 * (issue #65). `failed_schema` stays reserved for genuinely malformed or
 * unparseable output.
 */
const CONTRACT_REJECTED_REVIEW_REASON = "contract_rejected" as const;
export const LOW_CONFIDENCE_REVIEW_REASON = "low_confidence";
/**
 * Free say-it-again retries granted for low-confidence transcripts before
 * the evaluator is allowed to see the text (issue #64). Mirrors the bounded
 * shape of the ambiguity ladder; exhausting it falls through to normal
 * evaluation, never straight to review.
 */
export const MAX_LOW_CONFIDENCE_AUDIO_RETRIES = 2;

type OriginalTurnWriteDecision = {
  evaluation: StoredOriginalTurnEvaluation;
  targetAttempted: boolean | null;
  improvedSentence: string | null;
};

function deterministicOriginalEvaluation(
  fields: Omit<
    StoredOriginalTurnEvaluation,
    keyof StoredEvaluationProvenance | "kind"
  >,
  evidence: StoredEvaluationProvenance,
): StoredOriginalTurnEvaluation {
  return {
    kind: "original",
    ...fields,
    ...evidence,
    evaluationSource: "deterministic",
  };
}

/** Provenance attached to any evaluation produced without a provider call. */
function buildFallbackProvenance(
  transcriptionEvidence: TranscriptionEvidence,
): StoredEvaluationProvenance {
  return {
    policyVersion: CORRECTION_POLICY_VERSION,
    evaluationModel: resolveEvaluationModel(),
    evaluationSource: "model",
    transcriptionModel: transcriptionEvidence.model,
    transcriptionConfidence: transcriptionEvidence.confidence,
    runtimeVersion: resolveEvaluationRuntimeVersion(),
  };
}

function priorMinimalEffortBlocks(evaluation: unknown): number {
  if (
    typeof evaluation !== "object" ||
    evaluation === null ||
    Array.isArray(evaluation)
  ) {
    return 0;
  }
  const stored = evaluation as {
    minimalEffortBlocks?: unknown;
  };
  return typeof stored.minimalEffortBlocks === "number" &&
    Number.isFinite(stored.minimalEffortBlocks)
    ? Math.max(0, Math.floor(stored.minimalEffortBlocks))
    : 0;
}

/**
 * How many times this turn already answered a low-confidence transcript with
 * the free say-it-again retry (issue #64). Tracked separately from
 * `ambiguityRetries` so microphone problems never consume the meaningful-
 * answer recovery budget, and never escalate toward teacher review by
 * themselves.
 */
function priorLowConfidenceAudioRetries(evaluation: unknown): number {
  if (
    typeof evaluation !== "object" ||
    evaluation === null ||
    Array.isArray(evaluation)
  ) {
    return 0;
  }
  const stored = evaluation as {
    lowConfidenceAudioRetries?: unknown;
  };
  return typeof stored.lowConfidenceAudioRetries === "number" &&
    Number.isFinite(stored.lowConfidenceAudioRetries)
    ? Math.max(0, Math.floor(stored.lowConfidenceAudioRetries))
    : 0;
}

function priorAmbiguityState(evaluation: unknown): Pick<
  StoredOriginalTurnEvaluation,
  "ambiguityRetries" | "ambiguityHistory"
> {
  if (
    typeof evaluation !== "object" ||
    evaluation === null ||
    Array.isArray(evaluation)
  ) {
    return { ambiguityRetries: 0, ambiguityHistory: [] };
  }

  const stored = evaluation as Partial<StoredOriginalTurnEvaluation>;
  return {
    ambiguityRetries:
      typeof stored.ambiguityRetries === "number" &&
      Number.isFinite(stored.ambiguityRetries)
        ? Math.max(0, Math.floor(stored.ambiguityRetries))
        : 0,
    ambiguityHistory: Array.isArray(stored.ambiguityHistory)
      ? stored.ambiguityHistory
      : [],
  };
}

function applyOriginalTurnEvaluation(
  result: OriginalTurnEvaluationResult,
  guardContext: OriginalTurnGuardContext,
  fallbackProvenance: StoredEvaluationProvenance,
): OriginalTurnWriteDecision {
  if (!result.ok) {
    const decision =
      result.error === "schema_failed"
        ? originalTurnSchemaFailureResult()
        : originalTurnProviderFailureResult();
    const reviewReason =
      result.error === "schema_failed"
        ? FAILED_SCHEMA_REVIEW_REASON
        : "provider_failed";

    return {
      evaluation: {
        kind: "original",
        ...fallbackProvenance,
        version: AI_EVALUATION_VERSION,
        outcome: decision.kind,
        confidence: "low",
        reviewReason,
        meaningUnderstood: false,
        targetPatternAttempted: false,
        englishLanguage: "uncertain",
        correctionNeeded: false,
        correctionSeverity: null,
        correctionReason: "none",
        improvedSentence: null,
        requireRepeat: decision.requireRepeat,
        hangulInterpretations: [],
      },
      targetAttempted: null,
      improvedSentence: null,
    };
  }

  const decision = guardNoOpCorrection(
    guardNonsensicalMinimalEffortCorrection(
      guardParrotedConversationCorrection(
        decideOriginalTurnOutcome(
          result.evaluation,
          guardContext.evaluationMode,
          guardContext.missionQuestion,
          guardContext.priorAmbiguityRetries ?? 0,
        ),
        guardContext,
      ),
      guardContext,
    ),
    guardContext,
  );
  const improvedSentence =
    decision.kind === "needs_correction" || decision.kind === "accepted_original"
      ? decision.improvedSentence
      : null;

  return {
    evaluation: {
      kind: "original",
      ...result.evaluation,
      version: AI_EVALUATION_VERSION,
      outcome: decision.kind,
      confidence: result.evaluation.confidence,
      reviewReason:
        decision.kind === "teacher_review"
          ? decision.reviewReason || LOW_CONFIDENCE_REVIEW_REASON
          : null,
      meaningUnderstood: result.evaluation.meaningUnderstood,
      targetPatternAttempted: result.evaluation.targetPatternAttempted,
      englishLanguage: result.evaluation.englishLanguage,
      correctionNeeded: result.evaluation.correctionNeeded,
      correctionSeverity: result.evaluation.correctionSeverity,
      correctionReason: result.evaluation.correctionReason,
      improvedSentence,
      requireRepeat: decision.requireRepeat,
    },
    targetAttempted: result.evaluation.targetPatternAttempted,
    improvedSentence,
  };
}

function applyRepeatTurnEvaluation(
  result: RepeatTurnEvaluationResult,
  /** Repeat clips submitted for this turn so far, including this one. */
  attemptNumber = 1,
): StoredRepeatTurnEvaluation {
  if (!result.ok) {
    const decision =
      result.error === "schema_failed"
        ? repeatTurnSchemaFailureResult()
        : repeatTurnProviderFailureResult();
    const reviewReason =
      result.error === "schema_failed"
        ? FAILED_SCHEMA_REVIEW_REASON
        : "provider_failed";

    return {
      kind: "repeat",
      version: AI_EVALUATION_VERSION,
      outcome: decision.kind,
      confidence: "low",
      reviewReason,
      englishLanguage: "uncertain",
      repeatCloseEnough: false,
      repeatAccepted: decision.repeatAccepted,
      requireRepeat: decision.requireRepeat,
      hangulInterpretations: [],
    };
  }

  const decision = decideRepeatTurnOutcome(result.evaluation, attemptNumber);
  return {
    kind: "repeat",
    version: AI_EVALUATION_VERSION,
    outcome: decision.kind,
    confidence: result.evaluation.confidence,
    reviewReason:
      decision.kind === "teacher_review" ? decision.reviewReason : null,
    englishLanguage: result.evaluation.englishLanguage,
    repeatCloseEnough: result.evaluation.repeatCloseEnough,
    repeatAccepted: decision.repeatAccepted,
    requireRepeat: decision.kind === "retry_repeat" ? true : false,
    hangulInterpretations: result.evaluation.hangulInterpretations,
  };
}

export type PreGuardClassification =
  | { stage: "incomplete_recording_guard" | "minimal_effort_guard" }
  | { stage: "evaluate" };

/**
 * Synchronously predict whether this original answer will short-circuit into
 * a deterministic guard without any provider call. Callers that own audio
 * side effects (pronunciation scoring) use it to avoid starting work the
 * pipeline would discard; evaluateOriginalTurnAnswer uses the same logic as
 * its first pipeline step.
 */
export function classifyPreGuardStage(input: {
  transcript: string;
  targetExample: string | null;
  priorTurnEvaluation: unknown;
}): PreGuardClassification {
  const exactTargetMatched =
    input.targetExample !== null &&
    isExactTargetMatch(input.transcript, input.targetExample);

  if (!exactTargetMatched && isIncompleteUtterance(input.transcript)) {
    return { stage: "incomplete_recording_guard" };
  }
  if (
    isMinimalEffortAnswer(input.transcript) &&
    !exactTargetMatched &&
    priorMinimalEffortBlocks(input.priorTurnEvaluation) <
      MAX_MINIMAL_EFFORT_BLOCKS
  ) {
    return { stage: "minimal_effort_guard" };
  }
  return { stage: "evaluate" };
}

export type OriginalAnswerEvaluationRequest = {
  /** Everything the provider evaluator needs, including the transcript. */
  evaluationInput: EvaluateOriginalTurnInput;
  /**
   * Stored `attempt_turns.evaluation` for this row before this clip was
   * processed — the gate counters and ambiguity-ladder state are read from
   * here, never from caller-supplied numbers.
   */
  priorTurnEvaluation: unknown;
  /** Clip id written into ambiguity-history evidence entries. */
  audioClipId: string;
  /** Authored opener prompt, used when history entries lack a better question. */
  openingPrompt?: string;
};

export type OriginalAnswerEvaluationDeps = {
  evaluate?: typeof evaluateOriginalTurn;
};

export type OriginalAnswerEvaluationOutcome = {
  /**
   * Which deterministic decision produced the result:
   * - incomplete_recording_guard / minimal_effort_guard: fabricated without
   *   any provider call; callers persist and return early exactly as the
   *   inline guards they replace.
   * - evaluated: the full gate → fast-path → provider → repair → guards path.
   */
  stage:
    | "evaluated"
    | "incomplete_recording_guard"
    | "minimal_effort_guard";
  decision: OriginalTurnWriteDecision;
  fastPathUsed: boolean;
  lowConfidenceGateRetryApplied: boolean;
  gateRetryDetail: {
    minLogprob: number | null;
    tokenCount: number | null;
    retriesAfter: number;
  } | null;
  stageMs: {
    evaluationMs?: number;
    evaluationRepairMs?: number;
  };
};

/**
 * Full original-answer pipeline: low-confidence gate → deterministic fast
 * path → provider → canonicalize → validate → one policy repair →
 * re-validate → fallbacks → guard chain → stored-evidence shaping.
 */
export async function evaluateOriginalTurnAnswer(
  input: OriginalAnswerEvaluationRequest,
  deps: OriginalAnswerEvaluationDeps = {},
): Promise<OriginalAnswerEvaluationOutcome> {
  const { evaluationInput } = input;
  const transcript = evaluationInput.transcript;
  const fallbackProvenance = buildFallbackProvenance(
    evaluationInput.transcriptionEvidence ?? {
      model: "unknown",
      confidence: null,
    },
  );
  const ambiguityState = priorAmbiguityState(input.priorTurnEvaluation);
  const minimalEffortBlocks = priorMinimalEffortBlocks(
    input.priorTurnEvaluation,
  );

  const evaluate = deps.evaluate ?? evaluateOriginalTurn;
  const stageMs: OriginalAnswerEvaluationOutcome["stageMs"] = {};

  // Deterministic pre-evaluation guards. An exact authored-target match
  // always wins over both (phone-UAT item 6): the frame regex proves shape
  // only, but an authored example is known-good English.
  const classification = classifyPreGuardStage({
    transcript,
    targetExample: evaluationInput.targetExample,
    priorTurnEvaluation: input.priorTurnEvaluation,
  });
  const exactTargetMatched =
    evaluationInput.targetExample !== null &&
    isExactTargetMatch(transcript, evaluationInput.targetExample);

  if (classification.stage === "incomplete_recording_guard") {
    return {
      stage: "incomplete_recording_guard",
      decision: {
        evaluation: deterministicOriginalEvaluation(
          {
            version: AI_EVALUATION_VERSION,
            outcome: "retry_original",
            confidence: "high",
            reviewReason: null,
            meaningUnderstood: false,
            targetPatternAttempted: false,
            englishLanguage: "english",
            correctionNeeded: false,
            correctionSeverity: null,
            correctionReason: "none",
            improvedSentence: null,
            requireRepeat: false,
            hangulInterpretations: [],
            retryReason: "incomplete_recording",
            ...((ambiguityState.ambiguityRetries ?? 0) > 0
              ? {
                  ambiguityRetries: ambiguityState.ambiguityRetries,
                  ambiguityHistory: ambiguityState.ambiguityHistory,
                }
              : {}),
          },
          fallbackProvenance,
        ),
        targetAttempted: false,
        improvedSentence: null,
      },
      fastPathUsed: false,
      lowConfidenceGateRetryApplied: false,
      gateRetryDetail: null,
      stageMs: {},
    };
  }

  if (classification.stage === "minimal_effort_guard") {
    return {
      stage: "minimal_effort_guard",
      decision: {
        evaluation: deterministicOriginalEvaluation(
          {
            version: AI_EVALUATION_VERSION,
            outcome: "retry_original",
            confidence: "high",
            reviewReason: null,
            meaningUnderstood: false,
            targetPatternAttempted: false,
            englishLanguage: "english",
            correctionNeeded: false,
            correctionSeverity: null,
            correctionReason: "none",
            improvedSentence: null,
            requireRepeat: false,
            hangulInterpretations: [],
            retryReason: "minimal_effort",
            minimalEffortBlocks: minimalEffortBlocks + 1,
            minimalEffortKind:
              classifyMinimalEffortFeedback(transcript) ?? "short_answer",
            retryExample: resolveMinimalEffortRetryExample({
              evaluationMode: evaluationInput.evaluationMode,
              missionQuestion: evaluationInput.missionQuestion ?? "",
              targetExample: evaluationInput.targetExample,
            }),
            ...((ambiguityState.ambiguityRetries ?? 0) > 0
              ? {
                  ambiguityRetries: ambiguityState.ambiguityRetries,
                  ambiguityHistory: ambiguityState.ambiguityHistory,
                }
              : {}),
          },
          fallbackProvenance,
        ),
        targetAttempted: false,
        improvedSentence: null,
      },
      fastPathUsed: false,
      lowConfidenceGateRetryApplied: false,
      gateRetryDetail: null,
      stageMs: {},
    };
  }

  let evaluationResult: OriginalTurnEvaluationResult;
  let fastPathUsed = false;
  const storedLowConfidenceRetries = priorLowConfidenceAudioRetries(
    input.priorTurnEvaluation,
  );
  const transcriptConfidence =
    evaluationInput.transcriptionEvidence?.confidence ?? null;
  // Issue #64 low-confidence gate: a transcript that decoded below the
  // confidence threshold gets a free say-it-again retry BEFORE any
  // evaluation call. The evaluator would only see garbled text and route it
  // to teacher review — the dominant spurious-review cause in the
  // 2026-08-21 export. Bounded so a broken microphone cannot loop forever;
  // exhausting the gate falls through to the normal evaluation path, so
  // escalation stays unchanged.
  const lowConfidenceGateRetry =
    transcriptConfidence !== null &&
    isTranscriptConfidenceBelowGate(transcriptConfidence) &&
    storedLowConfidenceRetries < MAX_LOW_CONFIDENCE_AUDIO_RETRIES;
  if (lowConfidenceGateRetry) {
    evaluationResult = {
      ok: true,
      // The provider-shaped outcome satisfies the result type; the gated
      // decision below rewrites it to retry_original without passing through
      // decideOriginalTurnOutcome, so no ambiguity budget is consumed.
      evaluation: {
        ...fallbackProvenance,
        version: AI_EVALUATION_VERSION,
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        correctionNeeded: false,
        correctionSeverity: "none",
        correctionReason: "none",
        improvedSentence: null,
        englishLanguage: "uncertain",
        confidence: "low",
        reviewReason: null,
        hangulInterpretations: [],
        evaluationSource: "deterministic",
      },
    };
  } else {
    // Skip the evaluator only for an exact authored-target match. An open
    // answer that merely fits the frame shape (e.g. "I'd rather big city
    // because more things to do") is structurally on-frame but may be
    // ungrammatical, so it still needs the model — the frame regex proves
    // shape, not grammar. The model prompt already keeps the child's own
    // choice while correcting genuinely-wrong English.
    if (exactTargetMatched) {
      fastPathUsed = true;
      evaluationResult = {
        ok: true,
        evaluation: {
          ...fallbackProvenance,
          version: AI_EVALUATION_VERSION,
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
          evaluationSource: "deterministic",
          hangulInterpretations: [],
        },
      };
    } else {
      const evaluationStartedAt = Date.now();
      try {
        evaluationResult = await evaluate(evaluationInput);
      } finally {
        stageMs.evaluationMs = Math.max(0, Date.now() - evaluationStartedAt);
      }
    }
  }

  let contractViolations: OriginalEvaluationViolation[] = [];
  let contractRejected = false;
  if (lowConfidenceGateRetry) {
    // Skipped entirely: the transcript is not trusted text, so canonicalizing
    // it or paying for a policy-repair call about it would defeat the gate.
  } else if (evaluationResult.ok) {
    const canonicalEvaluation = canonicalizeNoOpOriginalEvaluation(
      evaluationResult.evaluation,
      transcript,
      evaluationInput.evaluationMode,
    );
    const firstContract = validateOriginalEvaluationContract({
      evaluation: canonicalEvaluation,
      evaluationMode: evaluationInput.evaluationMode,
      answerShape: evaluationInput.answerShape ?? "open",
      missionQuestion: evaluationInput.missionQuestion ?? null,
      targetPattern: evaluationInput.targetPattern,
      transcript,
    });

    if (firstContract.ok) {
      evaluationResult = {
        ok: true,
        evaluation: canonicalEvaluation,
      };
    } else {
      contractViolations = firstContract.violations;
      const repairStartedAt = Date.now();
      let repaired;
      try {
        repaired = await evaluate({
          ...evaluationInput,
          policyRepair: { violations: firstContract.violations },
        });
      } finally {
        stageMs.evaluationRepairMs = Math.max(0, Date.now() - repairStartedAt);
      }

      if (!repaired.ok) {
        evaluationResult = repaired;
      } else {
        const canonicalRepair = canonicalizeNoOpOriginalEvaluation(
          repaired.evaluation,
          transcript,
          evaluationInput.evaluationMode,
        );
        const repairedContract = validateOriginalEvaluationContract({
          evaluation: canonicalRepair,
          evaluationMode: evaluationInput.evaluationMode,
          answerShape: evaluationInput.answerShape ?? "open",
          missionQuestion: evaluationInput.missionQuestion ?? null,
          targetPattern: evaluationInput.targetPattern,
          transcript,
        });
        if (repairedContract.ok) {
          evaluationResult = {
            ok: true,
            evaluation: canonicalRepair,
          };
          contractViolations =
            canonicalRepair.outcome === "teacher_review" &&
            firstContract.violations.includes("prompt_echo")
              ? ["prompt_echo"]
              : [];
        } else {
          contractViolations = repairedContract.violations;
          contractRejected = true;
          log("warn", "ai.original_evaluation_contract_rejected", {
            violations: repairedContract.violations,
          });
          evaluationResult = {
            ok: false,
            error: "schema_failed",
          };
        }
      }
    }
  }

  if (
    !evaluationResult.ok &&
    evaluationResult.error === "schema_failed" &&
    evaluationInput.evaluationMode === "conversation" &&
    isLowConfidenceTranscript(transcriptConfidence)
  ) {
    evaluationResult = {
      ok: true,
      evaluation: {
        ...fallbackProvenance,
        version: AI_EVALUATION_VERSION,
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        correctionNeeded: false,
        correctionSeverity: "none",
        correctionReason: "none",
        improvedSentence: null,
        englishLanguage: "uncertain",
        confidence: "low",
        reviewReason: "low_confidence",
        evaluationSource: "deterministic",
        hangulInterpretations: [],
      },
    };
  }

  // The gated decision is synthesized directly — no contract
  // canonicalization or repair round-trip, either: the transcript is not
  // trusted text, so spending another evaluation call to repair a verdict
  // about it would defeat the gate.
  const decision: OriginalTurnWriteDecision = lowConfidenceGateRetry
    ? {
        evaluation: {
          kind: "original",
          ...fallbackProvenance,
          version: AI_EVALUATION_VERSION,
          outcome: "retry_original",
          confidence: "low",
          reviewReason: null,
          meaningUnderstood: false,
          targetPatternAttempted: false,
          englishLanguage: "uncertain",
          correctionNeeded: false,
          correctionSeverity: "none",
          correctionReason: "none",
          improvedSentence: null,
          requireRepeat: false,
          retryReason: "unclear_meaning",
          ambiguityRetries: ambiguityState.ambiguityRetries,
          lowConfidenceAudioRetries: storedLowConfidenceRetries + 1,
          hangulInterpretations: [],
          evaluationSource: "deterministic",
        },
        targetAttempted: false,
        improvedSentence: null,
      }
    : applyOriginalTurnEvaluation(
        evaluationResult,
        {
          evaluationMode: evaluationInput.evaluationMode,
          missionQuestion: evaluationInput.missionQuestion ?? null,
          transcript,
          priorMinimalEffortBlocks: minimalEffortBlocks,
          priorAmbiguityRetries:
            contractViolations.includes("prompt_echo") &&
            (ambiguityState.ambiguityRetries ?? 0) > 0
              ? MAX_AMBIGUITY_RETRIES
              : ambiguityState.ambiguityRetries,
        },
        fallbackProvenance,
      );
  if (minimalEffortBlocks > 0) {
    decision.evaluation.minimalEffortBlocks = minimalEffortBlocks;
  }
  // Preserve how many free audio retries this turn has already spent when
  // the normal evaluation path takes over (gate exhausted or confident
  // decode) — the synthesized gated decision sets it directly.
  const carriedLowConfidenceRetries = storedLowConfidenceRetries;
  if (!lowConfidenceGateRetry && carriedLowConfidenceRetries > 0) {
    decision.evaluation.lowConfidenceAudioRetries = carriedLowConfidenceRetries;
  }
  if (contractViolations.length > 0) {
    decision.evaluation.contractViolations = contractViolations;
    // Issue #65: a rejected verdict that policy repair could not fix is a
    // contract rejection, not a schema decode failure. The synthesis path
    // labels it failed_schema because that is the only !ok error it can
    // express; relabel here where the violations are known. Genuine
    // malformed-output failures carry no violations and keep failed_schema.
    if (
      contractRejected &&
      decision.evaluation.outcome === "teacher_review"
    ) {
      decision.evaluation.reviewReason = CONTRACT_REJECTED_REVIEW_REASON;
    }
  }
  if (
    evaluationInput.evaluationMode !== "conversation" &&
    evaluationInput.answerShape === "open" &&
    contractViolations.includes("unsupported_detail") &&
    minimalEffortBlocks === 0 &&
    (ambiguityState.ambiguityRetries ?? 0) === 0
  ) {
    const rejectedEvaluation = {
      ...decision.evaluation,
      outcome: "teacher_review" as const,
      meaningUnderstood: false,
      targetPatternAttempted: false,
      correctionNeeded: false,
      correctionSeverity: "none" as const,
      correctionReason: "none" as const,
      improvedSentence: null,
      englishLanguage: "uncertain" as const,
      confidence: "low" as const,
      reviewReason: decision.evaluation.reviewReason,
    };
    decision.evaluation.outcome = "retry_original";
    decision.evaluation.reviewReason = null;
    decision.evaluation.retryReason = "unclear_meaning";
    decision.evaluation.ambiguityRetries = 1;
    decision.evaluation.ambiguityHistory = [
      ...(ambiguityState.ambiguityHistory ?? []),
      {
        transcript,
        audioClipId: input.audioClipId,
        evaluation: rejectedEvaluation,
      },
    ];
  }
  if (
    evaluationInput.evaluationMode === "conversation" &&
    decision.evaluation.outcome === "retry_original" &&
    decision.evaluation.retryReason === undefined &&
    evaluationResult.ok &&
    evaluationResult.evaluation.outcome === "teacher_review" &&
    (ambiguityState.ambiguityRetries ?? 0) <
      (contractViolations.includes("prompt_echo")
        ? 1
        : MAX_AMBIGUITY_RETRIES)
  ) {
    const ambiguityRetries = (ambiguityState.ambiguityRetries ?? 0) + 1;
    decision.evaluation.retryReason = "unclear_meaning";
    decision.evaluation.ambiguityRetries = ambiguityRetries;
    decision.evaluation.ambiguityHistory = [
      ...(ambiguityState.ambiguityHistory ?? []),
      {
        transcript,
        audioClipId: input.audioClipId,
        evaluation: evaluationResult.evaluation,
        question:
          evaluationInput.missionQuestion ?? input.openingPrompt ?? "",
      },
    ];
  } else if ((ambiguityState.ambiguityRetries ?? 0) > 0) {
    decision.evaluation.ambiguityRetries = ambiguityState.ambiguityRetries;
    decision.evaluation.ambiguityHistory = ambiguityState.ambiguityHistory;
  }

  return {
    stage: "evaluated",
    decision,
    fastPathUsed,
    lowConfidenceGateRetryApplied: lowConfidenceGateRetry,
    gateRetryDetail: lowConfidenceGateRetry
      ? {
          minLogprob: transcriptConfidence?.minLogprob ?? null,
          tokenCount: transcriptConfidence?.tokenCount ?? null,
          retriesAfter: storedLowConfidenceRetries + 1,
        }
      : null,
    stageMs,
  };
}

export type RepeatAnswerEvaluationRequest = {
  /** The English sentence the learner was asked to repeat. */
  repeatTarget: string;
  originalTranscript: string;
  transcript: string;
  koreanSpans: EvaluateRepeatTurnInput["koreanSpans"];
  targetPattern: string;
  level: EvaluateRepeatTurnInput["level"];
  /** Prior transcribed repeat clips for this turn plus this one. */
  attemptNumber: number;
  /**
   * The stored original evaluation this repeat answers — carried from the
   * same upload when both clips arrive together, otherwise read from the
   * durable row. Persisted verbatim under evaluation.originalEvaluation so
   * correctionSeverity evidence survives the repeat write.
   */
  originalEvaluation?: StoredOriginalTurnEvaluation;
};

export type RepeatAnswerEvaluationDeps = {
  evaluate?: typeof evaluateRepeatTurn;
};

export type RepeatAnswerEvaluationOutcome = {
  evaluation: StoredRepeatTurnEvaluation;
  fastPathUsed: boolean;
  stageMs: {
    evaluationMs?: number;
  };
};

/**
 * Repeat-clip pipeline: deterministic exact-match fast path → provider →
 * stored-evidence shaping. `attemptNumber` labels whether this repeat was
 * close enough within the bounded repeat cap.
 */
export async function evaluateRepeatTurnAnswer(
  input: RepeatAnswerEvaluationRequest,
  deps: RepeatAnswerEvaluationDeps = {},
): Promise<RepeatAnswerEvaluationOutcome> {
  const stageMs: RepeatAnswerEvaluationOutcome["stageMs"] = {};
  // Skip the OpenAI evaluation call entirely when the repeat transcript is
  // an exact normalized match for the sentence the student was asked to
  // repeat — mirrors the original-answer fast path. Without this, a
  // verbatim repeat still depends on a non-deterministic LLM judgment call,
  // which can (and did) reject an exact match.
  const fastPathUsed = isExactTargetMatch(input.transcript, input.repeatTarget);
  let evaluationResult: RepeatTurnEvaluationResult;
  if (fastPathUsed) {
    evaluationResult = {
      ok: true,
      evaluation: {
        version: AI_EVALUATION_VERSION,
        outcome: "repeat_accepted",
        repeatCloseEnough: true,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
        hangulInterpretations: [],
      },
    };
  } else {
    const evaluationStartedAt = Date.now();
    try {
      evaluationResult = await (deps.evaluate ?? evaluateRepeatTurn)({
        originalTranscript: input.originalTranscript,
        improvedSentence: input.repeatTarget,
        targetPattern: input.targetPattern,
        level: input.level,
        repeatTranscript: input.transcript,
        koreanSpans: input.koreanSpans,
      });
    } finally {
      stageMs.evaluationMs = Math.max(0, Date.now() - evaluationStartedAt);
    }
  }
  return {
    evaluation: {
      ...applyRepeatTurnEvaluation(evaluationResult, input.attemptNumber),
      ...(input.originalEvaluation
        ? { originalEvaluation: input.originalEvaluation }
        : {}),
    },
    fastPathUsed,
    stageMs,
  };
}
