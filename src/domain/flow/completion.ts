/**
 * Deterministic attempt completion + resume-position helpers (D-06).
 *
 * Pure module — no DB, server, or AI/LLM imports. Flow control keys
 * on transcript presence plus app-owned acceptance fields.
 */

type CompletionTurn = {
  turn_order: number;
  original_transcript: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
  evaluation?: unknown;
};

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
    evaluation.outcome === "accepted_original"
  );
}

function isTurnFinished(turn: CompletionTurn): boolean {
  const hasAnswer =
    turn.original_transcript !== null &&
    turn.original_transcript.trim().length > 0;
  const hasRepeat =
    turn.repeat_transcript !== null &&
    turn.repeat_transcript.trim().length > 0;
  const repeatAccepted = turn.repeat_accepted === true;
  return (hasAnswer && hasRepeat && repeatAccepted) || originalAnswerAccepted(turn);
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
