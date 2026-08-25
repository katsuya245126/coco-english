import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Json } from "@/lib/db/types";
import {
  createOwnedSpeakingTryContext,
  type OwnedSpeakingTryContextInput,
} from "@/server/student-access/speaking-try-context";

type RpcArguments = {
  p_student_id: string;
  p_assignment_student_id: string;
  p_attempt_id: string;
  p_operation: string;
  p_payload: Record<string, Json>;
};

let attemptStatuses: Array<Database["public"]["Enums"]["attempt_status"]>;
let attemptLookupCount: number;
let upload: ReturnType<typeof vi.fn>;
let rpc: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    rpc,
    storage: {
      from: vi.fn(() => ({ upload })),
    },
  }),
}));

const snapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Soccer chat",
  targetPattern: "How often do you _____?",
  level: "elementary" as const,
  requiredTurns: 3,
  characterId: "default-buddy",
  conversationMode: true as const,
  requireCompleteSentenceAnswers: true,
  turns: [
    {
      turnOrder: 1,
      prompt: "How often do you play soccer?",
      targetExample: "I play soccer twice a week.",
      hintLadder: {
        tier1: "How often do you _____?",
        tier2: "once, twice, every day",
        tier3: "I play soccer twice a week.",
      },
      answerShape: "open" as const,
    },
  ],
};

const input: OwnedSpeakingTryContextInput = {
  studentId: "student-1",
  assignmentStudentId: "as-1",
  attemptId: "attempt-1",
  snapshot,
};

function rpcSuccess(value: unknown) {
  return { data: { ok: true, value }, error: null };
}

describe("owned speaking-try context", () => {
  beforeEach(() => {
    attemptStatuses = [];
    attemptLookupCount = 0;
    upload = vi.fn(async () => ({ error: null }));
    rpc = vi.fn(async (_name: string, args: RpcArguments) => {
      const status =
        attemptStatuses[attemptLookupCount++] ?? "in_progress";
      if (status !== "in_progress") {
        return { data: { ok: false, error: "not_found" }, error: null };
      }

      const payload = args.p_payload;
      if (
        payload.attempt_turn_id === "foreign-turn" ||
        payload.turn_id === "foreign-turn" ||
        payload.audio_clip_id === "foreign-clip" ||
        (args.p_operation === "update_clip" &&
          payload.object_key !== undefined &&
          payload.object_key !==
            "as-1/attempt-1/1/original_answer-clip-1.webm")
      ) {
        return { data: { ok: false, error: "not_found" }, error: null };
      }

      switch (args.p_operation) {
        case "initialize_turn":
          return rpcSuccess({
            id: "turn-1",
            original_transcript: null,
            improved_sentence: null,
            evaluation: {},
            coco_line: null,
          });
        case "insert_audio_clip":
          return rpcSuccess({ id: "clip-1" });
        case "authorize_storage_upload":
          return rpcSuccess({
            object_key: `as-1/attempt-1/${payload.turn_order}/${payload.clip_kind}-${payload.audio_clip_id}.webm`,
          });
        case "count_transcribed_repeat_clips":
          return rpcSuccess({ count: 0 });
        case "load_conversation_turns":
          return rpcSuccess([]);
        default:
          return rpcSuccess({ error: null });
      }
    });
  });

  it("uses one owned RPC per operation and rejects a status flip", async () => {
    attemptStatuses = ["in_progress", "completed"];
    const context = createOwnedSpeakingTryContext(input);

    expect(await context.initializeTurn(1)).toMatchObject({
      ok: true,
      value: { id: "turn-1" },
    });
    expect(await context.loadConversationTurns(2)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "owned_speaking_try_operation",
      expect.objectContaining({
        p_student_id: "student-1",
        p_assignment_student_id: "as-1",
        p_attempt_id: "attempt-1",
        p_operation: "initialize_turn",
      }),
    );
  });

  it("rejects foreign child identifiers before reads, writes, or storage", async () => {
    const context = createOwnedSpeakingTryContext(input);

    const foreignTurn = await context.insertAudioClip({
      attemptTurnId: "foreign-turn",
      clipKind: "original_answer",
    });
    const foreignClip = await context.markClipFailed({
      audioClipId: "foreign-clip",
      attemptTurnId: "turn-1",
      objectKey: "student-1/attempt-1/1/original_answer-foreign-clip.webm",
      mimeType: "audio/webm",
      durationMs: 1200,
      byteSize: 5,
    });
    const foreignScore = await context.writePronunciationScore({
      audioClipId: "foreign-clip",
      attemptTurnId: "turn-1",
      referenceText: "I play soccer.",
      accuracyScore: 90,
      fluencyScore: 90,
      completenessScore: 90,
      pronunciationScore: 90,
      starBand: 3,
      wordScores: [],
    });
    const foreignStorage = await context.uploadAudio({
      bucket: "student-audio",
      audioClipId: "foreign-clip",
      attemptTurnId: "turn-1",
      turnOrder: 1,
      clipKind: "original_answer",
      blob: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
    });

    expect(foreignTurn).toEqual({ ok: false, error: "not_found" });
    expect(foreignClip).toEqual({ ok: false, error: "not_found" });
    expect(foreignScore).toEqual({ ok: false, error: "not_found" });
    expect(foreignStorage).toEqual({ ok: false, error: "not_found" });
    expect(upload).not.toHaveBeenCalled();
    expect(
      rpc.mock.calls.map(
        (call) => (call[1] as RpcArguments).p_operation,
      ),
    ).toEqual([
      "insert_audio_clip",
      "update_clip",
      "write_pronunciation_score",
      "authorize_storage_upload",
    ]);
  });

  it("derives the storage key and authorizes it before crossing into Storage", async () => {
    const context = createOwnedSpeakingTryContext(input);

    const result = await context.uploadAudio({
      bucket: "student-audio",
      audioClipId: "clip-1",
      attemptTurnId: "turn-1",
      turnOrder: 1,
      clipKind: "original_answer",
      blob: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        objectKey: "as-1/attempt-1/1/original_answer-clip-1.webm",
      },
    });
    expect(rpc).toHaveBeenCalledWith(
      "owned_speaking_try_operation",
      expect.objectContaining({
        p_operation: "authorize_storage_upload",
        p_payload: expect.objectContaining({
          audio_clip_id: "clip-1",
          attempt_turn_id: "turn-1",
        }),
      }),
    );
    expect(
      (rpc.mock.calls.at(-1)?.[1] as RpcArguments).p_payload,
    ).not.toHaveProperty("object_key");
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith(
      "as-1/attempt-1/1/original_answer-clip-1.webm",
      expect.any(Blob),
      expect.objectContaining({ upsert: false }),
    );
  });

  it("rejects a caller-supplied foreign object key on an owned clip update", async () => {
    const context = createOwnedSpeakingTryContext(input);

    const result = await context.markClipFailed({
      audioClipId: "clip-1",
      attemptTurnId: "turn-1",
      objectKey: "as-1/attempt-1/99/original_answer-clip-1.webm",
      mimeType: "audio/webm",
      durationMs: 1200,
      byteSize: 5,
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});
