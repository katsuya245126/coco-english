import type { PronunciationStarBand, WordHighlight } from "@/domain/pronunciation/scoring";
import {
  TEACHER_REVIEW_OUTCOME,
  type StudentFacingEvaluation,
} from "@/domain/ai/stored-evaluation";
import type { PendingTurnReview } from "@/domain/flow/completion";
import {
  deriveSameTurnRecoveryPrompt,
  resolveAcceptedConversationTurn,
  type DynamicConversationPrompt,
} from "@/domain/mission/student-question-state";

export type FlowStep =
  | "question"
  | "cocoThinking"
  | "aiFeedback"
  | "repeat"
  | "repeatFeedback"
  | "reviewPending"
  | "closing"
  | "complete";

type OriginalFeedback = (
  | {
      kind: "acceptedOriginal";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "needsCorrection";
      transcript: string | null;
      improvedSentence: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryOriginal";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryUnclearMeaning";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryIncompleteRecording";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryMinimalEffort";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "teacherReview";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
) & {
  minimalEffortKind?: "dont_know" | "short_answer";
  retryExample?: string | null;
};

type RepeatFeedback =
  | {
      kind: "repeatAccepted";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "repeatRetry";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "repeatReview";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "repeatLimitReached";
      transcript: string | null;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    };

export type FlowState = {
  turnIndex: number;
  step: FlowStep;
  hintLevel: number;
  originalTranscript: string | null;
  repeatTranscript: string | null;
  improvedSentence: string | null;
  originalFeedback: OriginalFeedback | null;
  repeatFeedback: RepeatFeedback | null;
  // A first 1-star result forces one retry, but a later 1-star result never
  // traps a student who genuinely struggles with a turn.
  hasRetriedThisTurn: boolean;
  // The generated response for the current original answer.
  cocoLine: string | null;
  // The persisted Coco line that prompts the next dynamic turn.
  dynamicPrompt: DynamicConversationPrompt | null;
};

export type UploadVoiceClipPayload = {
  displayTranscript: string | null;
  evaluation?: StudentFacingEvaluation;
  starBand?: PronunciationStarBand | null;
  wordsToPractice?: WordHighlight[];
  cocoLine?: string | null;
};

export type ReconstructMissionFlowInput = {
  startingTurnIndex: number;
  initialDynamicPrompt: DynamicConversationPrompt | null;
  initialReview: (PendingTurnReview & { audioUrl?: string }) | null;
};

export type MissionFlowContext = {
  conversationMode: boolean;
  requiredTurns: number;
};

export type MissionFlowEvent =
  | (MissionFlowContext & {
      type: "originalUploaded";
      upload: UploadVoiceClipPayload;
    })
  | (MissionFlowContext & {
      type: "repeatUploaded";
      upload: UploadVoiceClipPayload;
    })
  | (MissionFlowContext & { type: "continueOriginal" })
  | (MissionFlowContext & { type: "continueRepeat" })
  | { type: "retryOriginal" }
  | { type: "retryWithImprovedSentence" | "retryRepeat" }
  | { type: "revealHint"; hintLevel: number };

export type CompletionDecision =
  | { kind: "complete"; state: FlowState }
  | { kind: "reviewPending"; state: FlowState }
  | { kind: "closing"; state: FlowState };

export type MissionFlowTransition =
  | { kind: "apply"; state: FlowState }
  | { kind: "unavailable"; state: FlowState }
  | CompletionDecision;

function emptyFlowState(
  turnIndex: number,
  dynamicPrompt: DynamicConversationPrompt | null,
): FlowState {
  return {
    turnIndex,
    step: "question",
    hintLevel: 0,
    originalTranscript: null,
    repeatTranscript: null,
    improvedSentence: null,
    originalFeedback: null,
    repeatFeedback: null,
    hasRetriedThisTurn: false,
    cocoLine: null,
    dynamicPrompt,
  };
}

export function reconstructMissionFlow({
  startingTurnIndex,
  initialDynamicPrompt,
  initialReview,
}: ReconstructMissionFlowInput): FlowState {
  const pendingRecoveryPrompt =
    initialReview?.step === "aiFeedback" &&
    initialReview.outcome === "retryUnclearMeaning"
      ? deriveSameTurnRecoveryPrompt({
          turnIndex: startingTurnIndex,
          pendingCocoLine: initialDynamicPrompt?.text ?? null,
        })
      : null;
  const emptyState = emptyFlowState(
    pendingRecoveryPrompt?.turnIndex ?? startingTurnIndex,
    pendingRecoveryPrompt?.dynamicPrompt ?? initialDynamicPrompt,
  );

  if (!initialReview) return emptyState;

  if (initialReview.step === "aiFeedback") {
    if (initialReview.outcome === "retryUnclearMeaning" && pendingRecoveryPrompt) {
      return {
        ...emptyState,
        hasRetriedThisTurn: true,
      };
    }

    let originalFeedback: OriginalFeedback;
    if (initialReview.outcome === "needsCorrection") {
      if (!initialReview.improvedSentence) return emptyState;
      originalFeedback = {
        kind: "needsCorrection",
        transcript: initialReview.transcript,
        improvedSentence: initialReview.improvedSentence,
      };
    } else {
      originalFeedback = {
        kind: initialReview.outcome,
        transcript: initialReview.transcript,
        minimalEffortKind: initialReview.minimalEffortKind,
        retryExample: initialReview.retryExample,
      };
    }

    return {
      ...emptyState,
      step: "aiFeedback",
      originalTranscript: initialReview.transcript,
      improvedSentence: initialReview.improvedSentence,
      originalFeedback,
      cocoLine: initialReview.cocoLine,
    };
  }

  return {
    ...emptyState,
    step: "repeatFeedback",
    originalTranscript: initialReview.originalTranscript,
    repeatTranscript: initialReview.transcript,
    improvedSentence: initialReview.improvedSentence,
    repeatFeedback: {
      kind: initialReview.outcome,
      transcript: initialReview.transcript,
    },
    cocoLine: initialReview.cocoLine,
  };
}

function feedbackFromEvaluation(
  transcript: string | null,
  evaluation: UploadVoiceClipPayload["evaluation"],
  starBand?: PronunciationStarBand | null,
  wordsToPractice?: WordHighlight[],
): OriginalFeedback {
  if (
    evaluation?.kind === "original" &&
    evaluation.outcome === "needs_correction" &&
    evaluation.improvedSentence
  ) {
    return {
      kind: "needsCorrection",
      transcript,
      improvedSentence: evaluation.improvedSentence,
      starBand,
      wordsToPractice,
    };
  }
  if (
    evaluation?.kind === "original" &&
    evaluation.outcome === "retry_original"
  ) {
    if (evaluation.retryReason === "minimal_effort") {
      return {
        kind: "retryMinimalEffort",
        transcript,
        minimalEffortKind: evaluation.minimalEffortKind,
        retryExample: evaluation.retryExample,
        starBand,
        wordsToPractice,
      };
    }
    if (evaluation.retryReason === "unclear_meaning") {
      return {
        kind: "retryUnclearMeaning",
        transcript,
        starBand,
        wordsToPractice,
      };
    }
    if (evaluation.retryReason === "incomplete_recording") {
      return {
        kind: "retryIncompleteRecording",
        transcript,
        starBand,
        wordsToPractice,
      };
    }
    return { kind: "retryOriginal", transcript, starBand, wordsToPractice };
  }
  // Both original and repeat evaluations may route to teacher review.
  if (evaluation?.outcome === TEACHER_REVIEW_OUTCOME) {
    return { kind: "teacherReview", transcript, starBand, wordsToPractice };
  }
  return { kind: "acceptedOriginal", transcript, starBand, wordsToPractice };
}

function repeatFeedbackFromEvaluation(
  transcript: string | null,
  evaluation: UploadVoiceClipPayload["evaluation"],
  starBand?: PronunciationStarBand | null,
  wordsToPractice?: WordHighlight[],
): RepeatFeedback {
  if (evaluation?.kind === "repeat") {
    if (evaluation.outcome === "retry_repeat") {
      return { kind: "repeatRetry", transcript, starBand, wordsToPractice };
    }
    if (evaluation.outcome === TEACHER_REVIEW_OUTCOME) {
      return { kind: "repeatReview", transcript, starBand, wordsToPractice };
    }
    if (evaluation.outcome === "repeat_limit_reached") {
      return {
        kind: "repeatLimitReached",
        transcript,
        starBand,
        wordsToPractice,
      };
    }
  }
  return { kind: "repeatAccepted", transcript, starBand, wordsToPractice };
}

function unavailableTransition(state: FlowState): MissionFlowTransition {
  return {
    kind: "unavailable",
    state: {
      ...state,
      turnIndex: state.turnIndex + 1,
      step: "question",
      cocoLine: null,
      dynamicPrompt: null,
    },
  };
}

function conversationTurnTransition(
  state: FlowState,
  requiredTurns: number,
  pendingCocoLine: string | null,
): MissionFlowTransition {
  const resolution = resolveAcceptedConversationTurn({
    turnIndex: state.turnIndex,
    requiredTurns,
    pendingCocoLine,
  });

  if (resolution.kind === "unavailable") {
    return unavailableTransition(state);
  }
  if (resolution.kind === "closing") {
    return {
      kind: "closing",
      state: {
        ...state,
        step: "closing",
        cocoLine: resolution.closingLine,
      },
    };
  }
  return {
    kind: "apply",
    state: emptyFlowState(resolution.turnIndex, resolution.dynamicPrompt),
  };
}

function completionTransition(
  state: FlowState,
  kind: CompletionDecision["kind"],
): CompletionDecision {
  return {
    kind,
    state: {
      ...state,
      step: kind,
    },
  };
}

export function transitionMissionFlow(
  state: FlowState,
  event: MissionFlowEvent,
): MissionFlowTransition {
  switch (event.type) {
    case "originalUploaded": {
      const transcript = event.upload.displayTranscript;
      const originalFeedback = feedbackFromEvaluation(
        transcript,
        event.upload.evaluation,
        event.upload.starBand,
        event.upload.wordsToPractice,
      );
      const recovery = deriveSameTurnRecoveryPrompt({
        turnIndex: state.turnIndex,
        pendingCocoLine: event.upload.cocoLine ?? null,
      });

      if (
        event.conversationMode &&
        originalFeedback.kind === "retryUnclearMeaning" &&
        recovery
      ) {
        return {
          kind: "apply",
          state: {
            ...emptyFlowState(recovery.turnIndex, recovery.dynamicPrompt),
            // Keep a revealed hint visible while the recovery question stays
            // on the same turn.
            hintLevel: state.hintLevel,
            hasRetriedThisTurn: true,
          },
        };
      }

      if (
        event.conversationMode &&
        (originalFeedback.kind === "acceptedOriginal" ||
          originalFeedback.kind === "teacherReview")
      ) {
        return conversationTurnTransition(
          state,
          event.requiredTurns,
          event.upload.cocoLine ?? null,
        );
      }

      return {
        kind: "apply",
        state: {
          ...state,
          step: "aiFeedback",
          originalTranscript: transcript,
          repeatTranscript: null,
          improvedSentence:
            originalFeedback.kind === "needsCorrection"
              ? originalFeedback.improvedSentence
              : null,
          originalFeedback,
          repeatFeedback: null,
          cocoLine: event.upload.cocoLine ?? null,
        },
      };
    }

    case "repeatUploaded": {
      const transcript = event.upload.displayTranscript;
      const repeatFeedback = repeatFeedbackFromEvaluation(
        transcript,
        event.upload.evaluation,
        event.upload.starBand,
        event.upload.wordsToPractice,
      );

      if (
        event.conversationMode &&
        (repeatFeedback.kind === "repeatAccepted" ||
          repeatFeedback.kind === "repeatReview" ||
          repeatFeedback.kind === "repeatLimitReached")
      ) {
        return conversationTurnTransition(
          state,
          event.requiredTurns,
          state.cocoLine,
        );
      }

      return {
        kind: "apply",
        state: {
          ...state,
          repeatTranscript: transcript,
          repeatFeedback,
          step: "repeatFeedback",
        },
      };
    }

    case "continueOriginal": {
      const feedback = state.originalFeedback;
      if (!feedback) return { kind: "apply", state };

      if (
        event.conversationMode &&
        (feedback.kind === "acceptedOriginal" ||
          feedback.kind === "teacherReview")
      ) {
        return conversationTurnTransition(
          state,
          event.requiredTurns,
          state.cocoLine,
        );
      }

      if (feedback.kind === "needsCorrection") {
        return { kind: "apply", state: { ...state, step: "repeat" } };
      }

      const isFinalTurn = state.turnIndex + 1 >= event.requiredTurns;
      if (isFinalTurn) {
        return completionTransition(
          state,
          feedback.kind === "teacherReview" ? "reviewPending" : "complete",
        );
      }
      return {
        kind: "apply",
        state: emptyFlowState(state.turnIndex + 1, null),
      };
    }

    case "continueRepeat": {
      const feedback = state.repeatFeedback;
      if (!feedback || feedback.kind === "repeatRetry") {
        return { kind: "apply", state };
      }

      if (event.conversationMode) {
        return conversationTurnTransition(
          state,
          event.requiredTurns,
          state.cocoLine,
        );
      }

      const isFinalTurn = state.turnIndex + 1 >= event.requiredTurns;
      if (isFinalTurn) {
        return completionTransition(
          state,
          feedback.kind === "repeatReview" ? "reviewPending" : "complete",
        );
      }
      return {
        kind: "apply",
        state: emptyFlowState(state.turnIndex + 1, null),
      };
    }

    case "retryOriginal":
      return {
        kind: "apply",
        state: {
          ...state,
          step: "question",
          originalTranscript: null,
          repeatTranscript: null,
          improvedSentence: null,
          originalFeedback: null,
          repeatFeedback: null,
          hasRetriedThisTurn: true,
        },
      };

    case "retryWithImprovedSentence":
    case "retryRepeat":
      return {
        kind: "apply",
        state: {
          ...state,
          step: "repeat",
          repeatTranscript: null,
          repeatFeedback: null,
          hasRetriedThisTurn: true,
        },
      };

    case "revealHint":
      return {
        kind: "apply",
        state: { ...state, hintLevel: event.hintLevel },
      };

  }
}
