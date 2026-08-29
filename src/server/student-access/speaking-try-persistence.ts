import type { Database, Json } from "@/lib/db/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { PersistedConversationTurn } from "@/server/student-access/conversation-history";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type RpcPayload = Record<string, Json>;
type AudioClipKind = Database["public"]["Enums"]["audio_clip_kind"];
type AudioProcessingStatus =
  Database["public"]["Enums"]["audio_processing_status"];
const DEFAULT_AUDIO_BUCKET = "student-audio";

export type PrepareOwnedSpeakingTryInput = {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  conversationMode: boolean;
  turnOrder: number;
  clipKind: AudioClipKind;
  mimeType: string;
  durationMs: number;
  byteSize: number;
};

export type OwnedSpeakingTryPersistenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "not_found" | "db_error" };

export type SpeakingTryTurn = {
  id: string;
  original_transcript: string | null;
  improved_sentence: string | null;
  evaluation: unknown;
  coco_line: string | null;
};

type PersistedWriteResult = { error: { message: string } | null };

type TurnPersistence =
  | {
      kind: "guard";
      transcript: string;
      evaluation: Json;
      replyHintFrame: string | null;
    }
  | {
      kind: "original";
      transcript: string;
      targetAttempted: boolean | null;
      improvedSentence: string | null;
      evaluation?: Json;
      replyHintFrame: string | null;
      reviewReason?: string | null;
    }
  | {
      kind: "repeat";
      transcript: string;
      repeatAccepted: boolean | null;
      evaluation: Json;
      reviewReason?: string | null;
    };

type CocoLinePersistence = {
  cocoLine: string;
  moderationEvent?: Json | null;
  evaluation?: Json;
};

type PronunciationScorePersistence = {
  referenceText: string;
  accuracyScore: number;
  fluencyScore: number | null;
  completenessScore: number | null;
  pronunciationScore: number;
  starBand: number;
  wordScores: Json;
};

type UploadPromise = Promise<{ error: { message: string } | null }>;

export type OwnedSpeakingTryPersistence = {
  readonly turn: SpeakingTryTurn;
  readConversationHistory(): Promise<
    OwnedSpeakingTryPersistenceResult<PersistedConversationTurn[]>
  >;
  createClip(blob: Blob): Promise<
    OwnedSpeakingTryPersistenceResult<{
      audioClipId: string;
      uploadPromise: UploadPromise;
    }>
  >;
  readRepeatEvaluationContext(): Promise<
    OwnedSpeakingTryPersistenceResult<{
      count: number;
      error: { message: string } | null;
    }>
  >;
  persistTurn(
    input: TurnPersistence,
  ): Promise<OwnedSpeakingTryPersistenceResult<PersistedWriteResult>>;
  persistCocoLine(
    input: CocoLinePersistence,
  ): Promise<OwnedSpeakingTryPersistenceResult<PersistedWriteResult>>;
  persistPronunciation(
    input: PronunciationScorePersistence,
  ): Promise<OwnedSpeakingTryPersistenceResult<PersistedWriteResult>>;
  complete(): Promise<
    OwnedSpeakingTryPersistenceResult<PersistedWriteResult>
  >;
  failFromExternalError(): Promise<void>;
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

export async function prepareOwnedSpeakingTry(
  input: PrepareOwnedSpeakingTryInput,
): Promise<OwnedSpeakingTryPersistenceResult<OwnedSpeakingTryPersistence>> {
  const supabase: ServiceClient = createSupabaseServiceClient();

  async function operation<T>(
    operationName: string,
    payload: RpcPayload,
    onDbError?: (error: unknown) => T,
  ): Promise<OwnedSpeakingTryPersistenceResult<T>> {
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

  const needsConversationHistory =
    input.conversationMode &&
    input.clipKind === "original_answer" &&
    input.turnOrder > 1;
  const preloadedConversationHistory = needsConversationHistory
    ? await operation<PersistedConversationTurn[]>(
        "load_conversation_turns",
        { turn_order: input.turnOrder },
      )
    : null;
  if (preloadedConversationHistory && !preloadedConversationHistory.ok) {
    return preloadedConversationHistory;
  }

  const turnResult = await operation<SpeakingTryTurn>("initialize_turn", {
    turn_order: input.turnOrder,
  });
  if (!turnResult.ok) return turnResult;

  const turn = turnResult.value;
  let audioClipId: string | null = null;
  let objectKey: string | null = null;

  async function updateClip(
    processingStatus: AudioProcessingStatus,
    includeObjectKey = true,
  ): Promise<OwnedSpeakingTryPersistenceResult<PersistedWriteResult>> {
    if (!audioClipId) return { ok: false, error: "not_found" };

    const payload: RpcPayload = {
      audio_clip_id: audioClipId,
      attempt_turn_id: turn.id,
      mime_type: input.mimeType,
      duration_ms: input.durationMs,
      byte_size: input.byteSize,
      processing_status: processingStatus,
    };
    if (includeObjectKey && objectKey) payload.object_key = objectKey;
    return operation<PersistedWriteResult>("update_clip", payload);
  }

  async function persistWrite(
    operationName: string,
    payload: RpcPayload,
    reviewReason?: string | null,
  ): Promise<OwnedSpeakingTryPersistenceResult<PersistedWriteResult>> {
    const write = await operation<PersistedWriteResult>(operationName, payload);
    if (!write.ok) return write;
    if (write.value.error) {
      await updateClip("failed");
      return write;
    }
    if (!reviewReason) return write;

    const review = await operation<PersistedWriteResult>("route_teacher_review", {
      review_reason: reviewReason,
    });
    if (!review.ok) {
      await updateClip("failed");
      return { ok: true, value: { error: { message: review.error } } };
    }
    if (review.value.error) {
      await updateClip("failed");
      return review;
    }
    return write;
  }

  return {
    ok: true,
    value: {
      turn,

      async readConversationHistory() {
        if (preloadedConversationHistory) return preloadedConversationHistory;
        return operation<PersistedConversationTurn[]>(
          "load_conversation_turns",
          { turn_order: input.turnOrder },
        );
      },

      async createClip(blob: Blob) {
        const inserted = await operation<{ id: string }>("insert_audio_clip", {
          attempt_turn_id: turn.id,
          clip_kind: input.clipKind,
        });
        if (!inserted.ok) return inserted;
        audioClipId = inserted.value.id;

        const authorization = await operation<{ object_key: string }>(
          "authorize_storage_upload",
          {
            audio_clip_id: audioClipId,
            attempt_turn_id: turn.id,
            turn_order: input.turnOrder,
            clip_kind: input.clipKind,
            mime_type: input.mimeType,
          },
        );
        if (!authorization.ok) return authorization;
        if (
          typeof authorization.value?.object_key !== "string" ||
          !authorization.value.object_key
        ) {
          return { ok: false as const, error: "db_error" as const };
        }
        objectKey = authorization.value.object_key;
        const bucket = process.env.STUDENT_AUDIO_BUCKET || DEFAULT_AUDIO_BUCKET;

        try {
          return {
            ok: true as const,
            value: {
              audioClipId,
              uploadPromise: supabase.storage
                .from(bucket)
                .upload(objectKey, blob, {
                  contentType: input.mimeType,
                  upsert: false,
                })
                .then(async (result) => {
                  const error = normalizeError(result.error);
                  if (error) await updateClip("failed", false);
                  return { error };
                }),
            },
          };
        } catch {
          return { ok: false as const, error: "db_error" as const };
        }
      },

      async readRepeatEvaluationContext() {
        const result = await operation<{
          count: number;
          error?: { message: string } | null;
        }>(
          "count_transcribed_repeat_clips",
          { attempt_turn_id: turn.id },
          (error) => ({ count: 0, error: normalizeError(error) }),
        );
        if (!result.ok) return result;
        if (result.value.error) await updateClip("failed");
        return {
          ok: true as const,
          value: { count: result.value.count, error: result.value.error ?? null },
        };
      },

      async persistTurn(turnInput) {
        if (turnInput.kind === "guard") {
          return operation<PersistedWriteResult>("write_guard_evaluation", {
            transcript: turnInput.transcript,
            turn_order: input.turnOrder,
            target_attempted: false,
            improved_sentence: null,
            evaluation: turnInput.evaluation,
            reply_hint_frame: turnInput.replyHintFrame,
          });
        }
        if (turnInput.kind === "repeat") {
          return persistWrite(
            "write_repeat_turn",
            {
              turn_id: turn.id,
              transcript: turnInput.transcript,
              repeat_accepted: turnInput.repeatAccepted,
              evaluation: turnInput.evaluation,
            },
            turnInput.reviewReason,
          );
        }

        const payload: RpcPayload = {
          transcript: turnInput.transcript,
          turn_order: input.turnOrder,
          target_attempted: turnInput.targetAttempted,
          improved_sentence: turnInput.improvedSentence,
          reply_hint_frame: turnInput.replyHintFrame,
        };
        if (turnInput.evaluation !== undefined) {
          payload.evaluation = turnInput.evaluation;
        }
        return persistWrite(
          "write_original_turn",
          payload,
          turnInput.reviewReason,
        );
      },

      async persistCocoLine(lineInput) {
        const payload: RpcPayload = {
          turn_order: input.turnOrder,
          coco_line: lineInput.cocoLine,
          moderation_event: lineInput.moderationEvent ?? null,
        };
        if (lineInput.evaluation !== undefined) {
          payload.evaluation = lineInput.evaluation;
        }
        const result = await operation<PersistedWriteResult>(
          "record_coco_line",
          payload,
        );
        if (!result.ok || result.value.error) await updateClip("failed");
        return result;
      },

      async persistPronunciation(scoreInput) {
        if (!audioClipId) return { ok: false as const, error: "not_found" as const };
        return operation<PersistedWriteResult>("write_pronunciation_score", {
          audio_clip_id: audioClipId,
          attempt_turn_id: turn.id,
          reference_text: scoreInput.referenceText,
          accuracy_score: scoreInput.accuracyScore,
          fluency_score: scoreInput.fluencyScore,
          completeness_score: scoreInput.completenessScore,
          pronunciation_score: scoreInput.pronunciationScore,
          star_band: scoreInput.starBand,
          word_scores: scoreInput.wordScores,
        });
      },

      async complete() {
        return updateClip("transcribed");
      },

      async failFromExternalError() {
        if (!audioClipId) return;
        await updateClip("failed");
      },
    },
  };
}
