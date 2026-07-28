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
      outcome: "repeatAccepted" | "repeatRetry" | "repeatReview";
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

function readEvaluationObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
  if (
    typeof turn.evaluation !== "object" ||
    turn.evaluation === null ||
    Array.isArray(turn.evaluation)
  ) {
    return null;
  }

  const evaluation = turn.evaluation as { version?: unknown; outcome?: unknown };
  return evaluation.version === "ai-eval-v1" &&
    typeof evaluation.outcome === "string"
    ? evaluation.outcome
    : null;
}

function evaluationRetryReason(turn: CompletionTurn): string | null {
  if (
    typeof turn.evaluation !== "object" ||
    turn.evaluation === null ||
    Array.isArray(turn.evaluation)
  ) {
    return null;
  }

  const evaluation = turn.evaluation as { retryReason?: unknown };
  return typeof evaluation.retryReason === "string"
    ? evaluation.retryReason
    : null;
}

function evaluationMinimalEffortMetadata(turn: CompletionTurn) {
  if (
    typeof turn.evaluation !== "object" ||
    turn.evaluation === null ||
    Array.isArray(turn.evaluation)
  ) {
    return { minimalEffortKind: undefined, retryExample: null };
  }

  const evaluation = turn.evaluation as {
    minimalEffortKind?: unknown;
    retryExample?: unknown;
  };
  const minimalEffortKind =
    evaluation.minimalEffortKind === "dont_know" ||
    evaluation.minimalEffortKind === "short_answer"
      ? evaluation.minimalEffortKind
      : undefined;
  return {
    minimalEffortKind,
    retryExample:
      typeof evaluation.retryExample === "string" &&
      evaluation.retryExample.trim().length > 0
        ? evaluation.retryExample.trim()
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

  if (
    typeof turn.evaluation !== "object" ||
    turn.evaluation === null ||
    Array.isArray(turn.evaluation)
  ) {
    return false;
  }

  const evaluation = turn.evaluation as {
    version?: unknown;
    outcome?: unknown;
    requireRepeat?: unknown;
  };

  return (
    evaluation.version === "ai-eval-v1" &&
    evaluation.requireRepeat === false &&
    (evaluation.outcome === "accepted_original" ||
      evaluation.outcome === "teacher_review")
  );
}

/**
 * Recognizes a repeat turn as finished when it was either accepted outright
 * (repeat_accepted === true, handled by the caller) or internally reviewed
 * (teacher_review) — a persisted repeat-path teacher-review turn is not
 * necessarily the mission's final turn, so resume and completion counting
 * must treat it as done rather than stranding the student on an
 * unreachable turn (mirrors originalAnswerAccepted's pattern for the
 * original-turn path).
 */
function repeatAnswerReviewed(turn: CompletionTurn): boolean {
  if (
    turn.repeat_transcript === null ||
    turn.repeat_transcript.trim().length === 0
  ) {
    return false;
  }

  if (
    typeof turn.evaluation !== "object" ||
    turn.evaluation === null ||
    Array.isArray(turn.evaluation)
  ) {
    return false;
  }

  const evaluation = turn.evaluation as {
    version?: unknown;
    outcome?: unknown;
    requireRepeat?: unknown;
  };

  return (
    evaluation.version === "ai-eval-v1" &&
    evaluation.outcome === "teacher_review" &&
    evaluation.requireRepeat === false
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
            : null;
    if (!repeatOutcome) return null;

    const storedEvaluation = readEvaluationObject(turn.evaluation);

    return {
      step: "repeatFeedback",
      outcome: repeatOutcome,
      transcript: displayFor(repeatTranscript, storedEvaluation),
      originalTranscript: displayFor(
        originalTranscript,
        readEvaluationObject(storedEvaluation?.originalEvaluation),
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

  return {
    step: "aiFeedback",
    outcome: originalOutcome,
    transcript: displayFor(
      originalTranscript,
      readEvaluationObject(turn.evaluation),
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
    (hasAnswer && hasRepeat && repeatAnswerReviewed(turn)) ||
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
