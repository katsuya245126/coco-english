import {
  conversationHistorySchema,
  type ConversationExchange,
} from "@/domain/ai/conversation-generation";

export type PersistedConversationTurn = {
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  coco_line: string | null;
};

export type BuildConversationHistoryResult =
  | { ok: true; history: ConversationExchange[] }
  | { ok: false; error: "invalid_history" };

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
    if (!response || !row.coco_line?.trim()) {
      return { ok: false, error: "invalid_history" };
    }
    history.push({
      turnOrder: row.turn_order,
      cocoLine: question,
      studentResponse: response,
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
