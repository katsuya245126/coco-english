import {
  isStoredTeacherReview,
  type StoredConversationRecoveryState,
  type StoredOriginalTurnEvaluation,
} from "@/domain/ai/stored-evaluation";
import {
  canGenerateNextDynamicTurn,
} from "@/server/student-access/mission-flow";
import {
  generateCocoReply,
  type GenerateCocoReplyError,
  type GenerateCocoReplyResult,
} from "@/server/ai/conversation-generator";
import { isContentSafe } from "@/server/ai/content-moderation";
import {
  WITHHELD_STUDENT_RESPONSE,
  conversationReplyMode,
  type ConversationExchange,
  type GenerateCocoReplyInput,
  type GeneratedCocoReplyParts,
  type GeneratedCocoReplyLineViolation,
} from "@/domain/ai/conversation-generation";
import {
  buildConversationHistory,
  collectPreviouslyAskedQuestions,
  type PersistedConversationTurn,
} from "@/server/student-access/conversation-history";
import {
  classifyFollowUpFallbackKind,
  selectClosingFallbackLine,
  selectFollowUpFallbackLine,
  SAY_IT_AGAIN_FALLBACK_LINE,
  withReviewPendingAcknowledgment,
} from "@/domain/conversation/fallback-lines";
import {
  buildDeterministicPivotQuestion,
  leadingQuestionWord,
  pickRecoveryPivotWord,
  topicAnchorWords,
  validateRecoveryPivotQuestion,
  type RecoveryPivotViolation,
} from "@/domain/conversation/recovery-pivot";

export type CannedFallbackCause =
  | GenerateCocoReplyError
  | "unsafe_output"
  | "output_moderation_unavailable";

export type CocoLineModerationEvent =
  | { kind: "flagged_student_input" }
  | { kind: "input_moderation_unavailable" }
  | { kind: "retried" }
  | {
      kind: "canned_fallback";
      cause: Exclude<CannedFallbackCause, "reply_policy_failed">;
    }
  | {
      kind: "canned_fallback";
      cause: "reply_policy_failed";
      violations: GeneratedCocoReplyLineViolation[];
      rejectedCandidate: GeneratedCocoReplyParts;
      rejectedAttempt: "first" | "corrected";
    }
  | {
      kind: "canned_fallback";
      cause: "recovery_pivot_rejected";
      violations: RecoveryPivotViolation[];
    };

export type CocoLineModerationEventKind = CocoLineModerationEvent["kind"];

type ConversationTurnContext = {
  turnOrder: number;
  targetPattern: string;
  requiredTurns: number;
  studentTranscript: string;
  conversationHistory: ConversationExchange[];
  responseHandling: "normal" | "review_pending";
  generationPurpose?: GenerateCocoReplyInput["generationPurpose"];
};

type ConversationTurnOutcome = {
  cocoLine: string | null;
  moderationEvent: CocoLineModerationEvent | null;
};

type GenerateCocoReplyFailure = Extract<
  GenerateCocoReplyResult,
  { ok: false }
>;

export type ConversationPersistenceIntent = {
  kind: "record_coco_line";
  turnOrder: number;
  cocoLine: string;
  moderationEvent: CocoLineModerationEvent | null;
  evaluation?: StoredOriginalTurnEvaluation;
};

export type ConversationTtsIntent = {
  characterId: string;
  text: string;
};

export type ConversationPersistenceResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "db_error" };

export type ConversationOrchestratorInput = {
  conversationMode: boolean;
  turnOrder: number;
  requiredTurns: number;
  targetPattern: string;
  title: string;
  characterId: string;
  openerLine: string;
  missionQuestion: string | null;
  transcript: string;
  priorTurns: PersistedConversationTurn[];
  evaluation?: StoredOriginalTurnEvaluation;
  recoveryState: StoredConversationRecoveryState;
  lowConfidenceGateRetryApplied: boolean;
};

export type ConversationOrchestratorPorts = {
  generateCocoReply: typeof generateCocoReply;
  isContentSafe: typeof isContentSafe;
  persistCocoLine: (
    intent: ConversationPersistenceIntent,
  ) => Promise<ConversationPersistenceResult>;
  warmCocoLine: (intent: ConversationTtsIntent) => Promise<void>;
};

export type ConversationOrchestratorResult =
  | {
      kind: "skip";
      cocoLine: null;
      moderationEvent: null;
      persistence: null;
      tts: null;
    }
  | {
      kind: "reply";
      cocoLine: string;
      moderationEvent: CocoLineModerationEvent | null;
      persistence: ConversationPersistenceIntent;
      tts: ConversationTtsIntent | null;
    }
  | {
      kind: "no_reply";
      cocoLine: null;
      moderationEvent: null;
      persistence: null;
      tts: null;
    }
  | {
      kind: "error";
      error:
        | "invalid_history"
        | "recovery_line_missing"
        | "persistence_failed";
      persistenceError?: "not_found" | "db_error";
    };

function generationFallbackEvent(
  failure: GenerateCocoReplyFailure,
): CocoLineModerationEvent {
  if (failure.error === "reply_policy_failed") {
    return {
      kind: "canned_fallback",
      cause: failure.error,
      violations: failure.violations,
      rejectedCandidate: failure.rejectedCandidate,
      rejectedAttempt: failure.rejectedAttempt,
    };
  }

  return { kind: "canned_fallback", cause: failure.error };
}

function fallbackLineForContext(
  context: Pick<
    ConversationTurnContext,
    "generationPurpose" | "turnOrder" | "requiredTurns" | "studentTranscript" | "responseHandling"
  >,
  inputUsable: boolean,
): string {
  if (context.generationPurpose?.kind === "unclear_recovery") {
    return context.generationPurpose.fallbackQuestion;
  }
  if (conversationReplyMode(context) === "closing") {
    return selectClosingFallbackLine();
  }
  return selectFollowUpFallbackLine(
    classifyFollowUpFallbackKind({
      latestResponse: context.studentTranscript,
      responseHandling: context.responseHandling,
      inputUsable,
    }),
  );
}

/** Provider-only sequencing for one already-resolved conversation history. */
async function runConversationTurn(
  context: ConversationTurnContext,
  deps: ConversationOrchestratorPorts,
): Promise<ConversationTurnOutcome> {
  if (!canGenerateNextDynamicTurn(context.turnOrder)) {
    return { cocoLine: null, moderationEvent: null };
  }

  const studentInputCheck = await deps.isContentSafe(context.studentTranscript);
  if (!studentInputCheck.safe) {
    return {
      cocoLine: fallbackLineForContext(context, false),
      moderationEvent: studentInputCheck.failedOpen
        ? { kind: "input_moderation_unavailable" }
        : { kind: "flagged_student_input" },
    };
  }

  const generationInput: GenerateCocoReplyInput = {
    targetPattern: context.targetPattern,
    turnOrder: context.turnOrder,
    requiredTurns: context.requiredTurns,
    hardCap: 8,
    safetyMode: "standard",
    responseHandling: context.responseHandling,
    conversationHistory: context.conversationHistory,
    ...(context.generationPurpose
      ? { generationPurpose: context.generationPurpose }
      : {}),
  };

  const firstAttempt = await deps.generateCocoReply(generationInput);
  if (!firstAttempt.ok) {
    return {
      cocoLine: fallbackLineForContext(context, true),
      moderationEvent: generationFallbackEvent(firstAttempt),
    };
  }

  const firstLineCheck = await deps.isContentSafe(firstAttempt.reply.line);
  if (firstLineCheck.safe) {
    return { cocoLine: firstAttempt.reply.line, moderationEvent: null };
  }

  if (firstLineCheck.failedOpen) {
    return {
      cocoLine: fallbackLineForContext(context, true),
      moderationEvent: {
        kind: "canned_fallback",
        cause: "output_moderation_unavailable",
      },
    };
  }

  const retryAttempt = await deps.generateCocoReply({
    ...generationInput,
    safetyMode: "retry",
  });
  if (!retryAttempt.ok) {
    return {
      cocoLine: fallbackLineForContext(context, true),
      moderationEvent: generationFallbackEvent(retryAttempt),
    };
  }

  const retryLineCheck = await deps.isContentSafe(retryAttempt.reply.line);
  if (retryLineCheck.safe) {
    return {
      cocoLine: retryAttempt.reply.line,
      moderationEvent: { kind: "retried" },
    };
  }

  return {
    cocoLine: fallbackLineForContext(context, true),
    moderationEvent: retryLineCheck.failedOpen
      ? {
          kind: "canned_fallback",
          cause: "output_moderation_unavailable",
        }
      : { kind: "canned_fallback", cause: "unsafe_output" },
  };
}

export async function orchestrateConversationTurn(
  input: ConversationOrchestratorInput,
  ports: ConversationOrchestratorPorts,
): Promise<ConversationOrchestratorResult> {
  if (!input.conversationMode || input.recoveryState.kind === "prompt_echo") {
    return {
      kind: "skip",
      cocoLine: null,
      moderationEvent: null,
      persistence: null,
      tts: null,
    };
  }

  const recoveryAttempt: 1 | 2 | null =
    !input.lowConfidenceGateRetryApplied &&
    input.recoveryState.kind === "ambiguity"
      ? input.recoveryState.attempt
      : null;
  const lowConfidenceAudioRetry =
    input.lowConfidenceGateRetryApplied ||
    (recoveryAttempt === null &&
      input.recoveryState.kind === "low_confidence_audio_retry");
  const freeSameTurnRetry = recoveryAttempt !== null || lowConfidenceAudioRetry;
  const reviewPendingContinuation = isStoredTeacherReview(input.evaluation);
  const currentStudentResponse =
    freeSameTurnRetry || reviewPendingContinuation
      ? WITHHELD_STUDENT_RESPONSE
      : input.evaluation?.improvedSentence?.trim() || input.transcript;

  let cocoLine: string | null = null;
  let moderationEvent: CocoLineModerationEvent | null = null;
  const recoveryPersistencePending =
    input.recoveryState.kind !== "none";

  if (recoveryAttempt === 1 || lowConfidenceAudioRetry) {
    cocoLine = SAY_IT_AGAIN_FALLBACK_LINE;
  } else {
    const historyResult = buildConversationHistory({
      openerLine: input.openerLine,
      currentTurnOrder: input.turnOrder,
      currentStudentResponse,
      priorTurns: input.priorTurns,
    });
    if (!historyResult.ok) {
      return { kind: "error", error: "invalid_history" };
    }

    const failedRecoveryQuestion = input.missionQuestion ?? input.openerLine;
    const previouslyAsked = collectPreviouslyAskedQuestions({
      conversationHistory: historyResult.history,
      ambiguityHistory: input.evaluation?.ambiguityHistory,
    });
    const recoveryTopicSeed = [
      /_{2,}/u.test(input.targetPattern) ? "" : input.targetPattern,
      input.title,
      failedRecoveryQuestion,
    ]
      .map((value) => value.trim())
      .find((value) => topicAnchorWords(value).length > 0) ?? "";
    const deterministicPivot = buildDeterministicPivotQuestion({
      failedQuestion: failedRecoveryQuestion,
      topicSeed: recoveryTopicSeed,
      previouslyAsked,
    });

    const generationPurpose =
      recoveryAttempt === null
        ? ({ kind: "next_turn" } as const)
        : {
            kind: "unclear_recovery" as const,
            attempt: recoveryAttempt,
            fallbackQuestion: deterministicPivot,
            ...(() => {
              const failedWord = leadingQuestionWord(failedRecoveryQuestion);
              const pivotWord = pickRecoveryPivotWord(failedWord);
              return pivotWord ? { pivotWord } : {};
            })(),
            ...(topicAnchorWords(recoveryTopicSeed).length > 0
              ? { topicSeed: recoveryTopicSeed }
              : {}),
          };

    const conversationOutcome = await runConversationTurn(
      {
        turnOrder: input.turnOrder,
        targetPattern: input.targetPattern,
        requiredTurns: input.requiredTurns,
        studentTranscript: input.transcript,
        conversationHistory: historyResult.history,
        responseHandling:
          recoveryAttempt !== null || reviewPendingContinuation
            ? "review_pending"
            : "normal",
        generationPurpose,
      },
      ports,
    );

    cocoLine = conversationOutcome.cocoLine;
    moderationEvent = conversationOutcome.moderationEvent;

    if (recoveryAttempt === 2 && cocoLine !== null) {
      const pivotCheck = validateRecoveryPivotQuestion(cocoLine, {
        failedQuestion: failedRecoveryQuestion,
        topicSeed: recoveryTopicSeed,
        previouslyAsked,
      });
      if (!pivotCheck.ok) {
        cocoLine = deterministicPivot;
        moderationEvent = {
          kind: "canned_fallback",
          cause: "recovery_pivot_rejected",
          violations: pivotCheck.reasons,
        };
      }
    }
  }

  if (
    cocoLine !== null &&
    recoveryAttempt === null &&
    reviewPendingContinuation
  ) {
    cocoLine = withReviewPendingAcknowledgment(cocoLine);
  }

  if (recoveryPersistencePending && (!cocoLine || !cocoLine.trim())) {
    return { kind: "error", error: "recovery_line_missing" };
  }

  if (cocoLine === null) {
    return {
      kind: "no_reply",
      cocoLine: null,
      moderationEvent: null,
      persistence: null,
      tts: null,
    };
  }

  if (recoveryAttempt !== null && input.evaluation?.ambiguityHistory?.length) {
    const latestAmbiguity = input.evaluation.ambiguityHistory.at(-1);
    if (latestAmbiguity) latestAmbiguity.recoveryQuestion = cocoLine;
  }

  const persistence: ConversationPersistenceIntent = {
    kind: "record_coco_line",
    turnOrder: input.turnOrder,
    cocoLine,
    moderationEvent,
    ...(freeSameTurnRetry && input.evaluation
      ? { evaluation: input.evaluation }
      : {}),
  };
  const persistenceResult = await ports.persistCocoLine(persistence);
  if (!persistenceResult.ok) {
    return {
      kind: "error",
      error: "persistence_failed",
      persistenceError: persistenceResult.error,
    };
  }

  const tts = reviewPendingContinuation
    ? null
    : { characterId: input.characterId, text: cocoLine };
  if (tts) {
    try {
      await ports.warmCocoLine(tts);
    } catch {
      // TTS is a cache warmup; a provider failure must not fail the upload.
    }
  }

  return {
    kind: "reply",
    cocoLine,
    moderationEvent,
    persistence,
    tts,
  };
}
