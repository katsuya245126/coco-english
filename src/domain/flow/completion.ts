/**
 * Deterministic attempt completion + resume-position helpers (D-06).
 *
 * Pure module — no DB, server, or AI/LLM imports. Flow control keys
 * ONLY on transcript presence + repeat_accepted; it never reads the
 * `evaluation` field. This isolation ensures that Phase 6's AI
 * evaluation swap cannot break completion logic (D-02 swap isolation).
 */

type CompletionTurn = {
  turn_order: number;
  original_transcript: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
};

function isTurnFinished(turn: CompletionTurn): boolean {
  const hasAnswer =
    turn.original_transcript !== null &&
    turn.original_transcript.trim().length > 0;
  const hasRepeat =
    turn.repeat_transcript !== null &&
    turn.repeat_transcript.trim().length > 0;
  const repeatAccepted = turn.repeat_accepted === true;
  return hasAnswer && hasRepeat && repeatAccepted;
}

/**
 * Returns true only when every required turn (turn_order 1..requiredTurns)
 * has a non-empty trimmed original_transcript, a non-empty trimmed
 * repeat_transcript, and repeat_accepted === true.
 *
 * Never reads the `evaluation` field — flow control is transcript-only.
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
