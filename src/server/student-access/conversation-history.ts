import {
  WITHHELD_STUDENT_RESPONSE,
  conversationHistorySchema,
  type ConversationExchange,
} from "@/domain/ai/conversation-generation";
import { storedTurnWasUnderstood } from "@/domain/ai/stored-evaluation";

export type PersistedConversationTurn = {
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  coco_line: string | null;
  evaluation?: unknown;
};

/**
 * Whether a prior turn's answer may be used to ground later generation.
 *
 * withheldUnusableLatestResponse masks an unusable answer only on the turn it
 * happens. Rebuilding history from the transcript alone then handed that same
 * answer back as trusted grounding on the next turn, and it survived into the
 * closing recap — attempt 4c1f229e ended with "You told me about your favorite
 * games inside" when the turn naming a game had failed evaluation and was never
 * understood.
 *
 * Discrimination lives in the shared stored-evaluation contract, so this
 * check and every other reader of the same column cannot disagree.
 */

export type BuildConversationHistoryResult =
  | { ok: true; history: ConversationExchange[] }
  | { ok: false; error: "invalid_history" };

export type PersistedAmbiguityEntry = {
  question?: string;
  recoveryQuestion?: string;
};

/**
 * Every question already put to the student this turn: the persisted
 * conversation lines plus anything recorded while recovering from unclear
 * answers. Recovery pivots must never repeat any of them verbatim.
 */
export function collectPreviouslyAskedQuestions(input: {
  conversationHistory: ConversationExchange[];
  ambiguityHistory?: PersistedAmbiguityEntry[];
}): string[] {
  const asked: string[] = [];
  for (const exchange of input.conversationHistory) {
    if (exchange?.cocoLine?.trim()) asked.push(exchange.cocoLine.trim());
  }
  for (const entry of input.ambiguityHistory ?? []) {
    if (entry?.question?.trim()) asked.push(entry.question.trim());
    if (entry?.recoveryQuestion?.trim()) asked.push(entry.recoveryQuestion.trim());
  }
  return asked;
}

export function buildConversationHistory(input: {
  openerLine: string;
  currentTurnOrder: number;
  currentStudentResponse: string;
  priorTurns: PersistedConversationTurn[];
}): BuildConversationHistoryResult {
  if (
    !input.openerLine.trim() ||
    !input.currentStudentResponse.trim() ||
    input.priorTurns.length !== input.currentTurnOrder - 1
  ) {
    return { ok: false, error: "invalid_history" };
  }

  const history: ConversationExchange[] = [];
  let question = input.openerLine;

  for (let index = 0; index < input.priorTurns.length; index += 1) {
    const row = input.priorTurns[index];
    if (!row || row.turn_order !== index + 1) {
      return { ok: false, error: "invalid_history" };
    }
    const response = row.improved_sentence?.trim() || row.original_transcript?.trim();
    // A turn with no transcript at all is malformed history regardless of
    // whether it was understood, so this check stays on the real value.
    if (!response || !row.coco_line?.trim()) {
      return { ok: false, error: "invalid_history" };
    }
    history.push({
      turnOrder: row.turn_order,
      cocoLine: question,
      studentResponse: storedTurnWasUnderstood(row.evaluation)
        ? response
        : WITHHELD_STUDENT_RESPONSE,
    });
    question = row.coco_line;
  }

  history.push({
    turnOrder: input.currentTurnOrder,
    cocoLine: question,
    studentResponse: input.currentStudentResponse,
  });

  const parsed = conversationHistorySchema.safeParse(history);
  return parsed.success
    ? { ok: true, history: parsed.data }
    : { ok: false, error: "invalid_history" };
}
