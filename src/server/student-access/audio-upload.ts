/**
 * Student audio upload service (T-05-04..T-05-07).
 *
 * Server-only module. Admission and each speaking-try operation are owned by
 * the short-lived context, which keeps service-role access behind one seam.
 * Storage object keys are internal evidence pointers, never authorization.
 */

import type { Database, Json } from "@/lib/db/types";
import { resolveMissionSnapshotTargetPattern } from "@/domain/mission/mission-snapshot";
import { isPendingConversationRecovery } from "@/domain/mission/student-question-state";
import { buildReplyHintFrame } from "@/domain/ai/reply-hint-frame";
import {
  hasEnglishTranscript,
  normalizeEnglishTranscript,
  transcribeAudioFile,
  type TranscriptionEvidence,
} from "@/server/audio/transcription";
import { buildTranscriptionVocabularyHint } from "@/domain/audio/vocabulary-hint";
import { DEFAULT_COCO_TTS_VOICE } from "@/domain/audio/tts";
import { warmTtsAudioCache } from "@/server/audio/tts-cache";
import { scorePronunciation } from "@/server/audio/pronunciation-scorer";
import { buildLearnerTranscript } from "@/domain/audio/transcript-interpretation";
import {
  wordsToPractice,
  type PronunciationStarBand,
  type WordHighlight,
} from "@/domain/pronunciation/scoring";
import {
  evaluateOriginalTurn,
  evaluateRepeatTurn,
  resolveEvaluationRuntimeVersion,
} from "@/server/ai/turn-evaluator";
import {
  classifyPreGuardStage,
  evaluateOriginalTurnAnswer,
  evaluateRepeatTurnAnswer,
  LOW_CONFIDENCE_REVIEW_REASON,
} from "@/server/ai/answer-evaluation";
import {
  classifyStoredConversationRecovery,
  storedOriginalOf,
  isStoredTeacherReview,
  type StoredOriginalTurnEvaluation,
  type StoredRepeatTurnEvaluation,
  type StudentFacingEvaluation,
} from "@/domain/ai/stored-evaluation";
import { canGenerateNextDynamicTurn } from "@/server/student-access/mission-flow";
import {
  orchestrateConversationTurn,
  type CocoLineModerationEvent,
} from "@/server/student-access/conversation-orchestrator";
import { consumeRequestBudget } from "@/server/security/request-budget";
import type { PersistedConversationTurn } from "@/server/student-access/conversation-history";
import {
  createOwnedSpeakingTryContext,
  type OwnedSpeakingTryContext,
} from "@/server/student-access/speaking-try-context";
import { withOwnedInProgressAttempt } from "@/server/student-access/owned-assignment";
import { generateCocoReply } from "@/server/ai/conversation-generator";
import { isContentSafe } from "@/server/ai/content-moderation";
import { log } from "@/server/logging/logger";

const DEFAULT_AUDIO_BUCKET = "student-audio";
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 90_000;
export const MIN_TRANSCRIBABLE_AUDIO_DURATION_MS = 500;
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/wave",
]);

export type AudioClipKind = Database["public"]["Enums"]["audio_clip_kind"];

export type TeacherReviewReason =
  | "low_confidence"
  | "ambiguous"
  | "failed_schema"
  | "provider_failed"
  | "contract_rejected";

export type UploadAttemptAudioClipInput = {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  clipKind: AudioClipKind;
  file: Blob;
  mimeType: string;
  durationMs: number;
  byteSize: number;
};

export type {
  CannedFallbackCause,
  CocoLineModerationEventKind,
} from "@/server/student-access/conversation-orchestrator";

export type UploadAttemptAudioClipResult =
  | {
      ok: true;
      audioClipId: string;
      processingStatus: "transcribed";
      /**
       * Learner-facing text only. `null` whenever the raw transcript contains
       * Hangul that was not confirmed as accented English, so the student
       * surface shows nothing rather than something it cannot vouch for. The
       * raw transcript stays teacher evidence and never leaves this module.
       */
      displayTranscript: string | null;
      evaluation?: StoredOriginalTurnEvaluation | StoredRepeatTurnEvaluation;
      starBand: PronunciationStarBand | null;
      wordsToPractice: WordHighlight[];
      cocoLine?: string | null;
      cocoLineModerationEvent?: CocoLineModerationEvent | null;
    }
  | {
      ok: false;
      error:
        | "not_found"
        | "invalid_audio"
        | "upload_failed_retryable"
        | "transcription_failed_retryable"
        | "db_error"
        | "rate_limited";
      retryable: boolean;
      retryAfterSeconds?: number;
    };

export type UploadAttemptAudioClipDeps = {
  consumeRequestBudget?: typeof consumeRequestBudget;
  transcribeAudioFile?: typeof transcribeAudioFile;
  /** Provider adapters, threaded through to the answer-evaluation module. */
  evaluateOriginalTurn?: typeof evaluateOriginalTurn;
  evaluateRepeatTurn?: typeof evaluateRepeatTurn;
  generateCocoReply?: typeof generateCocoReply;
  isContentSafe?: typeof isContentSafe;
  warmTtsAudioCache?: typeof warmTtsAudioCache;
  scorePronunciation?: typeof scorePronunciation;
};

/**
 * The only evaluation shape a student is ever allowed to receive.
 *
 * The stored evaluation is teacher/audit evidence: it carries raw Hangul spans
 * (`hangulInterpretations`), complete raw transcripts (`ambiguityHistory`), a
 * nested `originalEvaluation` with both, provenance, and contract violations.
 * None of that may cross the network to a learner, so the route projects
 * rather than serializes. The discriminated members are exactly what
 * `MissionFlowShell` consumes to pick a feedback card.
 */
/**
 * Allow-list projection. Written as explicit field reads, never a spread or a
 * delete-list, so a new stored field is invisible to students by default.
 */
export function toStudentEvaluation(
  evaluation:
    | StoredOriginalTurnEvaluation
    | StoredRepeatTurnEvaluation
    | undefined,
): StudentFacingEvaluation | undefined {
  if (!evaluation) return undefined;

  if (evaluation.kind === "repeat") {
    return { kind: "repeat", outcome: evaluation.outcome };
  }

  const projected: StudentFacingEvaluation = {
    kind: "original",
    outcome: evaluation.outcome,
    improvedSentence: evaluation.improvedSentence,
  };

  if (evaluation.retryReason !== undefined) {
    projected.retryReason = evaluation.retryReason;
  }
  if (evaluation.minimalEffortKind !== undefined) {
    projected.minimalEffortKind = evaluation.minimalEffortKind;
  }
  if (evaluation.retryExample !== undefined) {
    projected.retryExample = evaluation.retryExample;
  }

  return projected;
}

function getStudentAudioBucketId() {
  return process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;
}

function isValidInput(input: UploadAttemptAudioClipInput) {
  const normalizedMimeType = input.mimeType.toLowerCase().split(";")[0]?.trim();
  const fileMimeType = input.file.type.toLowerCase().split(";")[0]?.trim();

  return (
    Number.isInteger(input.turnOrder) &&
    input.turnOrder > 0 &&
    Number.isInteger(input.durationMs) &&
    input.durationMs >= 0 &&
    input.durationMs <= MAX_AUDIO_DURATION_MS &&
    Number.isInteger(input.byteSize) &&
    input.byteSize > 0 &&
    input.byteSize <= MAX_AUDIO_BYTES &&
    !!normalizedMimeType &&
    ALLOWED_AUDIO_MIME_TYPES.has(normalizedMimeType) &&
    (!fileMimeType || fileMimeType === normalizedMimeType)
  );
}

function toJson(
  value: StoredOriginalTurnEvaluation | StoredRepeatTurnEvaluation,
): Json {
  return value satisfies Json;
}

function persistedConversationRecoveryQuestion(
  evaluation: unknown,
  cocoLine: unknown,
  conversationMode: boolean,
) {
  if (
    !isPendingConversationRecovery({
      conversationMode,
      evaluation,
      cocoLine: typeof cocoLine === "string" ? cocoLine : null,
    })
  ) {
    return null;
  }

  return typeof cocoLine === "string" ? cocoLine.trim() : null;
}

function reviewReasonOrDefault(
  reviewReason: string | null,
): TeacherReviewReason {
  if (
    reviewReason === "low_confidence" ||
    reviewReason === "ambiguous" ||
    reviewReason === "failed_schema" ||
    reviewReason === "provider_failed" ||
    reviewReason === "contract_rejected"
  ) {
    return reviewReason;
  }

  return LOW_CONFIDENCE_REVIEW_REASON;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

export async function recordSpeakingTry(
  input: UploadAttemptAudioClipInput,
  deps: UploadAttemptAudioClipDeps = {},
): Promise<UploadAttemptAudioClipResult> {
  if (!isValidInput(input)) {
    return { ok: false, error: "invalid_audio", retryable: false };
  }

  const timingStartedAt = Date.now();
  const timings: Record<string, number> = {};
  let audioClipId: string | null = null;

  function logTiming(
    status: "success" | "failed",
    context?: Record<string, unknown>,
  ) {
    log("info", "audio.upload_timing", {
      status,
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
      audioClipId,
      turnOrder: input.turnOrder,
      clipKind: input.clipKind,
      durationMs: input.durationMs,
      byteSize: input.byteSize,
      ...timings,
      totalMs: elapsedMs(timingStartedAt),
      ...context,
    });
  }

  async function timeStage<T>(
    stage: string,
    work: () => T | PromiseLike<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      return await work();
    } finally {
      timings[`${stage}Ms`] = elapsedMs(startedAt);
    }
  }

  if (input.durationMs < MIN_TRANSCRIBABLE_AUDIO_DURATION_MS) {
    logTiming("failed", {
      error: "transcription_failed_retryable",
      step: "duration_precheck",
      reason: "short_clip",
    });
    return {
      ok: false,
      error: "transcription_failed_retryable",
      retryable: true,
    };
  }

  try {
    const ownedAssignment = await timeStage("assignmentAndAttemptLookup", () =>
      withOwnedInProgressAttempt(input, async (owned) => owned),
    );

    if (!ownedAssignment.ok) {
      const error = ownedAssignment.error === "db_error" ? "db_error" : "not_found";
      logTiming("failed", { error, step: "assignment_and_attempt_lookup" });
      return {
        ok: false,
        error,
        retryable: error === "db_error",
      };
    }

    if (ownedAssignment.value.status !== "started") {
      logTiming("failed", { error: "not_found", step: "assignment_status" });
      return { ok: false, error: "not_found", retryable: false };
    }

    const snapshot = ownedAssignment.value.snapshot;
    const authoredSnapshotTurn = snapshot?.turns.find(
      (missionTurn) => missionTurn.turnOrder === input.turnOrder,
    );
    if (!snapshot) {
      logTiming("failed", { error: "invalid_audio", step: "mission_snapshot" });
      return { ok: false, error: "invalid_audio", retryable: false };
    }

    const snapshotTurn =
      snapshot.conversationMode === true && input.turnOrder > 1
        ? undefined
        : authoredSnapshotTurn;
    const isDynamicChatTurn =
      snapshot.conversationMode === true &&
      !snapshotTurn &&
      canGenerateNextDynamicTurn(input.turnOrder);
    if (!snapshotTurn && !isDynamicChatTurn) {
      logTiming("failed", { error: "invalid_audio", step: "mission_snapshot" });
      return { ok: false, error: "invalid_audio", retryable: false };
    }

    const targetPattern = resolveMissionSnapshotTargetPattern(
      snapshot,
      input.turnOrder,
    );
    if (!targetPattern) {
      logTiming("failed", { error: "invalid_audio", step: "mission_snapshot" });
      return { ok: false, error: "invalid_audio", retryable: false };
    }

    // Admission runs only after assignment/attempt ownership, status,
    // cancellation, and mission-snapshot turn checks have all passed, so a
    // malformed or foreign request can never spend a student's allowance. It
    // runs before the conversation-history read, `file.arrayBuffer()`, the
    // attempt_turns upsert, the audio_clips insert, Storage, and every
    // provider call — a denied request causes no growth and no paid work.
    const budget = await (deps.consumeRequestBudget ?? consumeRequestBudget)({
      actorId: input.studentId,
      operation: "student_audio",
    });
    if (!budget.allowed) {
      logTiming("failed", { error: "rate_limited", step: "request_budget" });
      return {
        ok: false,
        error: "rate_limited",
        retryable: true,
        retryAfterSeconds: budget.retryAfterSeconds,
      };
    }

    const context: OwnedSpeakingTryContext = createOwnedSpeakingTryContext({
      studentId: input.studentId,
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
      snapshot,
    });

    async function markClipFailed(
      audioClipId: string,
      attemptTurnId: string,
      objectKey?: string,
    ): Promise<void> {
      await timeStage("failedClipGuard", () =>
        context.markClipFailed({
          audioClipId,
          attemptTurnId,
          ...(objectKey ? { objectKey } : {}),
          mimeType: input.mimeType,
          durationMs: input.durationMs,
          byteSize: input.byteSize,
        }),
      );
    }

    let priorConversationTurns: PersistedConversationTurn[] = [];
    let previousCocoLine: string | null = null;

    if (
      snapshot.conversationMode === true &&
      input.clipKind === "original_answer" &&
      input.turnOrder > 1
    ) {
      const historyResult = await timeStage("conversationHistoryGuard", () =>
        timeStage("conversationHistoryLookup", () =>
          context.loadConversationTurns(input.turnOrder),
        ),
      );
      if (!historyResult.ok) {
        logTiming("failed", {
          error: historyResult.error,
          step: "conversation_history_guard",
        });
        return {
          ok: false,
          error: historyResult.error,
          retryable: historyResult.error === "db_error",
        };
      }
      priorConversationTurns = historyResult.value;
      previousCocoLine = priorConversationTurns.at(-1)?.coco_line ?? null;
    }

    if (
      isDynamicChatTurn &&
      input.clipKind === "original_answer" &&
      (previousCocoLine === null ||
        priorConversationTurns.length !== input.turnOrder - 1)
    ) {
      logTiming("failed", { error: "invalid_audio", step: "previous_coco_line" });
      return { ok: false, error: "invalid_audio", retryable: false };
    }

    const targetExample =
      snapshot.conversationMode === true
        ? null
        : snapshotTurn?.targetExample ?? null;
    // Dynamic chat turns have no authored shape; treat them as open-ended.
    const answerShape = snapshotTurn?.answerShape ?? "open";

    const audioBytes = await timeStage("readAudio", () => input.file.arrayBuffer());
    const createAudioBlob = () => new Blob([audioBytes], { type: input.mimeType });

    const turnInit = await timeStage("turnGuard", () =>
      timeStage("turnInit", () => context.initializeTurn(input.turnOrder)),
    );

    if (!turnInit.ok) {
      const error = turnInit.error === "db_error" ? "db_error" : "not_found";
      logTiming("failed", { error, step: "turn_guard" });
      return {
        ok: false,
        error,
        retryable: error === "db_error",
      };
    }

    const turn = turnInit.value;

    const missionQuestion =
      persistedConversationRecoveryQuestion(
        turn.evaluation,
        turn.coco_line,
        snapshot.conversationMode === true,
      ) ??
      snapshotTurn?.prompt ??
      previousCocoLine;
    // The reply hint frame OFFERED to the student for the question they just
    // answered — recorded, not derived later, so a future change to
    // buildReplyHintFrame cannot rewrite what old attempts actually showed.
    // Mirrors deriveActiveStudentQuestion, which is what the UI renders, so
    // this is the available frame regardless of whether the student expanded
    // it. Preset missions never show one, so they stay null.
    const replyHintFrame =
      snapshot.conversationMode === true && missionQuestion
        ? buildReplyHintFrame(missionQuestion)
        : null;

    const repeatTarget = turn.improved_sentence ?? targetExample;
    if (input.clipKind === "repeat_attempt" && repeatTarget === null) {
      logTiming("failed", { error: "invalid_audio", step: "repeat_target" });
      return { ok: false, error: "invalid_audio", retryable: false };
    }
    const repeatTargetValue = repeatTarget ?? "";

    const audioClipInsert = await timeStage("audioClipGuard", () =>
      timeStage("audioClipInsert", () =>
        context.insertAudioClip({
          attemptTurnId: turn.id,
          clipKind: input.clipKind,
        }),
      ),
    );

    if (!audioClipInsert.ok) {
      logTiming("failed", {
        error: audioClipInsert.error,
        step: "audio_clip_guard",
      });
      return {
        ok: false,
        error: audioClipInsert.error,
        retryable: audioClipInsert.error === "db_error",
      };
    }

    const audioClip = audioClipInsert.value;
    audioClipId = audioClip.id;

    // storageUpload and transcription both only depend on the in-memory audio
    // bytes (transcription never reads the uploaded object back), so they run
    // concurrently instead of paying for the upload before transcription can
    // start. The callback returns the in-flight upload promise as data so the
    // guard admits first, then transcription can start while upload runs.
    // The upload result is still checked before returning success.
    const storageUploadAdmission = await timeStage(
      "storageUploadGuard",
      () =>
        context.uploadAudio({
          bucket: getStudentAudioBucketId(),
          audioClipId: audioClip.id,
          attemptTurnId: turn.id,
          turnOrder: input.turnOrder,
          clipKind: input.clipKind,
          blob: createAudioBlob(),
          mimeType: input.mimeType,
        }),
    );
    if (!storageUploadAdmission.ok) {
      logTiming("failed", {
        error: storageUploadAdmission.error,
        step: "storage_upload_guard",
      });
      return {
        ok: false,
        error: storageUploadAdmission.error,
        retryable: storageUploadAdmission.error === "db_error",
      };
    }
    const { objectKey, promise: admittedStorageUpload } =
      storageUploadAdmission.value;
    const storageUploadPromise = timeStage(
      "storageUpload",
      () => admittedStorageUpload,
    );

    const transcribe = deps.transcribeAudioFile ?? transcribeAudioFile;
    // Teacher-authored mission vocabulary biases the decode toward lesson
    // phrases ("I'd rather" instead of "I letter") — issue #64.
    const transcriptionVocabularyHint = buildTranscriptionVocabularyHint({
      title: snapshot.title,
      targetPattern,
      activePrompt: snapshotTurn?.prompt ?? null,
      targetExample: snapshotTurn?.targetExample ?? null,
    });
    const transcriptionPromise = timeStage("transcription", () =>
      transcribe({
        file: createAudioBlob(),
        mimeType: input.mimeType,
        ...(transcriptionVocabularyHint
          ? { vocabularyHint: transcriptionVocabularyHint }
          : {}),
      }),
    );

    const [{ error: uploadError }, transcription] = await Promise.all([
      storageUploadPromise,
      transcriptionPromise,
    ]);

    if (uploadError) {
      await markClipFailed(audioClip.id, turn.id);

      log("warn", "audio.upload_failed", {
        audioClipId: audioClip.id,
        assignmentStudentId: input.assignmentStudentId,
        attemptId: input.attemptId,
        turnOrder: input.turnOrder,
        error: errorMessage(uploadError),
      });
      logTiming("failed", {
        error: "upload_failed_retryable",
        step: "storage_upload",
      });

      return {
        ok: false,
        error: "upload_failed_retryable",
        retryable: true,
      };
    }

    if (!transcription.ok) {
      await markClipFailed(audioClip.id, turn.id, objectKey);

      logTiming("failed", {
        error: "transcription_failed_retryable",
        step: "transcription",
      });
      return {
        ok: false,
        error: "transcription_failed_retryable",
        retryable: true,
      };
    }

    const { text: transcript, koreanSpans } = normalizeEnglishTranscript(
      transcription.text,
    );
    if (!transcript || !hasEnglishTranscript(transcript)) {
      await markClipFailed(audioClip.id, turn.id, objectKey);

      logTiming("failed", {
        error: "transcription_failed_retryable",
        step: "transcript_validation",
      });
      return {
        ok: false,
        error: "transcription_failed_retryable",
        retryable: true,
      };
    }

    const transcriptionEvidence: TranscriptionEvidence = {
      model: transcription.model,
      confidence: transcription.confidence,
    };
    // Deterministic pre-evaluation guards (incomplete recording,
    // minimal effort) now live inside the answer-evaluation module and
    // surface as non-"evaluated" stages in the outcome below.
    let originalEvaluation: StoredOriginalTurnEvaluation | undefined;
    let repeatEvaluation: StoredRepeatTurnEvaluation | undefined;

    const score = deps.scorePronunciation ?? scorePronunciation;

    function beginPronunciationScoring(referenceText: string) {
      const scoringStartedAt = Date.now();
      return score({
        file: createAudioBlob(),
        referenceText,
        durationMs: input.durationMs,
      }).finally(() => {
        timings.pronunciationTotalMs = elapsedMs(scoringStartedAt);
      });
    }

    let recoveryPersistencePending = false;
    let lowConfidenceGateRetryApplied = false;

    const evaluationInput = {
      evaluationMode:
        snapshot.conversationMode === true ? "conversation" : "preset",
      missionQuestion: missionQuestion ?? undefined,
      targetPattern,
      targetExample,
      level: snapshot.level,
      turnOrder: input.turnOrder,
      transcript,
      requireCompleteSentenceAnswers:
        snapshot.requireCompleteSentenceAnswers,
      koreanSpans,
      answerShape,
      transcriptionEvidence,
      runtimeVersion: resolveEvaluationRuntimeVersion(),
    } as const;

    // Pronunciation scoring overlaps provider work on every path that will
    // do real work, and never starts on deterministic guard stages (the
    // classifier is the module's own first pipeline step).
    const preGuard =
      input.clipKind === "original_answer"
        ? classifyPreGuardStage({
            transcript,
            targetExample,
            priorTurnEvaluation: (
              turn as { evaluation?: unknown }
            ).evaluation,
          })
        : ({ stage: "evaluate" } as const);
    let scoringPromise: ReturnType<typeof beginPronunciationScoring> | null =
      input.clipKind === "repeat_attempt"
        ? beginPronunciationScoring(repeatTargetValue)
        : koreanSpans.length === 0 && preGuard.stage === "evaluate"
          ? beginPronunciationScoring(transcript)
          : null;

    // Original answers run the deep pipeline before any write so a
    // deterministic guard can persist and return without conversation
    // generation, TTS warmup, or an ambiguity-ladder side effect.
    const evaluationOutcome =
      input.clipKind === "original_answer"
        ? await evaluateOriginalTurnAnswer(
            {
              evaluationInput,
              priorTurnEvaluation: (
                turn as { evaluation?: unknown }
              ).evaluation,
              audioClipId: audioClip.id,
              ...(snapshot.turns[0]?.prompt
                ? { openingPrompt: snapshot.turns[0].prompt }
                : {}),
            },
            { evaluate: deps.evaluateOriginalTurn ?? evaluateOriginalTurn },
          )
        : null;
    if (evaluationOutcome) {
      timings.evaluationFastPath = evaluationOutcome.fastPathUsed ? 1 : 0;
      if (evaluationOutcome.lowConfidenceGateRetryApplied) {
        timings.evaluationSkippedLowConfidence = 1;
        log("warn", "audio.low_confidence_gate_retry", {
          assignmentStudentId: input.assignmentStudentId,
          attemptId: input.attemptId,
          turnOrder: input.turnOrder,
          minLogprob: evaluationOutcome.gateRetryDetail?.minLogprob,
          tokenCount: evaluationOutcome.gateRetryDetail?.tokenCount,
          retriesAfter: evaluationOutcome.gateRetryDetail?.retriesAfter,
        });
      } else if (!evaluationOutcome.fastPathUsed) {
        timings.evaluationSkippedLowConfidence = 0;
      }
      Object.assign(timings, evaluationOutcome.stageMs);
      lowConfidenceGateRetryApplied =
        evaluationOutcome.lowConfidenceGateRetryApplied;
    }

    if (evaluationOutcome && evaluationOutcome.stage !== "evaluated") {
      const decision = evaluationOutcome.decision;
      const writeResult = await timeStage("turnWriteGuard", () =>
        timeStage("turnWrite", () =>
          context.writeGuardEvaluation({
            transcript,
            turnOrder: input.turnOrder,
            targetAttempted: false,
            improvedSentence: null,
            evaluation: toJson(decision.evaluation),
            replyHintFrame,
          }),
        ),
      );
      if (!writeResult.ok) {
        const error = writeResult.error === "db_error" ? "db_error" : "not_found";
        logTiming("failed", { error, step: "turn_write_guard" });
        return {
          ok: false,
          error,
          retryable: error === "db_error",
        };
      }
      const write = writeResult.value;
      if (write.error) {
        logTiming("failed", { error: "db_error", step: "turn_write" });
        return { ok: false, error: "db_error", retryable: true };
      }
      const clipUpdateResult = await timeStage("finalClipGuard", () =>
        timeStage("finalClipUpdate", () =>
          context.finalizeClip({
            audioClipId: audioClip.id,
            attemptTurnId: turn.id,
            objectKey,
            mimeType: input.mimeType,
            durationMs: input.durationMs,
            byteSize: input.byteSize,
          }),
        ),
      );
      if (!clipUpdateResult.ok) {
        logTiming("failed", {
          error: clipUpdateResult.error,
          step: "final_clip_guard",
        });
        return {
          ok: false,
          error: clipUpdateResult.error,
          retryable: clipUpdateResult.error === "db_error",
        };
      }
      const { error: clipUpdateError } = clipUpdateResult.value;
      if (clipUpdateError) {
        logTiming("failed", { error: "db_error", step: "final_clip_update" });
        return { ok: false, error: "db_error", retryable: true };
      }

      if (evaluationOutcome.stage === "minimal_effort_guard") {
        log("info", "audio.minimal_effort_blocked", {
          audioClipId: audioClip.id,
          assignmentStudentId: input.assignmentStudentId,
          attemptId: input.attemptId,
          turnOrder: input.turnOrder,
          blocks: decision.evaluation.minimalEffortBlocks,
        });
      }
      logTiming("success", { step: evaluationOutcome.stage });
      return {
        ok: true,
        audioClipId: audioClip.id,
        processingStatus: "transcribed",
        displayTranscript: buildLearnerTranscript(transcript, []),
        evaluation: decision.evaluation,
        starBand: null,
        wordsToPractice: [],
        cocoLine: null,
        cocoLineModerationEvent: null,
      };
    }

    const turnWrite =
      input.clipKind === "original_answer"
        ? await (async () => {
            if (!evaluationOutcome || evaluationOutcome.stage !== "evaluated") {
              throw new Error("unreachable: guard stages return earlier");
            }
            const decision = evaluationOutcome.decision;
            originalEvaluation = decision.evaluation;
            const recoveryState = classifyStoredConversationRecovery(
              decision.evaluation,
            );
            recoveryPersistencePending =
              snapshot.conversationMode === true &&
              recoveryState.kind !== "none" &&
              recoveryState.kind !== "prompt_echo";

            const writeResult = await timeStage("turnWriteGuard", () =>
              timeStage("turnWrite", () =>
                context.writeOriginalTurn({
                  transcript,
                  turnOrder: input.turnOrder,
                  targetAttempted: decision.targetAttempted,
                  improvedSentence: decision.improvedSentence,
                  ...(recoveryPersistencePending
                    ? {}
                    : { evaluation: toJson(decision.evaluation) }),
                  replyHintFrame,
                }),
              ),
            );

            if (!writeResult.ok) {
              const guardError: "db_error" | "not_found" =
                writeResult.error === "db_error" ? "db_error" : "not_found";
              return {
                guardError,
              };
            }
            const write = writeResult.value;

            if (write.error || !isStoredTeacherReview(decision.evaluation)) {
              return write;
            }

            const routeResult = await context.routeTeacherReview(
              reviewReasonOrDefault(decision.evaluation.reviewReason),
            );

            if (!routeResult.ok) {
              return { error: new Error(routeResult.error) };
            }
            if (routeResult.value.error) {
              return { error: new Error(routeResult.value.error.message) };
            }

            return write;
          })()
        : await (async () => {
            // Count only prior repeats that completed transcription. The
            // current row is still pending here, so it is counted by the
            // evaluation module as this clip's attempt number.
            const repeatCountResult = await timeStage(
              "repeatAttemptCountGuard",
              () =>
                timeStage(
                  "repeatAttemptCount",
                  () => context.countTranscribedRepeatClips(turn.id),
                ),
            );
            if (!repeatCountResult.ok) {
              return { guardError: repeatCountResult.error };
            }
            const {
              count: priorRepeatClipCount,
              error: repeatCountError,
            } = repeatCountResult.value;
            if (repeatCountError) return { error: repeatCountError };

            // The original and the repeat arrive as separate uploads, so the
            // in-memory value is normally undefined here; the row is the
            // durable source. The module composes the complete persisted
            // evidence — preserving correctionSeverity — and this service
            // stores exactly what it returns.
            const repeatOutcome = await evaluateRepeatTurnAnswer(
              {
                repeatTarget: repeatTargetValue,
                originalTranscript: turn.original_transcript ?? "",
                transcript,
                koreanSpans,
                targetPattern,
                level: snapshot.level,
                attemptNumber: (priorRepeatClipCount ?? 0) + 1,
                originalEvaluation:
                  originalEvaluation ??
                  storedOriginalOf(turn.evaluation) ??
                  undefined,
              },
              { evaluate: deps.evaluateRepeatTurn ?? evaluateRepeatTurn },
            );
            timings.evaluationFastPath = repeatOutcome.fastPathUsed ? 1 : 0;
            Object.assign(timings, repeatOutcome.stageMs);
            const decision = repeatOutcome.evaluation;
            repeatEvaluation = decision;

            const writeResult = await timeStage("turnWriteGuard", () =>
              timeStage(
                "turnWrite",
                () =>
                  context.writeRepeatTurn({
                    turnId: turn.id,
                    transcript,
                    repeatAccepted: decision.repeatAccepted,
                    evaluation: toJson(decision),
                  }),
              ),
            );

            if (!writeResult.ok) {
              const guardError: "db_error" | "not_found" =
                writeResult.error === "db_error" ? "db_error" : "not_found";
              return {
                guardError,
              };
            }
            const write = writeResult.value;

            if (write.error || !isStoredTeacherReview(decision)) {
              return write;
            }

            const routeResult = await context.routeTeacherReview(
              reviewReasonOrDefault(decision.reviewReason),
            );

            if (!routeResult.ok) {
              return { error: new Error(routeResult.error) };
            }
            if (routeResult.value.error) {
              return { error: new Error(routeResult.value.error.message) };
            }

            return write;
          })();

    if ("guardError" in turnWrite) {
      const guardError: "db_error" | "not_found" =
        turnWrite.guardError ?? "db_error";
      logTiming("failed", {
        error: guardError,
        step: "turn_write_guard",
      });
      return {
        ok: false,
        error: guardError,
        retryable: guardError === "db_error",
      };
    }

    if (turnWrite.error) {
      await markClipFailed(audioClip.id, turn.id, objectKey);

      log("warn", "audio.processing_failed", {
        audioClipId: audioClip.id,
        assignmentStudentId: input.assignmentStudentId,
        attemptId: input.attemptId,
        turnOrder: input.turnOrder,
        step: "turn_write",
        error: errorMessage(turnWrite.error),
      });
      logTiming("failed", { error: "db_error", step: "turn_write" });

      return { ok: false, error: "db_error", retryable: true };
    }

    // Derive the learner-facing text and start any deferred scoring here —
    // immediately after the turn write succeeded and *before* conversation
    // generation, moderation, Coco-line persistence, and TTS warmup. A Hangul
    // original must cost evaluator latency only; if this ran after the block
    // below, its scoring would be serialized behind Coco's reply.
    const currentEvaluation = originalEvaluation ?? repeatEvaluation;
    const displayTranscript = buildLearnerTranscript(
      transcript,
      currentEvaluation?.hangulInterpretations ?? [],
    );

    const hasAccentedEnglish = currentEvaluation?.hangulInterpretations.some(
      (item) => item.kind === "accented_english",
    );
    if (
      input.clipKind === "original_answer" &&
      scoringPromise === null &&
      displayTranscript &&
      hasAccentedEnglish
    ) {
      scoringPromise = beginPronunciationScoring(displayTranscript);
    }

    // Conversation-mode dynamic-turn orchestration (CHAT-01/03/05/06). Runs
    // only for chat-mode missions, only on the original-answer turn (the
    // student's utterance Coco is replying to), after the turn write above
    // has already succeeded. Preset missions (conversationMode !== true)
    // never enter this seam.
    let cocoLine: string | null = null;
    let cocoLineModerationEvent: CocoLineModerationEvent | null = null;
    const recoveryState = classifyStoredConversationRecovery(originalEvaluation);

    if (
      snapshot.conversationMode === true &&
      input.clipKind === "original_answer"
    ) {
      const conversationOutcome = await timeStage("conversationTurn", () =>
        orchestrateConversationTurn(
          {
            conversationMode: true,
            turnOrder: input.turnOrder,
            requiredTurns: snapshot.requiredTurns,
            targetPattern,
            title: snapshot.title,
            characterId: snapshot.characterId,
            openerLine: snapshot.turns[0]?.prompt ?? "",
            missionQuestion: missionQuestion ?? null,
            transcript,
            priorTurns: priorConversationTurns,
            evaluation: originalEvaluation,
            recoveryState,
            lowConfidenceGateRetryApplied,
          },
          {
            generateCocoReply: deps.generateCocoReply ?? generateCocoReply,
            isContentSafe: deps.isContentSafe ?? isContentSafe,
            persistCocoLine: async (intent) => {
              const recordResult = await timeStage("cocoLineWrite", () =>
                context.recordCocoLine({
                  turnOrder: intent.turnOrder,
                  cocoLine: intent.cocoLine,
                  moderationEvent: intent.moderationEvent as Json | null,
                  ...(intent.evaluation
                    ? { evaluation: toJson(intent.evaluation) }
                    : {}),
                }),
              );
              if (!recordResult.ok) {
                return { ok: false as const, error: recordResult.error };
              }
              if (recordResult.value.error) {
                return { ok: false as const, error: "db_error" as const };
              }
              return { ok: true as const };
            },
            warmCocoLine: async (intent) => {
              try {
                const warm = deps.warmTtsAudioCache ?? warmTtsAudioCache;
                await timeStage("ttsWarmupCocoLine", () =>
                  warm({
                    characterId: intent.characterId,
                    voice: DEFAULT_COCO_TTS_VOICE,
                    texts: [intent.text],
                  }),
                );
              } catch (error) {
                log("warn", "audio.tts_coco_line_warmup_failed", {
                  assignmentStudentId: input.assignmentStudentId,
                  attemptId: input.attemptId,
                  turnOrder: input.turnOrder,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            },
          },
        ),
      );

      if (conversationOutcome.kind === "error") {
        if (conversationOutcome.error === "recovery_line_missing") {
          await markClipFailed(audioClip.id, turn.id, objectKey);
          logTiming("failed", {
            error: "db_error",
            step: "recovery_line_missing",
          });
          return { ok: false, error: "db_error", retryable: true };
        }
        if (conversationOutcome.error === "persistence_failed") {
          await markClipFailed(audioClip.id, turn.id, objectKey);
          const error = conversationOutcome.persistenceError ?? "db_error";
          log("warn", "audio.coco_line_persist_failed", {
            assignmentStudentId: input.assignmentStudentId,
            attemptId: input.attemptId,
            turnOrder: input.turnOrder,
            error,
          });
          logTiming("failed", { error, step: "coco_line_write" });
          return {
            ok: false,
            error,
            retryable: error === "db_error",
          };
        }
        logTiming("failed", {
          error: "invalid_audio",
          step: "conversation_history",
        });
        return { ok: false, error: "invalid_audio", retryable: false };
      }

      if (conversationOutcome.kind === "reply") {
        cocoLine = conversationOutcome.cocoLine;
        cocoLineModerationEvent = conversationOutcome.moderationEvent;
      }
    }

    let starBand: PronunciationStarBand | null = null;
    let wordHighlights: WordHighlight[] = [];

    // A null promise means scoring was deliberately never started: a Hangul
    // answer with nothing confirmed as accented English has no English
    // reference text to score against. That is not a failure and must not
    // reach the failure log below.
    if (scoringPromise !== null) {
      const startedScoring = scoringPromise;
      try {
        const pronunciationAwaitStartedAt = Date.now();
        const scoring = await startedScoring;
        timings.pronunciationAwaitMs = elapsedMs(pronunciationAwaitStartedAt);
        if (scoring.ok) {
          const scoreWriteResult = await timeStage(
            "pronunciationScoreGuard",
            () =>
              timeStage("pronunciationScoreWrite", () =>
                context.writePronunciationScore({
                  audioClipId: audioClip.id,
                  attemptTurnId: turn.id,
                  referenceText: scoring.score.referenceText,
                  accuracyScore: scoring.score.accuracyScore,
                  fluencyScore: scoring.score.fluencyScore,
                  completenessScore: scoring.score.completenessScore,
                  pronunciationScore: scoring.score.pronunciationScore,
                  starBand: scoring.score.starBand,
                  wordScores: scoring.score.wordScores satisfies Json,
                }),
              ),
          );

          if (!scoreWriteResult.ok) {
            log("warn", "audio.pronunciation_scoring_failed", {
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              turnOrder: input.turnOrder,
              error: scoreWriteResult.error,
            });
          } else if (scoreWriteResult.value.error) {
            log("warn", "audio.pronunciation_scoring_failed", {
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              turnOrder: input.turnOrder,
              error: scoreWriteResult.value.error.message,
            });
          } else {
            starBand = scoring.score.starBand;
            wordHighlights = wordsToPractice(
              scoring.score.wordScores,
              displayTranscript ?? transcript,
            );
          }
        } else {
          log("warn", "audio.pronunciation_scoring_failed", {
            assignmentStudentId: input.assignmentStudentId,
            attemptId: input.attemptId,
            turnOrder: input.turnOrder,
            error: scoring.error,
          });
        }
      } catch (error) {
        log("warn", "audio.pronunciation_scoring_failed", {
          assignmentStudentId: input.assignmentStudentId,
          attemptId: input.attemptId,
          turnOrder: input.turnOrder,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ttsWarmup (tts_audio_cache table + tts-audio storage) and finalClipUpdate
    // (audio_clips row) touch disjoint resources, so they run concurrently.
    // ttsWarmup failures must never fail the overall upload (existing
    // contract), so its rejection is caught inside its own branch rather than
    // via the outer Promise.all/allSettled.
    const improvedSentenceForWarmup = originalEvaluation?.improvedSentence;
    const shouldWarmTts =
      input.clipKind === "original_answer" &&
      originalEvaluation?.outcome === "needs_correction" &&
      originalEvaluation.requireRepeat &&
      !!improvedSentenceForWarmup;

    const ttsWarmupPromise = shouldWarmTts
      ? timeStage("ttsWarmup", async () => {
          try {
            const warm = deps.warmTtsAudioCache ?? warmTtsAudioCache;
            await warm({
              characterId: snapshot.characterId,
              voice: DEFAULT_COCO_TTS_VOICE,
              texts: [improvedSentenceForWarmup],
            });
          } catch (error) {
            log("warn", "audio.tts_improved_sentence_warmup_failed", {
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              turnOrder: input.turnOrder,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      : Promise.resolve();

    const finalClipUpdatePromise = timeStage("finalClipGuard", () =>
      timeStage(
        "finalClipUpdate",
        () =>
          context.finalizeClip({
            audioClipId: audioClip.id,
            attemptTurnId: turn.id,
            objectKey,
            mimeType: input.mimeType,
            durationMs: input.durationMs,
            byteSize: input.byteSize,
          }),
      ),
    );

    const [, finalClipUpdateResult] = await Promise.all([
      ttsWarmupPromise,
      finalClipUpdatePromise,
    ]);

    if (!finalClipUpdateResult.ok) {
      logTiming("failed", {
        error: finalClipUpdateResult.error,
        step: "final_clip_guard",
      });
      return {
        ok: false,
        error: finalClipUpdateResult.error,
        retryable: finalClipUpdateResult.error === "db_error",
      };
    }

    if (finalClipUpdateResult.value.error) {
      logTiming("failed", { error: "db_error", step: "final_clip_update" });
      return { ok: false, error: "db_error", retryable: true };
    }

    log("info", "audio.uploaded", {
      audioClipId: audioClip.id,
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
    });
    logTiming("success");
    return {
      ok: true,
      audioClipId: audioClip.id,
      processingStatus: "transcribed",
      displayTranscript,
      evaluation: originalEvaluation ?? repeatEvaluation,
      starBand,
      wordsToPractice: wordHighlights,
      cocoLine,
      cocoLineModerationEvent,
    };
  } catch (error) {
    logTiming("failed", {
      error: "db_error",
      step: "unexpected",
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "db_error", retryable: true };
  }
}
