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
import { missionSnapshotSchema } from "@/domain/mission/schemas";
import { isExactTargetMatch } from "@/domain/ai/fast-path";
import {
  AI_EVALUATION_VERSION,
  decideOriginalTurnOutcome,
  guardParrotedConversationCorrection,
  type OriginalTurnGuardContext,
  decideRepeatTurnOutcome,
  originalTurnProviderFailureResult,
  originalTurnSchemaFailureResult,
  repeatTurnProviderFailureResult,
  repeatTurnSchemaFailureResult,
  type OriginalTurnDecision,
  type OriginalTurnEvaluation,
  type RepeatTurnDecision,
  type RepeatTurnEvaluation,
} from "@/domain/ai/turn-evaluation";
import {
  hasEnglishTranscript,
  normalizeEnglishTranscript,
  transcribeAudioFile,
} from "@/server/audio/transcription";
import { DEFAULT_COCO_TTS_VOICE } from "@/domain/audio/tts";
import { warmTtsAudioCache } from "@/server/audio/tts-cache";
import { scorePronunciation } from "@/server/audio/pronunciation-scorer";
import {
  wordsToPractice,
  type PronunciationStarBand,
  type WordHighlight,
} from "@/domain/pronunciation/scoring";
import {
  evaluateOriginalTurn,
  evaluateRepeatTurn,
  type OriginalTurnEvaluationResult,
  type RepeatTurnEvaluationResult,
} from "@/server/ai/turn-evaluator";
import {
  canGenerateNextDynamicTurn,
  recordCocoLine,
  routeAssignmentStudentToTeacherReview,
  type TeacherReviewReason,
} from "@/server/student-access/mission-flow";
import { generateCocoReply } from "@/server/ai/conversation-generator";
import { isContentSafe } from "@/server/ai/content-moderation";
import { selectFallbackLine } from "@/domain/conversation/fallback-lines";
import type { ConversationExchange } from "@/domain/ai/conversation-generation";
import {
  buildConversationHistory,
  type PersistedConversationTurn,
} from "@/server/student-access/conversation-history";
import { log } from "@/server/logging/logger";

const DEFAULT_AUDIO_BUCKET = "student-audio";
const FAILED_SCHEMA_REVIEW_REASON = "failed_schema";
const LOW_CONFIDENCE_REVIEW_REASON = "low_confidence";
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_DURATION_MS = 90_000;
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

export type CocoLineModerationEventKind =
  | "flagged_student_input"
  | "retried"
  | "canned_fallback";

export type CocoLineModerationEvent = {
  kind: CocoLineModerationEventKind;
};

export type UploadAttemptAudioClipResult =
  | {
      ok: true;
      audioClipId: string;
      processingStatus: "transcribed";
      transcript: string;
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
        | "db_error";
      retryable: boolean;
    };

export type UploadAttemptAudioClipDeps = {
  transcribeAudioFile?: typeof transcribeAudioFile;
  evaluateOriginalTurn?: typeof evaluateOriginalTurn;
  evaluateRepeatTurn?: typeof evaluateRepeatTurn;
  generateCocoReply?: typeof generateCocoReply;
  isContentSafe?: typeof isContentSafe;
  warmTtsAudioCache?: typeof warmTtsAudioCache;
  scorePronunciation?: typeof scorePronunciation;
};

type StoredOriginalTurnEvaluation = {
  version: typeof AI_EVALUATION_VERSION;
  outcome: OriginalTurnDecision["kind"];
  confidence: OriginalTurnEvaluation["confidence"];
  reviewReason: OriginalTurnEvaluation["reviewReason"];
  meaningUnderstood: OriginalTurnEvaluation["meaningUnderstood"];
  targetPatternAttempted: OriginalTurnEvaluation["targetPatternAttempted"];
  englishLanguage: OriginalTurnEvaluation["englishLanguage"];
  correctionNeeded: OriginalTurnEvaluation["correctionNeeded"];
  improvedSentence: string | null;
  requireRepeat: boolean;
};

type OriginalTurnWriteDecision = {
  evaluation: StoredOriginalTurnEvaluation;
  targetAttempted: boolean | null;
  improvedSentence: string | null;
};

type StoredRepeatTurnEvaluation = {
  version: typeof AI_EVALUATION_VERSION;
  outcome: RepeatTurnDecision["kind"];
  confidence: RepeatTurnEvaluation["confidence"];
  reviewReason: RepeatTurnEvaluation["reviewReason"];
  englishLanguage: RepeatTurnEvaluation["englishLanguage"];
  repeatCloseEnough: RepeatTurnEvaluation["repeatCloseEnough"];
  repeatAccepted: boolean | null;
};

export function applyOriginalTurnEvaluation(
  result: OriginalTurnEvaluationResult,
  guardContext?: OriginalTurnGuardContext,
): OriginalTurnWriteDecision {
  if (!result.ok) {
    const decision =
      result.error === "schema_failed"
        ? originalTurnSchemaFailureResult()
        : originalTurnProviderFailureResult();
    const reviewReason =
      result.error === "schema_failed"
        ? FAILED_SCHEMA_REVIEW_REASON
        : "provider_failed";

    return {
      evaluation: {
        version: AI_EVALUATION_VERSION,
        outcome: decision.kind,
        confidence: "low",
        reviewReason,
        meaningUnderstood: false,
        targetPatternAttempted: false,
        englishLanguage: "uncertain",
        correctionNeeded: false,
        improvedSentence: null,
        requireRepeat: decision.requireRepeat,
      },
      targetAttempted: null,
      improvedSentence: null,
    };
  }

  const decision = guardParrotedConversationCorrection(
    decideOriginalTurnOutcome(result.evaluation),
    guardContext ?? { evaluationMode: "preset", missionQuestion: null },
  );
  const improvedSentence =
    decision.kind === "needs_correction" ? decision.improvedSentence : null;

  return {
    evaluation: {
      version: AI_EVALUATION_VERSION,
      outcome: decision.kind,
      confidence: result.evaluation.confidence,
      reviewReason:
        decision.kind === "teacher_review"
          ? decision.reviewReason || LOW_CONFIDENCE_REVIEW_REASON
          : null,
      meaningUnderstood: result.evaluation.meaningUnderstood,
      targetPatternAttempted: result.evaluation.targetPatternAttempted,
      englishLanguage: result.evaluation.englishLanguage,
      correctionNeeded: result.evaluation.correctionNeeded,
      improvedSentence,
      requireRepeat: decision.requireRepeat,
    },
    targetAttempted: result.evaluation.targetPatternAttempted,
    improvedSentence,
  };
}

export function applyRepeatTurnEvaluation(
  result: RepeatTurnEvaluationResult,
): StoredRepeatTurnEvaluation {
  if (!result.ok) {
    const decision =
      result.error === "schema_failed"
        ? repeatTurnSchemaFailureResult()
        : repeatTurnProviderFailureResult();
    const reviewReason =
      result.error === "schema_failed"
        ? FAILED_SCHEMA_REVIEW_REASON
        : "provider_failed";

    return {
      version: AI_EVALUATION_VERSION,
      outcome: decision.kind,
      confidence: "low",
      reviewReason,
      englishLanguage: "uncertain",
      repeatCloseEnough: false,
      repeatAccepted: decision.repeatAccepted,
    };
  }

  const decision = decideRepeatTurnOutcome(result.evaluation);
  return {
    version: AI_EVALUATION_VERSION,
    outcome: decision.kind,
    confidence: result.evaluation.confidence,
    reviewReason:
      decision.kind === "teacher_review" ? decision.reviewReason : null,
    englishLanguage: result.evaluation.englishLanguage,
    repeatCloseEnough: result.evaluation.repeatCloseEnough,
    repeatAccepted: decision.repeatAccepted,
  };
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
  const parsed = missionSnapshotSchema.safeParse(missionSnapshot);
  return parsed.success ? parsed.data : null;
}

function toJson(
  value: StoredOriginalTurnEvaluation | StoredRepeatTurnEvaluation,
): Json {
  return value as unknown as Json;
}

function reviewReasonOrDefault(
  reviewReason: string | null,
): TeacherReviewReason {
  if (
    reviewReason === "low_confidence" ||
    reviewReason === "ambiguous" ||
    reviewReason === "failed_schema" ||
    reviewReason === "provider_failed"
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
  scenePremise: string | null;
  targetPattern: string;
  requiredTurns: number;
  studentTranscript: string;
  conversationHistory: ConversationExchange[];
};

type ConversationTurnOutcome = {
  cocoLine: string | null;
  moderationEvent: CocoLineModerationEvent | null;
};

/**
 * Conversation-mode orchestration (CHAT-01/03/05/06, D-10/D-11/D-13,
 * RESEARCH.md step a-f pipeline). Runs ONLY for conversationMode missions,
 * after the student's original-answer turn write has already succeeded.
 * All generation/moderation calls live HERE (never in mission-flow.ts),
 * preserving the AI-06 boundary.
 *
 * Order (never reordered):
 *  a. hard-cap check (canGenerateNextDynamicTurn)
 *  b. moderate student input FIRST — flagged input never reaches the generator
 *  c. generate Coco's next line
 *  d. moderate the generated line; regenerate once with stronger steering if flagged
 *  e. provider failure shares the same canned-fallback path as (d)
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
  const studentInputCheck = await deps.isContentSafe(context.studentTranscript);
  if (!studentInputCheck.safe) {
    return {
      cocoLine: selectFallbackLine(context.turnOrder),
      moderationEvent: { kind: "flagged_student_input" },
    };
  }

  const windDown = context.turnOrder >= 6; // relative to the fixed hard cap of 8, not required_turns

  const generationInput = {
    scenePremise: context.scenePremise ?? "",
    targetPattern: context.targetPattern,
    turnOrder: context.turnOrder,
    requiredTurns: context.requiredTurns,
    hardCap: 8 as const,
    windDown,
    conversationHistory: context.conversationHistory,
  };

  // (c) GENERATE
  const firstAttempt = await deps.generateCocoReply(generationInput);

  // (e) PROVIDER/SCHEMA FAILURE shares the same canned-fallback path as (d)'s
  // final fallback (D-13).
  if (!firstAttempt.ok) {
    return {
      cocoLine: selectFallbackLine(context.turnOrder),
      moderationEvent: { kind: "canned_fallback" },
    };
  }

  // (d) MODERATE OUTPUT
  const firstLineCheck = await deps.isContentSafe(firstAttempt.reply.line);
  if (firstLineCheck.safe) {
    return { cocoLine: firstAttempt.reply.line, moderationEvent: null };
  }

  // Regenerate ONCE with stronger safety steering. Every regenerated line is
  // re-moderated — never assumed clean (RESEARCH.md anti-pattern warning).
  const retryAttempt = await deps.generateCocoReply(generationInput);
  if (retryAttempt.ok) {
    const retryLineCheck = await deps.isContentSafe(retryAttempt.reply.line);
    if (retryLineCheck.safe) {
      return { cocoLine: retryAttempt.reply.line, moderationEvent: { kind: "retried" } };
    }
  }

  // Fail twice / retry itself failed to generate -> shared canned fallback.
  return {
    cocoLine: selectFallbackLine(context.turnOrder),
    moderationEvent: { kind: "canned_fallback" },
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
          .select("turn_order, original_transcript, improved_sentence, coco_line")
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

    const missionQuestion = snapshotTurn?.prompt ?? previousCocoLine;
    const targetExample =
      snapshot.conversationMode === true
        ? null
        : snapshotTurn?.targetExample ?? null;

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
        .select("id, original_transcript, improved_sentence")
        .single(),
    );

    if (turnError || !turn) {
      logTiming("failed", { error: "db_error", step: "turn_init" });
      return { ok: false, error: "db_error", retryable: true };
    }

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
    const transcriptionPromise = timeStage("transcription", () =>
      transcribe({
        file: createAudioBlob(),
        mimeType: input.mimeType,
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

    const transcript = normalizeEnglishTranscript(transcription.text);
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

    let originalEvaluation: StoredOriginalTurnEvaluation | undefined;
    let repeatEvaluation: StoredRepeatTurnEvaluation | undefined;

    const pronunciationReferenceText =
      input.clipKind === "original_answer"
        ? transcript
        : repeatTarget;

    const score = deps.scorePronunciation ?? scorePronunciation;
    const scoringStartedAt = Date.now();
    const scoringPromise = score({
      file: createAudioBlob(),
      referenceText: pronunciationReferenceText,
      durationMs: input.durationMs,
    }).finally(() => {
      timings.pronunciationTotalMs = elapsedMs(scoringStartedAt);
    });

    const turnWrite =
      input.clipKind === "original_answer"
        ? await (async () => {
            // Skip the OpenAI evaluation call entirely when the transcript is
            // an exact normalized match for the turn's targetExample — this
            // is the common case for short/rote answers (e.g. "Hello", "I'm
            // fine") and removes ~1.3-3.3s of evaluation latency for them.
            // Open-ended answers still need semantic evaluation against the
            // mission question; grammar shape alone cannot establish relevance.
            const fastPathMatched =
              targetExample !== null &&
              isExactTargetMatch(transcript, targetExample);
            timings.evaluationFastPath = fastPathMatched ? 1 : 0;
            const evaluationResult: OriginalTurnEvaluationResult = fastPathMatched
              ? {
                  ok: true,
                  evaluation: {
                    version: AI_EVALUATION_VERSION,
                    outcome: "correct",
                    meaningUnderstood: true,
                    targetPatternAttempted: true,
                    correctionNeeded: false,
                    improvedSentence: null,
                    englishLanguage: "english",
                    confidence: "high",
                    reviewReason: null,
                  },
                }
              : await timeStage("evaluation", () => {
                  const evaluate = deps.evaluateOriginalTurn ?? evaluateOriginalTurn;
                  return evaluate({
                    evaluationMode:
                      snapshot.conversationMode === true
                        ? "conversation"
                        : "preset",
                    missionQuestion: missionQuestion ?? undefined,
                    targetPattern: snapshot.targetPattern,
                    targetExample,
                    level: snapshot.level,
                    turnOrder: input.turnOrder,
                    transcript,
                  });
                });
            const decision = applyOriginalTurnEvaluation(evaluationResult, {
              evaluationMode:
                snapshot.conversationMode === true ? "conversation" : "preset",
              missionQuestion: missionQuestion ?? null,
            });
            originalEvaluation = decision.evaluation;

            const write = await timeStage("turnWrite", () =>
              supabase.from("attempt_turns").upsert(
                {
                  attempt_id: input.attemptId,
                  turn_order: input.turnOrder,
                  original_transcript: transcript,
                  target_attempted: decision.targetAttempted,
                  improved_sentence: decision.improvedSentence,
                  evaluation: toJson(decision.evaluation),
                },
                { onConflict: "attempt_id,turn_order" },
              ),
            );

            if (write.error || decision.evaluation.outcome !== "teacher_review") {
              return write;
            }

            const routeResult = await routeAssignmentStudentToTeacherReview({
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
            // Skip the OpenAI evaluation call entirely when the repeat
            // transcript is an exact normalized match for the sentence the
            // student was asked to repeat — mirrors the original-answer fast
            // path above. Without this, a verbatim repeat still depends on a
            // non-deterministic LLM judgment call, which can (and did) reject
            // an exact match.
            const fastPathMatched = isExactTargetMatch(transcript, repeatTarget);
            timings.evaluationFastPath = fastPathMatched ? 1 : 0;
            const evaluationResult: RepeatTurnEvaluationResult = fastPathMatched
              ? {
                  ok: true,
                  evaluation: {
                    version: AI_EVALUATION_VERSION,
                    outcome: "repeat_accepted",
                    repeatCloseEnough: true,
                    englishLanguage: "english",
                    confidence: "high",
                    reviewReason: null,
                  },
                }
              : await timeStage("evaluation", () => {
                  const evaluate = deps.evaluateRepeatTurn ?? evaluateRepeatTurn;
                  return evaluate({
                    originalTranscript: turn.original_transcript ?? "",
                    improvedSentence: repeatTarget,
                    targetPattern: snapshot.targetPattern,
                    level: snapshot.level,
                    repeatTranscript: transcript,
                  });
                });
            const decision = applyRepeatTurnEvaluation(evaluationResult);
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

            if (write.error || decision.outcome !== "teacher_review") {
              return write;
            }

            const routeResult = await routeAssignmentStudentToTeacherReview({
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

    // Conversation-mode dynamic-turn orchestration (CHAT-01/03/05/06). Runs
    // only for chat-mode missions, only on the original-answer turn (the
    // student's utterance Coco is replying to), after the turn write above
    // has already succeeded. Preset missions (conversationMode !== true)
    // behave exactly as before — no generateCocoReply/isContentSafe call.
    let cocoLine: string | null = null;
    let cocoLineModerationEvent: CocoLineModerationEvent | null = null;

    if (snapshot.conversationMode === true && input.clipKind === "original_answer") {
      const currentStudentResponse =
        originalEvaluation?.improvedSentence?.trim() || transcript;
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

      const conversationOutcome = await timeStage("conversationTurn", () =>
        runConversationTurn(
          {
            studentId: input.studentId,
            assignmentStudentId: input.assignmentStudentId,
            attemptId: input.attemptId,
            turnOrder: input.turnOrder,
            scenePremise: snapshot.scenePremise,
            targetPattern: snapshot.targetPattern,
            requiredTurns: snapshot.requiredTurns,
            studentTranscript: transcript,
            conversationHistory: historyResult.history,
          },
          {
            generateCocoReply: deps.generateCocoReply ?? generateCocoReply,
            isContentSafe: deps.isContentSafe ?? isContentSafe,
          },
        ),
      );

      cocoLine = conversationOutcome.cocoLine;
      cocoLineModerationEvent = conversationOutcome.moderationEvent;
      const resolvedCocoLine = cocoLine;
      const resolvedModerationEvent = cocoLineModerationEvent;

      if (resolvedCocoLine !== null) {
        const recordResult = await timeStage("cocoLineWrite", () =>
          recordCocoLine({
            studentId: input.studentId,
            assignmentStudentId: input.assignmentStudentId,
            attemptId: input.attemptId,
            turnOrder: input.turnOrder,
            cocoLine: resolvedCocoLine,
            moderationEvent: resolvedModerationEvent,
          }),
        );

        if (!recordResult.ok) {
          log("warn", "audio.coco_line_persist_failed", {
            assignmentStudentId: input.assignmentStudentId,
            attemptId: input.attemptId,
            turnOrder: input.turnOrder,
            error: recordResult.error,
          });
        } else {
          // Kick off TTS for Coco's new line via the existing warm-cache path
          // used for preset/improved lines — no forked audio pipeline.
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

    try {
      const pronunciationAwaitStartedAt = Date.now();
      const scoring = await scoringPromise;
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
              word_scores: scoring.score.wordScores as unknown as Json,
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
          wordHighlights = wordsToPractice(scoring.score.wordScores, transcript);
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

    // ttsWarmup (tts_audio_cache table + tts-audio storage) and finalClipUpdate
    // (audio_clips row) touch disjoint resources, so they run concurrently.
    // ttsWarmup failures must never fail the overall upload (existing
    // contract), so its rejection is caught inside its own branch rather than
    // via the outer Promise.all/allSettled.
    const improvedSentenceForWarmup = originalEvaluation?.improvedSentence;
    const shouldWarmTts =
      input.clipKind === "original_answer" && !!improvedSentenceForWarmup;

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
      transcript,
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
