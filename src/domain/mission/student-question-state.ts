import type {
  HintLadder,
  MissionSnapshot,
  MissionSnapshotTurn,
} from "@/domain/mission/schemas";
import { buildReplyHintFrame } from "@/domain/ai/reply-hint-frame";
import { SAY_IT_AGAIN_FALLBACK_LINE } from "@/domain/conversation/fallback-lines";
import {
  classifyStoredConversationRecovery,
  parseStoredEvaluation,
} from "@/domain/ai/stored-evaluation";

type StudentQuestionSpeechLine = {
  lineKind: "mission_prompt" | "coco_dynamic_line";
  turnOrder: number;
};

export type StudentQuestionTurnFacts = {
  turnOrder: number;
  cocoLine: string | null;
  evaluation?: unknown;
};

type ActiveQuestionSnapshot = Pick<
  MissionSnapshot,
  "conversationMode" | "requiredTurns" | "turns"
>;

function completedRecoveryQuestionOf(evaluation: unknown): string | null {
  const parsed = parseStoredEvaluation(evaluation);
  if (!parsed.ok) return null;

  const original =
    parsed.kind === "original"
      ? parsed.evaluation
      : parsed.evaluation.originalEvaluation ?? null;
  const latest = original?.ambiguityHistory?.findLast((entry) =>
    entry.recoveryQuestion?.trim(),
  );
  const recoveryQuestion = latest?.recoveryQuestion?.trim();
  if (recoveryQuestion) return recoveryQuestion;

  return original &&
    typeof original.lowConfidenceAudioRetries === "number" &&
    Number.isFinite(original.lowConfidenceAudioRetries) &&
    original.lowConfidenceAudioRetries > 0
    ? SAY_IT_AGAIN_FALLBACK_LINE
    : null;
}

export function resolveActiveStudentQuestion({
  snapshot,
  savedTurns,
  currentTurn,
}: {
  snapshot: ActiveQuestionSnapshot;
  savedTurns: readonly StudentQuestionTurnFacts[];
  currentTurn: StudentQuestionTurnFacts;
}): { question: string; source: StudentQuestionSpeechLine } | null {
  if (currentTurn.turnOrder < 1 || currentTurn.turnOrder > snapshot.requiredTurns) {
    return null;
  }

  if (!snapshot.conversationMode) {
    const authoredTurn = snapshot.turns.find(
      (turn) => turn.turnOrder === currentTurn.turnOrder,
    );
    const question = authoredTurn?.prompt.trim();
    if (!question || !authoredTurn) return null;
    return {
      question,
      source: {
        lineKind: "mission_prompt",
        turnOrder: authoredTurn.turnOrder,
      },
    };
  }

  const completedRecoveryQuestion = completedRecoveryQuestionOf(
    currentTurn.evaluation,
  );

  const currentQuestion = currentTurn.cocoLine?.trim();
  const pendingRecoveryQuestion =
    currentQuestion &&
    isPendingConversationRecovery({
      conversationMode: true,
      evaluation: currentTurn.evaluation,
      cocoLine: currentQuestion,
    })
      ? currentQuestion
      : null;
  const recoveryQuestion = pendingRecoveryQuestion ?? completedRecoveryQuestion;

  if (
    currentTurn.turnOrder !== 1 &&
    (savedTurns.length !== currentTurn.turnOrder - 1 ||
      savedTurns.some(
        (turn, index) => turn.turnOrder !== index + 1 || !turn.cocoLine?.trim(),
      ))
  ) {
    return null;
  }

  if (recoveryQuestion) {
    return {
      question: recoveryQuestion,
      source: { lineKind: "coco_dynamic_line", turnOrder: currentTurn.turnOrder },
    };
  }

  if (currentTurn.turnOrder === 1) {
    const opener = snapshot.turns.find((turn) => turn.turnOrder === 1);
    const question = opener?.prompt.trim();
    return question
      ? {
          question,
          source: { lineKind: "mission_prompt", turnOrder: 1 },
        }
      : null;
  }

  const previousTurn = savedTurns[currentTurn.turnOrder - 2];
  const question = previousTurn?.cocoLine?.trim();
  if (!question) return null;

  return {
    question,
    source: { lineKind: "coco_dynamic_line", turnOrder: previousTurn.turnOrder },
  };
}

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
  const resolution =
    conversationMode &&
    dynamicText &&
    dynamicPrompt &&
    dynamicPrompt.sourceTurnOrder >= 1
      ? {
          question: dynamicText,
          source: {
            lineKind: "coco_dynamic_line" as const,
            turnOrder: dynamicPrompt.sourceTurnOrder,
          },
        }
      : resolveActiveStudentQuestion({
          snapshot: { conversationMode, requiredTurns: turns.length, turns },
          savedTurns: [],
          currentTurn: { turnOrder: turnIndex + 1, cocoLine: null },
        });

  if (resolution) {
    const snapshotTurn = turns.find(
      (turn) => turn.turnOrder === resolution.source.turnOrder,
    );
    if (!conversationMode && snapshotTurn) {
      return {
        kind: "preset",
        prompt: resolution.question,
        activeTurnOrder: snapshotTurn.turnOrder,
        hintLadder: snapshotTurn.hintLadder,
        targetExample: snapshotTurn.targetExample,
        recordingEnabled: true,
        line: resolution.source,
      };
    }
    if (conversationMode) {
      return {
        kind: "conversation",
        prompt: resolution.question,
        replyHintFrame: buildReplyHintFrame(resolution.question),
        activeTurnOrder: turnIndex + 1,
        recordingEnabled: true,
        line: resolution.source,
      };
    }
  }

  // The fallback remains a projection-specific unavailable state. The pure
  // resolver itself returns null when no safe question exists.
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
  attemptTurns,
}: {
  conversationMode: boolean;
  startingTurnIndex: number;
  attemptTurns: Array<StudentQuestionTurnFacts>;
}): DynamicConversationPrompt | null {
  if (!conversationMode) return null;

  const currentTurnOrder = startingTurnIndex + 1;
  const currentTurn = attemptTurns.find(
    (turn) => turn.turnOrder === currentTurnOrder,
  );
  const resolution = resolveActiveStudentQuestion({
    snapshot: {
      conversationMode: true,
      requiredTurns: Math.max(currentTurnOrder, attemptTurns.length + 1),
      turns: [],
    },
    savedTurns: attemptTurns.filter(
      (turn) => turn.turnOrder < currentTurnOrder,
    ),
    currentTurn: {
      turnOrder: currentTurnOrder,
      cocoLine: currentTurn?.cocoLine ?? null,
      evaluation: currentTurn?.evaluation,
    },
  });

  if (!resolution || resolution.source.lineKind !== "coco_dynamic_line") {
    return null;
  }
  return {
    text: resolution.question,
    sourceTurnOrder: resolution.source.turnOrder,
  };
}
