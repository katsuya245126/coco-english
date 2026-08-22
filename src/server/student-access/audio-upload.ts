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
import { isExactTargetMatch } from "@/domain/ai/fast-path";
import { isIncompleteUtterance } from "@/domain/ai/incomplete-utterance";
import { buildReplyHintFrame } from "@/domain/ai/reply-hint-frame";
import {
  canonicalizeNoOpOriginalEvaluation,
  validateOriginalEvaluationContract,
  type OriginalEvaluationViolation,
} from "@/domain/ai/original-evaluation-contract";
import {
  isMinimalEffortAnswer,
  MAX_MINIMAL_EFFORT_BLOCKS,
} from "@/domain/ai/minimal-effort-detection";
import {
  classifyMinimalEffortFeedback,
  resolveMinimalEffortRetryExample,
  type MinimalEffortKind,
} from "@/domain/ai/minimal-effort-feedback";
import {
  AI_EVALUATION_VERSION,
  CORRECTION_POLICY_VERSION,
  MAX_AMBIGUITY_RETRIES,
  decideOriginalTurnOutcome,
  guardNonsensicalMinimalEffortCorrection,
  guardNoOpCorrection,
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
  type TranscriptionEvidence,
} from "@/server/audio/transcription";
import {
  isLowConfidenceTranscript,
  isTranscriptConfidenceBelowGate,
} from "@/domain/audio/transcript-confidence";
import { buildTranscriptionVocabularyHint } from "@/domain/audio/vocabulary-hint";
import { DEFAULT_COCO_TTS_VOICE } from "@/domain/audio/tts";
import { warmTtsAudioCache } from "@/server/audio/tts-cache";
import { scorePronunciation } from "@/server/audio/pronunciation-scorer";
import {
  buildLearnerTranscript,
  type HangulInterpretation,
} from "@/domain/audio/transcript-interpretation";
import {
  wordsToPractice,
  type PronunciationStarBand,
  type WordHighlight,
} from "@/domain/pronunciation/scoring";
import {
  evaluateOriginalTurn,
  evaluateRepeatTurn,
  resolveEvaluationModel,
  resolveEvaluationRuntimeVersion,
  type OriginalTurnEvaluationResult,
  type RepeatTurnEvaluationResult,
} from "@/server/ai/turn-evaluator";
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
const FAILED_SCHEMA_REVIEW_REASON = "failed_schema";
/**
 * Free say-it-again retries granted for low-confidence transcripts before
 * the evaluator is allowed to see the text (issue #64). Mirrors the bounded
 * shape of the ambiguity ladder; exhausting it falls through to normal
 * evaluation, never straight to review.
 */
export const MAX_LOW_CONFIDENCE_AUDIO_RETRIES = 2;
/**
 * Review reason for a well-formed provider verdict rejected by a
 * deterministic contract check when policy repair could not fix it
 * (issue #65). `failed_schema` stays reserved for genuinely malformed or
 * unparseable output.
 */
const CONTRACT_REJECTED_REVIEW_REASON = "contract_rejected";
const LOW_CONFIDENCE_REVIEW_REASON = "low_confidence";
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
  evaluateOriginalTurn?: typeof evaluateOriginalTurn;
  evaluateRepeatTurn?: typeof evaluateRepeatTurn;
  generateCocoReply?: typeof generateCocoReply;
  isContentSafe?: typeof isContentSafe;
  warmTtsAudioCache?: typeof warmTtsAudioCache;
  scorePronunciation?: typeof scorePronunciation;
};

type StoredEvaluationProvenance = Pick<
  OriginalTurnEvaluation,
  | "policyVersion"
  | "evaluationModel"
  | "evaluationSource"
  | "transcriptionModel"
  | "transcriptionConfidence"
  | "runtimeVersion"
>;

type StoredOriginalTurnEvaluation = StoredEvaluationProvenance & {
  version: typeof AI_EVALUATION_VERSION;
  outcome: OriginalTurnDecision["kind"];
  confidence: OriginalTurnEvaluation["confidence"];
  reviewReason: OriginalTurnEvaluation["reviewReason"];
  meaningUnderstood: OriginalTurnEvaluation["meaningUnderstood"];
  targetPatternAttempted: OriginalTurnEvaluation["targetPatternAttempted"];
  englishLanguage: OriginalTurnEvaluation["englishLanguage"];
  correctionNeeded: OriginalTurnEvaluation["correctionNeeded"];
  correctionSeverity: OriginalTurnEvaluation["correctionSeverity"] | null;
  correctionReason: OriginalTurnEvaluation["correctionReason"];
  improvedSentence: string | null;
  requireRepeat: boolean;
  retryReason?: "minimal_effort" | "incomplete_recording" | "unclear_meaning";
  minimalEffortBlocks?: number;
  minimalEffortKind?: MinimalEffortKind;
  retryExample?: string | null;
  ambiguityRetries?: number;
  /**
   * Free say-it-again retries granted because the transcript itself decoded
   * with low confidence (issue #64). Deliberately separate from
   * `ambiguityRetries`: audio problems must not consume the meaningful-
   * answer recovery budget nor escalate toward review on their own.
   */
  lowConfidenceAudioRetries?: number;
  ambiguityHistory?: Array<{
    transcript: string;
    audioClipId: string;
    evaluation: OriginalTurnEvaluation;
    question?: string;
    recoveryQuestion?: string;
  }>;
  contractViolations?: OriginalEvaluationViolation[];
  hangulInterpretations: HangulInterpretation[];
};

/**
 * The only evaluation shape a student is ever allowed to receive.
 *
 * The stored evaluation is teacher/audit evidence: it carries raw Hangul spans
 * (`hangulInterpretations`), complete raw transcripts (`ambiguityHistory`), a
 * nested `originalEvaluation` with both, provenance, and contract violations.
 * None of that may cross the network to a learner, so the route projects
 * rather than serializes. These five fields are exactly what `MissionFlowShell`
 * consumes to pick a feedback card.
 */
export type StudentFacingEvaluation = {
  outcome: string;
  improvedSentence: string | null;
  retryReason?: "minimal_effort" | "incomplete_recording" | "unclear_meaning";
  minimalEffortKind?: MinimalEffortKind;
  retryExample?: string | null;
};

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

  const original =
    "improvedSentence" in evaluation
      ? (evaluation as StoredOriginalTurnEvaluation)
      : null;

  const projected: StudentFacingEvaluation = {
    outcome: evaluation.outcome,
    improvedSentence: original?.improvedSentence ?? null,
  };

  if (original?.retryReason !== undefined) {
    projected.retryReason = original.retryReason;
  }
  if (original?.minimalEffortKind !== undefined) {
    projected.minimalEffortKind = original.minimalEffortKind;
  }
  if (original?.retryExample !== undefined) {
    projected.retryExample = original.retryExample;
  }

  return projected;
}

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
  requireRepeat: boolean;
  originalEvaluation?: StoredOriginalTurnEvaluation;
  hangulInterpretations: HangulInterpretation[];
};

function deterministicOriginalEvaluation(
  fields: Omit<StoredOriginalTurnEvaluation, keyof StoredEvaluationProvenance>,
  evidence: StoredEvaluationProvenance,
): StoredOriginalTurnEvaluation {
  return {
    ...fields,
    ...evidence,
    evaluationSource: "deterministic",
  };
}

export function applyOriginalTurnEvaluation(
  result: OriginalTurnEvaluationResult,
  guardContext?: OriginalTurnGuardContext,
  fallbackProvenance: StoredEvaluationProvenance = {
    policyVersion: CORRECTION_POLICY_VERSION,
    evaluationModel: "unknown",
    evaluationSource: "model",
    transcriptionModel: "unknown",
    transcriptionConfidence: null,
    runtimeVersion: "unknown",
  },
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
        ...fallbackProvenance,
        version: AI_EVALUATION_VERSION,
        outcome: decision.kind,
        confidence: "low",
        reviewReason,
        meaningUnderstood: false,
        targetPatternAttempted: false,
        englishLanguage: "uncertain",
        correctionNeeded: false,
        correctionSeverity: null,
        correctionReason: "none",
        improvedSentence: null,
        requireRepeat: decision.requireRepeat,
        hangulInterpretations: [],
      },
      targetAttempted: null,
      improvedSentence: null,
    };
  }

  const resolvedGuardContext = guardContext ?? {
    evaluationMode: "preset",
    missionQuestion: null,
  };
  const decision = guardNoOpCorrection(
    guardNonsensicalMinimalEffortCorrection(
      guardParrotedConversationCorrection(
        decideOriginalTurnOutcome(
          result.evaluation,
          resolvedGuardContext.evaluationMode,
          resolvedGuardContext.missionQuestion,
          resolvedGuardContext.priorAmbiguityRetries ?? 0,
        ),
        resolvedGuardContext,
      ),
      resolvedGuardContext,
    ),
    resolvedGuardContext,
  );
  const improvedSentence =
    decision.kind === "needs_correction" || decision.kind === "accepted_original"
      ? decision.improvedSentence
      : null;

  return {
    evaluation: {
      ...result.evaluation,
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
      correctionSeverity: result.evaluation.correctionSeverity,
      correctionReason: result.evaluation.correctionReason,
      improvedSentence,
      requireRepeat: decision.requireRepeat,
    },
    targetAttempted: result.evaluation.targetPatternAttempted,
    improvedSentence,
  };
}

export function applyRepeatTurnEvaluation(
  result: RepeatTurnEvaluationResult,
  /** Repeat clips submitted for this turn so far, including this one. */
  attemptNumber = 1,
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
      requireRepeat: decision.requireRepeat,
      hangulInterpretations: [],
    };
  }

  const decision = decideRepeatTurnOutcome(result.evaluation, attemptNumber);
  return {
    version: AI_EVALUATION_VERSION,
    outcome: decision.kind,
    confidence: result.evaluation.confidence,
    reviewReason:
      decision.kind === "teacher_review" ? decision.reviewReason : null,
    englishLanguage: result.evaluation.englishLanguage,
    repeatCloseEnough: result.evaluation.repeatCloseEnough,
    repeatAccepted: decision.repeatAccepted,
    requireRepeat: decision.kind === "retry_repeat" ? true : false,
    hangulInterpretations: result.evaluation.hangulInterpretations,
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
  const result = interpretMissionSnapshot(missionSnapshot);
  return result.kind === "complete" ? result.snapshot : null;
}

function toJson(
  value: StoredOriginalTurnEvaluation | StoredRepeatTurnEvaluation,
): Json {
  return value satisfies Json;
}

/**
 * `attempt_turns.evaluation` holds either an original or a repeat evaluation.
 * `repeatCloseEnough` appears only on repeat evaluations and
 * `correctionSeverity` only on originals, so the pair distinguishes them
 * without a version bump. Guards against re-nesting an already-nested repeat
 * evaluation if a turn is written twice.
 */
function isStoredOriginalEvaluation(
  value: unknown,
): value is StoredOriginalTurnEvaluation {
  return (
    typeof value === "object" &&
    value !== null &&
    "correctionSeverity" in value &&
    !("repeatCloseEnough" in value)
  );
}

function priorMinimalEffortBlocks(evaluation: unknown): number {
  if (
    typeof evaluation !== "object" ||
    evaluation === null ||
    Array.isArray(evaluation)
  ) {
    return 0;
  }
  const stored = evaluation as {
    minimalEffortBlocks?: unknown;
  };
  return typeof stored.minimalEffortBlocks === "number" &&
    Number.isFinite(stored.minimalEffortBlocks)
    ? Math.max(0, Math.floor(stored.minimalEffortBlocks))
    : 0;
}

/**
 * How many times this turn already answered a low-confidence transcript with
 * the free say-it-again retry (issue #64). Tracked separately from
 * `ambiguityRetries` so microphone problems never consume the meaningful-
 * answer recovery budget, and never escalate toward teacher review by
 * themselves.
 */
function priorLowConfidenceAudioRetries(evaluation: unknown): number {
  if (
    typeof evaluation !== "object" ||
    evaluation === null ||
    Array.isArray(evaluation)
  ) {
    return 0;
  }
  const stored = evaluation as {
    lowConfidenceAudioRetries?: unknown;
  };
  return typeof stored.lowConfidenceAudioRetries === "number" &&
    Number.isFinite(stored.lowConfidenceAudioRetries)
    ? Math.max(0, Math.floor(stored.lowConfidenceAudioRetries))
    : 0;
}

function priorAmbiguityState(evaluation: unknown): Pick<
  StoredOriginalTurnEvaluation,
  "ambiguityRetries" | "ambiguityHistory"
> {
  if (
    typeof evaluation !== "object" ||
    evaluation === null ||
    Array.isArray(evaluation)
  ) {
    return { ambiguityRetries: 0, ambiguityHistory: [] };
  }

  const stored = evaluation as Partial<StoredOriginalTurnEvaluation>;
  return {
    ambiguityRetries:
      typeof stored.ambiguityRetries === "number" &&
      Number.isFinite(stored.ambiguityRetries)
        ? Math.max(0, Math.floor(stored.ambiguityRetries))
        : 0,
    ambiguityHistory: Array.isArray(stored.ambiguityHistory)
      ? stored.ambiguityHistory
      : [],
  };
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
    const fallbackProvenance: StoredEvaluationProvenance = {
      policyVersion: CORRECTION_POLICY_VERSION,
      evaluationModel: resolveEvaluationModel(),
      evaluationSource: "model",
      transcriptionModel: transcriptionEvidence.model,
      transcriptionConfidence: transcriptionEvidence.confidence,
      runtimeVersion: resolveEvaluationRuntimeVersion(),
    };
    const ambiguityState = priorAmbiguityState(
      (turn as { evaluation?: unknown }).evaluation,
    );
    const exactTargetMatched =
      input.clipKind === "original_answer" &&
      targetExample !== null &&
      isExactTargetMatch(transcript, targetExample);

    if (
      input.clipKind === "original_answer" &&
      !exactTargetMatched &&
      isIncompleteUtterance(transcript)
    ) {
      const evaluation = deterministicOriginalEvaluation(
        {
          version: AI_EVALUATION_VERSION,
          outcome: "retry_original",
          confidence: "high",
          reviewReason: null,
          meaningUnderstood: false,
          targetPatternAttempted: false,
          englishLanguage: "english",
          correctionNeeded: false,
          correctionSeverity: null,
          correctionReason: "none",
          improvedSentence: null,
          requireRepeat: false,
          hangulInterpretations: [],
          retryReason: "incomplete_recording",
          ...((ambiguityState.ambiguityRetries ?? 0) > 0
            ? {
                ambiguityRetries: ambiguityState.ambiguityRetries,
                ambiguityHistory: ambiguityState.ambiguityHistory,
              }
            : {}),
        },
        fallbackProvenance,
      );
      const write = await timeStage("turnWrite", () =>
        supabase.from("attempt_turns").upsert(
          {
            attempt_id: input.attemptId,
            turn_order: input.turnOrder,
            original_transcript: transcript,
            target_attempted: false,
            improved_sentence: null,
            evaluation: toJson(evaluation),
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
      logTiming("success", { step: "incomplete_recording_guard" });
      return {
        ok: true,
        audioClipId: audioClip.id,
        processingStatus: "transcribed",
        displayTranscript: buildLearnerTranscript(transcript, []),
        evaluation,
        starBand: null,
        wordsToPractice: [],
        cocoLine: null,
        cocoLineModerationEvent: null,
      };
    }

    // Minimal-effort answer guard (phone-UAT item 6, design approved
    // 2026-07-20). Deterministic blocklist only; an exact target-example
    // match ("Yes, I do." as an authored target) always wins; after
    // MAX_MINIMAL_EFFORT_BLOCKS blocks the answer evaluates normally so a
    // stuck student is never trapped (D-04). Runs before pronunciation
    // scoring / evaluation / conversation generation — a blocked try incurs
    // no paid provider call and never consumes the turn.
    const minimalEffortBlocks = priorMinimalEffortBlocks(
      (turn as { evaluation?: unknown }).evaluation,
    );
    if (
      input.clipKind === "original_answer" &&
      isMinimalEffortAnswer(transcript)
    ) {
      if (
        !exactTargetMatched &&
        minimalEffortBlocks < MAX_MINIMAL_EFFORT_BLOCKS
      ) {
        const minimalEffortKind =
          classifyMinimalEffortFeedback(transcript) ?? "short_answer";
        const retryExample = resolveMinimalEffortRetryExample({
          evaluationMode:
            snapshot.conversationMode === true ? "conversation" : "preset",
          missionQuestion: missionQuestion ?? "",
          targetExample,
        });
        const evaluation = deterministicOriginalEvaluation(
          {
            version: AI_EVALUATION_VERSION,
            outcome: "retry_original",
            confidence: "high",
            reviewReason: null,
            meaningUnderstood: false,
            targetPatternAttempted: false,
            englishLanguage: "english",
            correctionNeeded: false,
            correctionSeverity: null,
            correctionReason: "none",
            improvedSentence: null,
            requireRepeat: false,
            hangulInterpretations: [],
            retryReason: "minimal_effort",
            minimalEffortBlocks: minimalEffortBlocks + 1,
            minimalEffortKind,
            retryExample,
            ...((ambiguityState.ambiguityRetries ?? 0) > 0
              ? {
                  ambiguityRetries: ambiguityState.ambiguityRetries,
                  ambiguityHistory: ambiguityState.ambiguityHistory,
                }
              : {}),
          },
          fallbackProvenance,
        );

        const write = await timeStage("turnWrite", () =>
          supabase.from("attempt_turns").upsert(
            {
              attempt_id: input.attemptId,
              turn_order: input.turnOrder,
              original_transcript: transcript,
              target_attempted: false,
              improved_sentence: null,
              evaluation: toJson(evaluation),
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

        log("info", "audio.minimal_effort_blocked", {
          audioClipId: audioClip.id,
          assignmentStudentId: input.assignmentStudentId,
          attemptId: input.attemptId,
          turnOrder: input.turnOrder,
          blocks: minimalEffortBlocks + 1,
        });
        logTiming("success", { step: "minimal_effort_guard" });
        return {
          ok: true,
          audioClipId: audioClip.id,
          processingStatus: "transcribed",
          displayTranscript: buildLearnerTranscript(transcript, []),
          evaluation,
          starBand: null,
          wordsToPractice: [],
          cocoLine: null,
          cocoLineModerationEvent: null,
        };
      }
    }

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

    /*
     * All-English traffic keeps the existing fast path: scoring starts here and
     * runs concurrently with evaluation. Only a Hangul original answer waits,
     * because Azure is pinned to English and the reference text has to be the
     * interpreted reading, which does not exist until the evaluator classifies
     * the spans. Repeat clips score against the English sentence the learner
     * was asked to repeat, so they never need to wait.
     */
    let scoringPromise =
      input.clipKind === "repeat_attempt"
        ? beginPronunciationScoring(repeatTarget)
        : koreanSpans.length === 0
          ? beginPronunciationScoring(transcript)
          : null;

    const turnWrite =
      input.clipKind === "original_answer"
        ? await (async () => {
            // Skip the evaluator only for an exact authored-target match. An
            // open answer that merely fits the frame shape (e.g. "I'd rather
            // big city because more things to do") is structurally on-frame but
            // may be ungrammatical, so it still needs the model — the frame
            // regex proves shape, not grammar. The model prompt already keeps
            // the child's own choice while correcting genuinely-wrong English.
            const fastPathMatched = exactTargetMatched;
            timings.evaluationFastPath = fastPathMatched ? 1 : 0;
            const evaluate = deps.evaluateOriginalTurn ?? evaluateOriginalTurn;
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
            let evaluationResult: OriginalTurnEvaluationResult;
            const storedLowConfidenceRetries = priorLowConfidenceAudioRetries(
              turn.evaluation,
            );
            const transcriptConfidence = transcriptionEvidence.confidence;
            // Issue #64 low-confidence gate: a transcript that decoded below
            // the confidence threshold gets a free say-it-again retry BEFORE
            // any evaluation call. The evaluator would only see garbled text
            // and route it to teacher review — the dominant spurious-review
            // cause in the 2026-08-21 export. Bounded so a broken microphone
            // cannot loop forever; exhausting the gate falls through to the
            // normal evaluation path, so escalation stays unchanged.
            const lowConfidenceGateRetry =
              !fastPathMatched &&
              transcriptConfidence !== null &&
              isTranscriptConfidenceBelowGate(transcriptConfidence) &&
              storedLowConfidenceRetries < MAX_LOW_CONFIDENCE_AUDIO_RETRIES;
            if (lowConfidenceGateRetry) {
              timings.evaluationSkippedLowConfidence = 1;
              log("warn", "audio.low_confidence_gate_retry", {
                assignmentStudentId: input.assignmentStudentId,
                attemptId: input.attemptId,
                turnOrder: input.turnOrder,
                minLogprob: transcriptConfidence.minLogprob,
                tokenCount: transcriptConfidence.tokenCount,
                retriesAfter: storedLowConfidenceRetries + 1,
              });
              evaluationResult = {
                ok: true,
                // The provider-shaped outcome satisfies the result type; the
                // gated decision below rewrites it to retry_original without
                // passing through decideOriginalTurnOutcome, so no ambiguity
                // budget is consumed.
                evaluation: {
                  ...fallbackProvenance,
                  version: AI_EVALUATION_VERSION,
                  outcome: "teacher_review",
                  meaningUnderstood: false,
                  targetPatternAttempted: false,
                  correctionNeeded: false,
                  correctionSeverity: "none",
                  correctionReason: "none",
                  improvedSentence: null,
                  englishLanguage: "uncertain",
                  confidence: "low",
                  reviewReason: null,
                  hangulInterpretations: [],
                  evaluationSource: "deterministic",
                },
              };
            } else if (fastPathMatched) {
              timings.evaluationFastPath = fastPathMatched ? 1 : 0;
              evaluationResult = {
                ok: true,
                evaluation: {
                  ...fallbackProvenance,
                  version: AI_EVALUATION_VERSION,
                  outcome: "correct",
                  meaningUnderstood: true,
                  targetPatternAttempted: true,
                  correctionNeeded: false,
                  correctionSeverity: "none",
                  correctionReason: "none",
                  improvedSentence: null,
                  englishLanguage: "english",
                  confidence: "high",
                  reviewReason: null,
                  evaluationSource: "deterministic",
                  hangulInterpretations: [],
                },
              };
            } else {
              timings.evaluationSkippedLowConfidence = 0;
              evaluationResult = await timeStage("evaluation", () =>
                evaluate(evaluationInput),
              );
            }

            let contractViolations: OriginalEvaluationViolation[] = [];
            if (lowConfidenceGateRetry) {
              // Skipped entirely: the transcript is not trusted text, so
              // canonicalizing it or paying for a policy-repair call about
              // it would defeat the gate.
            } else if (evaluationResult.ok) {
              const canonicalEvaluation = canonicalizeNoOpOriginalEvaluation(
                evaluationResult.evaluation,
                transcript,
                evaluationInput.evaluationMode,
              );
              const firstContract = validateOriginalEvaluationContract({
                evaluation: canonicalEvaluation,
                evaluationMode: evaluationInput.evaluationMode,
                answerShape,
                missionQuestion: missionQuestion ?? null,
                targetPattern,
                transcript,
              });

              if (firstContract.ok) {
                evaluationResult = {
                  ok: true,
                  evaluation: canonicalEvaluation,
                };
              } else {
                contractViolations = firstContract.violations;
                const repaired = await timeStage("evaluationRepair", () =>
                  evaluate({
                    ...evaluationInput,
                    policyRepair: { violations: firstContract.violations },
                  }),
                );

                if (!repaired.ok) {
                  evaluationResult = repaired;
                } else {
                  const canonicalRepair = canonicalizeNoOpOriginalEvaluation(
                    repaired.evaluation,
                    transcript,
                    evaluationInput.evaluationMode,
                  );
                  const repairedContract = validateOriginalEvaluationContract({
                    evaluation: canonicalRepair,
                    evaluationMode: evaluationInput.evaluationMode,
                    answerShape,
                    missionQuestion: missionQuestion ?? null,
                    targetPattern,
                    transcript,
                  });
                  if (repairedContract.ok) {
                    evaluationResult = {
                      ok: true,
                      evaluation: canonicalRepair,
                    };
                    contractViolations = [];
                  } else {
                    contractViolations = repairedContract.violations;
                    log("warn", "ai.original_evaluation_contract_rejected", {
                      violations: repairedContract.violations,
                    });
                    evaluationResult = {
                      ok: false,
                      error: "schema_failed",
                    };
                  }
                }
              }
            }

            if (
              !evaluationResult.ok &&
              evaluationResult.error === "schema_failed" &&
              snapshot.conversationMode === true &&
              isLowConfidenceTranscript(transcriptionEvidence.confidence)
            ) {
              evaluationResult = {
                ok: true,
                evaluation: {
                  ...fallbackProvenance,
                  version: AI_EVALUATION_VERSION,
                  outcome: "teacher_review",
                  meaningUnderstood: false,
                  targetPatternAttempted: false,
                  correctionNeeded: false,
                  correctionSeverity: "none",
                  correctionReason: "none",
                  improvedSentence: null,
                  englishLanguage: "uncertain",
                  confidence: "low",
                  reviewReason: "low_confidence",
                  evaluationSource: "deterministic",
                  hangulInterpretations: [],
                },
              };
            }

            // The gated decision is synthesized directly — no contract
            // canonicalization or repair round-trip, either: the transcript
            // is not trusted text, so spending another evaluation call to
            // repair a verdict about it would defeat the gate.
            const decision: OriginalTurnWriteDecision = lowConfidenceGateRetry
              ? {
                  evaluation: {
                    ...fallbackProvenance,
                    version: AI_EVALUATION_VERSION,
                    outcome: "retry_original",
                    confidence: "low",
                    reviewReason: null,
                    meaningUnderstood: false,
                    targetPatternAttempted: false,
                    englishLanguage: "uncertain",
                    correctionNeeded: false,
                    correctionSeverity: "none",
                    correctionReason: "none",
                    improvedSentence: null,
                    requireRepeat: false,
                    retryReason: "unclear_meaning",
                    ambiguityRetries: priorAmbiguityState(turn.evaluation)
                      .ambiguityRetries,
                    lowConfidenceAudioRetries: storedLowConfidenceRetries + 1,
                    hangulInterpretations: [],
                    evaluationSource: "deterministic",
                  },
                  targetAttempted: false,
                  improvedSentence: null,
                }
              : applyOriginalTurnEvaluation(
                  evaluationResult,
                  {
                    evaluationMode:
                      snapshot.conversationMode === true ? "conversation" : "preset",
                    missionQuestion: missionQuestion ?? null,
                    transcript,
                    priorMinimalEffortBlocks: minimalEffortBlocks,
                    priorAmbiguityRetries: ambiguityState.ambiguityRetries,
                  },
                  fallbackProvenance,
                );
            if (minimalEffortBlocks > 0) {
              decision.evaluation.minimalEffortBlocks = minimalEffortBlocks;
            }
            // Preserve how many free audio retries this turn has already
            // spent when the normal evaluation path takes over (gate
            // exhausted or confident decode) — the synthesized gated
            // decision sets it directly.
            const carriedLowConfidenceRetries = priorLowConfidenceAudioRetries(
              turn.evaluation,
            );
            if (!lowConfidenceGateRetry && carriedLowConfidenceRetries > 0) {
              decision.evaluation.lowConfidenceAudioRetries =
                carriedLowConfidenceRetries;
            }
            if (contractViolations.length > 0) {
              decision.evaluation.contractViolations = contractViolations;
              // Issue #65: a rejected verdict that policy repair could not
              // fix is a contract rejection, not a schema decode failure.
              // The synthesis path labels it failed_schema because that is
              // the only !ok error it can express; relabel here where the
              // violations are known. Genuine malformed-output failures carry
              // no violations and keep failed_schema.
              if (
                decision.evaluation.outcome === "teacher_review" &&
                decision.evaluation.reviewReason === FAILED_SCHEMA_REVIEW_REASON
              ) {
                decision.evaluation.reviewReason =
                  CONTRACT_REJECTED_REVIEW_REASON;
              }
            }
            if (
              snapshot.conversationMode !== true &&
              answerShape === "open" &&
              contractViolations.includes("unsupported_detail") &&
              minimalEffortBlocks === 0 &&
              (ambiguityState.ambiguityRetries ?? 0) === 0
            ) {
              const rejectedEvaluation = {
                ...decision.evaluation,
                outcome: "teacher_review" as const,
                meaningUnderstood: false,
                targetPatternAttempted: false,
                correctionNeeded: false,
                correctionSeverity: "none" as const,
                correctionReason: "none" as const,
                improvedSentence: null,
                englishLanguage: "uncertain" as const,
                confidence: "low" as const,
                reviewReason: "failed_schema" as const,
              };
              decision.evaluation.outcome = "retry_original";
              decision.evaluation.reviewReason = null;
              decision.evaluation.retryReason = "unclear_meaning";
              decision.evaluation.ambiguityRetries = 1;
              decision.evaluation.ambiguityHistory = [
                ...(ambiguityState.ambiguityHistory ?? []),
                {
                  transcript,
                  audioClipId: audioClip.id,
                  evaluation: rejectedEvaluation,
                },
              ];
            }
            if (
              snapshot.conversationMode === true &&
              decision.evaluation.outcome === "retry_original" &&
              decision.evaluation.retryReason === undefined &&
              evaluationResult.ok &&
              evaluationResult.evaluation.outcome === "teacher_review" &&
              (ambiguityState.ambiguityRetries ?? 0) <
                MAX_AMBIGUITY_RETRIES
            ) {
              const ambiguityRetries =
                (ambiguityState.ambiguityRetries ?? 0) + 1;
              decision.evaluation.retryReason = "unclear_meaning";
              decision.evaluation.ambiguityRetries = ambiguityRetries;
              decision.evaluation.ambiguityHistory = [
                ...(ambiguityState.ambiguityHistory ?? []),
                {
                  transcript,
                  audioClipId: audioClip.id,
                  evaluation: evaluationResult.evaluation,
                  question: missionQuestion ?? snapshot.turns[0]?.prompt ?? "",
                },
              ];
            } else if ((ambiguityState.ambiguityRetries ?? 0) > 0) {
              decision.evaluation.ambiguityRetries =
                ambiguityState.ambiguityRetries;
              decision.evaluation.ambiguityHistory =
                ambiguityState.ambiguityHistory;
            }
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
                  reply_hint_frame: replyHintFrame,
                },
                { onConflict: "attempt_id,turn_order" },
              ),
            );

            if (write.error || decision.evaluation.outcome !== "teacher_review") {
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
                    hangulInterpretations: [],
                  },
                }
              : await timeStage("evaluation", () => {
                  const evaluate = deps.evaluateRepeatTurn ?? evaluateRepeatTurn;
                  return evaluate({
                    originalTranscript: turn.original_transcript ?? "",
                    improvedSentence: repeatTarget,
                    targetPattern,
                    level: snapshot.level,
                    repeatTranscript: transcript,
                    koreanSpans,
                  });
                });
            // Count the repeat clips recorded for this turn, this one
            // included: the row was inserted before evaluation. The turn row
            // itself cannot supply this — each repeat overwrites the last —
            // so the clip table is the only durable tally.
            const { count: repeatClipCount } = await timeStage(
              "repeatAttemptCount",
              () =>
                supabase
                  .from("audio_clips")
                  .select("id", { count: "exact", head: true })
                  .eq("attempt_turn_id", turn.id)
                  .eq("clip_kind", "repeat_attempt"),
            );
            const decision = applyRepeatTurnEvaluation(
              evaluationResult,
              repeatClipCount ?? 1,
            );
            repeatEvaluation = decision;

            // The original and the repeat arrive as separate uploads, so the
            // in-memory value is normally undefined here; the row is the
            // durable source. Preserving it keeps correctionSeverity — the
            // reason the repeat was demanded — from being overwritten.
            const priorOriginalEvaluation =
              originalEvaluation ??
              (isStoredOriginalEvaluation(turn.evaluation)
                ? turn.evaluation
                : undefined);

            const write = await timeStage("turnWrite", () =>
              supabase
                .from("attempt_turns")
                .update({
                  repeat_transcript: transcript,
                  repeat_accepted: decision.repeatAccepted,
                  evaluation: toJson({
                    ...decision,
                    ...(priorOriginalEvaluation
                      ? { originalEvaluation: priorOriginalEvaluation }
                      : {}),
                  }),
                })
                .eq("id", turn.id),
            );

            if (write.error || decision.outcome !== "teacher_review") {
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
      input.clipKind === "original_answer"
    ) {
      const recoveryAttempt: 1 | 2 | null =
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
        recoveryAttempt === null &&
        originalEvaluation?.outcome === "retry_original" &&
        originalEvaluation.retryReason === "unclear_meaning" &&
        typeof originalEvaluation.lowConfidenceAudioRetries === "number" &&
        originalEvaluation.lowConfidenceAudioRetries > 0;
      const freeSameTurnRetry = recoveryAttempt !== null || lowConfidenceAudioRetry;
      const reviewPendingContinuation =
        originalEvaluation?.outcome === "teacher_review";
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
        const recoveryTopicSeed = snapshot.title;
        const deterministicPivot = buildDeterministicPivotQuestion({
          failedQuestion: failedRecoveryQuestion,
          topicSeed: recoveryTopicSeed,
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
            previouslyAsked: collectPreviouslyAskedQuestions({
              conversationHistory: historyResult.history,
              ambiguityHistory: originalEvaluation?.ambiguityHistory,
            }),
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
        if (originalEvaluation?.outcome !== "teacher_review") {
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
