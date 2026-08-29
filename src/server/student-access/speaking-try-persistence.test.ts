import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Json } from "@/lib/db/types";
import {
  prepareOwnedSpeakingTry,
  type OwnedSpeakingTryPersistence,
  type PrepareOwnedSpeakingTryInput,
} from "@/server/student-access/speaking-try-persistence";

type RpcArguments = {
  p_student_id: string;
  p_assignment_student_id: string;
  p_attempt_id: string;
  p_operation: string;
  p_payload: Record<string, Json>;
};

let rpc: ReturnType<typeof vi.fn>;
let upload: ReturnType<typeof vi.fn>;
let rpcError: { message: string } | null;
let failedOperation: string | null;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    rpc,
    storage: {
      from: vi.fn(() => ({ upload })),
    },
  }),
}));

const input: PrepareOwnedSpeakingTryInput = {
  studentId: "student-1",
  assignmentStudentId: "as-1",
  attemptId: "attempt-1",
  conversationMode: true,
  turnOrder: 1,
  clipKind: "original_answer" satisfies Database["public"]["Enums"]["audio_clip_kind"],
  mimeType: "audio/webm",
  durationMs: 1200,
  byteSize: 5,
};

function rpcSuccess(value: unknown) {
  return { data: { ok: true, value }, error: null };
}

async function prepare(): Promise<OwnedSpeakingTryPersistence> {
  const result = await prepareOwnedSpeakingTry(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function operations() {
  return rpc.mock.calls.map(
    (call) => (call[1] as RpcArguments).p_operation,
  );
}

describe("owned speaking-try persistence", () => {
  beforeEach(() => {
    rpcError = null;
    failedOperation = null;
    upload = vi.fn(async () => ({ error: null }));
    rpc = vi.fn(async (_name: string, args: RpcArguments) => {
      if (rpcError) return { data: null, error: rpcError };
      if (args.p_operation === failedOperation) {
        return rpcSuccess({ error: { message: "write failed" } });
      }

      switch (args.p_operation) {
        case "initialize_turn":
          return rpcSuccess({
            id: "turn-1",
            original_transcript: null,
            improved_sentence: null,
            evaluation: null,
            coco_line: null,
          });
        case "load_conversation_turns":
          return rpcSuccess([]);
        case "insert_audio_clip":
          return rpcSuccess({ id: "clip-1" });
        case "authorize_storage_upload":
          return rpcSuccess({
            object_key: "as-1/attempt-1/1/original_answer-clip-1.webm",
          });
        case "count_transcribed_repeat_clips":
          return rpcSuccess({ count: 2 });
        default:
          return rpcSuccess({ error: null });
      }
    });
  });

  it("prepares a caller-focused handle around one initialized owned turn", async () => {
    const persistence = await prepare();

    expect(persistence.turn).toMatchObject({ id: "turn-1" });
    expect(operations()).toEqual(["initialize_turn"]);
    expect(rpc).toHaveBeenCalledWith(
      "owned_speaking_try_operation",
      expect.objectContaining({
        p_student_id: "student-1",
        p_assignment_student_id: "as-1",
        p_attempt_id: "attempt-1",
        p_operation: "initialize_turn",
        p_payload: { turn_order: 1 },
      }),
    );
  });

  it("owns history, clip creation, storage authorization, and upload launch", async () => {
    const persistence = await prepare();

    expect(await persistence.readConversationHistory()).toEqual({
      ok: true,
      value: [],
    });
    const clip = await persistence.createClip(
      new Blob(["voice"], { type: "audio/webm" }),
    );

    expect(clip).toMatchObject({
      ok: true,
      value: {
        audioClipId: "clip-1",
      },
    });
    if (!clip.ok) throw new Error(clip.error);
    await clip.value.uploadPromise;

    expect(operations()).toEqual([
      "initialize_turn",
      "load_conversation_turns",
      "insert_audio_clip",
      "authorize_storage_upload",
    ]);
    expect(upload).toHaveBeenCalledWith(
      "as-1/attempt-1/1/original_answer-clip-1.webm",
      expect.any(Blob),
      expect.objectContaining({ contentType: "audio/webm", upsert: false }),
    );
  });

  it("reads required conversation history before creating the current turn", async () => {
    const turnTwoInput = { ...input, turnOrder: 2 };
    const result = await prepareOwnedSpeakingTry(turnTwoInput);

    expect(result.ok).toBe(true);
    expect(operations()).toEqual(["load_conversation_turns", "initialize_turn"]);
  });

  it("does not initialize a turn when the required history read fails", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: { ok: false, error: "db_error" },
      error: null,
    }));

    await expect(
      prepareOwnedSpeakingTry({ ...input, turnOrder: 2 }),
    ).resolves.toEqual({ ok: false, error: "db_error" });
    expect(operations()).toEqual(["load_conversation_turns"]);
  });

  it("owns external-failure and upload-failure compensation", async () => {
    const persistence = await prepare();
    const clip = await persistence.createClip(new Blob(["voice"]));
    expect(clip.ok).toBe(true);
    if (!clip.ok) throw new Error(clip.error);

    await clip.value.uploadPromise;
    await persistence.failFromExternalError();
    const regularCleanup = rpc.mock.calls.at(-1)?.[1] as RpcArguments;
    expect(regularCleanup.p_payload).toMatchObject({
      object_key: "as-1/attempt-1/1/original_answer-clip-1.webm",
      processing_status: "failed",
    });

    upload.mockResolvedValueOnce({ error: { message: "storage unavailable" } });
    const failedUploadPersistence = await prepare();
    const failedClip = await failedUploadPersistence.createClip(
      new Blob(["voice"]),
    );
    expect(failedClip.ok).toBe(true);
    if (!failedClip.ok) throw new Error(failedClip.error);
    await failedClip.value.uploadPromise;
    const uploadFailureCleanup = rpc.mock.calls.at(-1)?.[1] as RpcArguments;
    expect(uploadFailureCleanup.p_operation).toBe("update_clip");
    expect(uploadFailureCleanup.p_payload).not.toHaveProperty("object_key");
  });

  it("persists original results and conditionally routes teacher review as one phase", async () => {
    const persistence = await prepare();

    const result = await persistence.persistTurn({
      kind: "original",
      transcript: "I play soccer.",
      targetAttempted: true,
      improvedSentence: null,
      evaluation: { outcome: "correct" },
      replyHintFrame: null,
      reviewReason: "low_confidence",
    });

    expect(result).toEqual({ ok: true, value: { error: null } });
    expect(operations()).toEqual([
      "initialize_turn",
      "write_original_turn",
      "route_teacher_review",
    ]);
    expect(
      (rpc.mock.calls[1][1] as RpcArguments).p_payload,
    ).toMatchObject({
      transcript: "I play soccer.",
      target_attempted: true,
    });
    expect(
      (rpc.mock.calls[2][1] as RpcArguments).p_payload,
    ).toEqual({ review_reason: "low_confidence" });
  });

  it("automatically compensates internal review and Conversation-line failures", async () => {
    const persistence = await prepare();
    const clip = await persistence.createClip(new Blob(["voice"]));
    expect(clip.ok).toBe(true);

    failedOperation = "route_teacher_review";
    const review = await persistence.persistTurn({
      kind: "original",
      transcript: "Maybe.",
      targetAttempted: null,
      improvedSentence: null,
      evaluation: { outcome: "teacher_review" },
      replyHintFrame: null,
      reviewReason: "low_confidence",
    });
    expect(review).toMatchObject({ ok: true, value: { error: {} } });
    expect(operations().slice(-2)).toEqual([
      "route_teacher_review",
      "update_clip",
    ]);

    failedOperation = "record_coco_line";
    const line = await persistence.persistCocoLine({
      cocoLine: "Can you say that again?",
    });
    expect(line).toMatchObject({ ok: true, value: { error: {} } });
    expect(operations().slice(-2)).toEqual(["record_coco_line", "update_clip"]);
  });

  it("owns repeat context reads, repeat persistence, Coco-line persistence, score writes, and finalization", async () => {
    const persistence = await prepare();
    const clip = await persistence.createClip(new Blob(["voice"]));
    expect(clip.ok).toBe(true);

    expect(await persistence.readRepeatEvaluationContext()).toEqual({
      ok: true,
      value: { count: 2, error: null },
    });
    expect(
      await persistence.persistTurn({
        kind: "repeat",
        transcript: "I play soccer twice a week.",
        repeatAccepted: true,
        evaluation: { outcome: "repeat_accepted" },
      }),
    ).toEqual({ ok: true, value: { error: null } });
    expect(
      await persistence.persistCocoLine({
        cocoLine: "That sounds fun!",
        moderationEvent: null,
      }),
    ).toEqual({ ok: true, value: { error: null } });
    expect(
      await persistence.persistPronunciation({
        referenceText: "I play soccer.",
        accuracyScore: 90,
        fluencyScore: 90,
        completenessScore: 90,
        pronunciationScore: 90,
        starBand: 3,
        wordScores: [],
      }),
    ).toEqual({ ok: true, value: { error: null } });
    expect(await persistence.complete()).toEqual({
      ok: true,
      value: { error: null },
    });

    expect(operations()).toEqual([
      "initialize_turn",
      "insert_audio_clip",
      "authorize_storage_upload",
      "count_transcribed_repeat_clips",
      "write_repeat_turn",
      "record_coco_line",
      "write_pronunciation_score",
      "update_clip",
    ]);
  });

  it("preserves not-found and database failures at the interface boundary", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: { ok: false, error: "not_found" },
      error: null,
    }));
    await expect(prepareOwnedSpeakingTry(input)).resolves.toEqual({
      ok: false,
      error: "not_found",
    });

    rpcError = { message: "database unavailable" };
    await expect(prepareOwnedSpeakingTry(input)).resolves.toEqual({
      ok: false,
      error: "db_error",
    });
  });
});
