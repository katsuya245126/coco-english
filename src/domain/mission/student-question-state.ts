import type { HintLadder, MissionSnapshotTurn } from "@/domain/mission/schemas";
import { buildReplyHintFrame } from "@/domain/ai/reply-hint-frame";
import { classifyStoredConversationRecovery } from "@/domain/ai/stored-evaluation";

type StudentQuestionSpeechLine = {
  lineKind: "mission_prompt" | "coco_dynamic_line";
  turnOrder: number;
};

export type DynamicConversationPrompt = {
  text: string;
  sourceTurnOrder: number;
};

export function isPendingConversationRecovery({
  conversationMode,
  evaluation,
  cocoLine,
}: {
  conversationMode: boolean;
  evaluation: unknown;
  cocoLine: string | null;
}): boolean {
  if (!conversationMode || !cocoLine?.trim()) return false;

  const recovery = classifyStoredConversationRecovery(evaluation);
  return (
    recovery.kind === "ambiguity" ||
    recovery.kind === "low_confidence_audio_retry" ||
    recovery.kind === "carried_ambiguity"
  );
}

export function deriveSameTurnRecoveryPrompt({
  turnIndex,
  pendingCocoLine,
}: {
  turnIndex: number;
  pendingCocoLine: string | null;
}): {
  turnIndex: number;
  dynamicPrompt: DynamicConversationPrompt;
} | null {
  const text = pendingCocoLine?.trim();
  if (!text) return null;

  return {
    turnIndex,
    dynamicPrompt: { text, sourceTurnOrder: turnIndex + 1 },
  };
}

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
  replyHintFrame: string | null;
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
  dynamicPrompt: DynamicConversationPrompt | null;
}): ActiveStudentQuestion {
  const dynamicText = dynamicPrompt?.text.trim();
  if (
    conversationMode &&
    dynamicPrompt &&
    dynamicText &&
    dynamicPrompt.sourceTurnOrder >= 1
  ) {
    return {
      kind: "conversation",
      prompt: dynamicText,
      replyHintFrame: buildReplyHintFrame(dynamicText),
      activeTurnOrder: turnIndex + 1,
      recordingEnabled: true,
      line: {
        lineKind: "coco_dynamic_line",
        turnOrder: dynamicPrompt.sourceTurnOrder,
      },
    };
  }

  const snapshotTurn =
    !conversationMode || turnIndex === 0 ? turns[turnIndex] : undefined;
  if (snapshotTurn) {
    if (conversationMode) {
      return {
        kind: "conversation",
        prompt: snapshotTurn.prompt,
        replyHintFrame: buildReplyHintFrame(snapshotTurn.prompt),
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
}): {
  turnIndex: number;
  dynamicPrompt: DynamicConversationPrompt | null;
} {
  const text = pendingCocoLine?.trim();
  const dynamicPrompt = text
    ? { text, sourceTurnOrder: turnIndex + 1 }
    : null;
  return { turnIndex: turnIndex + 1, dynamicPrompt };
}

export type AcceptedConversationTurnResolution =
  | {
      kind: "next";
      turnIndex: number;
      dynamicPrompt: DynamicConversationPrompt;
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
    dynamicPrompt: { text: line, sourceTurnOrder: turnIndex + 1 },
  };
}

export function deriveResumedDynamicPrompt({
  conversationMode,
  startingTurnIndex,
  pendingUnclearRetry,
  attemptTurns,
}: {
  conversationMode: boolean;
  startingTurnIndex: number;
  pendingUnclearRetry: boolean;
  attemptTurns: Array<{ turnOrder: number; cocoLine: string | null }>;
}): DynamicConversationPrompt | null {
  if (
    !conversationMode ||
    (startingTurnIndex < 1 && !pendingUnclearRetry)
  ) {
    return null;
  }

  const sourceTurnOrder = pendingUnclearRetry
    ? startingTurnIndex + 1
    : startingTurnIndex;
  const text = attemptTurns
    .find((turn) => turn.turnOrder === sourceTurnOrder)
    ?.cocoLine?.trim();
  return text ? { text, sourceTurnOrder } : null;
}
