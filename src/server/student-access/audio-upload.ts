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
import {
  AI_EVALUATION_VERSION,
  decideOriginalTurnOutcome,
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
import { transcribeAudioFile } from "@/server/audio/transcription";
import {
  evaluateOriginalTurn,
  evaluateRepeatTurn,
  type OriginalTurnEvaluationResult,
  type RepeatTurnEvaluationResult,
} from "@/server/ai/turn-evaluator";

const DEFAULT_AUDIO_BUCKET = "student-audio";
const FAILED_SCHEMA_REVIEW_REASON = "failed_schema";
const LOW_CONFIDENCE_REVIEW_REASON = "low_confidence";

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

export type UploadAttemptAudioClipResult =
  | {
      ok: true;
      audioClipId: string;
      processingStatus: "transcribed";
      transcript: string;
      evaluation?: StoredOriginalTurnEvaluation | StoredRepeatTurnEvaluation;
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

  const decision = decideOriginalTurnOutcome(result.evaluation);
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
  return (
    Number.isInteger(input.turnOrder) &&
    input.turnOrder > 0 &&
    Number.isInteger(input.durationMs) &&
    input.durationMs >= 0 &&
    Number.isInteger(input.byteSize) &&
    input.byteSize > 0 &&
    input.mimeType.trim().startsWith("audio/")
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

export async function uploadAttemptAudioClip(
  input: UploadAttemptAudioClipInput,
  deps: UploadAttemptAudioClipDeps = {},
): Promise<UploadAttemptAudioClipResult> {
  if (!isValidInput(input)) {
    return { ok: false, error: "invalid_audio", retryable: false };
  }

  try {
    const supabase = createSupabaseServiceClient();

    const { data: assignmentStudent, error: assignmentError } = await supabase
      .from("assignment_students")
      .select("id, student_id, assignments(mission_snapshot)")
      .eq("id", input.assignmentStudentId)
      .eq("student_id", input.studentId)
      .maybeSingle();

    if (assignmentError) {
      return { ok: false, error: "db_error", retryable: true };
    }
    if (!assignmentStudent) {
      return { ok: false, error: "not_found", retryable: false };
    }

    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("id, assignment_student_id")
      .eq("id", input.attemptId)
      .eq("assignment_student_id", input.assignmentStudentId)
      .maybeSingle();

    if (attemptError) {
      return { ok: false, error: "db_error", retryable: true };
    }
    if (!attempt) {
      return { ok: false, error: "not_found", retryable: false };
    }

    const { data: turn, error: turnError } = await supabase
      .from("attempt_turns")
      .upsert(
        {
          attempt_id: input.attemptId,
          turn_order: input.turnOrder,
        },
        { onConflict: "attempt_id,turn_order" },
      )
      .select("id, original_transcript, improved_sentence")
      .single();

    if (turnError || !turn) {
      return { ok: false, error: "db_error", retryable: true };
    }

    const { data: audioClip, error: clipError } = await supabase
      .from("audio_clips")
      .insert({
        attempt_turn_id: turn.id,
        clip_kind: input.clipKind,
        processing_status: "pending_upload",
      })
      .select("id")
      .single();

    if (clipError || !audioClip) {
      return { ok: false, error: "db_error", retryable: true };
    }

    const objectKey = buildObjectKey({
      assignmentStudentId: input.assignmentStudentId,
      attemptId: input.attemptId,
      turnOrder: input.turnOrder,
      clipKind: input.clipKind,
      audioClipId: audioClip.id,
      mimeType: input.mimeType,
    });

    const { error: uploadError } = await supabase.storage
      .from(getStudentAudioBucketId())
      .upload(objectKey, input.file, {
        contentType: input.mimeType,
        upsert: false,
      });

    if (uploadError) {
      await supabase
        .from("audio_clips")
        .update({
          processing_status: "failed",
          mime_type: input.mimeType,
          duration_ms: input.durationMs,
          byte_size: input.byteSize,
        })
        .eq("id", audioClip.id);

      return {
        ok: false,
        error: "upload_failed_retryable",
        retryable: true,
      };
    }

    const transcribe = deps.transcribeAudioFile ?? transcribeAudioFile;
    const transcription = await transcribe({
      file: input.file,
      mimeType: input.mimeType,
    });

    if (!transcription.ok) {
      await supabase
        .from("audio_clips")
        .update({
          object_key: objectKey,
          mime_type: input.mimeType,
          duration_ms: input.durationMs,
          byte_size: input.byteSize,
          processing_status: "failed",
        })
        .eq("id", audioClip.id);

      return {
        ok: false,
        error: "transcription_failed_retryable",
        retryable: true,
      };
    }

    const transcript = transcription.text;
    let originalEvaluation: StoredOriginalTurnEvaluation | undefined;
    let repeatEvaluation: StoredRepeatTurnEvaluation | undefined;
    const turnWrite =
      input.clipKind === "original_answer"
        ? await (async () => {
            const snapshot = readMissionSnapshot(assignmentStudent);
            const snapshotTurn = snapshot?.turns.find(
              (missionTurn) => missionTurn.turnOrder === input.turnOrder,
            );
            const evaluate = deps.evaluateOriginalTurn ?? evaluateOriginalTurn;
            const evaluationResult = await evaluate({
              missionQuestion: snapshotTurn?.prompt ?? "",
              targetPattern: snapshot?.targetPattern ?? "",
              targetExample: snapshotTurn?.targetExample ?? "",
              level: snapshot?.level ?? "elementary",
              turnOrder: input.turnOrder,
              transcript,
            });
            const decision = applyOriginalTurnEvaluation(evaluationResult);
            originalEvaluation = decision.evaluation;

            return supabase.from("attempt_turns").upsert(
              {
                attempt_id: input.attemptId,
                turn_order: input.turnOrder,
                original_transcript: transcript,
                target_attempted: decision.targetAttempted,
                improved_sentence: decision.improvedSentence,
                evaluation: toJson(decision.evaluation),
              },
              { onConflict: "attempt_id,turn_order" },
            );
          })()
        : await (async () => {
            const snapshot = readMissionSnapshot(assignmentStudent);
            const snapshotTurn = snapshot?.turns.find(
              (missionTurn) => missionTurn.turnOrder === input.turnOrder,
            );
            const evaluate = deps.evaluateRepeatTurn ?? evaluateRepeatTurn;
            const evaluationResult = await evaluate({
              originalTranscript: turn.original_transcript ?? "",
              improvedSentence:
                turn.improved_sentence ?? snapshotTurn?.targetExample ?? "",
              targetPattern: snapshot?.targetPattern ?? "",
              level: snapshot?.level ?? "elementary",
              repeatTranscript: transcript,
            });
            const decision = applyRepeatTurnEvaluation(evaluationResult);
            repeatEvaluation = decision;

            return supabase
              .from("attempt_turns")
              .update({
                repeat_transcript: transcript,
                repeat_accepted: decision.repeatAccepted,
                evaluation: toJson(decision),
              })
              .eq("id", turn.id);
          })();

    if (turnWrite.error) {
      await supabase
        .from("audio_clips")
        .update({
          object_key: objectKey,
          mime_type: input.mimeType,
          duration_ms: input.durationMs,
          byte_size: input.byteSize,
          processing_status: "failed",
        })
        .eq("id", audioClip.id);

      return { ok: false, error: "db_error", retryable: true };
    }

    const { error: updateError } = await supabase
      .from("audio_clips")
      .update({
        object_key: objectKey,
        mime_type: input.mimeType,
        duration_ms: input.durationMs,
        byte_size: input.byteSize,
        processing_status: "transcribed",
      })
      .eq("id", audioClip.id);

    if (updateError) {
      return { ok: false, error: "db_error", retryable: true };
    }

    return {
      ok: true,
      audioClipId: audioClip.id,
      processingStatus: "transcribed",
      transcript,
      evaluation: originalEvaluation ?? repeatEvaluation,
    };
  } catch {
    return { ok: false, error: "db_error", retryable: true };
  }
}
