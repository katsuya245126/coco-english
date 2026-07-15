import type { HintLadder, MissionSnapshotTurn } from "@/domain/mission/schemas";

type StudentQuestionSpeechLine = {
  lineKind: "mission_prompt" | "coco_dynamic_line";
  turnOrder: number;
};

type AuthoredStudentQuestion = {
  kind: "authored";
  prompt: string;
  activeTurnOrder: number;
  hintLadder: HintLadder;
  targetExample: string;
  recordingEnabled: true;
  line: StudentQuestionSpeechLine;
};

type DynamicStudentQuestion = {
  kind: "dynamic";
  prompt: string;
  activeTurnOrder: number;
  singleHint: string;
  recordingEnabled: true;
  line: StudentQuestionSpeechLine;
};

type UnavailableStudentQuestion = {
  kind: "unavailable";
  reason: "missing_dynamic_prompt";
  recordingEnabled: false;
};

export type ActiveStudentQuestion =
  | AuthoredStudentQuestion
  | DynamicStudentQuestion
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
  const snapshotTurn = turns[turnIndex];
  if (snapshotTurn) {
    return {
      kind: "authored",
      prompt: snapshotTurn.prompt,
      activeTurnOrder: snapshotTurn.turnOrder,
      hintLadder: snapshotTurn.hintLadder,
      targetExample: snapshotTurn.targetExample,
      recordingEnabled: true,
      line: { lineKind: "mission_prompt", turnOrder: snapshotTurn.turnOrder },
    };
  }

  const prompt = dynamicPrompt?.trim();
  const patternExample = turns[0]?.targetExample;
  if (conversationMode && prompt && patternExample) {
    return {
      kind: "dynamic",
      prompt,
      activeTurnOrder: turnIndex + 1,
      singleHint: `Try using: ${patternExample}`,
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
  | { kind: "complete" }
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
  if (turnIndex + 1 >= requiredTurns) {
    return { kind: "complete" };
  }

  const dynamicPrompt = pendingCocoLine?.trim();
  if (!dynamicPrompt) {
    return { kind: "unavailable" };
  }

  return {
    kind: "next",
    turnIndex: turnIndex + 1,
    dynamicPrompt,
  };
}

export function deriveResumedDynamicPrompt({
  conversationMode,
  startingTurnIndex,
  snapshotTurnCount,
  attemptTurns,
}: {
  conversationMode: boolean;
  startingTurnIndex: number;
  snapshotTurnCount: number;
  attemptTurns: Array<{ turnOrder: number; cocoLine: string | null }>;
}): string | null {
  if (!conversationMode || startingTurnIndex < snapshotTurnCount) return null;

  return (
    attemptTurns.find((turn) => turn.turnOrder === startingTurnIndex)?.cocoLine?.trim() ||
    null
  );
}
