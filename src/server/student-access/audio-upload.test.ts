import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";
import type { GenerateCocoReplyResult } from "@/server/ai/conversation-generator";
import type { GenerateCocoReplyInput } from "@/domain/ai/conversation-generation";

// Conversation-mode orchestration in audio-upload.ts (CHAT-01/03/05/06,
// D-10/D-11/D-13). Mirrors the mocking shape of tests/server/audio-upload.test.ts
// (the preset-path suite, left untouched) but scoped to the new chat-mode
// branch: dual-direction moderation, hard-cap refusal, retry-once, shared
// canned-fallback path, and idempotent coco_line/moderation_event persistence.

let mockSupabase: ReturnType<typeof createMockSupabase>;
const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

vi.mock("@/server/logging/logger", () => ({
  log: mockLog,
}));

type Operation = {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function audioInput(overrides: {
  turnOrder?: number;
  body?: string;
} = {}) {
  const body = overrides.body ?? "voice";
  const mimeType = "audio/webm";
  const file = new Blob([body], { type: mimeType });

  return {
    studentId: "student-1",
    assignmentStudentId: "as-1",
    attemptId: "attempt-1",
    turnOrder: overrides.turnOrder ?? 1,
    clipKind: "original_answer" as Database["public"]["Enums"]["audio_clip_kind"],
    file,
    mimeType,
    durationMs: 1200,
    byteSize: body.length,
  };
}

function successfulTranscriber(
  text: string,
  koreanSpans: Array<{ hangul: string; romanized: string }> = [],
) {
  return vi.fn(async () => ({ ok: true as const, text, koreanSpans }));
}

function successfulOriginalEvaluator(overrides = {}) {
  return vi.fn(async () => ({
    ok: true as const,
    evaluation: {
      version: "ai-eval-v1" as const,
      outcome: "correct" as const,
      meaningUnderstood: true,
      targetPatternAttempted: true,
      correctionNeeded: false,
      correctionSeverity: "none" as const,
      improvedSentence: null,
      englishLanguage: "english" as const,
      confidence: "high" as const,
      reviewReason: null,
      ...overrides,
    },
  }));
}

// Chat missions have one teacher-authored opener. Every later turn is dynamic
// and must be accepted only through the server-owned hard-cap gate.
const conversationMissionSnapshotFixture = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Coffee shop scene",
  targetPattern: "Can I have ___, please?",
  topic: "ordering food",
  level: "elementary",
  requiredTurns: 4,
  characterId: "default-buddy",
  conversationMode: true,
  scenePremise: "You walk into Coco's coffee shop after school.",
  turns: [
    {
    turnOrder: 1,
    prompt: "What would you like to say?",
    targetExample: "Can I have a juice, please?",
    hintLadder: {
      tier1: "Can I have ___?",
      tier2: "juice",
      tier3: "Can I have a juice, please?",
    },
    },
  ],
};

const soccerConversationSnapshot = {
  ...conversationMissionSnapshotFixture,
  targetPattern: "How often do you _____?",
  turns: [
    {
      ...conversationMissionSnapshotFixture.turns[0],
      turnOrder: 1,
      prompt: "How often do you play soccer?",
      targetExample: "How often do you play soccer?",
    },
  ],
};

function createMockSupabase(options: {
  assignmentFound?: boolean;
  attemptFound?: boolean;
  attemptStatus?: Database["public"]["Enums"]["attempt_status"];
  uploadError?: Error | null;
  missionSnapshot?: typeof conversationMissionSnapshotFixture;
  previousTurns?: Array<{
    turn_order: number;
    original_transcript: string | null;
    improved_sentence: string | null;
    coco_line: string | null;
  }>;
  historyLookupError?: { message: string } | null;
  cocoLineUpsertError?: { message: string } | null;
  turnEvaluation?: unknown;
} = {}) {
  const operations: Operation[] = [];
  const upload = vi.fn(async () => ({ error: options.uploadError ?? null }));

  function createQuery(table: string) {
    const operation: Operation = { table, action: "select", filters: [] };

    // resolvedError() determines what an awaited terminal call (upsert/update
    // with no further .select()/.single() chained) resolves to. Only the
    // coco_line upsert path is parameterized with an injectable error in
    // these tests; every other terminal write defaults to success.
    function resolvedError() {
      if (
        table === "attempt_turns" &&
        options.cocoLineUpsertError &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "coco_line" in operation.payload
      ) {
        return options.cocoLineUpsertError;
      }
      return null;
    }

    const query: Record<string, unknown> & PromiseLike<{ error: unknown }> = {
      select: vi.fn(() => query),
      insert: vi.fn((payload: unknown) => {
        operation.action = "insert";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
      update: vi.fn((payload: unknown) => {
        operation.action = "update";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
      upsert: vi.fn((payload: unknown) => {
        operation.action = "upsert";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
      lt: vi.fn((column: string, value: unknown) => {
        operation.filters.push([`${column}<`, value]);
        return query;
      }),
      order: vi.fn(async () => {
        if (!operations.includes(operation)) operations.push(operation);
        if (table === "attempt_turns" && operation.action === "select") {
          return {
            data: options.previousTurns ?? [],
            error: options.historyLookupError ?? null,
          };
        }
        return { data: [], error: null };
      }),
      // Makes `query` itself awaitable — supports call sites that await the
      // builder directly with no terminal .select()/.single() (e.g. the
      // pronunciation_scores upsert and the attempt_turns/audio_clips
      // .update().eq() writes).
      then: (<TResult1, TResult2 = never>(
        onFulfilled?:
          | ((value: { error: unknown }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => {
        if (!operations.includes(operation)) operations.push(operation);
        return Promise.resolve({ error: resolvedError() }).then(
          onFulfilled ?? undefined,
          onRejected ?? undefined,
        );
      }) as PromiseLike<{ error: unknown }>["then"],
      maybeSingle: vi.fn(async () => {
        operations.push(operation);
        if (table === "assignment_students") {
          return {
            data:
              options.assignmentFound === false
                ? null
                : {
                    id: "as-1",
                    assignment_id: "assignment-1",
                    student_id: "student-1",
                    status: options.attemptFound === false ? "started" : "started",
                    latest_attempt_id: "attempt-1",
                    attempt_count: 1,
                    highest_hint_level: 0,
                    assignments: {
                      mission_snapshot:
                        options.missionSnapshot ?? conversationMissionSnapshotFixture,
                      canceled_at: null,
                    },
                  },
            error: null,
          };
        }
        if (table === "attempts") {
          return {
            data:
              options.attemptFound === false
                ? null
                : {
                    id: "attempt-1",
                    assignment_student_id: "as-1",
                    status: options.attemptStatus ?? "in_progress",
                  },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      single: vi.fn(async () => {
        if (!operations.includes(operation)) operations.push(operation);
        if (table === "attempt_turns") {
          return {
            data: {
              id: "turn-1",
              original_transcript: null,
              improved_sentence: null,
              evaluation: options.turnEvaluation ?? null,
            },
            error: null,
          };
        }
        if (table === "audio_clips") {
          return { data: { id: "clip-1" }, error: null };
        }
        return { data: null, error: null };
      }),
    };

    return query;
  }

  return {
    operations,
    storage: { from: vi.fn(() => ({ upload })) },
    upload,
    from: vi.fn((table: string) => createQuery(table)),
  };
}

function fakeGenerateCocoReply(
  impl: (input: GenerateCocoReplyInput) => Promise<GenerateCocoReplyResult>,
) {
  return vi.fn(impl);
}

function fakeIsContentSafe(
  impl: (text: string) => Promise<
    { safe: boolean; failedOpen: false } | { safe: false; failedOpen: true }
  >,
) {
  return vi.fn(impl);
}

describe("uploadAttemptAudioClip conversation-mode orchestration", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("preset mission (conversationMode false) never calls generateCocoReply/isContentSafe", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        conversationMode: false,
        requiredTurns: 1,
        turns: [
          {
            turnOrder: 1,
            prompt: "What do you want to order?",
            targetExample: "Can I have a juice, please?",
            hintLadder: { tier1: "Can I have ___?", tier2: "juice", tier3: "Can I have a juice, please?" },
          },
        ],
      } as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Can I have a juice, please?"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(result.ok).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.cocoLine).toBeNull();
    }
  });

  it("accepts a relevant free-talk opener without requiring the target pattern", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I don't play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        targetPattern: "How often do you _____?",
        targetExample: null,
        transcript: "I don't play soccer.",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      evaluation: { outcome: "accepted_original" },
      cocoLine: "Oh, what do you like to do instead?",
    });
  });

  it("routes an incorrect free-talk opener through conversation-mode correction while still returning the next Coco line", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      improvedSentence: "I don't play soccer.",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I no play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationMode: "conversation",
        missionQuestion: "How often do you play soccer?",
        targetExample: null,
        transcript: "I no play soccer.",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "needs_correction",
        improvedSentence: "I don't play soccer.",
        requireRepeat: true,
      },
      cocoLine: "Oh, what do you like to do instead?",
    });
  });

  it("downgrades a correction that parrots the mission question to retry_original (UAT 2026-07-16)", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    // Provider disobeys the "never use the missionQuestion as
    // improvedSentence" instruction — the deterministic guard must catch it.
    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      improvedSentence: "How often do you play soccer?",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I don't"),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        improvedSentence: null,
        requireRepeat: false,
      },
    });
  });

  it("persists an accepted minor recast, grounds Coco with it, and does not warm correction TTS", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "minor",
      improvedSentence: "I don't play soccer often.",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));
    const warmTtsAudioCache = vi.fn(async () => ({
      ok: true as const,
      warmed: 1,
      skipped: 0,
      failed: 0,
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I no play soccer much."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
      warmTtsAudioCache,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "accepted_original",
        correctionSeverity: "minor",
        improvedSentence: "I don't play soccer often.",
        requireRepeat: false,
      },
      cocoLine: "Oh, what do you like to do instead?",
    });
    // TTS is warmed once for Coco's generated reply line, but never for the
    // accepted minor recast's improved sentence — only material corrections
    // warm live correction TTS.
    expect(warmTtsAudioCache).toHaveBeenCalledTimes(1);
    expect(warmTtsAudioCache).toHaveBeenCalledWith(
      expect.objectContaining({ texts: ["Oh, what do you like to do instead?"] }),
    );
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({
          original_transcript: "I no play soccer much.",
          improved_sentence: "I don't play soccer often.",
        }),
      }),
    );
  });

  it("still warms correction TTS for a material conversation-mode correction", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      improvedSentence: "I don't play soccer.",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));
    const warmTtsAudioCache = vi.fn(async () => ({
      ok: true as const,
      warmed: 1,
      skipped: 0,
      failed: 0,
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I no play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
      warmTtsAudioCache,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "needs_correction",
        correctionSeverity: "material",
        improvedSentence: "I don't play soccer.",
        requireRepeat: true,
      },
    });
    expect(warmTtsAudioCache).toHaveBeenCalledWith(
      expect.objectContaining({ texts: ["I don't play soccer."] }),
    );
  });

  it("passes the snapshotted answer policy and review disposition to owned AI adapters", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        requireCompleteSentenceAnswers: false,
      } as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator({
      outcome: "teacher_review",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      confidence: "medium",
      reviewReason: "ambiguous",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Soccer is fun! Who do you usually play with?" },
    }));

    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("School."),
      evaluateOriginalTurn: evaluate,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ requireCompleteSentenceAnswers: false }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ responseHandling: "review_pending" }),
    );
  });

  it("flagged student input: no generateCocoReply call; canned redirect persisted with flagged_student_input event", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: false, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("something inappropriate"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(result.ok).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.cocoLine).toBeTruthy();
      expect(result.cocoLineModerationEvent).toEqual({ kind: "flagged_student_input" });
    }

    const cocoLineUpsert = mockSupabase.operations.find(
      (op) =>
        op.table === "attempt_turns" &&
        op.action === "upsert" &&
        typeof op.payload === "object" &&
        op.payload !== null &&
        "coco_line" in op.payload,
    );
    expect(cocoLineUpsert?.payload).toMatchObject({
      moderation_event: { kind: "flagged_student_input" },
    });
  });

  it("turnOrder > HARD_TURN_CAP is rejected before upload or generation", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 9 }), {
      transcribeAudioFile: successfulTranscriber("I would like more coffee."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(result).toEqual({ ok: false, error: "invalid_audio", retryable: false });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("evaluates an owned dynamic turn with one persisted Coco line reused for generation", async () => {
    mockSupabase = createMockSupabase({
      previousTurns: [
        {
          turn_order: 1,
          original_transcript: "I like soccer.",
          improved_sentence: null,
          coco_line: "That sounds fun! What will you do next?",
        },
      ],
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Great! Tell me one more thing." },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I will play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(result.ok).toBe(true);
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationMode: "conversation",
        missionQuestion: "That sounds fun! What will you do next?",
        targetExample: null,
      }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What would you like to say?",
            studentResponse: "I like soccer.",
          },
          {
            turnOrder: 2,
            cocoLine: "That sounds fun! What will you do next?",
            studentResponse: "I will play soccer.",
          },
        ],
      }),
    );
    expect(
      mockSupabase.operations.filter(
        (operation) =>
          operation.table === "attempt_turns" &&
          operation.action === "select" &&
          operation.filters.some(
            ([column, value]) => column === "turn_order<" && value === 2,
          ),
      ),
    ).toHaveLength(1);
  });

  it("ignores a legacy authored tail and evaluates turn two against its persisted Coco line", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          conversationMissionSnapshotFixture.turns[0],
          {
            ...conversationMissionSnapshotFixture.turns[0],
            turnOrder: 2,
            prompt: "What authored food question is this legacy tail?",
          },
        ],
      },
      previousTurns: [
        {
          turn_order: 1,
          original_transcript: "I like soccer.",
          improved_sentence: null,
          coco_line: "That sounds fun! What will you do next?",
        },
      ],
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Great! Tell me one more thing." },
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I will play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result.ok).toBe(true);
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationMode: "conversation",
        missionQuestion: "That sounds fun! What will you do next?",
        targetExample: null,
      }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What would you like to say?",
            studentResponse: "I like soccer.",
          },
          {
            turnOrder: 2,
            cocoLine: "That sounds fun! What will you do next?",
            studentResponse: "I will play soccer.",
          },
        ],
      }),
    );
  });

  it("does not let a legacy authored tail bypass missing conversation history", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          conversationMissionSnapshotFixture.turns[0],
          {
            ...conversationMissionSnapshotFixture.turns[0],
            turnOrder: 2,
            prompt: "What authored food question is this legacy tail?",
          },
        ],
      },
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I will play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "Should never be generated." },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid_audio",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(evaluateOriginal).not.toHaveBeenCalled();
  });

  it("passes the complete current-attempt history into generation", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "Who do you talk with at school?",
          },
        ],
      },
      previousTurns: [
        {
          turn_order: 1,
          original_transcript: "I talk Minju.",
          improved_sentence: "I talk with Minju.",
          coco_line: "Where do you talk with Minju?",
        },
      ],
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, in the classroom! What do you talk about?" },
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("In the classroom."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result.ok).toBe(true);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Who do you talk with at school?",
            studentResponse: "I talk with Minju.",
          },
          {
            turnOrder: 2,
            cocoLine: "Where do you talk with Minju?",
            studentResponse: "In the classroom.",
          },
        ],
      }),
    );
    const historyRead = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "select" &&
        operation.filters.some(
          ([column, value]) => column === "attempt_id" && value === "attempt-1",
        ),
    );
    expect(historyRead?.filters).toContainEqual(["turn_order<", 2]);
  });

  it("returns a retryable database error when conversation history lookup fails", async () => {
    mockSupabase = createMockSupabase({
      historyLookupError: { message: "history unavailable" },
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("In the classroom."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toEqual({ ok: false, error: "db_error", retryable: true });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects a dynamic turn with no persisted Coco line before upload or evaluation", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I will play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({ safe: true, failedOpen: false })),
    });

    expect(result).toEqual({ ok: false, error: "invalid_audio", retryable: false });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(evaluateOriginal).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("generated line passes moderation: coco_line persisted with no moderation_event; TTS warmed", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "That sounds great! What else would you like?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));
    const warm = vi.fn(async () => ({ ok: true as const, warmed: 1, skipped: 0, failed: 0 }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("Can I have a juice, please?"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
      warmTtsAudioCache: warm,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(moderate).toHaveBeenCalledWith("Can I have a juice, please?");
    expect(moderate).toHaveBeenCalledWith(
      "That sounds great! What else would you like?",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cocoLine).toBe("That sounds great! What else would you like?");
      expect(result.cocoLineModerationEvent).toBeNull();
    }
    expect(warm).toHaveBeenCalledWith(
      expect.objectContaining({
        texts: ["That sounds great! What else would you like?"],
      }),
    );

    const cocoLineUpsert = mockSupabase.operations.find(
      (op) =>
        op.table === "attempt_turns" &&
        op.action === "upsert" &&
        typeof op.payload === "object" &&
        op.payload !== null &&
        "coco_line" in op.payload,
    );
    expect(cocoLineUpsert?.payload).toMatchObject({
      coco_line: "That sounds great! What else would you like?",
      moderation_event: null,
    });
  });

  it("does not return an ephemeral Coco line when persistence fails", async () => {
    mockSupabase = createMockSupabase({
      cocoLineUpsertError: { message: "write failed" },
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like juice."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "Juice is tasty! What juice do you like?" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toEqual({ ok: false, error: "db_error", retryable: true });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "audio_clips" &&
          operation.action === "update" &&
          JSON.stringify(operation.payload).includes('"processing_status":"failed"'),
      ),
    ).toBe(true);
  });

  it("fails moderation once then passes on regenerate: retried event persisted", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(
      (() => {
        let call = 0;
        return async () => {
          call += 1;
          return {
            ok: true as const,
            reply: {
              line: call === 1 ? "unsafe first draft" : "That's great! Tell me more.",
            },
          };
        };
      })(),
    );
    const moderate = fakeIsContentSafe(async (text: string) => ({
      safe: text !== "unsafe first draft",
      failedOpen: false,
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("Can I have a juice, please?"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cocoLine).toBe("That's great! Tell me more.");
      expect(result.cocoLineModerationEvent).toEqual({ kind: "retried" });
    }
    expect(generate.mock.calls[0]?.[0]).toMatchObject({ safetyMode: "standard" });
    expect(generate.mock.calls[1]?.[0]).toMatchObject({ safetyMode: "retry" });
  });

  it("fails moderation twice: canned fallback persisted with canned_fallback event", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "always unsafe" },
    }));
    // The student transcript itself must pass moderation (step b) so the
    // pipeline reaches generation; only the generated line is unsafe both
    // times (step d, then the post-retry re-check), forcing the shared
    // canned-fallback path.
    const moderate = fakeIsContentSafe(async (text: string) => ({
      safe: text === "Can I have a juice, please?",
      failedOpen: false,
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("Can I have a juice, please?"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cocoLine).toBeTruthy();
      expect(result.cocoLineModerationEvent).toEqual({
        kind: "canned_fallback",
        cause: "unsafe_output",
      });
    }
  });

  it("provider failure: shares the same canned-fallback path as moderation failure", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("Can I have a juice, please?"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cocoLine).toBeTruthy();
      expect(result.cocoLineModerationEvent).toEqual({
        kind: "canned_fallback",
        cause: "provider_failed",
      });
    }
  });

  it.each([
    ["invalid_input", { kind: "canned_fallback", cause: "invalid_input" }],
    ["missing_api_key", { kind: "canned_fallback", cause: "missing_api_key" }],
    ["provider_failed", { kind: "canned_fallback", cause: "provider_failed" }],
    ["schema_failed", { kind: "canned_fallback", cause: "schema_failed" }],
  ] as const)(
    "persists the %s generation fallback cause",
    async (error, expectedEvent) => {
      const { uploadAttemptAudioClip } = await import(
        "@/server/student-access/audio-upload"
      );
      const generate = fakeGenerateCocoReply(async () => ({ ok: false, error }));
      const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
        transcribeAudioFile: successfulTranscriber("I like soccer."),
        evaluateOriginalTurn: successfulOriginalEvaluator(),
        generateCocoReply: generate,
        isContentSafe: fakeIsContentSafe(async () => ({
          safe: true,
          failedOpen: false,
        })),
      });

      expect(result).toMatchObject({
        ok: true,
        cocoLineModerationEvent: expectedEvent,
      });
    },
  );

  it("persists every policy reason when correction is exhausted", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "reply_policy_failed",
      violations: ["either_or_question", "topic_drift"],
    }));
    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "reply_policy_failed",
        violations: ["either_or_question", "topic_drift"],
      },
    });
  });

  it("selects the meaningful follow-up fallback when generation fails after a substantive answer", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I will eat sushi."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: "Thanks for telling me! What do you like about that?",
      cocoLineModerationEvent: { kind: "canned_fallback", cause: "provider_failed" },
    });
  });

  it("selects the vague_or_stuck follow-up fallback when generation fails after a vague answer", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "schema_failed",
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("Anything."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: "That's okay! Can you give me one example?",
      cocoLineModerationEvent: { kind: "canned_fallback", cause: "schema_failed" },
    });
  });

  it("selects the uncertain follow-up fallback when generation fails on a review-pending answer", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator({
      outcome: "teacher_review",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      confidence: "medium",
      reviewReason: "ambiguous",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I will eat sushi."),
      evaluateOriginalTurn: evaluate,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine:
        "Let's try that question another way. Can you tell me one small detail?",
      cocoLineModerationEvent: { kind: "canned_fallback", cause: "provider_failed" },
    });
  });

  it("selects the uncertain follow-up fallback for unsafe student input regardless of transcript content", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "This must not be generated." },
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I will eat sushi."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: false,
        failedOpen: false,
      })),
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      cocoLine:
        "Let's try that question another way. Can you tell me one small detail?",
      cocoLineModerationEvent: { kind: "flagged_student_input" },
    });
  });

  it("uses the static closing fallback text, not a follow-up fallback, on final-turn generation failure", async () => {
    mockSupabase = createMockSupabase({
      previousTurns: Array.from({ length: 3 }, (_, index) => ({
        turn_order: index + 1,
        original_transcript: `Answer ${index + 1}.`,
        improved_sentence: null,
        coco_line: `Question ${index + 2}?`,
      })),
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 4 }), {
      transcribeAudioFile: successfulTranscriber("I will eat sushi."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: "That was fun! Thanks for talking with me. See you next time!",
      cocoLineModerationEvent: { kind: "canned_fallback", cause: "provider_failed" },
    });
  });

  it("distinguishes unavailable input moderation from flagged input", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "This must not be generated." },
    }));
    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: false,
        failedOpen: true,
      })),
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      cocoLineModerationEvent: { kind: "input_moderation_unavailable" },
    });
  });

  it("falls back immediately when output moderation is unavailable", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Soccer is fun! Who plays with you?" },
    }));
    let moderationCall = 0;
    const moderate = fakeIsContentSafe(async () => {
      moderationCall += 1;
      return moderationCall === 1
        ? { safe: true as const, failedOpen: false as const }
        : { safe: false as const, failedOpen: true as const };
    });
    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "output_moderation_unavailable",
      },
    });
  });

  it("requests and persists a closing on the final required turn", async () => {
    mockSupabase = createMockSupabase({
      previousTurns: Array.from({ length: 3 }, (_, index) => ({
        turn_order: index + 1,
        original_transcript: `Answer ${index + 1}.`,
        improved_sentence: null,
        coco_line: `Question ${index + 2}?`,
      })),
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const closing =
      "Sushi sounds delicious! Thanks for talking with me. See you next time!";
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: closing },
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 4 }), {
      transcribeAudioFile: successfulTranscriber("I will eat sushi."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ turnOrder: 4, requiredTurns: 4 }),
    );
    expect(result).toMatchObject({ ok: true, cocoLine: closing });
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({ coco_line: closing }),
      }),
    );
  });

  it("uses the static closing fallback for provider, schema, and policy failures", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const failures: Array<{
      generation: GenerateCocoReplyResult;
      expectedEvent: Record<string, unknown>;
    }> = [
      {
        generation: { ok: false, error: "provider_failed" },
        expectedEvent: { kind: "canned_fallback", cause: "provider_failed" },
      },
      {
        generation: { ok: false, error: "schema_failed" },
        expectedEvent: { kind: "canned_fallback", cause: "schema_failed" },
      },
      {
        generation: {
          ok: false,
          error: "reply_policy_failed",
          violations: ["question_format"],
        },
        expectedEvent: {
          kind: "canned_fallback",
          cause: "reply_policy_failed",
          violations: ["question_format"],
        },
      },
    ];

    for (const { generation, expectedEvent } of failures) {
      mockSupabase = createMockSupabase({
        previousTurns: Array.from({ length: 3 }, (_, index) => ({
          turn_order: index + 1,
          original_transcript: `Answer ${index + 1}.`,
          improved_sentence: null,
          coco_line: `Question ${index + 2}?`,
        })),
      });

      const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 4 }), {
        transcribeAudioFile: successfulTranscriber("I will eat sushi."),
        evaluateOriginalTurn: successfulOriginalEvaluator(),
        generateCocoReply: fakeGenerateCocoReply(async () => generation),
        isContentSafe: fakeIsContentSafe(async () => ({
          safe: true,
          failedOpen: false,
        })),
      });

      expect(result).toMatchObject({
        ok: true,
        cocoLine: "That was fun! Thanks for talking with me. See you next time!",
        cocoLineModerationEvent: expectedEvent,
      });
    }
  });

  it("uses the static closing fallback when output moderation is unavailable", async () => {
    mockSupabase = createMockSupabase({
      previousTurns: Array.from({ length: 3 }, (_, index) => ({
        turn_order: index + 1,
        original_transcript: `Answer ${index + 1}.`,
        improved_sentence: null,
        coco_line: `Question ${index + 2}?`,
      })),
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    let moderationCall = 0;

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 4 }), {
      transcribeAudioFile: successfulTranscriber("I will eat sushi."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "Sushi sounds delicious! See you next time!" },
      })),
      isContentSafe: fakeIsContentSafe(async () => {
        moderationCall += 1;
        return moderationCall === 1
          ? { safe: true as const, failedOpen: false as const }
          : { safe: false as const, failedOpen: true as const };
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: "That was fun! Thanks for talking with me. See you next time!",
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "output_moderation_unavailable",
      },
    });
  });

  it("generates the closing on turn eight instead of short-circuiting at the hard cap", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        requiredTurns: 8,
      },
      previousTurns: Array.from({ length: 7 }, (_, index) => ({
        turn_order: index + 1,
        original_transcript: `Answer ${index + 1}.`,
        improved_sentence: null,
        coco_line: `Question ${index + 2}?`,
      })),
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "That was fun! See you next time!" },
    }));

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 8 }), {
      transcribeAudioFile: successfulTranscriber("I enjoyed swimming."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ turnOrder: 8, requiredTurns: 8 }),
    );
    expect(result).toMatchObject({
      ok: true,
      cocoLine: "That was fun! See you next time!",
    });
  });
});

describe("minimal-effort answer guard (conversation mode)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("skips conversation-turn generation on a blocked answer", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));
    const moderate = fakeIsContentSafe(async () => ({
      safe: true,
      failedOpen: false,
    }));
    const evaluate = successfulOriginalEvaluator();

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("no"),
      evaluateOriginalTurn: evaluate,
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(generate).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
    expect(result.cocoLine).toBeNull();
    expect(result.evaluation).toMatchObject({
      outcome: "retry_original",
      retryReason: "minimal_effort",
      minimalEffortBlocks: 1,
      minimalEffortKind: "short_answer",
      retryExample: "I play soccer sometimes.",
    });
  });

  it("routes the post-cap How often polar correction to teacher review", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
      turnEvaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        retryReason: "minimal_effort",
        minimalEffortBlocks: 2,
      },
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator({
      outcome: "needs_correction",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      correctionNeeded: true,
      correctionSeverity: "material",
      improvedSentence: "Yes, I do.",
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: evaluate,
    });

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "teacher_review",
        reviewReason: "ambiguous",
        improvedSentence: null,
        requireRepeat: false,
        minimalEffortBlocks: 2,
      },
    });
  });
});
