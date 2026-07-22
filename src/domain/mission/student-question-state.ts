import type { HintLadder, MissionSnapshotTurn } from "@/domain/mission/schemas";

type StudentQuestionSpeechLine = {
  lineKind: "mission_prompt" | "coco_dynamic_line";
  turnOrder: number;
};

type PresetStudentQuestion = {
  kind: "preset";
  prompt: string;
  activeTurnOrder: number;
  hintLadder: HintLadder;
  targetExample: string;
  recordingEnabled: true;
  line: StudentQuestionSpeechLine;
};

type ConversationStudentQuestion = {
  kind: "conversation";
  prompt: string;
  activeTurnOrder: number;
  recordingEnabled: true;
  line: StudentQuestionSpeechLine;
};

type UnavailableStudentQuestion = {
  kind: "unavailable";
  reason: "missing_dynamic_prompt";
  recordingEnabled: false;
};

export type ActiveStudentQuestion =
  | PresetStudentQuestion
  | ConversationStudentQuestion
  | UnavailableStudentQuestion;

export function deriveActiveStudentQuestion({
  conversationMode,
  turnIndex,
  turns,
  dynamicPrompt,
}: {
  conversationMode: boolean;
  turnIndex: number;
  turns: MissionSnapshotTurn[];
  dynamicPrompt: string | null;
}): ActiveStudentQuestion {
  const snapshotTurn =
    !conversationMode || turnIndex === 0 ? turns[turnIndex] : undefined;
  if (snapshotTurn) {
    if (conversationMode) {
      return {
        kind: "conversation",
        prompt: snapshotTurn.prompt,
        activeTurnOrder: snapshotTurn.turnOrder,
        recordingEnabled: true,
        line: { lineKind: "mission_prompt", turnOrder: snapshotTurn.turnOrder },
      };
    }
    return {
      kind: "preset",
      prompt: snapshotTurn.prompt,
      activeTurnOrder: snapshotTurn.turnOrder,
      hintLadder: snapshotTurn.hintLadder,
      targetExample: snapshotTurn.targetExample,
      recordingEnabled: true,
      line: { lineKind: "mission_prompt", turnOrder: snapshotTurn.turnOrder },
    };
  }

  const prompt = dynamicPrompt?.trim();
  if (conversationMode && turnIndex > 0 && prompt) {
    return {
      kind: "conversation",
      prompt,
      activeTurnOrder: turnIndex + 1,
      recordingEnabled: true,
      line: { lineKind: "coco_dynamic_line", turnOrder: turnIndex },
    };
  }

  return {
    kind: "unavailable",
    reason: "missing_dynamic_prompt",
    recordingEnabled: false,
  };
}

export function advanceConversationQuestion({
  turnIndex,
  pendingCocoLine,
}: {
  turnIndex: number;
  pendingCocoLine: string | null;
}): { turnIndex: number; dynamicPrompt: string | null } {
  const dynamicPrompt = pendingCocoLine?.trim() || null;
  return { turnIndex: turnIndex + 1, dynamicPrompt };
}

export type AcceptedConversationTurnResolution =
  | {
      kind: "next";
      turnIndex: number;
      dynamicPrompt: string;
    }
  | { kind: "closing"; closingLine: string }
  | { kind: "unavailable" };

export function resolveAcceptedConversationTurn({
  turnIndex,
  requiredTurns,
  pendingCocoLine,
}: {
  turnIndex: number;
  requiredTurns: number;
  pendingCocoLine: string | null;
}): AcceptedConversationTurnResolution {
  const line = pendingCocoLine?.trim();
  if (!line) return { kind: "unavailable" };

  if (turnIndex + 1 >= requiredTurns) {
    return { kind: "closing", closingLine: line };
  }

  return {
    kind: "next",
    turnIndex: turnIndex + 1,
    dynamicPrompt: line,
  };
}

export function deriveResumedDynamicPrompt({
  conversationMode,
  startingTurnIndex,
  attemptTurns,
}: {
  conversationMode: boolean;
  startingTurnIndex: number;
  attemptTurns: Array<{ turnOrder: number; cocoLine: string | null }>;
}): string | null {
  if (!conversationMode || startingTurnIndex < 1) return null;

  return (
    attemptTurns.find((turn) => turn.turnOrder === startingTurnIndex)?.cocoLine?.trim() ||
    null
  );
}
