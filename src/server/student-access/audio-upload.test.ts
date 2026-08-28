import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";
import type { GenerateCocoReplyResult } from "@/server/ai/conversation-generator";
import type {
  GeneratedCocoReply,
  GenerateCocoReplyInput,
} from "@/domain/ai/conversation-generation";
import { SAY_IT_AGAIN_FALLBACK_LINE } from "@/domain/conversation/fallback-lines";

// recordSpeakingTry orchestration at the production entry: preset and
// conversation behavior share this one test-side owned-operation interpreter.
// Database ownership semantics remain covered by the real-database integration
// suite, not this adapter.

let mockSupabase: ReturnType<typeof createMockSupabase>;
const { mockLog, mockConsumeRequestBudget } = vi.hoisted(() => ({
  mockLog: vi.fn(),
  mockConsumeRequestBudget: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

vi.mock("@/server/logging/logger", () => ({
  log: mockLog,
}));

// The real module fails closed without a configured STUDENT_ACCESS_SECRET.
// These tests cover conversation orchestration, not admission, so the budget
// admits by default.
vi.mock("@/server/security/request-budget", () => ({
  consumeRequestBudget: mockConsumeRequestBudget,
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
  clipKind?: Database["public"]["Enums"]["audio_clip_kind"];
  mimeType?: string;
  durationMs?: number;
  byteSize?: number;
  file?: Blob;
} = {}) {
  const body = overrides.body ?? "voice";
  const mimeType = overrides.mimeType ?? "audio/webm";
  const file = overrides.file ?? new Blob([body], { type: mimeType });

  return {
    studentId: "student-1",
    assignmentStudentId: "as-1",
    attemptId: "attempt-1",
    turnOrder: overrides.turnOrder ?? 1,
    clipKind: overrides.clipKind ?? "original_answer",
    file,
    mimeType,
    durationMs: overrides.durationMs ?? 1200,
    byteSize: overrides.byteSize ?? body.length,
  };
}

function successfulTranscriber(
  text: string,
  koreanSpans: Array<{ hangul: string; romanized: string }> = [],
) {
  return vi.fn(async () => ({
    ok: true as const,
    text,
    koreanSpans,
    model: "test-transcriber",
    confidence: null,
  }));
}

function failedTranscriber() {
  return vi.fn(async () => ({
    ok: false as const,
    error: "transcription_failed" as const,
  }));
}

function successfulPronunciationScorer() {
  return vi.fn(async () => ({
    ok: true as const,
    score: {
      accuracyScore: 88,
      fluencyScore: 90,
      completenessScore: 95,
      pronunciationScore: 87,
      starBand: 3 as const,
      referenceText: "I like apples.",
      wordScores: [],
    },
  }));
}

function lowConfidenceTranscriber(
  text: string,
  minLogprob = -1.5,
  tokenCount = 7,
) {
  return vi.fn(async () => ({
    ok: true as const,
    text,
    koreanSpans: [],
    model: "test-transcriber",
    confidence: { minLogprob, tokenCount },
  }));
}

function originalEvaluation(overrides = {}) {
  return {
    version: "ai-eval-v1" as const,
    outcome: "correct" as const,
    meaningUnderstood: true,
    targetPatternAttempted: true,
    correctionNeeded: false,
    correctionSeverity: "none" as const,
    correctionReason: "none" as const,
    improvedSentence: null,
    englishLanguage: "english" as const,
    confidence: "high" as const,
    reviewReason: null,
    policyVersion: "natural-conversation-v1" as const,
    evaluationModel: "test-evaluator",
    evaluationSource: "model" as const,
    transcriptionModel: "test-transcriber",
    transcriptionConfidence: null,
    runtimeVersion: "test-runtime",
    hangulInterpretations: [],
    ...overrides,
  };
}

function successfulOriginalEvaluator(overrides = {}) {
  return vi.fn(async () => ({
    ok: true as const,
    evaluation: originalEvaluation(overrides),
  }));
}

function generatedReply(line: string): GeneratedCocoReply {
  return {
    reaction: null,
    focus: null,
    question: null,
    line,
  };
}

// Chat missions have one teacher-authored opener. Every later turn is dynamic
// and must be accepted only through the server-owned hard-cap gate.
const conversationMissionSnapshotFixture = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Coffee shop scene",
  targetPattern: "Can I have ___, please?",
  level: "elementary",
  requiredTurns: 4,
  characterId: "default-buddy",
  conversationMode: true,
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

const multiPatternPresetSnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Mixed review",
  level: "elementary",
  requiredTurns: 2,
  characterId: "default-buddy",
  conversationMode: false,
  requireCompleteSentenceAnswers: true,
  turns: [
    {
      turnOrder: 1,
      prompt: "What do you like after school?",
      targetPattern: "I like ___.",
      targetExample: "I like soccer.",
      hintLadder: {
        tier1: "Start with: I like",
        tier2: "soccer, reading",
        tier3: "I like soccer.",
      },
      answerShape: "open",
    },
    {
      turnOrder: 2,
      prompt: "What will you do tomorrow?",
      targetPattern: "I will ___.",
      targetExample: "I will study.",
      hintLadder: {
        tier1: "Start with: I will",
        tier2: "study, play",
        tier3: "I will study.",
      },
      answerShape: "open",
    },
  ],
};

function createMockSupabase(options: {
  assignmentFound?: boolean;
  assignmentStatus?: Database["public"]["Enums"]["assignment_student_status"];
  attemptStatus?: Database["public"]["Enums"]["attempt_status"];
  attemptStatuses?: Database["public"]["Enums"]["attempt_status"][];
  uploadError?: Error | null;
  missionSnapshot?: unknown;
  previousTurns?: Array<{
    turn_order: number;
    original_transcript: string | null;
    improved_sentence: string | null;
    coco_line: string | null;
    evaluation?: unknown;
  }>;
  historyLookupError?: { message: string } | null;
  cocoLineUpsertError?: { message: string } | null;
  turnEvaluation?: unknown;
  turnImprovedSentence?: string | null;
  turnCocoLine?: string | null;
  priorRepeatClipStatuses?: Database["public"]["Enums"]["audio_processing_status"][];
  repeatCountError?: { message: string } | null;
} = {}) {
  const operations: Operation[] = [];
  const upload = vi.fn(async () => ({ error: options.uploadError ?? null }));
  let attemptLookupCount = 0;

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
        if (table === "audio_clips" && operation.action === "select") {
          const statuses = options.priorRepeatClipStatuses ?? [];
          const transcribedOnly = operation.filters.some(
            ([column, value]) =>
              column === "processing_status" && value === "transcribed",
          );
          const count = statuses.filter(
            (status) => !transcribedOnly || status === "transcribed",
          ).length;
          return Promise.resolve({
            count,
            error: options.repeatCountError ?? null,
          }).then(
            onFulfilled ?? undefined,
            onRejected ?? undefined,
          );
        }
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
                    status: options.assignmentStatus ?? "started",
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
          const attemptStatus =
            options.attemptStatuses?.[attemptLookupCount++] ??
            options.attemptStatus ??
            "in_progress";
          return {
            data:
              attemptStatus !== "in_progress"
                ? null
                : {
                    id: "attempt-1",
                    assignment_student_id: "as-1",
                    status: attemptStatus,
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
              improved_sentence: options.turnImprovedSentence ?? null,
              coco_line: options.turnCocoLine ?? null,
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

  const rpc = vi.fn(async (_name: string, args: {
    p_operation: string;
    p_payload: Record<string, unknown>;
  }) => {
    const status =
      options.attemptStatuses?.[attemptLookupCount++] ??
      options.attemptStatus ??
      "in_progress";
    if (status !== "in_progress") {
      return {
        data: { ok: false, error: "not_found" },
        error: null,
      };
    }

    const payload = args.p_payload;
    const operationByName: Record<string, Operation> = {
      load_conversation_turns: {
        table: "attempt_turns",
        action: "select",
        filters: [["attempt_id", "attempt-1"], ["turn_order<", payload.turn_order]],
      },
      initialize_turn: {
        table: "attempt_turns",
        action: "upsert",
        filters: [],
        payload: {
          attempt_id: "attempt-1",
          turn_order: payload.turn_order,
        },
      },
      insert_audio_clip: {
        table: "audio_clips",
        action: "insert",
        filters: [],
        payload: {
          attempt_turn_id: payload.attempt_turn_id,
          clip_kind: payload.clip_kind,
          processing_status: "pending_upload",
        },
      },
      update_clip: {
        table: "audio_clips",
        action: "update",
        filters: [["id", payload.audio_clip_id], ["attempt_turn_id", payload.attempt_turn_id]],
        payload: {
          ...(payload.object_key ? { object_key: payload.object_key } : {}),
          mime_type: payload.mime_type,
          duration_ms: payload.duration_ms,
          byte_size: payload.byte_size,
          processing_status: payload.processing_status,
        },
      },
      count_transcribed_repeat_clips: {
        table: "audio_clips",
        action: "select",
        filters: [["attempt_turn_id", payload.attempt_turn_id], ["clip_kind", "repeat_attempt"], ["processing_status", "transcribed"]],
      },
      write_guard_evaluation: {
        table: "attempt_turns",
        action: "upsert",
        filters: [],
        payload: {
          original_transcript: payload.transcript,
          turn_order: payload.turn_order,
          target_attempted: false,
          improved_sentence: null,
          evaluation: payload.evaluation,
          reply_hint_frame: payload.reply_hint_frame,
        },
      },
      write_original_turn: {
        table: "attempt_turns",
        action: "upsert",
        filters: [],
        payload: {
          original_transcript: payload.transcript,
          turn_order: payload.turn_order,
          target_attempted: payload.target_attempted,
          improved_sentence: payload.improved_sentence,
          ...(payload.evaluation !== undefined
            ? { evaluation: payload.evaluation }
            : {}),
          reply_hint_frame: payload.reply_hint_frame,
        },
      },
      write_repeat_turn: {
        table: "attempt_turns",
        action: "update",
        filters: [["id", payload.turn_id], ["attempt_id", "attempt-1"]],
        payload: {
          repeat_transcript: payload.transcript,
          repeat_accepted: payload.repeat_accepted,
          evaluation: payload.evaluation,
        },
      },
      route_teacher_review: {
        table: "attempts",
        action: "update",
        filters: [["id", "attempt-1"], ["assignment_student_id", "as-1"], ["status", "in_progress"]],
        payload: { needs_review_reason: payload.review_reason },
      },
      record_coco_line: {
        table: "attempt_turns",
        action: "upsert",
        filters: [],
        payload: {
          turn_order: payload.turn_order,
          coco_line: payload.coco_line,
          moderation_event: payload.moderation_event,
          ...(payload.evaluation !== undefined
            ? { evaluation: payload.evaluation }
            : {}),
        },
      },
      write_pronunciation_score: {
        table: "pronunciation_scores",
        action: "upsert",
        filters: [],
        payload: {
          audio_clip_id: payload.audio_clip_id,
          provider: "azure_speech",
          reference_text: payload.reference_text,
          accuracy_score: payload.accuracy_score,
          fluency_score: payload.fluency_score,
          completeness_score: payload.completeness_score,
          pronunciation_score: payload.pronunciation_score,
          star_band: payload.star_band,
          word_scores: payload.word_scores,
        },
      },
    };
    const operation = operationByName[args.p_operation];
    if (operation) operations.push(operation);

    if (args.p_operation === "load_conversation_turns") {
      return options.historyLookupError
        ? { data: null, error: options.historyLookupError }
        : { data: { ok: true, value: options.previousTurns ?? [] }, error: null };
    }
    if (args.p_operation === "initialize_turn") {
      return {
        data: {
          ok: true,
          value: {
            id: "turn-1",
            original_transcript: null,
            improved_sentence: options.turnImprovedSentence ?? null,
            coco_line: options.turnCocoLine ?? null,
            evaluation: options.turnEvaluation ?? null,
          },
        },
        error: null,
      };
    }
    if (args.p_operation === "insert_audio_clip") {
      return { data: { ok: true, value: { id: "clip-1" } }, error: null };
    }
    if (args.p_operation === "authorize_storage_upload") {
      return {
        data: {
          ok: true,
          value: {
            object_key: `as-1/attempt-1/${payload.turn_order}/${payload.clip_kind}-${payload.audio_clip_id}.webm`,
          },
        },
        error: null,
      };
    }
    if (args.p_operation === "count_transcribed_repeat_clips") {
      if (options.repeatCountError) {
        return { data: null, error: options.repeatCountError };
      }
      const statuses = options.priorRepeatClipStatuses ?? [];
      return {
        data: {
          ok: true,
          value: { count: statuses.filter((status) => status === "transcribed").length },
        },
        error: null,
      };
    }
    if (
      args.p_operation === "record_coco_line" &&
      options.cocoLineUpsertError
    ) {
      return { data: null, error: options.cocoLineUpsertError };
    }
    return { data: { ok: true, value: { error: null } }, error: null };
  });

  return {
    operations,
    storage: { from: vi.fn(() => ({ upload })) },
    upload,
    rpc,
    from: vi.fn((table: string) => createQuery(table)),
  };
}

function fakeGenerateCocoReply(
  impl: (
    input: GenerateCocoReplyInput,
  ) => Promise<
    | GenerateCocoReplyResult
    | { ok: true; reply: { line: string } }
  >,
) {
  return vi.fn(async (input: GenerateCocoReplyInput): Promise<GenerateCocoReplyResult> => {
    const result = await impl(input);
    if (result.ok && "line" in result.reply && !("reaction" in result.reply)) {
      return { ...result, reply: generatedReply(result.reply.line) };
    }
    return result as GenerateCocoReplyResult;
  });
}

function fakeIsContentSafe(
  impl: (text: string) => Promise<
    { safe: boolean; failedOpen: false } | { safe: false; failedOpen: true }
  >,
) {
  return vi.fn(impl);
}

const repeatEvaluator = (overrides = {}) =>
  vi.fn(async () => ({
    ok: true as const,
    evaluation: {
      version: "ai-eval-v1" as const,
      outcome: "repeat_accepted" as const,
      repeatCloseEnough: true,
      englishLanguage: "english" as const,
      confidence: "high" as const,
      reviewReason: null,
      hangulInterpretations: [],
      ...overrides,
    },
  }));

describe("student audio rate-limit presentation", () => {
  const missionFlowSource = readFileSync(
    join(process.cwd(), "src/components/student/MissionFlowShell.tsx"),
    "utf8",
  );

  it("shows distinct wait-and-retry copy instead of a provider-outage message", () => {
    expect(missionFlowSource).toContain('payload?.error === "rate_limited"');
    expect(missionFlowSource).toContain(
      "You’ve practiced a lot in a short time. Wait a few minutes, then try again.",
    );
  });
});

describe("recordSpeakingTry admission and upload", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockConsumeRequestBudget.mockReset();
    mockConsumeRequestBudget.mockResolvedValue({ allowed: true });
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("denies after ownership checks and before audio or provider work", async () => {
    const consumeRequestBudget = vi.fn(async () => ({
      allowed: false as const,
      retryAfterSeconds: 287,
    }));
    const transcribeAudioFile = vi.fn();
    const file = new Blob(["voice"], { type: "audio/webm" });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(
      audioInput({ file }),
      { consumeRequestBudget, transcribeAudioFile },
    );

    expect(result).toEqual({
      ok: false,
      error: "rate_limited",
      retryable: true,
      retryAfterSeconds: 287,
    });
    expect(consumeRequestBudget).toHaveBeenCalledWith({
      actorId: "student-1",
      operation: "student_audio",
    });
    expect(mockSupabase.from).toHaveBeenCalled();
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(transcribeAudioFile).not.toHaveBeenCalled();
  });

  it("stops when the owned assignment lookup has no row", async () => {
    mockSupabase = createMockSupabase({ assignmentFound: false });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput());

    expect(result).toEqual({
      ok: false,
      error: "not_found",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it("uploads, inserts, and transcribes when admission allows", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: multiPatternPresetSnapshot,
    });
    const consumeRequestBudget = vi.fn(async () => ({
      allowed: true as const,
    }));
    const transcribeAudioFile = successfulTranscriber("I like soccer.");
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      consumeRequestBudget,
      transcribeAudioFile,
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result).toMatchObject({ ok: true });
    expect(consumeRequestBudget).toHaveBeenCalledWith({
      actorId: "student-1",
      operation: "student_audio",
    });
    expect(
      mockSupabase.operations.some(({ action }) => action === "insert"),
    ).toBe(true);
    expect(mockSupabase.upload).toHaveBeenCalled();
    expect(transcribeAudioFile).toHaveBeenCalled();
  });

  it("marks the clip failed and returns retryable when storage upload fails", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: multiPatternPresetSnapshot,
      uploadError: new Error("storage unavailable"),
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
    });

    expect(result).toEqual({
      ok: false,
      error: "upload_failed_retryable",
      retryable: true,
    });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "audio_clips" &&
          operation.action === "update" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          "processing_status" in operation.payload &&
          operation.payload.processing_status === "failed",
      ),
    ).toBe(true);
  });

  it("marks the clip failed when transcription fails without writing a transcript", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: multiPatternPresetSnapshot,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: failedTranscriber(),
    });

    expect(result).toEqual({
      ok: false,
      error: "transcription_failed_retryable",
      retryable: true,
    });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "audio_clips" &&
          operation.action === "update" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          "processing_status" in operation.payload &&
          operation.payload.processing_status === "failed",
      ),
    ).toBe(true);
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempt_turns" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          "original_transcript" in operation.payload,
      ),
    ).toBe(false);
  });

  it("rejects closed assignments and attempts before creating audio rows", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    mockSupabase = createMockSupabase({ assignmentStatus: "completed" });
    const completedAssignment = await recordSpeakingTry(audioInput());
    expect(completedAssignment).toEqual({
      ok: false,
      error: "not_found",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some((operation) => operation.table === "audio_clips"),
    ).toBe(false);

    mockSupabase = createMockSupabase({ attemptStatus: "completed" });
    const completedAttempt = await recordSpeakingTry(audioInput());
    expect(completedAttempt).toEqual({
      ok: false,
      error: "not_found",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some((operation) => operation.table === "audio_clips"),
    ).toBe(false);
  });

  it("rejects malformed audio before ownership, upload, or transcription work", async () => {
    const transcribeAudioFile = successfulTranscriber("should not run");
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    await expect(
      recordSpeakingTry(
        audioInput({ mimeType: "audio/ogg" }),
        { transcribeAudioFile },
      ),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_audio",
      retryable: false,
    });
    await expect(
      recordSpeakingTry(
        audioInput({ byteSize: 5 * 1024 * 1024 + 1 }),
        { transcribeAudioFile },
      ),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_audio",
      retryable: false,
    });

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(transcribeAudioFile).not.toHaveBeenCalled();
  });

  it("persists a successful pronunciation score for an original answer", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: multiPatternPresetSnapshot,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const scorePronunciation = vi.fn(async () => ({
      ok: true as const,
      score: {
        accuracyScore: 88,
        fluencyScore: 90,
        completenessScore: 95,
        pronunciationScore: 87,
        starBand: 3 as const,
        referenceText: "I like soccer.",
        wordScores: [
          { word: "soccer", accuracyScore: 40, errorType: "Mispronunciation" },
        ],
      },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      starBand: 3,
      wordsToPractice: [{ word: "soccer", label: "Mispronounced" }],
    });
    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceText: "I like soccer.",
        durationMs: 1200,
      }),
    );
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "pronunciation_scores",
      ),
    ).toBe(true);
  });
});

describe("recordSpeakingTry conversation-mode orchestration", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockConsumeRequestBudget.mockReset();
    mockConsumeRequestBudget.mockResolvedValue({ allowed: true });
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("does not score, evaluate, generate, or warm TTS for an incomplete recording", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi.fn();
    const scorePronunciation = vi.fn();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should not be called" },
    }));
    const warmTtsAudioCache = vi.fn();

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I"),
      evaluateOriginalTurn,
      scorePronunciation,
      generateCocoReply: generate,
      warmTtsAudioCache,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "incomplete_recording",
        requireRepeat: false,
      },
    });
    expect(evaluateOriginalTurn).not.toHaveBeenCalled();
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(warmTtsAudioCache).not.toHaveBeenCalled();
  });

  it("preserves the ambiguity budget through an incomplete re-recording", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I"),
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        retryReason: "incomplete_recording",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
          },
        ],
      },
    });
  });

  it("repairs an unsafe correction exactly once before continuing", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What games do you like to play when you swim together?",
            targetExample: "I will swim with my family.",
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation({
          outcome: "needs_correction",
          correctionNeeded: true,
          correctionSeverity: "material",
          correctionReason: "grammar",
          improvedSentence:
            "I like to play Jenga when we swim together.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation(),
      });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Nice plans! Who will you swim with?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like to play Jenga."),
      evaluateOriginalTurn,
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
    expect(evaluateOriginalTurn.mock.calls[1]?.[0].policyRepair).toEqual({
      violations: ["pure_embellishment"],
    });
    expect(result).toMatchObject({
      ok: true,
      evaluation: { outcome: "accepted_original", requireRepeat: false },
    });
  });

  it("keeps failed_schema when a contract repair returns malformed output", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        conversationMode: false,
        requiredTurns: 1,
        targetPattern: undefined,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            targetPattern: "Can I have ___, please?",
          },
        ],
      } as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const firstEvaluation = successfulOriginalEvaluator({
      outcome: "teacher_review",
      meaningUnderstood: true,
      targetPatternAttempted: false,
      correctionNeeded: false,
      correctionSeverity: "none",
      correctionReason: "none",
      improvedSentence: null,
      reviewReason: "ambiguous",
    });
    const evaluateOriginalTurn = vi
      .fn()
      .mockImplementationOnce(firstEvaluation)
      .mockResolvedValueOnce({
        ok: false as const,
        error: "schema_failed" as const,
      });

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like to play Jenga."),
      evaluateOriginalTurn,
    });

    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "teacher_review",
        reviewReason: "failed_schema",
      },
    });
  });

  it("repairs a contradictory understood ambiguity exactly once", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What will you do at the beach?",
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation({
          outcome: "teacher_review",
          meaningUnderstood: true,
          reviewReason: "ambiguous",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation({
          outcome: "needs_correction",
          correctionNeeded: true,
          correctionSeverity: "material",
          correctionReason: "grammar",
          improvedSentence:
            "I will swim, and my family will eat 삼겹살.",
          hangulInterpretations: [
            { hangul: "삼겹살", kind: "name" as const, englishReading: null },
          ],
        }),
      });

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber(
        "I will swimming and my family eat 삼겹살.",
      ),
      evaluateOriginalTurn,
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "That sounds fun! What will you eat?" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
    expect(
      evaluateOriginalTurn.mock.calls[1]?.[0].policyRepair.violations,
    ).toContain("teacher_review_meaning_understood");
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "needs_correction",
        requireRepeat: true,
      },
    });
  });

  it("persists the static say-it-again recovery line without a generation call", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Do you want juice or water?" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("At my family maybe."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-1",
            evaluation: {
              outcome: "teacher_review",
              reviewReason: "ambiguous",
            },
          },
        ],
      },
      cocoLine: SAY_IT_AGAIN_FALLBACK_LINE,
    });
    expect(result.ok && result.cocoLineModerationEvent === null).toBe(true);
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({
          coco_line: SAY_IT_AGAIN_FALLBACK_LINE,
          evaluation: expect.objectContaining({
            ambiguityHistory: expect.arrayContaining([
              expect.objectContaining({
                question: "What would you like to say?",
                recoveryQuestion: SAY_IT_AGAIN_FALLBACK_LINE,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it("does not advance the ambiguity counter when recovery-line persistence fails", async () => {
    mockSupabase = createMockSupabase({
      cocoLineUpsertError: { message: "recovery line write down" },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("At my family maybe."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
    });

    expect(result).toEqual({ ok: false, error: "db_error", retryable: true });
    const counterWriteWithoutRecoveryLine = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "evaluation" in operation.payload &&
        (operation.payload.evaluation as { ambiguityRetries?: unknown })
          ?.ambiguityRetries === 1 &&
        !("coco_line" in operation.payload),
    );
    expect(counterWriteWithoutRecoveryLine).toBeUndefined();
  });

  it("treats a prompt echo as an unanswered conversation turn", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt:
              "It's almost summer vacation! What are you going to do during summer vacation?",
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        evaluation: originalEvaluation({ targetPatternAttempted: false }),
      })
      .mockResolvedValueOnce({
        ok: true as const,
        evaluation: originalEvaluation({
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          reviewReason: "ambiguous",
        }),
      });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "This should not be generated." },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber(
        "It's almost summer vacation.",
      ),
      evaluateOriginalTurn,
      generateCocoReply: generate,
    });

    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
    expect(evaluateOriginalTurn.mock.calls[1]?.[0].policyRepair).toEqual({
      violations: ["prompt_echo"],
    });
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        contractViolations: ["prompt_echo"],
      },
      cocoLine: null,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({
          evaluation: expect.objectContaining({
            outcome: "retry_original",
            ambiguityRetries: 1,
            contractViolations: ["prompt_echo"],
          }),
        }),
      }),
    );
  });

  it("sends a repeated prompt echo to teacher review after one retry", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt:
              "It's almost summer vacation! What are you going to do during summer vacation?",
          },
        ],
      },
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "It's almost summer vacation.",
            audioClipId: "clip-first",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        evaluation: originalEvaluation({ targetPatternAttempted: false }),
      })
      .mockResolvedValueOnce({
        ok: true as const,
        evaluation: originalEvaluation({
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          reviewReason: "ambiguous",
        }),
      });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Thanks for trying! What else do you want to tell me?" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber(
        "It's almost summer vacation.",
      ),
      evaluateOriginalTurn,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "teacher_review",
        ambiguityRetries: 1,
        contractViolations: ["prompt_echo"],
      },
      cocoLine: null,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the one unclear retry for a low-confidence schema failure", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Do you want juice or water?" },
    }));

    // Confidence between the gate (-0.78) and hallucination (-0.1)
    // thresholds: the evaluator runs, fails the schema, and the
    // conversation-mode low-confidence fallback consumes the ambiguity
    // ladder — the gate must not intercept this band.
    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: vi.fn(async () => ({
        ok: true as const,
        text: "All right, I want how we are.",
        koreanSpans: [],
        model: "test-transcriber",
        confidence: {
          minLogprob: -0.5,
          tokenCount: 9,
        },
      })),
      evaluateOriginalTurn: vi.fn(async () => ({
        ok: false as const,
        error: "schema_failed" as const,
      })),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        transcriptionConfidence: {
          minLogprob: -0.5,
          tokenCount: 9,
        },
      },
      cocoLine: SAY_IT_AGAIN_FALLBACK_LINE,
    });
  });

  it("gates a garbled low-confidence transcript behind a free say-it-again retry before any evaluation call", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator({
      outcome: "correct",
      meaningUnderstood: true,
      targetPatternAttempted: true,
      confidence: "high",
      reviewReason: null,
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be generated" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: lowConfidenceTranscriber("I'm letter Busan because beach is beautiful."),
      evaluateOriginalTurn: evaluate,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 0,
        lowConfidenceAudioRetries: 1,
      },
      cocoLine: SAY_IT_AGAIN_FALLBACK_LINE,
    });
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({
          evaluation: expect.objectContaining({
            outcome: "retry_original",
            lowConfidenceAudioRetries: 1,
            ambiguityRetries: 0,
          }),
        }),
      }),
    );
  });

  it("does not persist malformed recovery counters as a pending retry", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "What would you like to say next?" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "non_english" as const,
        meaningUnderstood: false,
        targetPatternAttempted: false,
        englishLanguage: "non_english" as const,
        retryReason: "unclear_meaning" as const,
        ambiguityRetries: 3,
        lowConfidenceAudioRetries: 3,
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 3,
        lowConfidenceAudioRetries: 3,
      },
      cocoLine: "What would you like to say next?",
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ generationPurpose: { kind: "next_turn" } }),
    );
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({
          evaluation: expect.objectContaining({
            ambiguityRetries: 3,
            lowConfidenceAudioRetries: 3,
          }),
        }),
      }),
    );
  });

  it("spends the second free gate retry without calling the evaluator", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "low",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        lowConfidenceAudioRetries: 1,
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator();

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: lowConfidenceTranscriber("Still garbled audio.", -1.2),
      evaluateOriginalTurn: evaluate,
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "unused" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 0,
        lowConfidenceAudioRetries: 2,
      },
      cocoLine: SAY_IT_AGAIN_FALLBACK_LINE,
    });
  });

  it("keeps a low-confidence retry static after the ambiguity ladder is spent", async () => {
    const ambiguityHistory = [
      {
        transcript: "At my family maybe.",
        audioClipId: "clip-first",
        question: "What would you like to say?",
        evaluation: originalEvaluation({
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: "ambiguous",
        }),
      },
      {
        transcript: "Maybe family there.",
        audioClipId: "clip-second",
        question: "Where would you say that?",
        evaluation: originalEvaluation({
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: "ambiguous",
        }),
      },
    ];
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "low",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 2,
        lowConfidenceAudioRetries: 0,
        ambiguityHistory,
      },
      turnCocoLine: "Where would you say that?",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "must not generate" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: lowConfidenceTranscriber("Still garbled audio."),
      evaluateOriginalTurn: evaluate,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      cocoLine: SAY_IT_AGAIN_FALLBACK_LINE,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 2,
        lowConfidenceAudioRetries: 1,
        ambiguityHistory,
      },
    });
  });

  it("falls through to the evaluator once the gate budget is exhausted", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "low",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        lowConfidenceAudioRetries: 2,
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator({
      outcome: "teacher_review",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      confidence: "medium",
      reviewReason: "ambiguous",
    });

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: lowConfidenceTranscriber("Still garbled audio.", -1.2),
      evaluateOriginalTurn: evaluate,
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "Okay! No worries! What is your favorite game?" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluate).toHaveBeenCalledTimes(1);
    // Gate exhausted + ambiguous verdict consumes the ambiguity ladder as
    // normal — audio retries never bought a pass on meaningful-answer rules.
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        lowConfidenceAudioRetries: 2,
      },
    });
  });

  it("does not gate a confident transcript even when it decodes oddly", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator();
    const transcribe = vi.fn(async () => ({
      ok: true as const,
      text: "I'm letter Busan because beach is beautiful.",
      koreanSpans: [],
      model: "test-transcriber",
      confidence: { minLogprob: -0.3, tokenCount: 8 },
    }));

    await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: evaluate,
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "unused" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        vocabularyHint: expect.stringContaining("Coffee shop"),
      }),
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("preserves first-try ambiguity evidence when the retry is still unclear", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
            question: "What would you like to say?",
            evaluation: {
              ...originalEvaluation({
                outcome: "teacher_review",
                meaningUnderstood: false,
                targetPatternAttempted: false,
                confidence: "medium",
                reviewReason: "ambiguous",
              }),
            },
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Thanks for trying! What else do you want to tell me?" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Maybe family there."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 2,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
          },
          {
            transcript: "Maybe family there.",
            question: "What would you like to say?",
          },
        ],
      },
      cocoLine: 'Who do you talk to about the topic "coffee shop"?',
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        responseHandling: "review_pending",
        generationPurpose: {
          kind: "unclear_recovery",
          attempt: 2,
          fallbackQuestion: 'Who do you talk to about the topic "coffee shop"?',
          pivotWord: "where",
          topicSeed: "Coffee shop scene",
        },
      }),
    );
  });

  it("replaces a same-angle recovery candidate with the deterministic pivot", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
            question: "What would you like to say?",
            evaluation: {
              ...originalEvaluation({
                outcome: "teacher_review",
                meaningUnderstood: false,
                targetPatternAttempted: false,
                confidence: "medium",
                reviewReason: "ambiguous",
              }),
            },
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "What would you like to order today?" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Maybe family there."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: 'Who do you talk to about the topic "coffee shop"?',
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "recovery_pivot_rejected",
        violations: expect.arrayContaining(["same_question_word"]),
      },
    });
  });

  it("keeps an on-topic different-angle recovery candidate as generated", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
            question: "What would you like to say?",
            evaluation: {
              ...originalEvaluation({
                outcome: "teacher_review",
                meaningUnderstood: false,
                targetPatternAttempted: false,
                confidence: "medium",
                reviewReason: "ambiguous",
              }),
            },
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Where in the coffee shop would you sit?" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Something unclear."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: "Where in the coffee shop would you sit?",
    });
    expect(result.ok && result.cocoLineModerationEvent === null).toBe(true);
  });

  it("uses the one unclear retry when correction repair resolves to genuine ambiguity", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What games do you like to play when you swim together?",
            targetExample: "I will swim with my family.",
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation({
          outcome: "needs_correction",
          correctionNeeded: true,
          correctionSeverity: "material",
          correctionReason: "grammar",
          improvedSentence:
            "I like to play Jenga on the side of the pool.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation({
          outcome: "teacher_review",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: "ambiguous",
        }),
      });

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("On the side."),
      evaluateOriginalTurn,
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "What game do you mean?" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
    expect(evaluateOriginalTurn.mock.calls[1]?.[0].policyRepair).toEqual({
      violations: ["unsupported_detail"],
    });
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        improvedSentence: null,
        requireRepeat: false,
      },
    });
  });

  it("generates and persists recovery 2 from the earlier understood exchange", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "Where are you going this summer?",
          },
        ],
      },
      previousTurns: [
        {
          turn_order: 1,
          original_transcript: "I'm going to the waterpark.",
          improved_sentence: null,
          coco_line: "Who are you going with?",
          evaluation: originalEvaluation(),
        },
      ],
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "Maybe my friend.",
            audioClipId: "clip-first",
            question: "Who are you going with?",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
      turnCocoLine: "Do you want juice or water?",
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = successfulOriginalEvaluator({
      outcome: "teacher_review",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      confidence: "medium",
      reviewReason: "ambiguous",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "What do you like to do after school?" },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("Something unclear."),
      evaluateOriginalTurn,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        requireRepeat: false,
        ambiguityRetries: 2,
        ambiguityHistory: [
          expect.objectContaining({
            transcript: "Maybe my friend.",
            question: "Who are you going with?",
          }),
          expect.objectContaining({
            transcript: "Something unclear.",
            question: "Do you want juice or water?",
          }),
        ],
      },
      cocoLine: 'What can you tell me about the topic "coffee shop"?',
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "recovery_pivot_rejected",
        violations: expect.arrayContaining(["off_topic"]),
      },
    });
    expect(evaluateOriginalTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        missionQuestion: "Do you want juice or water?",
      }),
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        responseHandling: "review_pending",
        generationPurpose: {
          kind: "unclear_recovery",
          attempt: 2,
          fallbackQuestion: 'What can you tell me about the topic "coffee shop"?',
          pivotWord: "where",
          topicSeed: "Coffee shop scene",
        },
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Where are you going this summer?",
            studentResponse: "I'm going to the waterpark.",
          },
          {
            turnOrder: 2,
            cocoLine: "Who are you going with?",
            studentResponse: "(not understood)",
          },
        ],
      }),
    );
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({
          coco_line: 'What can you tell me about the topic "coffee shop"?',
          evaluation: expect.objectContaining({
            outcome: "retry_original",
            ambiguityRetries: 2,
          }),
        }),
      }),
    );
  });

  it("routes a third unclear answer to review without another recovery", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 2,
        ambiguityHistory: [
          {
            transcript: "Maybe my friend.",
            audioClipId: "clip-first",
            question: "What would you like to say?",
            recoveryQuestion: "Do you want juice or water?",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
          {
            transcript: "Something unclear.",
            audioClipId: "clip-second",
            question: "Do you want juice or water?",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "This should not be a recovery." },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("A third unclear answer."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "teacher_review",
        ambiguityRetries: 2,
      },
      cocoLine: "Okay! No worries! This should not be a recovery.",
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        responseHandling: "review_pending",
        generationPurpose: { kind: "next_turn" },
      }),
    );
    expect(generate.mock.calls).not.toContainEqual([
      expect.objectContaining({
        generationPurpose: expect.objectContaining({ kind: "unclear_recovery" }),
      }),
    ]);
  });

  it("falls back to the deterministic pivot when recovery 2 generation fails", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "Who do you like to play soccer with?",
          },
        ],
      },
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
            question: "Who do you like to play soccer with?",
            evaluation: {
              ...originalEvaluation({
                outcome: "teacher_review",
                meaningUnderstood: false,
                targetPatternAttempted: false,
                confidence: "medium",
                reviewReason: "ambiguous",
              }),
            },
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Something unclear."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: 'What can you tell me about the topic "coffee shop"?',
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "provider_failed",
      },
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 2,
      },
    });
    expect(mockSupabase.operations).toContainEqual(
      expect.objectContaining({
        table: "attempt_turns",
        action: "upsert",
        payload: expect.objectContaining({
          coco_line: 'What can you tell me about the topic "coffee shop"?',
        }),
      }),
    );
  });

  it("rejects a recovery 2 pivot grounded only in a generic mission title", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        title: "Homework 3",
        targetPattern: "I like soccer.",
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What do you like to do after school?",
            targetExample: "I like to play soccer.",
          },
        ],
      },
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "Maybe soccer.",
            audioClipId: "clip-first",
            question: "What do you like to do after school?",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
      turnCocoLine: "What do you like to do after school?",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generatedPivot = "Where is your homework?";
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: generatedPivot },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Something unclear."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: 'Who do you talk to about the topic "soccer"?',
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "recovery_pivot_rejected",
      },
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: expect.objectContaining({
          topicSeed: expect.stringContaining("I like soccer."),
        }),
      }),
    );
    const generationInput = generate.mock.calls[0]?.[0];
    if (generationInput?.generationPurpose?.kind === "unclear_recovery") {
      expect(generationInput.generationPurpose.topicSeed).not.toContain(
        "Homework 3",
      );
    }
    expect(result.ok && result.cocoLine).not.toBe(generatedPivot);
  });

  it("skips a blank scaffold target pattern when choosing recovery topic", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        title: "City life",
        targetPattern: "I'd rather _____ because _____",
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "Would you rather live in a big city or a small town?",
          },
        ],
      },
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "Maybe city.",
            audioClipId: "clip-first",
            question: "Would you rather live in a big city or a small town?",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
      turnCocoLine: "Would you rather live in a big city or a small town?",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generatedPivot =
      'What can you tell me about the topic "rather because"?';
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: generatedPivot },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Something unclear."),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: 'What can you tell me about the topic "city life"?',
      cocoLineModerationEvent: {
        kind: "canned_fallback",
        cause: "recovery_pivot_rejected",
      },
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        generationPurpose: expect.objectContaining({
          topicSeed: "City life",
        }),
      }),
    );
    expect(result.ok && result.cocoLine).not.toBe(generatedPivot);
    expect(result.ok && result.cocoLine).not.toMatch(/rather|because/u);
  });

  it("evaluates a re-upload against the current row recovery question", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
            question: "What would you like to say?",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
      turnCocoLine: "Do you want juice or water?",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = successfulOriginalEvaluator({
      outcome: "teacher_review",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      confidence: "medium",
      reviewReason: "ambiguous",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "What do you like to do after school?" },
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Something unclear."),
      evaluateOriginalTurn,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: 'What can you tell me about the topic "coffee shop"?',
    });
    expect(evaluateOriginalTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        missionQuestion: "Do you want juice or water?",
      }),
    );
  });

  it.each([
    ["minimal_effort"],
    ["incomplete_recording"],
  ] as const)(
    "keeps the current recovery question after a %s retry guard",
    async (retryReason) => {
      mockSupabase = createMockSupabase({
        turnEvaluation: {
          ...originalEvaluation({
            outcome: "retry_original",
            meaningUnderstood: false,
            targetPatternAttempted: false,
            confidence: "medium",
            reviewReason: null,
          }),
          retryReason,
          ambiguityRetries: 1,
        },
        turnCocoLine: "Do you want juice or water?",
      });
      const { recordSpeakingTry } = await import(
        "@/server/student-access/audio-upload"
      );
      const evaluateOriginalTurn = successfulOriginalEvaluator({
        outcome: "teacher_review",
        meaningUnderstood: false,
        targetPatternAttempted: false,
        confidence: "medium",
        reviewReason: "ambiguous",
      });

      await recordSpeakingTry(audioInput(), {
        transcribeAudioFile: successfulTranscriber("I like juice."),
        evaluateOriginalTurn,
        generateCocoReply: fakeGenerateCocoReply(async () => ({
          ok: true,
          reply: { line: "What else do you like?" },
        })),
        isContentSafe: fakeIsContentSafe(async () => ({
          safe: true,
          failedOpen: false,
        })),
      });

      expect(evaluateOriginalTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          missionQuestion: "Do you want juice or water?",
        }),
      );
    },
  );

  it("routes a second unsafe correction to review without repeat or correction TTS", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What games do you like to play when you swim together?",
            targetExample: "I will swim with my family.",
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const unsafe = originalEvaluation({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "I like to play Jenga when we swim together.",
    });
    const evaluateOriginalTurn = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, evaluation: unsafe })
      .mockResolvedValueOnce({ ok: true, evaluation: unsafe });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "reply_policy_failed",
      violations: ["question_format"],
      rejectedCandidate: {
        reaction: "Try again.",
        focus: null,
        question: null,
      },
      rejectedAttempt: "corrected",
    }));
    const warmTtsAudioCache = vi.fn();

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like to play Jenga."),
      evaluateOriginalTurn,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({ safe: true, failedOpen: false })),
      warmTtsAudioCache,
    });

    if (!result.ok) throw new Error(`expected upload success, got ${result.error}`);
    expect(result.evaluation).toMatchObject({
      outcome: "teacher_review",
      requireRepeat: false,
      // Issue #65: a rejected verdict that repair could not fix is a
      // contract rejection, not a schema decode failure.
      reviewReason: "contract_rejected",
      contractViolations: ["pure_embellishment"],
    });
    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
    expect(warmTtsAudioCache).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ responseHandling: "review_pending" }),
    );
  });

  it("accepts a meaningful fragment unchanged when complete sentences are disabled", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        requireCompleteSentenceAnswers: false,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What games do you like to play when you swim together?",
            targetExample: "I will swim with my family.",
          },
        ],
      } as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = successfulOriginalEvaluator();

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("My family."),
      evaluateOriginalTurn,
    });

    expect(result).toMatchObject({
      ok: true,
      displayTranscript: "My family.",
      evaluation: { outcome: "accepted_original", improvedSentence: null },
    });
    expect(evaluateOriginalTurn).toHaveBeenCalledWith(
      expect.objectContaining({ requireCompleteSentenceAnswers: false }),
    );
  });

  it("requires one repeat for a grounded fragment completion when enabled", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        requireCompleteSentenceAnswers: true,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What games do you like to play when you swim together?",
            targetExample: "I will swim with my family.",
          },
        ],
      } as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "fragment_completion",
      improvedSentence: "I will swim with my family.",
    });

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("My family."),
      evaluateOriginalTurn,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "needs_correction",
        improvedSentence: "I will swim with my family.",
        requireRepeat: true,
      },
    });
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

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput(), {
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

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "I don't play soccer.",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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

  it("repairs a correction that parrots the mission question before routing to review", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    // Provider disobeys the "never use the missionQuestion as
    // improvedSentence" instruction — the deterministic guard must catch it.
    const parrotedEvaluation = {
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "How often do you play soccer?",
    } as const;
    const evaluateOriginal = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation(parrotedEvaluation),
      })
      .mockResolvedValueOnce({
        ok: true,
        evaluation: originalEvaluation(parrotedEvaluation),
      });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, what do you like to do instead?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I don't"),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
    });

    expect(evaluateOriginal).toHaveBeenCalledTimes(2);
    expect(evaluateOriginal.mock.calls[1]?.[0].policyRepair).toEqual({
      violations: ["parroted_question", "unsupported_detail"],
    });
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "teacher_review",
        improvedSentence: null,
        requireRepeat: false,
      },
    });
  });

  // Wiring check for guardNoOpCorrection (UAT 2026-07-25, attempt 103fa68e
// turn 2). The unit tests in tests/domain/turn-evaluation.test.ts cover the
  // comparison itself; this drives the whole upload path to prove the guard is
  // actually in the chain and that the live transcript reaches it. It replaces
  // a live UAT that could not be reproduced on demand — the defect depends on
  // the provider returning a vacuous correction, which is not triggerable.
  it("never demands a repeat when the correction is identical to what the student said (UAT 2026-07-25)", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    // The recorded defect: provider echoes the student's own sentence back as
    // a "material" correction and demands a repeat.
    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "I want to read many cartoons.",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Which cartoon is your favourite?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));
    const warmTtsAudioCache = vi.fn(async () => ({
      ok: true as const,
      warmed: 1,
      skipped: 0,
      failed: 0,
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("I want to read many cartoons."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: moderate,
      warmTtsAudioCache,
    });

    // The child is accepted and the conversation continues — no re-record.
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "accepted_original",
        improvedSentence: null,
        requireRepeat: false,
      },
      cocoLine: "Which cartoon is your favourite?",
    });

    // The vacuous correction is never persisted, so it can never be shown or
    // spoken back to the student.
    const turnUpsert = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        (operation.payload as { original_transcript?: unknown })
          .original_transcript !== undefined,
    );
    if (!turnUpsert) throw new Error("expected an original turn upsert");
    expect(turnUpsert.payload).toMatchObject({
      original_transcript: "I want to read many cartoons.",
      improved_sentence: null,
    });

    // TTS is warmed for Coco's reply only — never for the discarded correction.
    expect(warmTtsAudioCache).toHaveBeenCalledTimes(1);
    expect(warmTtsAudioCache).toHaveBeenCalledWith(
      expect.objectContaining({ texts: ["Which cartoon is your favourite?"] }),
    );
  });

  it("accepts an optional-detail correction without repair or repeat", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What do you make at the beach?",
            targetExample: "I make sandcastles.",
          },
        ],
      },
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "fragment_completion",
      improvedSentence: "I make sandcastles at the beach.",
    });

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I make sandcastles."),
      evaluateOriginalTurn,
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "What do you build there?" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "accepted_original",
        improvedSentence: null,
        requireRepeat: false,
      },
    });
  });

  it("persists an accepted minor recast, grounds Coco with it, and does not warm correction TTS", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "minor",
      correctionReason: "grammar",
      improvedSentence: "I don't play soccer much.",
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

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
        improvedSentence: "I don't play soccer much.",
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
          improved_sentence: "I don't play soccer much.",
        }),
      }),
    );
  });

  it("persists a provider-classified regular singular/plural recast as accepted minor", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...soccerConversationSnapshot,
        targetPattern: "I watch _____.",
        turns: [
          {
            ...soccerConversationSnapshot.turns[0],
            prompt: "What do you watch?",
            targetExample: "I watch cartoons.",
          },
        ],
      } as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "minor",
      correctionReason: "grammar",
      improvedSentence: "I watch cartoons.",
    });
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "What kind of cartoons do you like?" },
    }));
    const warmTtsAudioCache = vi.fn(async () => ({
      ok: true as const,
      warmed: 1,
      skipped: 0,
      failed: 0,
    }));

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I watch cartoon."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
      warmTtsAudioCache,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "accepted_original",
        correctionSeverity: "minor",
        improvedSentence: "I watch cartoons.",
        requireRepeat: false,
      },
      cocoLine: "What kind of cartoons do you like?",
    });
    expect(warmTtsAudioCache).toHaveBeenCalledTimes(1);
    expect(warmTtsAudioCache).toHaveBeenCalledWith(
      expect.objectContaining({ texts: ["What kind of cartoons do you like?"] }),
    );
    const turnUpsert = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        (operation.payload as { original_transcript?: unknown })
          .original_transcript === "I watch cartoon.",
    );
    if (!turnUpsert) throw new Error("expected a singular/plural turn upsert");
    expect(turnUpsert.payload).toMatchObject({
      original_transcript: "I watch cartoon.",
      improved_sentence: "I watch cartoons.",
      evaluation: expect.objectContaining({
        outcome: "accepted_original",
        correctionSeverity: "minor",
        requireRepeat: false,
      }),
    });
  });

  it("still warms correction TTS for a material conversation-mode correction", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
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

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
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

    await recordSpeakingTry(audioInput(), {
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
    // The first unclear retry is the static say-it-again line, so the
    // generation adapter is not owned a call on this path at all.
    expect(generate).not.toHaveBeenCalled();
  });

  it("flagged student input: no generateCocoReply call; canned redirect persisted with flagged_student_input event", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: false, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 9 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Great! Tell me one more thing." },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
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

  // reply_hint_frame records the hint frame that was AVAILABLE for the question
  // the student answered, so a later change to buildReplyHintFrame cannot
  // rewrite what old attempts actually showed. It is not a record of whether
  // the student expanded the hint.
  it("stores the reply hint frame for the dynamic question the student answered", async () => {
    mockSupabase = createMockSupabase({
      previousTurns: [
        {
          turn_order: 1,
          original_transcript: "I like soccer.",
          improved_sentence: null,
          coco_line: "What will you do next?",
        },
      ],
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I will play soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "Great! Tell me one more thing." },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result.ok).toBe(true);
    const answerWrite = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );
    // The frame comes from the prior turn's persisted coco_line, not from the
    // authored opener and not from the next line Coco is about to say.
    expect(answerWrite?.payload).toMatchObject({
      reply_hint_frame: "I will ____.",
    });
  });

  it("stores the reply hint frame for the conversation opener on turn one", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            turnOrder: 1,
            prompt: "What do you like to do after school?",
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like to play soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: fakeGenerateCocoReply(async () => ({
        ok: true,
        reply: { line: "Nice! Where do you play?" },
      })),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result.ok).toBe(true);
    const answerWrite = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );
    expect(answerWrite?.payload).toMatchObject({
      reply_hint_frame: "I like to ____.",
    });
  });

  it("stores a null reply hint frame for preset missions", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        conversationMode: false,
        requiredTurns: 1,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            turnOrder: 1,
            // Would yield "I want to order ____." in conversation mode; preset
            // missions must stay null because they never show a reply hint.
            prompt: "What do you want to order?",
          },
        ],
      } as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Can I have a juice, please?"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
    });

    expect(result.ok).toBe(true);
    const answerWrite = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );
    expect(answerWrite?.payload).toMatchObject({ reply_hint_frame: null });
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Great! Tell me one more thing." },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Oh, in the classroom! What do you talk about?" },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
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

  it("hands a prior teacher-review turn to generation as not understood", async () => {
    // End-to-end wiring for attempt 4c1f229e: the history select must fetch
    // `evaluation`, and buildConversationHistory must mask the unusable answer
    // so it can never ground a later line or the closing recap.
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        turns: [
          {
            ...conversationMissionSnapshotFixture.turns[0],
            prompt: "What games are you going to play this summer?",
          },
        ],
      },
      previousTurns: [
        {
          turn_order: 1,
          original_transcript: "발러런트",
          improved_sentence: null,
          coco_line: "Do you like to play games inside or outside?",
          evaluation: {
            outcome: "teacher_review",
            reviewReason: "failed_schema",
          },
        },
      ],
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Thanks for telling me! What do you like about that?" },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("Inside."),
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
          expect.objectContaining({
            turnOrder: 1,
            studentResponse: "(not understood)",
          }),
          expect.objectContaining({
            turnOrder: 2,
            studentResponse: "Inside.",
          }),
        ],
      }),
    );
  });

  it("returns a retryable database error when conversation history lookup fails", async () => {
    mockSupabase = createMockSupabase({
      historyLookupError: { message: "history unavailable" },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
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

  it("rechecks the owned in-progress attempt before reading conversation history", async () => {
    mockSupabase = createMockSupabase({
      attemptStatuses: ["in_progress", "completed"],
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const transcribe = successfulTranscriber("In the classroom.");

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: transcribe,
    });

    expect(result).toEqual({ ok: false, error: "not_found", retryable: false });
    expect(transcribe).not.toHaveBeenCalled();
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempt_turns" &&
          operation.action === "select" &&
          operation.filters.some(([column]) => column === "turn_order<"),
      ),
    ).toBe(false);
    expect(
      mockSupabase.operations.some((operation) => operation.table === "audio_clips"),
    ).toBe(false);
  });

  it("does not upload or transcribe when the attempt ends before storage admission", async () => {
    mockSupabase = createMockSupabase({
      attemptStatuses: [
        "in_progress",
        "in_progress",
        "in_progress",
        "completed",
      ],
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const transcribe = successfulTranscriber("Can I have a juice, please?");

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: transcribe,
    });

    expect(result).toEqual({ ok: false, error: "not_found", retryable: false });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects a dynamic turn with no persisted Coco line before upload or evaluation", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
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

  it("rejects a dynamic turn when saved Conversation history is out of order", async () => {
    mockSupabase = createMockSupabase({
      previousTurns: [
        {
          turn_order: 1,
          original_transcript: "Answer one.",
          improved_sentence: null,
          coco_line: "Question two?",
        },
        {
          turn_order: 3,
          original_transcript: "Answer three.",
          improved_sentence: null,
          coco_line: "Question four?",
        },
      ],
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "should never be called" },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 3 }), {
      transcribeAudioFile: successfulTranscriber("I play soccer."),
      evaluateOriginalTurn: evaluateOriginal,
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toEqual({ ok: false, error: "invalid_audio", retryable: false });
    expect(evaluateOriginal).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it("does not load Conversation history for a later-turn repeat upload", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: soccerConversationSnapshot,
      historyLookupError: { message: "repeat must not load history" },
      turnEvaluation: originalEvaluation({
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "material",
        improvedSentence: "I play soccer every day.",
      }),
      turnImprovedSentence: "I play soccer every day.",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = repeatEvaluator();

    const result = await recordSpeakingTry(
      {
        ...audioInput({ turnOrder: 2 }),
        clipKind: "repeat_attempt" as const,
      },
      {
        transcribeAudioFile: successfulTranscriber("I play soccer daily."),
        evaluateRepeatTurn: evaluateRepeat,
      },
    );

    expect(result.ok).toBe(true);
    expect(evaluateRepeat).toHaveBeenCalled();
  });

  it("generated line passes moderation: coco_line persisted with no moderation_event; TTS warmed", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "That sounds great! What else would you like?" },
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));
    const warm = vi.fn(async () => ({ ok: true as const, warmed: 1, skipped: 0, failed: 0 }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
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
    const { recordSpeakingTry } = await import(
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

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
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

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));
    const moderate = fakeIsContentSafe(async () => ({ safe: true, failedOpen: false }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
      const { recordSpeakingTry } = await import(
        "@/server/student-access/audio-upload"
      );
      const generate = fakeGenerateCocoReply(async () => ({ ok: false, error }));
      const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "reply_policy_failed",
      violations: ["either_or_question", "topic_drift"],
      rejectedCandidate: {
        reaction: "Nice!",
        focus: "soccer",
        question: "Do you play soccer or basketball?",
      },
      rejectedAttempt: "corrected",
    }));
    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
        rejectedCandidate: {
          reaction: "Nice!",
          focus: "soccer",
          question: "Do you play soccer or basketball?",
        },
        rejectedAttempt: "corrected",
      },
    });
  });

  it("selects the meaningful follow-up fallback when generation fails after a substantive answer", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
      cocoLine: "Thanks for telling me! Can you tell me one more thing?",
      cocoLineModerationEvent: { kind: "canned_fallback", cause: "provider_failed" },
    });
  });

  it("selects the vague_or_stuck follow-up fallback when generation fails after a vague answer", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "schema_failed",
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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

  it("answers the first unclear retry with the static line even when generation would fail", async () => {
    const { recordSpeakingTry } = await import(
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

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
      cocoLine: SAY_IT_AGAIN_FALLBACK_LINE,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
      },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("selects the uncertain follow-up fallback for unsafe student input regardless of transcript content", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "This must not be generated." },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
      cocoLine: "Thanks for trying! What else do you want to tell me?",
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: false,
      error: "provider_failed",
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 4 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "This must not be generated." },
    }));
    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
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
    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const closing =
      "Sushi sounds delicious! Thanks for talking with me. See you next time!";
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: closing },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 4 }), {
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
    const { recordSpeakingTry } = await import(
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
          rejectedCandidate: {
            reaction: "Try again.",
            focus: null,
            question: null,
          },
          rejectedAttempt: "corrected",
        },
        expectedEvent: {
          kind: "canned_fallback",
          cause: "reply_policy_failed",
          violations: ["question_format"],
          rejectedCandidate: {
            reaction: "Try again.",
            focus: null,
            question: null,
          },
          rejectedAttempt: "corrected",
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

      const result = await recordSpeakingTry(audioInput({ turnOrder: 4 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    let moderationCall = 0;

    const result = await recordSpeakingTry(audioInput({ turnOrder: 4 }), {
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const generate = fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "That was fun! See you next time!" },
    }));

    const result = await recordSpeakingTry(audioInput({ turnOrder: 8 }), {
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

describe("learner-safe display transcript at the upload boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase({
      missionSnapshot: multiPatternPresetSnapshot,
    });
    mockLog.mockClear();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  function turnWrite(field: "original_transcript" | "repeat_transcript") {
    return mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        (operation.action === "upsert" || operation.action === "update") &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        field in operation.payload,
    )?.payload as Record<string, unknown> | undefined;
  }

  it("shows the English reading of accented-English spans and scores against it", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const raw = "바닐라 아이스크림 is tastier than 초콜릿 아이스크림.";
    const scorePronunciation = successfulPronunciationScorer();

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber(raw, [
        { hangul: "바닐라", romanized: "Banilla" },
        { hangul: "아이스크림", romanized: "Aiseukeurim" },
        { hangul: "초콜릿", romanized: "Chokollit" },
      ]),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        hangulInterpretations: [
          {
            hangul: "바닐라",
            kind: "accented_english",
            englishReading: "vanilla",
          },
          {
            hangul: "아이스크림",
            kind: "accented_english",
            englishReading: "ice cream",
          },
          {
            hangul: "초콜릿",
            kind: "accented_english",
            englishReading: "chocolate",
          },
        ],
      }),
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      displayTranscript:
        "vanilla ice cream is tastier than chocolate ice cream.",
    });
    expect(turnWrite("original_transcript")).toMatchObject({
      original_transcript: raw,
    });
    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceText:
          "vanilla ice cream is tastier than chocolate ice cream.",
      }),
    );
  });

  it("hides the whole transcript and skips scoring when a span is Korean vocabulary", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const scorePronunciation = successfulPronunciationScorer();

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like 축구.", [
        { hangul: "축구", romanized: "Chukgu" },
      ]),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "material",
        correctionReason: "vocabulary",
        improvedSentence: "I like soccer.",
        hangulInterpretations: [
          { hangul: "축구", kind: "korean_vocabulary", englishReading: null },
        ],
      }),
      scorePronunciation,
    });

    expect(result).toMatchObject({ ok: true, displayTranscript: null });
    expect(turnWrite("original_transcript")?.original_transcript).toBe(
      "I like 축구.",
    );
    expect(scorePronunciation).not.toHaveBeenCalled();
  });

  it("keeps a proper name exactly as spoken in the learner transcript", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I'm going to 거제도.", [
        { hangul: "거제도", romanized: "Geojedo" },
      ]),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        hangulInterpretations: [
          { hangul: "거제도", kind: "name", englishReading: null },
        ],
      }),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result).toMatchObject({
      ok: true,
      displayTranscript: "I'm going to 거제도.",
    });
  });

  it("fails closed when interpretation metadata is missing for a Hangul transcript", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like 바닐라.", [
        { hangul: "바닐라", romanized: "Banilla" },
      ]),
      evaluateOriginalTurn: vi.fn(async () => ({
        ok: false as const,
        error: "schema_failed" as const,
      })),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result).toMatchObject({ ok: true, displayTranscript: null });
    expect(turnWrite("original_transcript")?.original_transcript).toBe(
      "I like 바닐라.",
    );
  });

  it("gives a repeat turn a learner-safe display while storing the raw repeat", async () => {
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(
      audioInput({ turnOrder: 2, clipKind: "repeat_attempt", body: "repeat" }),
      {
        transcribeAudioFile: successfulTranscriber("I like 아이스크림.", [
          { hangul: "아이스크림", romanized: "Aiseukeurim" },
        ]),
        evaluateRepeatTurn: repeatEvaluator({
          hangulInterpretations: [
            {
              hangul: "아이스크림",
              kind: "accented_english",
              englishReading: "ice cream",
            },
          ],
        }),
        scorePronunciation: successfulPronunciationScorer(),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      displayTranscript: "I like ice cream.",
    });
    expect(turnWrite("repeat_transcript")?.repeat_transcript).toBe(
      "I like 아이스크림.",
    );
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
    const { recordSpeakingTry } = await import(
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

    const result = await recordSpeakingTry(audioInput(), {
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

  it("preserves the ambiguity budget through a minimal-effort re-recording", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        ...originalEvaluation({
          outcome: "retry_original",
          meaningUnderstood: false,
          targetPatternAttempted: false,
          confidence: "medium",
          reviewReason: null,
        }),
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
            evaluation: originalEvaluation({
              outcome: "teacher_review",
              meaningUnderstood: false,
              targetPatternAttempted: false,
              confidence: "medium",
              reviewReason: "ambiguous",
            }),
          },
        ],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("No."),
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        retryReason: "minimal_effort",
        ambiguityRetries: 1,
        ambiguityHistory: [
          {
            transcript: "At my family maybe.",
            audioClipId: "clip-first",
          },
        ],
      },
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
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator({
      outcome: "needs_correction",
      meaningUnderstood: false,
      targetPatternAttempted: false,
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "Yes, I do.",
    });

    const result = await recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: evaluate,
    });

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "teacher_review",
        reviewReason: "contract_rejected",
        improvedSentence: null,
        requireRepeat: false,
        minimalEffortBlocks: 2,
      },
    });
  });
});

describe("multi-pattern preset evaluation", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockConsumeRequestBudget.mockReset();
    mockConsumeRequestBudget.mockResolvedValue({ allowed: true });
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("offers one recording retry when an open-preset recast invents intent", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        multiPatternPresetSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      targetPatternAttempted: false,
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "I will play soccer.",
    });

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationMode: "preset",
        missionQuestion: "What will you do tomorrow?",
        targetPattern: "I will ___.",
        targetExample: "I will study.",
        transcript: "I like soccer.",
      }),
    );
    expect(evaluateOriginal).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        targetPatternAttempted: false,
        improvedSentence: null,
        requireRepeat: false,
        ambiguityHistory: [
          {
            evaluation: { reviewReason: "contract_rejected" },
          },
        ],
      },
    });
  });

  it("keeps malformed open-preset contract repair in nested audit evidence", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        multiPatternPresetSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        evaluation: originalEvaluation({
          outcome: "needs_correction",
          targetPatternAttempted: false,
          correctionNeeded: true,
          correctionSeverity: "material",
          correctionReason: "grammar",
          improvedSentence: "I will play soccer.",
        }),
      })
      .mockResolvedValueOnce({
        ok: false as const,
        error: "schema_failed" as const,
      });

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        ambiguityHistory: [
          {
            evaluation: { reviewReason: "failed_schema" },
          },
        ],
      },
    });
  });

  it("routes a second unsafe open-preset recast to teacher review", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        multiPatternPresetSnapshot as unknown as typeof conversationMissionSnapshotFixture,
      turnEvaluation: {
        ...originalEvaluation(),
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        ambiguityHistory: [],
      },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction",
      targetPatternAttempted: false,
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "I will play soccer.",
    });

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I like soccer."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "teacher_review",
        ambiguityRetries: 1,
        improvedSentence: null,
        requireRepeat: false,
      },
    });
  });

  it("accepts the active pattern regardless of sibling turn patterns", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        multiPatternPresetSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();

    const result = await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I will read."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPattern: "I will ___.",
        targetExample: "I will study.",
        transcript: "I will read.",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      evaluation: { outcome: "accepted_original", requireRepeat: false },
    });
  });

  it("keeps the active pattern on deterministic policy repair", async () => {
    const patternSensitiveSnapshot = {
      ...multiPatternPresetSnapshot,
      turns: multiPatternPresetSnapshot.turns.map((turn) =>
        turn.turnOrder === 1
          ? { ...turn, prompt: "What do you enjoy after school?" }
          : turn,
      ),
    };
    mockSupabase = createMockSupabase({
      missionSnapshot:
        patternSensitiveSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const soccerInterpretation = [
      {
        hangul: "축구",
        kind: "accented_english" as const,
        englishReading: "soccer",
      },
    ];
    const evaluateOriginal = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true as const,
        evaluation: originalEvaluation({
          outcome: "needs_correction",
          targetPatternAttempted: false,
          correctionNeeded: true,
          correctionSeverity: "material",
          correctionReason: "fragment_completion",
          improvedSentence: "I like soccer.",
          hangulInterpretations: soccerInterpretation,
        }),
      })
      .mockResolvedValueOnce({
        ok: true as const,
        evaluation: originalEvaluation({
          hangulInterpretations: soccerInterpretation,
        }),
      });

    const result = await recordSpeakingTry(audioInput({ turnOrder: 1 }), {
      transcribeAudioFile: successfulTranscriber("soccer 축구", [
        { hangul: "축구", romanized: "Chukgu" },
      ]),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledTimes(2);
    expect(evaluateOriginal.mock.calls[1]?.[0]).toMatchObject({
      targetPattern: "I like ___.",
      targetExample: "I like soccer.",
      policyRepair: { violations: ["target_pattern_padding"] },
    });
    expect(result).toMatchObject({
      ok: true,
      evaluation: { outcome: "accepted_original", requireRepeat: false },
    });
  });

  it("evaluates a correction repeat with the active pattern and improved sentence", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        multiPatternPresetSnapshot as unknown as typeof conversationMissionSnapshotFixture,
      turnImprovedSentence: "I will play soccer.",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = repeatEvaluator();

    const result = await recordSpeakingTry(
      {
        ...audioInput({ turnOrder: 2 }),
        clipKind: "repeat_attempt" as const,
      },
      {
        transcribeAudioFile: successfulTranscriber("I will play football."),
        evaluateRepeatTurn: evaluateRepeat,
      },
    );

    expect(result.ok).toBe(true);
    expect(evaluateRepeat).toHaveBeenCalledWith(
      expect.objectContaining({
        improvedSentence: "I will play soccer.",
        targetPattern: "I will ___.",
        repeatTranscript: "I will play football.",
      }),
    );
  });

  it("falls back to the active turn example when no improved sentence was stored", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot:
        multiPatternPresetSnapshot as unknown as typeof conversationMissionSnapshotFixture,
      turnImprovedSentence: null,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = repeatEvaluator();

    await recordSpeakingTry(
      {
        ...audioInput({ turnOrder: 2 }),
        clipKind: "repeat_attempt" as const,
      },
      {
        transcribeAudioFile: successfulTranscriber("I will read."),
        evaluateRepeatTurn: evaluateRepeat,
      },
    );

    expect(evaluateRepeat).toHaveBeenCalledWith(
      expect.objectContaining({
        improvedSentence: "I will study.",
        targetPattern: "I will ___.",
      }),
    );
  });

  it("uses the saved mission fallback for a historical preset snapshot", async () => {
    const historicalSnapshot = {
      ...multiPatternPresetSnapshot,
      targetPattern: "I like ___.",
      turns: multiPatternPresetSnapshot.turns.map(
        ({ targetPattern: _targetPattern, ...turn }) => turn,
      ),
    };
    mockSupabase = createMockSupabase({
      missionSnapshot:
        historicalSnapshot as unknown as typeof conversationMissionSnapshotFixture,
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginal = successfulOriginalEvaluator();

    await recordSpeakingTry(audioInput({ turnOrder: 2 }), {
      transcribeAudioFile: successfulTranscriber("I like reading."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({ targetPattern: "I like ___." }),
    );
  });
});

describe("repeat write preserves the original evaluation (2026-07-25)", () => {
  const storedOriginalEvaluation = {
    version: "ai-eval-v1",
    outcome: "needs_correction",
    confidence: "high",
    reviewReason: null,
    meaningUnderstood: true,
    targetPatternAttempted: true,
    englishLanguage: "english",
    correctionNeeded: true,
    correctionSeverity: "material",
    correctionReason: "grammar",
    improvedSentence: "I like adventure cartoons.",
    requireRepeat: true,
  };

  function findRepeatTurnUpdate() {
    const turnUpdate = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "update" &&
        (operation.payload as { repeat_transcript?: unknown })
          .repeat_transcript !== undefined,
    );
    if (!turnUpdate) throw new Error("expected a repeat turn update");
    return (turnUpdate.payload as { evaluation: Record<string, unknown> })
      .evaluation;
  }

  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("nests the prior original evaluation under originalEvaluation", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: storedOriginalEvaluation,
      turnImprovedSentence: "I like adventure cartoons.",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await recordSpeakingTry(
      { ...audioInput({ turnOrder: 1 }), clipKind: "repeat_attempt" as const },
      {
        transcribeAudioFile: successfulTranscriber("I like adventure cartoons."),
        evaluateRepeatTurn: repeatEvaluator(),
      },
    );

    expect(result.ok).toBe(true);

    const written = findRepeatTurnUpdate();

    // Repeat fields stay at the top level so existing readers keep working.
    expect(written).toMatchObject({ repeatCloseEnough: true });
    // The evaluation that caused the repeat survives.
    expect(written.originalEvaluation).toMatchObject({
      correctionSeverity: "material",
      improvedSentence: "I like adventure cartoons.",
    });
  });

  it("omits originalEvaluation when no prior evaluation exists", async () => {
    mockSupabase = createMockSupabase({
      turnImprovedSentence: "I like adventure cartoons.",
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    await recordSpeakingTry(
      { ...audioInput({ turnOrder: 1 }), clipKind: "repeat_attempt" as const },
      {
        transcribeAudioFile: successfulTranscriber("I like adventure cartoons."),
        evaluateRepeatTurn: repeatEvaluator(),
      },
    );

    expect(findRepeatTurnUpdate()).not.toHaveProperty("originalEvaluation");
  });
});

describe("repeat cap accounting (issue #51)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockConsumeRequestBudget.mockReset();
    mockConsumeRequestBudget.mockResolvedValue({ allowed: true });
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("counts only prior transcribed repeats plus this processed clip", async () => {
    mockSupabase = createMockSupabase({
      turnImprovedSentence: "I like adventure cartoons.",
      priorRepeatClipStatuses: [
        "transcribed",
        "failed",
        "pending_upload",
        "transcribed",
      ],
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeatTurn = vi.fn(async () => ({
      ok: true as const,
      evaluation: {
        version: "ai-eval-v1" as const,
        outcome: "repeat_retry" as const,
        repeatCloseEnough: false,
        englishLanguage: "english" as const,
        confidence: "high" as const,
        reviewReason: null,
        hangulInterpretations: [],
      },
    }));

    const result = await recordSpeakingTry(
      { ...audioInput({ turnOrder: 1 }), clipKind: "repeat_attempt" as const },
      {
        transcribeAudioFile: successfulTranscriber("I like adventure books."),
        evaluateRepeatTurn,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "repeat_limit_reached",
        repeatCloseEnough: false,
        repeatAccepted: false,
        requireRepeat: false,
      },
    });
    expect(evaluateRepeatTurn).toHaveBeenCalledTimes(1);
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempts" &&
          operation.action === "update" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          "needs_review_reason" in operation.payload,
      ),
    ).toBe(false);
    const countQuery = mockSupabase.operations.find(
      (operation) =>
        operation.table === "audio_clips" &&
        operation.action === "select" &&
        operation.filters.some(
          ([column, value]) =>
            column === "clip_kind" && value === "repeat_attempt",
        ),
    );
    expect(countQuery?.filters).toEqual(
      expect.arrayContaining([
        ["processing_status", "transcribed"],
      ]),
    );
  });

  it("returns a retryable database error when repeat-count lookup fails", async () => {
    mockSupabase = createMockSupabase({
      turnImprovedSentence: "I like adventure cartoons.",
      priorRepeatClipStatuses: ["transcribed"],
      repeatCountError: { message: "count unavailable" },
    });
    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeatTurn = vi.fn(async () => ({
      ok: true as const,
      evaluation: {
        version: "ai-eval-v1" as const,
        outcome: "repeat_retry" as const,
        repeatCloseEnough: false,
        englishLanguage: "english" as const,
        confidence: "high" as const,
        reviewReason: null,
        hangulInterpretations: [],
      },
    }));

    const result = await recordSpeakingTry(
      { ...audioInput({ turnOrder: 1 }), clipKind: "repeat_attempt" as const },
      {
        transcribeAudioFile: successfulTranscriber("I like adventure books."),
        evaluateRepeatTurn,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "db_error",
      retryable: true,
    });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempt_turns" &&
          operation.action === "update" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          "repeat_transcript" in operation.payload,
      ),
    ).toBe(false);
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "audio_clips" &&
          operation.action === "update" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          "processing_status" in operation.payload &&
          operation.payload.processing_status === "failed",
      ),
    ).toBe(true);
    // Issue #66 extraction: the repeat-count lookup now precedes evaluation,
    // so a known-broken write path fails before any paid provider call.
    expect(evaluateRepeatTurn).not.toHaveBeenCalled();
  });
});

describe("Hangul-original pronunciation scoring start order", () => {
  it("starts scoring before generateCocoReply resolves", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...conversationMissionSnapshotFixture,
        requiredTurns: 4,
      } as unknown as typeof conversationMissionSnapshotFixture,
    });

    const { recordSpeakingTry } = await import(
      "@/server/student-access/audio-upload"
    );

    // Hold Coco's reply open. If scoring only starts after conversation
    // generation, the scorer cannot have been called by the time we check.
    let releaseCocoReply: (() => void) | null = null;
    const cocoReplyGate = new Promise<void>((resolve) => {
      releaseCocoReply = resolve;
    });
    let markScoringStarted: (() => void) | null = null;
    const scoringStarted = new Promise<void>((resolve) => {
      markScoringStarted = resolve;
    });

    const generate = fakeGenerateCocoReply(async () => {
      await cocoReplyGate;
      return { ok: true, reply: generatedReply("Yum, I like vanilla too!") };
    });
    const scorePronunciation = vi.fn(async () => {
      markScoringStarted!();
      return {
        ok: true as const,
        score: {
          starBand: 3 as const,
          pronunciationScore: 90,
          accuracyScore: 90,
          fluencyScore: 90,
          completenessScore: 100,
          prosodyScore: 90,
          wordScores: [],
        },
      };
    });

    const uploadPromise = recordSpeakingTry(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like 바닐라.", [
        { hangul: "바닐라", romanized: "Banilla" },
      ]),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        hangulInterpretations: [
          {
            hangul: "바닐라",
            kind: "accented_english",
            englishReading: "vanilla",
          },
        ],
      }),
      generateCocoReply: generate,
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
      scorePronunciation,
    } as unknown as Parameters<typeof recordSpeakingTry>[1]);

    // Scoring must be under way while Coco's reply is still pending.
    await scoringStarted;
    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "I like vanilla." }),
    );
    // Coco's reply is still gated open at this point, so scoring demonstrably
    // did not wait on conversation generation.
    releaseCocoReply!();
    const result = await uploadPromise;
    expect(result.ok).toBe(true);
  });
});
