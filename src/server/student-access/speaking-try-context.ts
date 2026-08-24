import type { Database, Json } from "@/lib/db/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MissionSnapshot } from "@/domain/mission/schemas";
import type { PersistedConversationTurn } from "@/server/student-access/conversation-history";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

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
  moderationEvent?: unknown | null;
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
    objectKey: string;
    blob: Blob;
    mimeType: string;
  }): Promise<
    OwnedSpeakingTryContextResult<{
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

type GuardResult = OwnedSpeakingTryContextResult<void>;

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

function queryError(error: unknown): { message: string } | null {
  return normalizeError(error);
}

function failed(error: "not_found" | "db_error"): GuardResult {
  return { ok: false, error };
}

export function createOwnedSpeakingTryContext(
  input: OwnedSpeakingTryContextInput,
): OwnedSpeakingTryContext {
  const supabase: ServiceClient = createSupabaseServiceClient();

  async function proveCurrentOwnership(): Promise<GuardResult> {
    try {
      const { data: assignment, error: assignmentError } = await supabase
        .from("assignment_students")
        .select("id, student_id, status, assignments(canceled_at)")
        .eq("id", input.assignmentStudentId)
        .eq("student_id", input.studentId)
        .maybeSingle();

      if (assignmentError) return failed("db_error");
      const assignmentRow = assignment as
        | {
            status?: string;
            assignments?: { canceled_at?: string | null } | null;
          }
        | null;
      if (
        !assignmentRow ||
        assignmentRow.status !== "started" ||
        assignmentRow.assignments?.canceled_at
      ) {
        return failed("not_found");
      }

      const { data: attempt, error: attemptError } = await supabase
        .from("attempts")
        .select("id")
        .eq("id", input.attemptId)
        .eq("assignment_student_id", input.assignmentStudentId)
        .eq("status", "in_progress")
        .maybeSingle();

      if (attemptError) return failed("db_error");
      return attempt ? { ok: true, value: undefined } : failed("not_found");
    } catch {
      return failed("db_error");
    }
  }

  async function guarded<T>(
    operation: () => T | PromiseLike<T>,
  ): Promise<OwnedSpeakingTryContextResult<T>> {
    const proof = await proveCurrentOwnership();
    if (!proof.ok) return proof;

    try {
      return { ok: true, value: await operation() };
    } catch {
      return { ok: false, error: "db_error" };
    }
  }

  async function writeQuery(
    operation: () => PromiseLike<{ error: unknown }>,
  ): Promise<{ error: { message: string } | null }> {
    const result = await operation();
    return { error: queryError(result.error) };
  }

  async function updateClip(
    inputClip: ClipMetadata,
    processingStatus: Database["public"]["Enums"]["audio_processing_status"],
  ) {
    return guarded(() =>
      writeQuery(() =>
        supabase
          .from("audio_clips")
          .update({
            ...(inputClip.objectKey ? { object_key: inputClip.objectKey } : {}),
            mime_type: inputClip.mimeType,
            duration_ms: inputClip.durationMs,
            byte_size: inputClip.byteSize,
            processing_status: processingStatus,
          })
          .eq("id", inputClip.audioClipId)
          .eq("attempt_turn_id", inputClip.attemptTurnId),
      ),
    );
  }

  return {
    snapshot: input.snapshot,

    async loadConversationTurns(turnOrder: number) {
      return guarded(async () => {
        const { data, error } = await supabase
          .from("attempt_turns")
          .select(
            "turn_order, original_transcript, improved_sentence, coco_line, evaluation",
          )
          .eq("attempt_id", input.attemptId)
          .lt("turn_order", turnOrder)
          .order("turn_order", { ascending: true });
        if (error) throw error;
        return (data ?? []) as PersistedConversationTurn[];
      });
    },

    async initializeTurn(turnOrder: number) {
      return guarded(async () => {
        const { data, error } = await supabase
          .from("attempt_turns")
          .upsert(
            {
              attempt_id: input.attemptId,
              turn_order: turnOrder,
            },
            { onConflict: "attempt_id,turn_order" },
          )
          .select(
            "id, original_transcript, improved_sentence, evaluation, coco_line",
          )
          .single();
        if (error || !data) throw error ?? new Error("turn missing");
        return data as SpeakingTryTurn;
      });
    },

    async insertAudioClip(clipInput: {
      attemptTurnId: string;
      clipKind: Database["public"]["Enums"]["audio_clip_kind"];
    }) {
      return guarded(async () => {
        const { data, error } = await supabase
          .from("audio_clips")
          .insert({
            attempt_turn_id: clipInput.attemptTurnId,
            clip_kind: clipInput.clipKind,
            processing_status: "pending_upload",
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("clip missing");
        return data;
      });
    },

    async uploadAudio(uploadInput: {
      bucket: string;
      objectKey: string;
      blob: Blob;
      mimeType: string;
    }) {
      return guarded(() => ({
        promise: supabase.storage
          .from(uploadInput.bucket)
          .upload(uploadInput.objectKey, uploadInput.blob, {
            contentType: uploadInput.mimeType,
            upsert: false,
          })
          .then((result) => ({ error: queryError(result.error) })),
      }));
    },

    async markClipFailed(clipInput: ClipMetadata) {
      return updateClip(clipInput, "failed");
    },

    async finalizeClip(clipInput: ClipMetadata) {
      return updateClip(clipInput, "transcribed");
    },

    async countTranscribedRepeatClips(attemptTurnId: string) {
      return guarded(async () => {
        const { count, error } = await supabase
          .from("audio_clips")
          .select("id", { count: "exact", head: true })
          .eq("attempt_turn_id", attemptTurnId)
          .eq("clip_kind", "repeat_attempt")
          .eq("processing_status", "transcribed");
        return { count: count ?? 0, error: queryError(error) };
      });
    },

    async writeGuardEvaluation(writeInput: OriginalTurnWrite) {
      return guarded(() =>
        writeQuery(() =>
          supabase.from("attempt_turns").upsert(
            {
              attempt_id: input.attemptId,
              turn_order: writeInput.turnOrder,
              original_transcript: writeInput.transcript,
              target_attempted: false,
              improved_sentence: null,
              evaluation: writeInput.evaluation,
              reply_hint_frame: writeInput.replyHintFrame,
            },
            { onConflict: "attempt_id,turn_order" },
          ),
        ),
      );
    },

    async writeOriginalTurn(writeInput: OriginalTurnWrite) {
      return guarded(() =>
        writeQuery(() =>
          supabase.from("attempt_turns").upsert(
            {
              attempt_id: input.attemptId,
              turn_order: writeInput.turnOrder,
              original_transcript: writeInput.transcript,
              target_attempted: writeInput.targetAttempted,
              improved_sentence: writeInput.improvedSentence,
              ...(writeInput.evaluation === undefined
                ? {}
                : { evaluation: writeInput.evaluation }),
              reply_hint_frame: writeInput.replyHintFrame,
            },
            { onConflict: "attempt_id,turn_order" },
          ),
        ),
      );
    },

    async writeRepeatTurn(writeInput: RepeatTurnWrite) {
      return guarded(() =>
        writeQuery(() =>
          supabase
            .from("attempt_turns")
            .update({
              repeat_transcript: writeInput.transcript,
              repeat_accepted: writeInput.repeatAccepted,
              evaluation: writeInput.evaluation,
            })
            .eq("id", writeInput.turnId)
            .eq("attempt_id", input.attemptId),
        ),
      );
    },

    async routeTeacherReview(reviewReason: string) {
      return guarded(() =>
        writeQuery(() =>
          supabase
            .from("attempts")
            .update({ needs_review_reason: reviewReason })
            .eq("id", input.attemptId)
            .eq("assignment_student_id", input.assignmentStudentId)
            .eq("status", "in_progress"),
        ),
      );
    },

    async recordCocoLine(lineInput: CocoLineWrite) {
      return guarded(() =>
        writeQuery(() =>
          supabase.from("attempt_turns").upsert(
            {
              attempt_id: input.attemptId,
              turn_order: lineInput.turnOrder,
              coco_line: lineInput.cocoLine,
              moderation_event: (lineInput.moderationEvent ?? null) as Json,
              ...(lineInput.evaluation === undefined
                ? {}
                : { evaluation: lineInput.evaluation }),
            },
            { onConflict: "attempt_id,turn_order" },
          ),
        ),
      );
    },

    async writePronunciationScore(scoreInput: {
      audioClipId: string;
      referenceText: string;
      accuracyScore: number;
      fluencyScore: number | null;
      completenessScore: number | null;
      pronunciationScore: number;
      starBand: number;
      wordScores: Json;
    }) {
      return guarded(() =>
        writeQuery(() =>
          supabase.from("pronunciation_scores").upsert(
            {
              audio_clip_id: scoreInput.audioClipId,
              provider: "azure_speech",
              reference_text: scoreInput.referenceText,
              accuracy_score: scoreInput.accuracyScore,
              fluency_score: scoreInput.fluencyScore,
              completeness_score: scoreInput.completenessScore,
              pronunciation_score: scoreInput.pronunciationScore,
              star_band: scoreInput.starBand,
              word_scores: scoreInput.wordScores,
            },
            { onConflict: "audio_clip_id" },
          ),
        ),
      );
    },
  };
}
