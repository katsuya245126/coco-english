import type { Database, Json } from "@/lib/db/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MissionSnapshot } from "@/domain/mission/schemas";
import type { PersistedConversationTurn } from "@/server/student-access/conversation-history";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type RpcPayload = Record<string, Json>;

export type OwnedSpeakingTryContextInput = {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  snapshot: MissionSnapshot;
};

export type OwnedSpeakingTryContextResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "not_found" | "db_error" };

export type SpeakingTryTurn = {
  id: string;
  original_transcript: string | null;
  improved_sentence: string | null;
  evaluation: unknown;
  coco_line: string | null;
};

type ClipMetadata = {
  audioClipId: string;
  attemptTurnId: string;
  objectKey?: string;
  mimeType: string;
  durationMs: number;
  byteSize: number;
};

type OriginalTurnWrite = {
  transcript: string;
  turnOrder: number;
  targetAttempted: boolean | null;
  improvedSentence: string | null;
  evaluation?: Json;
  replyHintFrame: string | null;
};

type RepeatTurnWrite = {
  turnId: string;
  transcript: string;
  repeatAccepted: boolean | null;
  evaluation: Json;
};

type CocoLineWrite = {
  turnOrder: number;
  cocoLine: string;
  moderationEvent?: Json | null;
  evaluation?: Json;
};

export type OwnedSpeakingTryContext = {
  readonly snapshot: MissionSnapshot;
  loadConversationTurns(
    turnOrder: number,
  ): Promise<OwnedSpeakingTryContextResult<PersistedConversationTurn[]>>;
  initializeTurn(
    turnOrder: number,
  ): Promise<OwnedSpeakingTryContextResult<SpeakingTryTurn>>;
  insertAudioClip(input: {
    attemptTurnId: string;
    clipKind: Database["public"]["Enums"]["audio_clip_kind"];
  }): Promise<OwnedSpeakingTryContextResult<{ id: string }>>;
  uploadAudio(input: {
    bucket: string;
    audioClipId: string;
    attemptTurnId: string;
    turnOrder: number;
    clipKind: Database["public"]["Enums"]["audio_clip_kind"];
    blob: Blob;
    mimeType: string;
  }): Promise<
    OwnedSpeakingTryContextResult<{
      objectKey: string;
      promise: Promise<{ error: { message: string } | null }>;
    }>
  >;
  markClipFailed(
    input: ClipMetadata,
  ): Promise<OwnedSpeakingTryContextResult<{ error: { message: string } | null }>>;
  finalizeClip(
    input: ClipMetadata,
  ): Promise<OwnedSpeakingTryContextResult<{ error: { message: string } | null }>>;
  countTranscribedRepeatClips(
    attemptTurnId: string,
  ): Promise<
    OwnedSpeakingTryContextResult<{
      count: number;
      error: { message: string } | null;
    }>
  >;
  writeGuardEvaluation(input: OriginalTurnWrite): Promise<
    OwnedSpeakingTryContextResult<{ error: { message: string } | null }>
  >;
  writeOriginalTurn(input: OriginalTurnWrite): Promise<
    OwnedSpeakingTryContextResult<{ error: { message: string } | null }>
  >;
  writeRepeatTurn(input: RepeatTurnWrite): Promise<
    OwnedSpeakingTryContextResult<{ error: { message: string } | null }>
  >;
  routeTeacherReview(
    reviewReason: string,
  ): Promise<OwnedSpeakingTryContextResult<{ error: { message: string } | null }>>;
  recordCocoLine(input: CocoLineWrite): Promise<
    OwnedSpeakingTryContextResult<{ error: { message: string } | null }>
  >;
  writePronunciationScore(input: {
    audioClipId: string;
    attemptTurnId: string;
    referenceText: string;
    accuracyScore: number;
    fluencyScore: number | null;
    completenessScore: number | null;
    pronunciationScore: number;
    starBand: number;
    wordScores: Json;
  }): Promise<
    OwnedSpeakingTryContextResult<{ error: { message: string } | null }>
  >;
};

type RpcResponse = {
  ok?: unknown;
  error?: unknown;
  value?: unknown;
};

function normalizeError(error: unknown): { message: string } | null {
  if (!error) return null;
  if (error instanceof Error) return { message: error.message };
  if (
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return { message: error.message };
  }
  return { message: String(error) };
}

function asRpcResponse(value: unknown): RpcResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RpcResponse;
}

export function createOwnedSpeakingTryContext(
  input: OwnedSpeakingTryContextInput,
): OwnedSpeakingTryContext {
  const supabase: ServiceClient = createSupabaseServiceClient();

  async function operation<T>(
    operationName: string,
    payload: RpcPayload,
    onDbError?: (error: unknown) => T,
  ): Promise<OwnedSpeakingTryContextResult<T>> {
    try {
      const { data, error } = await supabase.rpc(
        "owned_speaking_try_operation",
        {
          p_student_id: input.studentId,
          p_assignment_student_id: input.assignmentStudentId,
          p_attempt_id: input.attemptId,
          p_operation: operationName,
          p_payload: payload,
        },
      );
      if (error) {
        return onDbError
          ? { ok: true, value: onDbError(error) }
          : { ok: false, error: "db_error" };
      }

      const response = asRpcResponse(data);
      if (!response || response.ok !== true) {
        if (response?.error === "db_error" && onDbError) {
          return { ok: true, value: onDbError(response.error) };
        }
        return {
          ok: false,
          error: response?.error === "not_found" ? "not_found" : "db_error",
        };
      }
      return { ok: true, value: response.value as T };
    } catch {
      return { ok: false, error: "db_error" };
    }
  }

  async function updateClip(
    inputClip: ClipMetadata,
    processingStatus: Database["public"]["Enums"]["audio_processing_status"],
  ) {
    const payload: RpcPayload = {
      audio_clip_id: inputClip.audioClipId,
      attempt_turn_id: inputClip.attemptTurnId,
      mime_type: inputClip.mimeType,
      duration_ms: inputClip.durationMs,
      byte_size: inputClip.byteSize,
      processing_status: processingStatus,
    };
    if (inputClip.objectKey) payload.object_key = inputClip.objectKey;
    return operation<{ error: { message: string } | null }>(
      "update_clip",
      payload,
    );
  }

  return {
    snapshot: input.snapshot,

    async loadConversationTurns(turnOrder: number) {
      return operation<PersistedConversationTurn[]>(
        "load_conversation_turns",
        { turn_order: turnOrder },
      );
    },

    async initializeTurn(turnOrder: number) {
      return operation<SpeakingTryTurn>("initialize_turn", {
        turn_order: turnOrder,
      });
    },

    async insertAudioClip(clipInput: {
      attemptTurnId: string;
      clipKind: Database["public"]["Enums"]["audio_clip_kind"];
    }) {
      return operation<{ id: string }>("insert_audio_clip", {
        attempt_turn_id: clipInput.attemptTurnId,
        clip_kind: clipInput.clipKind,
      });
    },

    async uploadAudio(uploadInput: {
      bucket: string;
      audioClipId: string;
      attemptTurnId: string;
      turnOrder: number;
      clipKind: Database["public"]["Enums"]["audio_clip_kind"];
      blob: Blob;
      mimeType: string;
    }) {
      const expectedBucket =
        process.env.STUDENT_AUDIO_BUCKET || "student-audio";
      if (uploadInput.bucket !== expectedBucket) {
        return { ok: false as const, error: "not_found" as const };
      }

      // The caller cannot supply the object key. The owned RPC derives it from
      // immutable IDs, validates the child rows, and returns it before Storage
      // is touched. Storage has no transactional join to Postgres, so the
      // upload is the unavoidable boundary after operation-time authorization.
      const authorization = await operation<{ object_key: string }>(
        "authorize_storage_upload",
        {
          audio_clip_id: uploadInput.audioClipId,
          attempt_turn_id: uploadInput.attemptTurnId,
          turn_order: uploadInput.turnOrder,
          clip_kind: uploadInput.clipKind,
          mime_type: uploadInput.mimeType,
        },
      );
      if (!authorization.ok) return authorization;
      const objectKey = authorization.value?.object_key;
      if (typeof objectKey !== "string" || !objectKey) {
        return { ok: false, error: "db_error" };
      }

      try {
        return {
          ok: true as const,
          value: {
            objectKey,
            promise: supabase.storage
              .from(uploadInput.bucket)
              .upload(objectKey, uploadInput.blob, {
                contentType: uploadInput.mimeType,
                upsert: false,
              })
              .then((result) => ({ error: normalizeError(result.error) })),
          },
        };
      } catch {
        return { ok: false as const, error: "db_error" as const };
      }
    },

    async markClipFailed(clipInput: ClipMetadata) {
      return updateClip(clipInput, "failed");
    },

    async finalizeClip(clipInput: ClipMetadata) {
      return updateClip(clipInput, "transcribed");
    },

    async countTranscribedRepeatClips(attemptTurnId: string) {
      const result = await operation<{
        count: number;
        error?: { message: string } | null;
      }>(
        "count_transcribed_repeat_clips",
        { attempt_turn_id: attemptTurnId },
        (error) => ({ count: 0, error: normalizeError(error) }),
      );
      if (!result.ok) return result;
      return {
        ok: true as const,
        value: { count: result.value.count, error: result.value.error ?? null },
      };
    },

    async writeGuardEvaluation(writeInput: OriginalTurnWrite) {
      return operation<{ error: { message: string } | null }>(
        "write_guard_evaluation",
        {
          transcript: writeInput.transcript,
          turn_order: writeInput.turnOrder,
          target_attempted: false,
          improved_sentence: null,
          evaluation: writeInput.evaluation ?? null,
          reply_hint_frame: writeInput.replyHintFrame,
        },
      );
    },

    async writeOriginalTurn(writeInput: OriginalTurnWrite) {
      const payload: RpcPayload = {
        transcript: writeInput.transcript,
        turn_order: writeInput.turnOrder,
        target_attempted: writeInput.targetAttempted,
        improved_sentence: writeInput.improvedSentence,
        reply_hint_frame: writeInput.replyHintFrame,
      };
      if (writeInput.evaluation !== undefined) {
        payload.evaluation = writeInput.evaluation;
      }
      return operation<{ error: { message: string } | null }>(
        "write_original_turn",
        payload,
      );
    },

    async writeRepeatTurn(writeInput: RepeatTurnWrite) {
      return operation<{ error: { message: string } | null }>(
        "write_repeat_turn",
        {
          turn_id: writeInput.turnId,
          transcript: writeInput.transcript,
          repeat_accepted: writeInput.repeatAccepted,
          evaluation: writeInput.evaluation,
        },
      );
    },

    async routeTeacherReview(reviewReason: string) {
      return operation<{ error: { message: string } | null }>(
        "route_teacher_review",
        { review_reason: reviewReason },
      );
    },

    async recordCocoLine(lineInput: CocoLineWrite) {
      const payload: RpcPayload = {
        turn_order: lineInput.turnOrder,
        coco_line: lineInput.cocoLine,
        moderation_event: lineInput.moderationEvent ?? null,
      };
      if (lineInput.evaluation !== undefined) {
        payload.evaluation = lineInput.evaluation;
      }
      return operation<{ error: { message: string } | null }>(
        "record_coco_line",
        payload,
      );
    },

    async writePronunciationScore(scoreInput: {
      audioClipId: string;
      attemptTurnId: string;
      referenceText: string;
      accuracyScore: number;
      fluencyScore: number | null;
      completenessScore: number | null;
      pronunciationScore: number;
      starBand: number;
      wordScores: Json;
    }) {
      return operation<{ error: { message: string } | null }>(
        "write_pronunciation_score",
        {
          audio_clip_id: scoreInput.audioClipId,
          attempt_turn_id: scoreInput.attemptTurnId,
          reference_text: scoreInput.referenceText,
          accuracy_score: scoreInput.accuracyScore,
          fluency_score: scoreInput.fluencyScore,
          completeness_score: scoreInput.completenessScore,
          pronunciation_score: scoreInput.pronunciationScore,
          star_band: scoreInput.starBand,
          word_scores: scoreInput.wordScores,
        },
      );
    },
  };
}
