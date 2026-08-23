/**
 * Deterministic attempt completion + resume-position helpers (D-06).
 *
 * Pure module — no DB, server, or AI/LLM imports. Flow control keys
 * on transcript presence plus app-owned acceptance fields.
 *
 * Flow control still reads the persisted raw transcripts: they are the
 * evidence that a turn happened. Only the learner-facing `transcript` fields
 * are re-derived through the interpretation metadata, so a Hangul span the
 * evaluator never confirmed as English is withheld from the child without
 * changing whether the turn counts as answered.
 */

import {
  buildLearnerTranscript,
  hangulInterpretationSchema,
  type HangulInterpretation,
} from "@/domain/audio/transcript-interpretation";
import {
  AI_EVALUATION_VERSION,
} from "@/domain/ai/turn-evaluation";
import {
  originalMetadataOf,
  parseStoredEvaluation,
  storedOriginalOf,
  TEACHER_REVIEW_OUTCOME,
} from "@/domain/ai/stored-evaluation";

export type CompletionTurn = {
  turn_order: number;
  original_transcript: string | null;
  improved_sentence?: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
  evaluation?: unknown;
  coco_line?: string | null;
};

export type PendingTurnReview =
  | {
      step: "aiFeedback";
      outcome:
        | "acceptedOriginal"
        | "needsCorrection"
        | "retryOriginal"
        | "retryUnclearMeaning"
        | "retryIncompleteRecording"
        | "retryMinimalEffort";
      transcript: string | null;
      improvedSentence: string | null;
      clipKind: "original_answer";
      cocoLine: string | null;
      minimalEffortKind?: "dont_know" | "short_answer";
      retryExample?: string | null;
    }
  | {
      step: "repeatFeedback";
      outcome:
        | "repeatAccepted"
        | "repeatRetry"
        | "repeatReview"
        | "repeatLimitReached";
      transcript: string | null;
      originalTranscript: string | null;
      improvedSentence: string | null;
      clipKind: "repeat_attempt";
      cocoLine: string | null;
    };

function readInterpretations(value: unknown): HangulInterpretation[] {
  const parsed = hangulInterpretationSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * Absent or malformed metadata yields an empty set, which is exactly right in
 * both directions: a legacy all-English row still displays verbatim, and any
 * row containing Hangul fails closed to `null`.
 */
function displayFor(
  rawTranscript: string,
  evaluation: Record<string, unknown> | null,
): string | null {
  return buildLearnerTranscript(
    rawTranscript,
    readInterpretations(evaluation?.hangulInterpretations),
  );
}

function evaluationOutcome(turn: CompletionTurn): string | null {
  // The version gate keeps pre-discriminant rows of unknown vintage excluded;
  // discrimination itself lives in the shared stored-evaluation contract.
  const parsed = parseStoredEvaluation(turn.evaluation);
  return parsed.ok &&
    parsed.evaluation.version === AI_EVALUATION_VERSION &&
    typeof parsed.evaluation.outcome === "string"
    ? parsed.evaluation.outcome
    : null;
}

function evaluationRetryReason(turn: CompletionTurn): string | null {
  const retryReason = storedOriginalOf(turn.evaluation)?.retryReason;
  return typeof retryReason === "string" ? retryReason : null;
}

function evaluationMinimalEffortMetadata(turn: CompletionTurn) {
  const original = storedOriginalOf(turn.evaluation);
  return {
    minimalEffortKind: original?.minimalEffortKind,
    retryExample:
      typeof original?.retryExample === "string" &&
      original.retryExample.trim().length > 0
        ? original.retryExample.trim()
        : null,
  };
}

/**
 * Recognizes an original answer as finished when it was either accepted
 * outright or internally reviewed (teacher_review) — a persisted
 * teacher-review turn is not necessarily the mission's final turn, so resume
 * and completion counting must treat it as done rather than re-prompting the
 * student for the same turn (Task 3, deferred-completion redesign).
 */
function originalAnswerAccepted(turn: CompletionTurn): boolean {
  if (
    turn.original_transcript === null ||
    turn.original_transcript.trim().length === 0
  ) {
    return false;
  }

  // The version gate keeps pre-discriminant rows of unknown vintage excluded;
  // discrimination itself lives in the shared stored-evaluation contract.
  const parsed = parseStoredEvaluation(turn.evaluation);
  return (
    parsed.ok &&
    parsed.evaluation.version === AI_EVALUATION_VERSION &&
    parsed.evaluation.requireRepeat === false &&
    (parsed.evaluation.outcome === "accepted_original" ||
      parsed.evaluation.outcome === TEACHER_REVIEW_OUTCOME)
  );
}

/**
 * Recognizes a repeat turn as finished when it was either accepted outright
 * (repeat_accepted === true, handled by the caller), internally reviewed, or
 * stopped at the repeat cap. Those terminal outcomes must not strand the
 * student on an unreachable turn.
 */
function repeatAnswerFinished(turn: CompletionTurn): boolean {
  if (
    turn.repeat_transcript === null ||
    turn.repeat_transcript.trim().length === 0
  ) {
    return false;
  }

  const parsed = parseStoredEvaluation(turn.evaluation);
  return (
    parsed.ok &&
    parsed.evaluation.version === AI_EVALUATION_VERSION &&
    (parsed.evaluation.outcome === TEACHER_REVIEW_OUTCOME ||
      parsed.evaluation.outcome === "repeat_limit_reached") &&
    parsed.evaluation.requireRepeat === false
  );
}

/** Rebuild the feedback card that immediately followed the latest recording. */
export function getPendingTurnReview(
  turn: CompletionTurn,
): PendingTurnReview | null {
  const originalTranscript = turn.original_transcript?.trim();
  if (!originalTranscript) return null;

  const outcome = evaluationOutcome(turn);
  const repeatTranscript = turn.repeat_transcript?.trim();

  if (repeatTranscript) {
    const repeatOutcome =
      outcome === "accepted_repeat"
        ? "repeatAccepted"
        : outcome === "retry_repeat"
          ? "repeatRetry"
          : outcome === "teacher_review"
            ? "repeatReview"
            : outcome === "repeat_limit_reached"
              ? "repeatLimitReached"
            : null;
    if (!repeatOutcome) return null;

    const parsedEvaluation = parseStoredEvaluation(turn.evaluation);

    return {
      step: "repeatFeedback",
      outcome: repeatOutcome,
      transcript: displayFor(
        repeatTranscript,
        parsedEvaluation.ok ? parsedEvaluation.evaluation : null,
      ),
      originalTranscript: displayFor(
        originalTranscript,
        originalMetadataOf(parsedEvaluation),
      ),
      improvedSentence: turn.improved_sentence ?? null,
      clipKind: "repeat_attempt",
      cocoLine: turn.coco_line?.trim() || null,
    };
  }

  const originalOutcome =
    outcome === "accepted_original"
      ? "acceptedOriginal"
      : outcome === "needs_correction"
        ? "needsCorrection"
        : outcome === "retry_original"
          ? evaluationRetryReason(turn) === "minimal_effort"
            ? "retryMinimalEffort"
            : evaluationRetryReason(turn) === "unclear_meaning"
              ? "retryUnclearMeaning"
            : evaluationRetryReason(turn) === "incomplete_recording"
              ? "retryIncompleteRecording"
            : "retryOriginal"
          : null;
  if (!originalOutcome) return null;

  const minimalEffortMetadata =
    originalOutcome === "retryMinimalEffort"
      ? evaluationMinimalEffortMetadata(turn)
      : {};

  // The pending original feedback reads the row's top-level record: the
  // repeat-overwritten nesting only matters after a repeat write.
  const parsedTurnEvaluation = parseStoredEvaluation(turn.evaluation);

  return {
    step: "aiFeedback",
    outcome: originalOutcome,
    transcript: displayFor(
      originalTranscript,
      parsedTurnEvaluation.ok ? parsedTurnEvaluation.evaluation : null,
    ),
    improvedSentence: turn.improved_sentence ?? null,
    clipKind: "original_answer",
    cocoLine: turn.coco_line?.trim() || null,
    ...minimalEffortMetadata,
  };
}

function isTurnFinished(turn: CompletionTurn): boolean {
  const hasAnswer =
    turn.original_transcript !== null &&
    turn.original_transcript.trim().length > 0;
  const hasRepeat =
    turn.repeat_transcript !== null &&
    turn.repeat_transcript.trim().length > 0;
  const repeatAccepted = turn.repeat_accepted === true;
  return (
    (hasAnswer && hasRepeat && repeatAccepted) ||
    (hasAnswer && hasRepeat && repeatAnswerFinished(turn)) ||
    originalAnswerAccepted(turn)
  );
}

/**
 * Returns true only when every required turn (turn_order 1..requiredTurns)
 * has either a non-empty original answer accepted by app-owned AI evaluation,
 * or a non-empty accepted repeat.
 */
export function isAttemptComplete(
  requiredTurns: number,
  turns: CompletionTurn[],
): boolean {
  if (turns.length < requiredTurns) return false;

  const turnMap = new Map<number, CompletionTurn>();
  for (const t of turns) {
    turnMap.set(t.turn_order, t);
  }

  for (let order = 1; order <= requiredTurns; order++) {
    const turn = turnMap.get(order);
    if (!turn || !isTurnFinished(turn)) return false;
  }

  return true;
}

/**
 * Returns the 1-based turn_order of the first turn in 1..requiredTurns
 * that is missing an accepted answer + repeat, or `requiredTurns + 1`
 * (sentinel: all done) if every required turn is finished.
 */
export function nextUnfinishedTurnOrder(
  requiredTurns: number,
  turns: CompletionTurn[],
): number {
  const turnMap = new Map<number, CompletionTurn>();
  for (const t of turns) {
    turnMap.set(t.turn_order, t);
  }

  for (let order = 1; order <= requiredTurns; order++) {
    const turn = turnMap.get(order);
    if (!turn || !isTurnFinished(turn)) return order;
  }

  return requiredTurns + 1;
}
