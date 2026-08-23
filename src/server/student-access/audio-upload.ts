/**
 * Student audio upload service (T-05-04..T-05-07).
 *
 * Server-only module. Uses the service-role client, so every write is preceded
 * by app-level ownership checks against assignment_students.student_id and the
 * attempt's assignment_student_id. Storage object keys are internal evidence
 * pointers, never authorization.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/db/types";
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
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
  storedOriginalOf,
  TEACHER_REVIEW_OUTCOME,
  type StoredOriginalTurnEvaluation,
  type StoredRepeatTurnEvaluation,
  type StudentFacingEvaluation,
} from "@/domain/ai/stored-evaluation";

import {
  canGenerateNextDynamicTurn,
  flagAttemptForTeacherReview,
  recordCocoLine,
  type TeacherReviewReason,
} from "@/server/student-access/mission-flow";
import {
  generateCocoReply,
  type GenerateCocoReplyError,
  type GenerateCocoReplyResult,
} from "@/server/ai/conversation-generator";
import { isContentSafe } from "@/server/ai/content-moderation";
import { consumeRequestBudget } from "@/server/security/request-budget";
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
      /** W-pivot candidate broke a recovery rule; deterministic pivot used. */
      kind: "canned_fallback";
      cause: "recovery_pivot_rejected";
      violations: RecoveryPivotViolation[];
    };

export type CocoLineModerationEventKind =
  CocoLineModerationEvent["kind"];

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

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim();
  if (normalized === "audio/mp4" || normalized === "audio/m4a") return "m4a";
  if (normalized === "audio/mpeg") return "mp3";
  if (normalized === "audio/wav" || normalized === "audio/wave") return "wav";
  return "webm";
}

function buildObjectKey(input: {
  assignmentStudentId: string;
  attemptId: string;
  turnOrder: number;
  clipKind: AudioClipKind;
  audioClipId: string;
  mimeType: string;
}) {
  const ext = extensionForMimeType(input.mimeType);
  return [
    input.assignmentStudentId,
    input.attemptId,
    String(input.turnOrder),
    `${input.clipKind}-${input.audioClipId}.${ext}`,
  ].join("/");
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

function readMissionSnapshot(assignmentStudent: unknown) {
  const rawSnapshot = (assignmentStudent as {
    assignments?:
      | { mission_snapshot?: unknown }
      | Array<{ mission_snapshot?: unknown }>;
  }).assignments;
  const missionSnapshot = Array.isArray(rawSnapshot)
    ? rawSnapshot[0]?.mission_snapshot
    : rawSnapshot?.mission_snapshot;
  const result = interpretMissionSnapshot(missionSnapshot);
  return result.kind === "complete" ? result.snapshot : null;
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

type ConversationTurnContext = {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
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
  context: ConversationTurnContext,
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

/**
 * Conversation-mode orchestration (CHAT-01/03/05/06, D-10/D-11/D-13,
 * RESEARCH.md step a-f pipeline). Runs ONLY for conversationMode missions,
 * after the student's original-answer turn write has already succeeded.
 * All generation/moderation calls live HERE (never in mission-flow.ts),
 * preserving the AI-06 boundary.
 *
 * Order (never reordered):
 *  a. hard-cap check (canGenerateNextDynamicTurn)
 *  b. moderate student input FIRST — flagged input never reaches the generator;
 *     moderation being merely unavailable (failedOpen) is recorded distinctly
 *     from an explicit unsafe verdict, but both fail closed (canned fallback)
 *  c. generate Coco's next line
 *  d. moderate the generated line; only an explicit unsafe verdict regenerates
 *     (via safetyMode: "retry") — an unavailable check fails closed immediately,
 *     never spending a useless generation retry
 *  e. provider/schema/policy failures persist their attributable cause
 *  f. persist (recordCocoLine) — coco_line + moderation_event
 */
async function runConversationTurn(
  context: ConversationTurnContext,
  deps: {
    generateCocoReply: typeof generateCocoReply;
    isContentSafe: typeof isContentSafe;
  },
): Promise<ConversationTurnOutcome> {
  // (a) HARD-CAP: refuse to generate past the fixed ceiling of 8, regardless
  // of the mission's own required_turns (Pitfall 4).
  if (!canGenerateNextDynamicTurn(context.turnOrder)) {
    return { cocoLine: null, moderationEvent: null };
  }

  // (b) MODERATE STUDENT INPUT FIRST (D-11) — a flagged transcript never
  // reaches the generator; the extra moderation call per turn is accepted.
  // Fails closed either way, but an explicit unsafe verdict is recorded
  // distinctly from moderation merely being unavailable.
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

  // (c) GENERATE
  const firstAttempt = await deps.generateCocoReply(generationInput);

  // (e) PROVIDER/SCHEMA/POLICY FAILURE persists its attributable cause.
  if (!firstAttempt.ok) {
    return {
      cocoLine: fallbackLineForContext(context, true),
      moderationEvent: generationFallbackEvent(firstAttempt),
    };
  }

  // (d) MODERATE OUTPUT
  const firstLineCheck = await deps.isContentSafe(firstAttempt.reply.line);
  if (firstLineCheck.safe) {
    return { cocoLine: firstAttempt.reply.line, moderationEvent: null };
  }

  // Output moderation merely being unavailable fails closed immediately —
  // no generation retry, since there is nothing to retry against (the first
  // line was never confirmed unsafe).
  if (firstLineCheck.failedOpen) {
    return {
      cocoLine: fallbackLineForContext(context, true),
      moderationEvent: {
        kind: "canned_fallback",
        cause: "output_moderation_unavailable",
      },
    };
  }

  // Only an explicit unsafe verdict reaches regeneration, sent through the
  // dedicated safety-retry steering. Every regenerated line is re-moderated
  // — never assumed clean (RESEARCH.md anti-pattern warning).
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

export async function uploadAttemptAudioClip(
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
    const supabase = createSupabaseServiceClient();

    // assignmentLookup and attemptLookup are independent reads (each filters
    // only on raw request input; neither consumes the other's result), so
    // they run concurrently to avoid paying two sequential round trips.
    // Failure precedence is preserved below: assignment-related failures are
    // still checked and returned before attempt-related failures, exactly as
    // when these ran serially.
    const [
      { data: assignmentStudent, error: assignmentError },
      { data: attempt, error: attemptError },
    ] = await timeStage("assignmentAndAttemptLookup", () =>
      Promise.all([
        supabase
          .from("assignment_students")
          .select("id, student_id, status, assignments(mission_snapshot, canceled_at)")
          .eq("id", input.assignmentStudentId)
          .eq("student_id", input.studentId)
          .maybeSingle(),
        supabase
          .from("attempts")
          .select("id, assignment_student_id, status")
          .eq("id", input.attemptId)
          .eq("assignment_student_id", input.assignmentStudentId)
          .maybeSingle(),
      ]),
    );

    if (assignmentError) {
      logTiming("failed", { error: "db_error", step: "assignment_lookup" });
      return { ok: false, error: "db_error", retryable: true };
    }
    if (!assignmentStudent) {
      logTiming("failed", { error: "not_found", step: "assignment_lookup" });
      return { ok: false, error: "not_found", retryable: false };
    }
    if (assignmentStudent.status !== "started") {
      logTiming("failed", { error: "not_found", step: "assignment_status" });
      return { ok: false, error: "not_found", retryable: false };
    }
    const assignment = (
      assignmentStudent as {
        assignments?: { canceled_at?: string | null } | null;
      }
    ).assignments;
    if (assignment?.canceled_at) {
      logTiming("failed", { error: "not_found", step: "assignment_canceled" });
      return { ok: false, error: "not_found", retryable: false };
    }

    if (attemptError) {
      logTiming("failed", { error: "db_error", step: "attempt_lookup" });
      return { ok: false, error: "db_error", retryable: true };
    }
    if (!attempt) {
      logTiming("failed", { error: "not_found", step: "attempt_lookup" });
      return { ok: false, error: "not_found", retryable: false };
    }
    if (attempt.status !== "in_progress") {
      logTiming("failed", { error: "not_found", step: "attempt_status" });
      return { ok: false, error: "not_found", retryable: false };
    }

    const snapshot = readMissionSnapshot(assignmentStudent);
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

    let priorConversationTurns: PersistedConversationTurn[] = [];
    let previousCocoLine: string | null = null;

    if (
      snapshot.conversationMode === true &&
      input.clipKind === "original_answer" &&
      input.turnOrder > 1
    ) {
      const { data, error } = await timeStage("conversationHistoryLookup", () =>
        supabase
          .from("attempt_turns")
          .select(
            "turn_order, original_transcript, improved_sentence, coco_line, evaluation",
          )
          .eq("attempt_id", input.attemptId)
          .lt("turn_order", input.turnOrder)
          .order("turn_order", { ascending: true }),
      );
      if (error) {
        logTiming("failed", { error: "db_error", step: "conversation_history" });
        return { ok: false, error: "db_error", retryable: true };
      }
      priorConversationTurns = data ?? [];
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

    const { data: turn, error: turnError } = await timeStage("turnInit", () =>
      supabase
        .from("attempt_turns")
        .upsert(
          {
            attempt_id: input.attemptId,
            turn_order: input.turnOrder,
          },
          { onConflict: "attempt_id,turn_order" },
        )
        .select(
          "id, original_transcript, improved_sentence, evaluation, coco_line",
        )
        .single(),
    );

    if (turnError || !turn) {
      logTiming("failed", { error: "db_error", step: "turn_init" });
      return { ok: false, error: "db_error", retryable: true };
    }

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

    const { data: audioClip, error: clipError } = await timeStage(
      "audioClipInsert",
      () =>
        supabase
          .from("audio_clips")
          .insert({
            attempt_turn_id: turn.id,
            clip_kind: input.clipKind,
            processing_status: "pending_upload",
          })
          .select("id")
          .single(),
    );

    if (clipError || !audioClip) {
      logTiming("failed", { error: "db_error", step: "audio_clip_insert" });
      return { ok: false, error: "db_error", retryable: true };
    }
    audioClipId = audioClip.id;

    const objectKey = buildObjectKey({
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
      turnOrder: input.turnOrder,
      clipKind: input.clipKind,
      audioClipId: audioClip.id,
      mimeType: input.mimeType,
    });

    // storageUpload and transcription both only depend on the in-memory audio
    // bytes (transcription never reads the uploaded object back), so they run
    // concurrently instead of paying for the upload before transcription can
    // start. The upload result is still checked before returning success.
    const storageUploadPromise = timeStage("storageUpload", () =>
      supabase.storage
        .from(getStudentAudioBucketId())
        .upload(objectKey, createAudioBlob(), {
          contentType: input.mimeType,
          upsert: false,
        }),
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
      await timeStage("failedClipUpdate", () =>
        supabase
          .from("audio_clips")
          .update({
            processing_status: "failed",
            mime_type: input.mimeType,
            duration_ms: input.durationMs,
            byte_size: input.byteSize,
          })
          .eq("id", audioClip.id),
      );

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
      await timeStage("failedClipUpdate", () =>
        supabase
          .from("audio_clips")
          .update({
            object_key: objectKey,
            mime_type: input.mimeType,
            duration_ms: input.durationMs,
            byte_size: input.byteSize,
            processing_status: "failed",
          })
          .eq("id", audioClip.id),
      );

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
      await timeStage("failedClipUpdate", () =>
        supabase
          .from("audio_clips")
          .update({
            object_key: objectKey,
            mime_type: input.mimeType,
            duration_ms: input.durationMs,
            byte_size: input.byteSize,
            processing_status: "failed",
          })
          .eq("id", audioClip.id),
      );

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
        ? beginPronunciationScoring(repeatTarget)
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
      const write = await timeStage("turnWrite", () =>
        supabase.from("attempt_turns").upsert(
          {
            attempt_id: input.attemptId,
            turn_order: input.turnOrder,
            original_transcript: transcript,
            target_attempted: false,
            improved_sentence: null,
            evaluation: toJson(decision.evaluation),
            reply_hint_frame: replyHintFrame,
          },
          { onConflict: "attempt_id,turn_order" },
        ),
      );
      if (write.error) {
        logTiming("failed", { error: "db_error", step: "turn_write" });
        return { ok: false, error: "db_error", retryable: true };
      }
      const { error: clipUpdateError } = await timeStage(
        "finalClipUpdate",
        () =>
          supabase
            .from("audio_clips")
            .update({
              object_key: objectKey,
              mime_type: input.mimeType,
              duration_ms: input.durationMs,
              byte_size: input.byteSize,
              processing_status: "transcribed",
            })
            .eq("id", audioClip.id),
      );
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
            recoveryPersistencePending =
              snapshot.conversationMode === true &&
              decision.evaluation.outcome === "retry_original" &&
              decision.evaluation.retryReason === "unclear_meaning" &&
              !decision.evaluation.contractViolations?.includes(
                "prompt_echo",
              ) &&
              (decision.evaluation.ambiguityRetries === 1 ||
                decision.evaluation.ambiguityRetries === 2 ||
                (typeof decision.evaluation.lowConfidenceAudioRetries ===
                  "number" &&
                  decision.evaluation.lowConfidenceAudioRetries > 0));

            const write = await timeStage("turnWrite", () =>
              supabase.from("attempt_turns").upsert(
                {
                  attempt_id: input.attemptId,
                  turn_order: input.turnOrder,
                  original_transcript: transcript,
                  target_attempted: decision.targetAttempted,
                  improved_sentence: decision.improvedSentence,
                  ...(recoveryPersistencePending
                    ? {}
                    : { evaluation: toJson(decision.evaluation) }),
                  reply_hint_frame: replyHintFrame,
                },
                { onConflict: "attempt_id,turn_order" },
              ),
            );

            if (write.error || decision.evaluation.outcome !== TEACHER_REVIEW_OUTCOME) {
              return write;
            }

            const routeResult = await flagAttemptForTeacherReview({
              studentId: input.studentId,
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              reviewReason: reviewReasonOrDefault(
                decision.evaluation.reviewReason,
              ),
            });

            if (!routeResult.ok) {
              return { error: new Error(routeResult.error) };
            }

            return write;
          })()
        : await (async () => {
            // Count only prior repeats that completed transcription. The
            // current row is still pending here, so it is counted by the
            // evaluation module as this clip's attempt number.
            const {
              count: priorRepeatClipCount,
              error: repeatCountError,
            } = await timeStage(
              "repeatAttemptCount",
              () =>
                supabase
                  .from("audio_clips")
                  .select("id", { count: "exact", head: true })
                  .eq("attempt_turn_id", turn.id)
                  .eq("clip_kind", "repeat_attempt")
                  .eq("processing_status", "transcribed"),
            );
            if (repeatCountError) return { error: repeatCountError };

            // The original and the repeat arrive as separate uploads, so the
            // in-memory value is normally undefined here; the row is the
            // durable source. The module composes the complete persisted
            // evidence — preserving correctionSeverity — and this service
            // stores exactly what it returns.
            const repeatOutcome = await evaluateRepeatTurnAnswer(
              {
                repeatTarget,
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

            const write = await timeStage("turnWrite", () =>
              supabase
                .from("attempt_turns")
                .update({
                  repeat_transcript: transcript,
                  repeat_accepted: decision.repeatAccepted,
                  evaluation: toJson(decision),
                })
                .eq("id", turn.id),
            );

            if (write.error || decision.outcome !== TEACHER_REVIEW_OUTCOME) {
              return write;
            }

            const routeResult = await flagAttemptForTeacherReview({
              studentId: input.studentId,
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              reviewReason: reviewReasonOrDefault(decision.reviewReason),
            });

            if (!routeResult.ok) {
              return { error: new Error(routeResult.error) };
            }

            return write;
          })();

    if (turnWrite.error) {
      await timeStage("failedClipUpdate", () =>
        supabase
          .from("audio_clips")
          .update({
            object_key: objectKey,
            mime_type: input.mimeType,
            duration_ms: input.durationMs,
            byte_size: input.byteSize,
            processing_status: "failed",
          })
          .eq("id", audioClip.id),
      );

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
    // behave exactly as before — no generateCocoReply/isContentSafe call.
    let cocoLine: string | null = null;
    let cocoLineModerationEvent: CocoLineModerationEvent | null = null;

    if (
      snapshot.conversationMode === true &&
      input.clipKind === "original_answer" &&
      !originalEvaluation?.contractViolations?.includes("prompt_echo")
    ) {
      const recoveryAttempt: 1 | 2 | null =
        !lowConfidenceGateRetryApplied &&
        originalEvaluation?.outcome === "retry_original" &&
        originalEvaluation.retryReason === "unclear_meaning" &&
        (originalEvaluation.ambiguityRetries === 1 ||
          originalEvaluation.ambiguityRetries === 2)
          ? originalEvaluation.ambiguityRetries
          : null;
      // Issue #64: a low-confidence-gated retry is also a free same-turn
      // retry, but its counter is separate — it must never consume or advance
      // the ambiguity ladder.
      const lowConfidenceAudioRetry =
        lowConfidenceGateRetryApplied ||
        (recoveryAttempt === null &&
          originalEvaluation?.outcome === "retry_original" &&
          originalEvaluation.retryReason === "unclear_meaning" &&
          typeof originalEvaluation.lowConfidenceAudioRetries === "number" &&
          originalEvaluation.lowConfidenceAudioRetries > 0);
      const freeSameTurnRetry = recoveryAttempt !== null || lowConfidenceAudioRetry;
      const reviewPendingContinuation =
        originalEvaluation?.outcome === TEACHER_REVIEW_OUTCOME;
      const currentStudentResponse =
        freeSameTurnRetry || reviewPendingContinuation
          ? WITHHELD_STUDENT_RESPONSE
          : originalEvaluation?.improvedSentence?.trim() || transcript;

      // Recovery ladder (2026-08-22): the first unclear answer gets the
      // static say-it-again line — no generation call, nothing derived from
      // the withheld transcript reaches the student, so history and
      // moderation round-trips are skipped entirely. A low-confidence-gated
      // retry is likewise always the free static line.
      if (recoveryAttempt === 1 || lowConfidenceAudioRetry) {
        cocoLine = SAY_IT_AGAIN_FALLBACK_LINE;
      } else {
        const historyResult = buildConversationHistory({
          openerLine: snapshot.turns[0]?.prompt ?? "",
          currentTurnOrder: input.turnOrder,
          currentStudentResponse,
          priorTurns: priorConversationTurns,
        });
        if (!historyResult.ok) {
          logTiming("failed", {
            error: "invalid_audio",
            step: "conversation_history",
          });
          return { ok: false, error: "invalid_audio", retryable: false };
        }

        const failedRecoveryQuestion =
          missionQuestion ?? snapshot.turns[0]?.prompt ?? "";
        const previouslyAsked = collectPreviouslyAskedQuestions({
          conversationHistory: historyResult.history,
          ambiguityHistory: originalEvaluation?.ambiguityHistory,
        });
        const recoveryTopicSeed = [
          /_{2,}/u.test(targetPattern) ? "" : targetPattern,
          snapshot.title,
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
            ? { kind: "next_turn" as const }
            : {
                kind: "unclear_recovery" as const,
                attempt: recoveryAttempt,
                fallbackQuestion: deterministicPivot,
                ...((() => {
                  const failedWord = leadingQuestionWord(failedRecoveryQuestion);
                  const pivotWord = pickRecoveryPivotWord(failedWord);
                  return pivotWord ? { pivotWord } : {};
                })()),
                ...(topicAnchorWords(recoveryTopicSeed).length > 0
                  ? { topicSeed: recoveryTopicSeed }
                  : {}),
              };

        const conversationOutcome = await timeStage("conversationTurn", () =>
          runConversationTurn(
            {
              studentId: input.studentId,
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              turnOrder: input.turnOrder,
              targetPattern,
              requiredTurns: snapshot.requiredTurns,
              studentTranscript: transcript,
              conversationHistory: historyResult.history,
              responseHandling:
                recoveryAttempt !== null || reviewPendingContinuation
                  ? "review_pending"
                  : "normal",
              generationPurpose,
            },
            {
              generateCocoReply: deps.generateCocoReply ?? generateCocoReply,
              isContentSafe: deps.isContentSafe ?? isContentSafe,
            },
          ),
        );

        cocoLine = conversationOutcome.cocoLine;
        cocoLineModerationEvent = conversationOutcome.moderationEvent;

        if (recoveryAttempt === 2 && cocoLine !== null) {
          const pivotCheck = validateRecoveryPivotQuestion(cocoLine, {
            failedQuestion: failedRecoveryQuestion,
            topicSeed: recoveryTopicSeed,
            previouslyAsked,
          });
          if (!pivotCheck.ok) {
            log("warn", "ai.recovery_pivot_rejected", {
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              turnOrder: input.turnOrder,
              reasons: pivotCheck.reasons,
            });
            cocoLine = deterministicPivot;
            cocoLineModerationEvent = {
              kind: "canned_fallback",
              cause: "recovery_pivot_rejected",
              violations: pivotCheck.reasons,
            };
          }
        }
      }

      // After a third-strike turn is flagged for teacher review in the
      // background, the continuation question opens with a short spoken
      // acknowledgment so the handoff does not read as a silent topic jump.
      if (
        cocoLine !== null &&
        recoveryAttempt === null &&
        reviewPendingContinuation
      ) {
        cocoLine = withReviewPendingAcknowledgment(cocoLine);
      }

      const resolvedCocoLine = cocoLine;
      const resolvedModerationEvent = cocoLineModerationEvent;

      if (
        recoveryPersistencePending &&
        (!resolvedCocoLine || !resolvedCocoLine.trim())
      ) {
        await supabase
          .from("audio_clips")
          .update({ processing_status: "failed" })
          .eq("id", audioClip.id);
        logTiming("failed", {
          error: "db_error",
          step: "recovery_line_missing",
        });
        return { ok: false, error: "db_error", retryable: true };
      }

      if (resolvedCocoLine !== null) {
        if (
          recoveryAttempt !== null &&
          originalEvaluation?.ambiguityHistory?.length
        ) {
          const latestAmbiguity = originalEvaluation.ambiguityHistory.at(-1);
          if (latestAmbiguity) {
            latestAmbiguity.recoveryQuestion = resolvedCocoLine;
          }
        }
        const recordResult = await timeStage("cocoLineWrite", () =>
          recordCocoLine({
            studentId: input.studentId,
            assignmentStudentId: input.assignmentStudentId,
            attemptId: input.attemptId,
            turnOrder: input.turnOrder,
            cocoLine: resolvedCocoLine,
            moderationEvent: resolvedModerationEvent,
            ...(freeSameTurnRetry && originalEvaluation
              ? { evaluation: toJson(originalEvaluation) }
              : {}),
          }),
        );

        if (!recordResult.ok) {
          await supabase
            .from("audio_clips")
            .update({ processing_status: "failed" })
            .eq("id", audioClip.id);
          log("warn", "audio.coco_line_persist_failed", {
            assignmentStudentId: input.assignmentStudentId,
            attemptId: input.attemptId,
            turnOrder: input.turnOrder,
            error: recordResult.error,
          });
          logTiming("failed", {
            error: "db_error",
            step: "coco_line_write",
          });
          return { ok: false, error: "db_error", retryable: true };
        }

        // Kick off TTS for Coco's new line via the existing warm-cache path
        // used for preset/improved lines — no forked audio pipeline.
        if (originalEvaluation?.outcome !== TEACHER_REVIEW_OUTCOME) {
          try {
            const warm = deps.warmTtsAudioCache ?? warmTtsAudioCache;
            await timeStage("ttsWarmupCocoLine", () =>
              warm({
                characterId: snapshot.characterId,
                voice: DEFAULT_COCO_TTS_VOICE,
                texts: [resolvedCocoLine],
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
        }
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
          const scoreUpsert = await timeStage("pronunciationScoreWrite", () =>
            supabase.from("pronunciation_scores").upsert(
              {
                audio_clip_id: audioClip.id,
                provider: "azure_speech",
                reference_text: scoring.score.referenceText,
                accuracy_score: scoring.score.accuracyScore,
                fluency_score: scoring.score.fluencyScore,
                completeness_score: scoring.score.completenessScore,
                pronunciation_score: scoring.score.pronunciationScore,
                star_band: scoring.score.starBand,
                word_scores: scoring.score.wordScores satisfies Json,
              },
              { onConflict: "audio_clip_id" },
            ),
          );

          if (scoreUpsert.error) {
            log("warn", "audio.pronunciation_scoring_failed", {
              assignmentStudentId: input.assignmentStudentId,
              attemptId: input.attemptId,
              turnOrder: input.turnOrder,
              error: scoreUpsert.error.message,
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

    const finalClipUpdatePromise = timeStage("finalClipUpdate", () =>
      supabase
        .from("audio_clips")
        .update({
          object_key: objectKey,
          mime_type: input.mimeType,
          duration_ms: input.durationMs,
          byte_size: input.byteSize,
          processing_status: "transcribed",
        })
        .eq("id", audioClip.id),
    );

    const [, { error: updateError }] = await Promise.all([
      ttsWarmupPromise,
      finalClipUpdatePromise,
    ]);

    if (updateError) {
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
