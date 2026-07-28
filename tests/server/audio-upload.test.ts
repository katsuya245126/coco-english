import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";

let mockSupabase: ReturnType<typeof createMockSupabase>;
const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

vi.mock("@/server/logging/logger", () => ({
  log: mockLog,
}));

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/202606270001_student_audio_storage.sql",
);

type Operation = {
  table: string;
  action: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function audioInput(overrides: {
  turnOrder?: number;
  clipKind?: Database["public"]["Enums"]["audio_clip_kind"];
  body?: string;
  mimeType?: string;
  durationMs?: number;
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
    byteSize: body.length,
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

function noSpeechTranscriber() {
  return vi.fn(async () => ({
    ok: false as const,
    error: "no_speech" as const,
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
    },
  }));
}

function successfulRepeatEvaluator(overrides = {}) {
  return vi.fn(async () => ({
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
}

const missionSnapshotFixture: {
  missionId: string;
  title: string;
  targetPattern: string;
  topic: string;
  level: string;
  requiredTurns: number;
  characterId: string;
  turns: Array<{
    turnOrder: number;
    prompt: string;
    targetExample: string;
    hintLadder: { tier1: string; tier2: string; tier3: string };
    answerShape?: "fixed" | "open";
  }>;
} = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "After school",
  targetPattern: "I like ___ing.",
  topic: "sports",
  level: "elementary",
  requiredTurns: 2,
  characterId: "default-buddy",
  turns: [
    {
      turnOrder: 1,
      prompt: "What do you like doing after school?",
      targetExample: "I like playing soccer after school.",
      hintLadder: {
        tier1: "I like ___ing.",
        tier2: "playing soccer",
        tier3: "I like playing soccer after school.",
      },
    },
    {
      turnOrder: 2,
      prompt: "What do you like eating?",
      targetExample: "I like eating pizza.",
      hintLadder: {
        tier1: "I like ___ing.",
        tier2: "eating pizza",
        tier3: "I like eating pizza.",
      },
    },
  ],
};

function createMockSupabase(options: {
  assignmentFound?: boolean;
  assignmentStatus?: Database["public"]["Enums"]["assignment_student_status"];
  attemptFound?: boolean;
  attemptStatus?: Database["public"]["Enums"]["attempt_status"];
  uploadError?: Error | null;
  turnWriteError?: Error | null;
  missionSnapshot?: typeof missionSnapshotFixture;
  turnEvaluation?: unknown;
} = {}) {
  const operations: Operation[] = [];
  const upload = vi.fn(async () => ({
    error: options.uploadError ?? null,
  }));

  function createQuery(table: string) {
    const operation: Operation = {
      table,
      action: "select",
      filters: [],
    };

    const query = {
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
        if (
          table === "attempt_turns" &&
          options.turnWriteError &&
          typeof payload === "object" &&
          payload !== null &&
          ("original_transcript" in payload || "repeat_transcript" in payload)
        ) {
          return { error: options.turnWriteError };
        }
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        operations.push(operation);
        if (table === "assignment_students") {
          return {
            data:
              options.assignmentFound === false
                ? null
                : {
                    id: "as-1",
                    status: options.assignmentStatus ?? "started",
                    assignments: {
                      mission_snapshot:
                        options.missionSnapshot ?? missionSnapshotFixture,
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
            data: { id: "turn-1", evaluation: options.turnEvaluation ?? null },
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
    storage: {
      from: vi.fn(() => ({ upload })),
    },
    upload,
    from: vi.fn((table: string) => createQuery(table)),
  };
}

describe("student audio storage migration", () => {
  it("creates the private student-audio bucket", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("student-audio");
    expect(migration).toMatch(/public\s*=\s*false/i);
    expect(migration).not.toMatch(/public\s*=\s*true/i);
  });
});

describe("Phase 5 audio database types", () => {
  it("exposes attempt, turn, and audio clip table types", () => {
    type Tables = Database["public"]["Tables"];

    const attempt: Tables["attempts"]["Insert"] = {
      assignment_student_id: "assignment-student-id",
    };
    const turn: Tables["attempt_turns"]["Insert"] = {
      attempt_id: "attempt-id",
      turn_order: 1,
    };
    const clip: Tables["audio_clips"]["Insert"] = {
      attempt_turn_id: "attempt-turn-id",
      clip_kind: "original_answer",
    };

    expect(attempt.assignment_student_id).toBe("assignment-student-id");
    expect(turn.turn_order).toBe(1);
    expect(clip.clip_kind).toBe("original_answer");
  });
});

describe("uploadAttemptAudioClip", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("accepts an authored open frame with the learner's own choice without evaluation", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        requiredTurns: 1,
        targetPattern: "I think _____ is the best",
        turns: [
          {
            ...missionSnapshotFixture.turns[0],
            prompt:
              "Which ice cream is the best: vanilla, strawberry, or chocolate?",
            targetExample: "I think vanilla ice cream is the best.",
            hintLadder: {
              tier1: "I think _______ is the best",
              tier2: "vanilla",
              tier3: "I think vanilla ice cream is the best.",
            },
            answerShape: "open",
          },
        ],
      },
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi.fn();
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber(
        "I think chocolate ice cream is the best.",
      ),
      evaluateOriginalTurn,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "accepted_original",
        requireRepeat: false,
        evaluationSource: "deterministic",
      },
    });
    expect(evaluateOriginalTurn).not.toHaveBeenCalled();
  });

  it("defers an open-frame match with Hangul to evaluator language judgment", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        requiredTurns: 1,
        targetPattern: "I think _____ is the best",
        turns: [
          {
            ...missionSnapshotFixture.turns[0],
            prompt:
              "Which ice cream is the best: vanilla, strawberry, or chocolate?",
            targetExample: "I think vanilla ice cream is the best.",
            hintLadder: {
              tier1: "I think _______ is the best",
              tier2: "vanilla",
              tier3: "I think vanilla ice cream is the best.",
            },
            answerShape: "open",
          },
        ],
      },
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = successfulOriginalEvaluator({
      hangulInterpretations: [
        { hangul: "바닐라", kind: "accented_english", englishReading: "vanilla" },
      ],
    });
    const koreanSpans = [{ hangul: "바닐라", romanized: "Banilla" }];

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber(
        "I think 바닐라 is the best.",
        koreanSpans,
      ),
      evaluateOriginalTurn,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: { evaluationSource: "model" },
    });
    expect(evaluateOriginalTurn).toHaveBeenCalledTimes(1);
    expect(evaluateOriginalTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        koreanSpans: [expect.objectContaining({ hangul: "바닐라" })],
      }),
    );
  });

  it("retries a dangling original before scoring or evaluation", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const scorePronunciation = vi.fn();
    const evaluateOriginalTurn = vi.fn();
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I"),
      scorePronunciation,
      evaluateOriginalTurn,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "retry_original",
        retryReason: "incomplete_recording",
        requireRepeat: false,
      },
    });
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(evaluateOriginalTurn).not.toHaveBeenCalled();
  });

  it("lets an exact single-token authored target win before incomplete detection", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        requiredTurns: 1,
        targetPattern: "I",
        turns: [
          {
            ...missionSnapshotFixture.turns[0],
            targetExample: "I",
            hintLadder: { tier1: "I", tier2: "I", tier3: "I" },
            answerShape: "fixed",
          },
        ],
      },
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateOriginalTurn = vi.fn();
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I"),
      evaluateOriginalTurn,
    });
    expect(result).toMatchObject({
      ok: true,
      evaluation: { outcome: "accepted_original" },
    });
    expect(evaluateOriginalTurn).not.toHaveBeenCalled();
  });

  it("filters assignment ownership by assignment_students.student_id before upload", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const transcribe = successfulTranscriber("I like apples.");
    const evaluateOriginal = successfulOriginalEvaluator();
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(result).toMatchObject({
      ok: true,
      audioClipId: "clip-1",
      processingStatus: "transcribed",
      displayTranscript: "I like apples.",
      evaluation: {
        version: "ai-eval-v1",
        outcome: "accepted_original",
      },
    });

    const assignmentLookup = mockSupabase.operations.find(
      (operation) => operation.table === "assignment_students",
    );
    expect(assignmentLookup?.filters).toEqual(
      expect.arrayContaining([
        ["id", "as-1"],
        ["student_id", "student-1"],
      ]),
    );
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("student-audio");
    expect(transcribe).toHaveBeenCalledWith({
      file: expect.any(Blob),
      mimeType: "audio/webm",
    });
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluationMode: "preset",
        transcript: "I like apples.",
        targetPattern: "I like ___ing.",
        targetExample: "I like playing soccer after school.",
        level: "elementary",
        turnOrder: 1,
      }),
    );
  });

  it("skips OpenAI evaluation and accepts directly when the transcript exactly matches targetExample", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    // Deliberately differs from the target example in case and trailing
    // punctuation to prove the fast-path normalizes before comparing.
    const transcribe = successfulTranscriber(
      "I LIKE PLAYING SOCCER AFTER SCHOOL!",
    );
    const evaluateOriginal = successfulOriginalEvaluator();
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "accepted_original",
      },
    });
    expect(evaluateOriginal).not.toHaveBeenCalled();

    const timingCall = mockLog.mock.calls.find(
      ([level, event]) => level === "info" && event === "audio.upload_timing",
    );
    expect(timingCall?.[2]).toMatchObject({ evaluationFastPath: 1 });
  });

  it("uses semantic evaluation for a relevant open-ended answer that differs from the example", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        targetPattern: "I'm going to _____.",
        turns: [
          {
            ...missionSnapshotFixture.turns[0],
            prompt: "What are you going to do after school?",
            targetExample: "I'm going to do my homework.",
          },
          missionSnapshotFixture.turns[1],
        ],
      },
    });

    const evaluateOriginal = successfulOriginalEvaluator();
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I am going to play games."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: {
        outcome: "accepted_original",
        targetPatternAttempted: true,
        correctionNeeded: false,
      },
    });
    expect(evaluateOriginal).toHaveBeenCalledTimes(1);
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        missionQuestion: "What are you going to do after school?",
        transcript: "I am going to play games.",
      }),
    );
  });

  it("passes the snapshot turn's answerShape to the evaluator", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        targetPattern: "I like _____.",
        turns: [
          {
            ...missionSnapshotFixture.turns[0],
            prompt: "What ice cream do you like?",
            targetExample: "I like vanilla ice cream.",
            answerShape: "open",
          },
          missionSnapshotFixture.turns[1],
        ],
      },
    });

    const evaluateOriginal = successfulOriginalEvaluator();
    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like chocolate ice cream."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledTimes(1);
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({ answerShape: "open" }),
    );
  });

  it("passes a fixed answerShape through to the evaluator", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        targetPattern: "The capital of Korea is _____.",
        turns: [
          {
            ...missionSnapshotFixture.turns[0],
            prompt: "What is the capital of Korea?",
            targetExample: "The capital of Korea is Seoul.",
            answerShape: "fixed",
          },
          missionSnapshotFixture.turns[1],
        ],
      },
    });

    const evaluateOriginal = successfulOriginalEvaluator();
    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("The capital of Korea is Busan."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledTimes(1);
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({ answerShape: "fixed" }),
    );
  });

  it("does not auto-accept an off-topic answer merely because it fills the grammar frame", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        targetPattern: "I'm going to _____.",
        turns: [
          {
            ...missionSnapshotFixture.turns[0],
            prompt: "What are you going to do after school?",
            targetExample: "I'm going to do my homework.",
          },
          missionSnapshotFixture.turns[1],
        ],
      },
    });

    const evaluateOriginal = successfulOriginalEvaluator({
      outcome: "needs_correction" as const,
      meaningUnderstood: false,
      targetPatternAttempted: true,
      correctionNeeded: true,
      correctionSeverity: "material" as const,
      correctionReason: "grammar" as const,
      improvedSentence: "I'm going to do my homework.",
    });
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I am going to eat the moon."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(result).toMatchObject({
      ok: true,
      evaluation: { outcome: "needs_correction" },
    });
    expect(evaluateOriginal).toHaveBeenCalledTimes(1);
  });

  it("falls through to OpenAI evaluation when the transcript matches neither the example nor target pattern", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const transcribe = successfulTranscriber(
      "I enjoy playing soccer with my friends after school.",
    );
    const evaluateOriginal = successfulOriginalEvaluator();
    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(evaluateOriginal).toHaveBeenCalledTimes(1);

    const timingCall = mockLog.mock.calls.find(
      ([level, event]) => level === "info" && event === "audio.upload_timing",
    );
    expect(timingCall?.[2]).toMatchObject({ evaluationFastPath: 0 });
  });

  it("logs production-safe stage timings for successful uploads", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: vi.fn(async () => ({
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
      })),
    });

    const timingCall = mockLog.mock.calls.find(
      ([level, event]) => level === "info" && event === "audio.upload_timing",
    );
    expect(timingCall).toBeTruthy();
    expect(timingCall?.[2]).toEqual(
      expect.objectContaining({
        status: "success",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
        audioClipId: "clip-1",
        turnOrder: 1,
        clipKind: "original_answer",
        durationMs: 1200,
        byteSize: 5,
        storageUploadMs: expect.any(Number),
        transcriptionMs: expect.any(Number),
        evaluationMs: expect.any(Number),
        pronunciationTotalMs: expect.any(Number),
        pronunciationAwaitMs: expect.any(Number),
        finalClipUpdateMs: expect.any(Number),
        totalMs: expect.any(Number),
      }),
    );
    expect(JSON.stringify(timingCall?.[2])).not.toContain("I like apples");
  });

  it("writes pending and transcribed processing_status metadata", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    await uploadAttemptAudioClip(audioInput({
      turnOrder: 2,
      clipKind: "repeat_attempt",
      body: "repeat",
    }), {
      transcribeAudioFile: successfulTranscriber("I like apples very much."),
      evaluateRepeatTurn: successfulRepeatEvaluator(),
    });

    const clipInsert = mockSupabase.operations.find(
      (operation) =>
        operation.table === "audio_clips" && operation.action === "insert",
    );
    const clipUpdate = mockSupabase.operations.find(
      (operation) =>
        operation.table === "audio_clips" && operation.action === "update",
    );

    expect(clipInsert?.payload).toMatchObject({
      attempt_turn_id: "turn-1",
      clip_kind: "repeat_attempt",
      processing_status: "pending_upload",
    });
    expect(clipUpdate?.payload).toMatchObject({
      object_key: expect.stringContaining("as-1/attempt-1/2/repeat_attempt-clip-1"),
      mime_type: "audio/webm",
      duration_ms: 1200,
      byte_size: 6,
      processing_status: "transcribed",
    });
  });

  it("writes original_transcript through the original answer path", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I want pizza."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
    });

    const transcriptWrite = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );

    expect(transcriptWrite?.payload).toMatchObject({
      original_transcript: "I want pizza.",
      target_attempted: true,
      evaluation: expect.objectContaining({
        version: "ai-eval-v1",
        outcome: "accepted_original",
      }),
    });
  });

  it("warms Coco TTS for an improved sentence after original-turn evaluation writes it", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const warmTtsAudioCache = vi.fn(async () => ({
      ok: true as const,
      warmed: 1,
      skipped: 0,
      failed: 0,
    }));

    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I play soccer"),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "material",
        correctionReason: "grammar",
        improvedSentence: "I like playing soccer after school.",
      }),
      warmTtsAudioCache,
    });

    expect(warmTtsAudioCache).toHaveBeenCalledWith({
      characterId: "default-buddy",
      voice: "marin",
      texts: ["I like playing soccer after school."],
    });
  });

  it("does not fail audio upload when improved-sentence TTS warming fails", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I play soccer"),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "material",
        correctionReason: "grammar",
        improvedSentence: "I like playing soccer after school.",
      }),
      warmTtsAudioCache: vi.fn(async () => {
        throw new Error("tts down");
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      audioClipId: "clip-1",
      processingStatus: "transcribed",
    });
  });

  it("evaluates repeat attempts before writing repeat_transcript and repeat_accepted", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateRepeat = successfulRepeatEvaluator();
    await uploadAttemptAudioClip(audioInput({ clipKind: "repeat_attempt" }), {
      transcribeAudioFile: successfulTranscriber("I want pizza, please."),
      evaluateRepeatTurn: evaluateRepeat,
    });

    const transcriptWrite = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "update" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "repeat_transcript" in operation.payload,
    );

    expect(transcriptWrite?.payload).toMatchObject({
      repeat_transcript: "I want pizza, please.",
      repeat_accepted: true,
      evaluation: expect.objectContaining({
        outcome: "accepted_repeat",
        repeatAccepted: true,
      }),
    });
    expect(transcriptWrite?.filters).toContainEqual(["id", "turn-1"]);
    // A repeat answers the same question as the original, so the frame is
    // already on the row. Leaving it out of the update keeps the original
    // answer's recorded frame from being rewritten.
    expect(transcriptWrite?.payload).not.toHaveProperty("reply_hint_frame");
    expect(evaluateRepeat).toHaveBeenCalledWith(
      expect.objectContaining({
        repeatTranscript: "I want pizza, please.",
        improvedSentence: "I like playing soccer after school.",
        targetPattern: "I like ___ing.",
        level: "elementary",
      }),
    );
  });

  it("passes normalized repeat transcript Korean spans to repeat evaluation", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = successfulRepeatEvaluator();

    await uploadAttemptAudioClip(
      audioInput({ clipKind: "repeat_attempt", body: "repeat" }),
      {
        transcribeAudioFile: successfulTranscriber(
          "바닐라 아이스크림 is tastier than strawberry 아이스크림.",
        ),
        evaluateRepeatTurn: evaluateRepeat,
      },
    );

    expect(evaluateRepeat).toHaveBeenCalledWith(
      expect.objectContaining({
        repeatTranscript:
          "바닐라 아이스크림 is tastier than strawberry 아이스크림.",
        koreanSpans: [
          { hangul: "바닐라", romanized: "Banilra" },
          { hangul: "아이스크림", romanized: "Aiseukeurim" },
        ],
      }),
    );
  });

  it("still bypasses repeat evaluation for an exact English repeat", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = successfulRepeatEvaluator();

    const result = await uploadAttemptAudioClip(
      audioInput({ clipKind: "repeat_attempt", body: "repeat" }),
      {
        transcribeAudioFile: successfulTranscriber(
          "I like playing soccer after school.",
        ),
        evaluateRepeatTurn: evaluateRepeat,
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(evaluateRepeat).not.toHaveBeenCalled();
  });

  it("marks the clip failed and returns retryable when storage upload fails", async () => {
    mockSupabase = createMockSupabase({
      uploadError: new Error("storage unavailable"),
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    // storageUpload and transcription now run concurrently (transcription
    // reads in-memory audio bytes, not the uploaded object), so transcription
    // still completes even though its result is discarded once the upload
    // failure is detected.
    const transcribe = successfulTranscriber("runs concurrently with upload");
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: transcribe,
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
          (operation.payload as { processing_status?: string }).processing_status ===
            "failed",
      ),
    ).toBe(true);
    expect(mockLog).toHaveBeenCalledWith("warn", "audio.upload_failed", {
      audioClipId: "clip-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      error: "storage unavailable",
    });
  });

  it("logs downstream turn write failures after the audio object has uploaded", async () => {
    mockSupabase = createMockSupabase({
      turnWriteError: new Error("turn write down"),
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
    });

    expect(result).toEqual({
      ok: false,
      error: "db_error",
      retryable: true,
    });
    expect(mockLog).toHaveBeenCalledWith("warn", "audio.processing_failed", {
      audioClipId: "clip-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      step: "turn_write",
      error: "turn write down",
    });
  });

  it("marks the clip failed when transcription fails and does not write transcript fields", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(audioInput(), {
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
          (operation.payload as { processing_status?: string }).processing_status ===
            "failed",
      ),
    ).toBe(true);
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempt_turns" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          ("original_transcript" in operation.payload ||
            "repeat_transcript" in operation.payload),
      ),
    ).toBe(false);
  });

  it("maps no_speech to retryable without evaluation, scoring, or a transcript write", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const transcribe = noSpeechTranscriber();
    const evaluateOriginal = successfulOriginalEvaluator();
    const scorePronunciation = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: evaluateOriginal,
      scorePronunciation,
    });

    expect(result).toEqual({
      ok: false,
      error: "transcription_failed_retryable",
      retryable: true,
    });
    expect(transcribe).toHaveBeenCalledOnce();
    expect(evaluateOriginal).not.toHaveBeenCalled();
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempt_turns" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          ("original_transcript" in operation.payload ||
            "repeat_transcript" in operation.payload),
      ),
    ).toBe(false);
  });

  // Superseded 2026-07-25 (UAT blocker). This previously asserted that an
  // all-Hangul transcript was rejected here, before the evaluator ran. That
  // treated "no Latin letter" as proof the child answered in Korean, but the
  // transcriber also writes accented English in Hangul ("바나나스" for
  // *bananas*) — so a child who answered correctly in English was told "I
  // didn't hear you. Try again." with no way past. The evaluator owns this
  // call; it must be reached. A genuinely Korean answer still routes to a
  // retry, now via the evaluator's non_english outcome.
  it("passes a Korean-only transcript through to the evaluator to judge", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator();
    const scorePronunciation = vi.fn(async () => ({
      ok: true as const,
      score: {
        accuracyScore: 88,
        fluencyScore: 90,
        completenessScore: 95,
        pronunciationScore: 87,
        starBand: 3 as const,
        referenceText: "I like soccer.",
        wordScores: [],
      },
    }));

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("나는 방과 후에 축구를 좋아해요."),
      evaluateOriginalTurn: evaluateOriginal,
      scorePronunciation,
    });

    expect(result).toMatchObject({ ok: true });
    expect(evaluateOriginal).toHaveBeenCalled();
    // The evaluator receives the answer verbatim, with the spans it needs to
    // sound out — the two inputs its non_english / phonetic rules run on.
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: "나는 방과 후에 축구를 좋아해요.",
        koreanSpans: expect.arrayContaining([
          expect.objectContaining({ hangul: "축구를" }),
        ]),
      }),
    );
  });

  it("stores a code-switched transcript verbatim and gives the evaluator its Korean spans", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator();
    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like 축구 after school."),
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(result).toMatchObject({ ok: true, displayTranscript: null });
    expect(evaluateOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: "I like 축구 after school.",
        koreanSpans: [{ hangul: "축구", romanized: "Chukgu" }],
      }),
    );

    const transcriptWrite = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );

    // The stored transcript is the evidence a teacher reads. It must record
    // what the child said, never English they did not produce.
    expect(transcriptWrite?.payload).toMatchObject({
      original_transcript: "I like 축구 after school.",
    });
  });

  it("turns a Korean vocabulary word into a correction the student repeats", async () => {
    // The teach half of the allow/teach split: 축구 is ordinary vocabulary,
    // so the student hears "soccer" and says the sentence again. The stored
    // transcript still records the Korean they actually said.
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like 축구 after school.", [
        { hangul: "축구", romanized: "Chukgu" },
      ]),
      evaluateOriginalTurn: successfulOriginalEvaluator({
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "material",
        correctionReason: "vocabulary",
        improvedSentence: "I like soccer after school.",
        hangulInterpretations: [
          { hangul: "축구", kind: "korean_vocabulary", englishReading: null },
        ],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      displayTranscript: null,
      evaluation: {
        outcome: "needs_correction",
        improvedSentence: "I like soccer after school.",
      },
    });

    const transcriptWrite = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );

    expect(transcriptWrite?.payload).toMatchObject({
      original_transcript: "I like 축구 after school.",
    });
  });

  it("rejects closed assignments and attempts before creating audio rows", async () => {
    mockSupabase = createMockSupabase({ assignmentStatus: "completed" });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const completedAssignmentResult = await uploadAttemptAudioClip(audioInput());

    expect(completedAssignmentResult).toEqual({
      ok: false,
      error: "not_found",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "audio_clips",
      ),
    ).toBe(false);

    mockSupabase = createMockSupabase({ attemptStatus: "completed" });
    const completedAttemptResult = await uploadAttemptAudioClip(audioInput());

    expect(completedAttemptResult).toEqual({
      ok: false,
      error: "not_found",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "audio_clips",
      ),
    ).toBe(false);
  });

  it("rejects turn orders outside the mission snapshot before creating evidence rows", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const evaluateOriginal = successfulOriginalEvaluator();
    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 999 }), {
      evaluateOriginalTurn: evaluateOriginal,
    });

    expect(result).toEqual({
      ok: false,
      error: "invalid_audio",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(evaluateOriginal).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempt_turns" &&
          operation.action === "upsert",
      ),
    ).toBe(false);
  });

  it("returns retryable for a 300 ms tap before file, database, storage, or transcription work", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const file = new Blob(["voice"], { type: "audio/webm" });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const transcribe = successfulTranscriber("I like apples.");
    const evaluateOriginal = successfulOriginalEvaluator();
    const scorePronunciation = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(
      audioInput({ durationMs: 300, file }),
      {
        transcribeAudioFile: transcribe,
        evaluateOriginalTurn: evaluateOriginal,
        scorePronunciation,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "transcription_failed_retryable",
      retryable: true,
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(evaluateOriginal).not.toHaveBeenCalled();
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      "info",
      "audio.upload_timing",
      expect.objectContaining({
        status: "failed",
        audioClipId: null,
        durationMs: 300,
        error: "transcription_failed_retryable",
        step: "duration_precheck",
        reason: "short_clip",
      }),
    );
  });

  it("allows a clip at the exact 500 ms boundary", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const transcribe = successfulTranscriber("I like apples.");

    const result = await uploadAttemptAudioClip(audioInput({ durationMs: 500 }), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result).toMatchObject({
      ok: true,
      displayTranscript: "I like apples.",
    });
    expect(transcribe).toHaveBeenCalledOnce();
  });

  it("rejects oversized, overlong, and unsupported audio before storage or transcription", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const transcribe = successfulTranscriber("should not run");

    await expect(
      uploadAttemptAudioClip(
        { ...audioInput(), byteSize: 5 * 1024 * 1024 + 1 },
        { transcribeAudioFile: transcribe },
      ),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_audio",
      retryable: false,
    });
    await expect(
      uploadAttemptAudioClip(
        audioInput({ durationMs: 90_001 }),
        { transcribeAudioFile: transcribe },
      ),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_audio",
      retryable: false,
    });
    await expect(
      uploadAttemptAudioClip(
        audioInput({ mimeType: "audio/ogg" }),
        { transcribeAudioFile: transcribe },
      ),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_audio",
      retryable: false,
    });

    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("does not upload when assignment ownership does not match", async () => {
    mockSupabase = createMockSupabase({ assignmentFound: false });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip({
      ...audioInput(),
      studentId: "other-student",
    });

    expect(result).toEqual({
      ok: false,
      error: "not_found",
      retryable: false,
    });
    expect(mockSupabase.upload).not.toHaveBeenCalled();
  });

  it("keeps upload route behind readStudentUnlock and avoids public URLs", () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
      ),
      "utf8",
    );

    expect(routeSource).toContain("readStudentUnlock");
    expect(routeSource).toContain("MAX_AUDIO_BYTES");
    expect(routeSource).toContain("MAX_AUDIO_DURATION_MS");
    expect(routeSource).toContain("ALLOWED_AUDIO_MIME_TYPES");
    expect(routeSource).not.toContain("getPublicUrl");
    expect(routeSource).not.toContain("publicUrl");
  });

  it("scores original-answer pronunciation against the transcript and upserts a pronunciation_scores row on success", async () => {
    const { uploadAttemptAudioClip } = await import(
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
        referenceText: "I like playing soccer.",
        wordScores: [
          { word: "I", accuracyScore: 100, errorType: "None" },
          { word: "playing", accuracyScore: 40, errorType: "Mispronunciation" },
        ],
      },
    }));

    const result = await uploadAttemptAudioClip(audioInput(), {
      // Transcript contains "playing" so the mispronounced word is one the
      // student actually said — wordsToPractice intersects against the
      // transcript, so a word absent from it is never surfaced.
      transcribeAudioFile: successfulTranscriber("I like playing soccer."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      audioClipId: "clip-1",
      starBand: 3,
      wordsToPractice: [{ word: "playing", label: "Mispronounced" }],
    });
    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceText: "I like playing soccer.",
        durationMs: 1200,
      }),
    );

    const scoreUpsert = mockSupabase.operations.find(
      (operation) => operation.table === "pronunciation_scores",
    );
    expect(scoreUpsert?.action).toBe("upsert");
    expect(scoreUpsert?.payload).toMatchObject({
      audio_clip_id: "clip-1",
      provider: "azure_speech",
      reference_text: "I like playing soccer.",
      accuracy_score: 88,
      fluency_score: 90,
      completeness_score: 95,
      pronunciation_score: 87,
      star_band: 3,
    });

    expect(result).not.toHaveProperty("accuracyScore");
    expect(result).not.toHaveProperty("pronunciationScore");
    expect(JSON.stringify(result)).not.toContain("accuracyScore");
  });

  it("does not surface target-sentence words the student never said as words to practice", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    // Even if a scorer returns words absent from the transcript, they should
    // not reach the student-facing practice list.
    const scorePronunciation = vi.fn(async () => ({
      ok: true as const,
      score: {
        accuracyScore: 55,
        fluencyScore: 60,
        completenessScore: 40,
        pronunciationScore: 50,
        starBand: 1 as const,
        referenceText: "I like playing soccer after school.",
        wordScores: [
          { word: "I", accuracyScore: 100, errorType: "None" },
          { word: "playing", accuracyScore: 30, errorType: "Mispronunciation" },
          { word: "soccer", accuracyScore: 20, errorType: "Mispronunciation" },
        ],
      },
    }));

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      wordsToPractice: [],
    });
  });

  it("passes a fresh readable blob to pronunciation scoring after upload/transcription consumers", async () => {
    mockSupabase = createMockSupabase();
    mockSupabase.storage.from = vi.fn(() => ({
      upload: vi.fn(async (_key: string, file: Blob) => {
        await file.arrayBuffer();
        return { error: null };
      }),
    })) as typeof mockSupabase.storage.from;

    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    let readCount = 0;
    const oneShotFile = new Blob(["voice"], { type: "audio/webm" });
    Object.defineProperty(oneShotFile, "arrayBuffer", {
      value: vi.fn(async () => {
        readCount += 1;
        if (readCount > 1) {
          throw new Error("original blob already consumed");
        }
        return new TextEncoder().encode("voice").buffer;
      }),
    });

    const scorePronunciation = vi.fn(async ({ file }: { file: Blob }) => {
      await expect(file.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer);
      return {
        ok: true as const,
        score: {
          accuracyScore: 88,
          fluencyScore: 90,
          completenessScore: 95,
          pronunciationScore: 87,
          starBand: 3 as const,
          referenceText: "I like playing soccer after school.",
          wordScores: [],
        },
      };
    });

    const result = await uploadAttemptAudioClip(
      audioInput({ file: oneShotFile }),
      {
        transcribeAudioFile: successfulTranscriber("I like apples."),
        evaluateOriginalTurn: successfulOriginalEvaluator(),
        scorePronunciation,
      },
    );

    expect(result).toMatchObject({ ok: true, audioClipId: "clip-1" });
    expect(scorePronunciation).toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "pronunciation_scores",
      ),
    ).toBe(true);
  });

  it("uses the improved sentence as reference text for repeat attempts", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const scorePronunciation = vi.fn(async () => ({
      ok: true as const,
      score: {
        accuracyScore: 70,
        fluencyScore: 72,
        completenessScore: 80,
        pronunciationScore: 68,
        starBand: 2 as const,
        referenceText: "I like eating pizza.",
        wordScores: [],
      },
    }));

    await uploadAttemptAudioClip(
      audioInput({ turnOrder: 2, clipKind: "repeat_attempt", body: "repeat" }),
      {
        transcribeAudioFile: successfulTranscriber("I like eating pizza."),
        evaluateRepeatTurn: successfulRepeatEvaluator(),
        scorePronunciation,
      },
    );

    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "I like eating pizza." }),
    );
  });

  it("degrades gracefully when pronunciation scoring fails, still returning ok:true with no score row", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const scorePronunciation = vi.fn(async () => ({
      ok: false as const,
      error: "provider_failed" as const,
    }));

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      audioClipId: "clip-1",
      starBand: null,
      wordsToPractice: [],
    });
    expect(scorePronunciation).toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "pronunciation_scores",
      ),
    ).toBe(false);
  });

  it("degrades gracefully when pronunciation scoring throws, still returning ok:true", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const scorePronunciation = vi.fn(async () => {
      throw new Error("azure down");
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      audioClipId: "clip-1",
      starBand: null,
    });
  });

  it("does not fail the upload when the pronunciation_scores DB write fails", async () => {
    mockSupabase = createMockSupabase();
    const originalFrom = mockSupabase.from;
    mockSupabase.from = vi.fn((table: string) => {
      const query = originalFrom(table);
      if (table === "pronunciation_scores") {
        return {
          ...query,
          upsert: vi.fn((payload: unknown) => {
            void payload;
            return { error: new Error("db down") };
          }),
        };
      }
      return query;
    }) as typeof mockSupabase.from;

    const { uploadAttemptAudioClip } = await import(
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
        referenceText: "I like playing soccer after school.",
        wordScores: [],
      },
    }));

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      audioClipId: "clip-1",
      starBand: null,
    });
  });

  it("starts pronunciation scoring concurrently with turn evaluation, not serially after it", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const callOrder: string[] = [];

    const evaluateOriginal = vi.fn(async () => {
      callOrder.push("evaluate:start");
      const evaluation = {
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
      };
      callOrder.push("evaluate:end");
      return { ok: true as const, evaluation };
    });

    const scorePronunciation = vi.fn(async () => {
      callOrder.push("score:start");
      const score = {
        accuracyScore: 88,
        fluencyScore: 90,
        completenessScore: 95,
        pronunciationScore: 87,
        starBand: 3 as const,
        referenceText: "I like playing soccer after school.",
        wordScores: [],
      };
      callOrder.push("score:end");
      return { ok: true as const, score };
    });

    await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn: evaluateOriginal,
      scorePronunciation,
    });

    expect(evaluateOriginal).toHaveBeenCalled();
    expect(scorePronunciation).toHaveBeenCalled();
    // Both fakes were invoked before either fully resolved serially after the other --
    // i.e. scoring is not chained strictly after evaluation completes.
    expect(callOrder.indexOf("score:start")).toBeLessThan(
      callOrder.indexOf("evaluate:end"),
    );
  });
});

describe("minimal-effort answer guard", () => {
  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("blocks a minimal-effort answer without calling the evaluator or scorer", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluate = successfulOriginalEvaluator();
    const score = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: evaluate,
      scorePronunciation: score,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(evaluate).not.toHaveBeenCalled();
    expect(score).not.toHaveBeenCalled();
    expect(result.evaluation).toMatchObject({
      outcome: "retry_original",
      retryReason: "minimal_effort",
      minimalEffortBlocks: 1,
      minimalEffortKind: "short_answer",
      retryExample: "I like playing soccer after school.",
      requireRepeat: false,
    });
    expect(result.starBand).toBeNull();

    const turnUpsert = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );
    expect(turnUpsert?.payload).toMatchObject({
      original_transcript: "Yes.",
      improved_sentence: null,
    });
  });

  it("increments the block counter from the stored evaluation", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        retryReason: "minimal_effort",
        minimalEffortBlocks: 1,
      },
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I don't know."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.evaluation).toMatchObject({
      retryReason: "minimal_effort",
      minimalEffortBlocks: 2,
      minimalEffortKind: "dont_know",
      retryExample: "I like playing soccer after school.",
    });
  });

  it("evaluates normally after 2 prior blocks (never traps the student)", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        retryReason: "minimal_effort",
        minimalEffortBlocks: 2,
      },
    });
    const evaluate = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "material",
      correctionReason: "grammar",
      improvedSentence: "Yes, I like pizza.",
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: evaluate,
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result.evaluation).toMatchObject({
      outcome: "needs_correction",
      minimalEffortBlocks: 2,
    });
  });

  it("does not restart blocking after a post-cap generic retry overwrites the reason", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        minimalEffortBlocks: 2,
      },
    });
    const evaluate = successfulOriginalEvaluator();

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("No."),
      evaluateOriginalTurn: evaluate,
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result.ok).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("never blocks an exact target-example match", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    mockSupabase = createMockSupabase({
      missionSnapshot: {
        ...missionSnapshotFixture,
        turns: [
          { ...missionSnapshotFixture.turns[0], targetExample: "Yes." },
          missionSnapshotFixture.turns[1],
        ],
      },
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.evaluation).toMatchObject({ outcome: "accepted_original" });
  });

  it("does not run the guard for repeat attempts", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = successfulRepeatEvaluator();

    const result = await uploadAttemptAudioClip(
      audioInput({ clipKind: "repeat_attempt" }),
      {
        transcribeAudioFile: successfulTranscriber("Yes."),
        evaluateRepeatTurn: evaluateRepeat,
        scorePronunciation: successfulPronunciationScorer(),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.evaluation).toMatchObject({ outcome: "accepted_repeat" });
  });
});

describe("learner-safe display transcript at the upload boundary", () => {
  beforeEach(() => {
    mockSupabase = createMockSupabase();
    mockLog.mockClear();
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
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const raw = "바닐라 아이스크림 is tastier than 초콜릿 아이스크림.";
    const scorePronunciation = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(audioInput(), {
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

    // The stored evidence is what the child actually said, unchanged.
    expect(turnWrite("original_transcript")).toMatchObject({
      original_transcript: raw,
      evaluation: expect.objectContaining({
        hangulInterpretations: expect.any(Array),
      }),
    });

    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceText:
          "vanilla ice cream is tastier than chocolate ice cream.",
      }),
    );
  });

  it("hides the whole transcript and skips scoring when a span is Korean vocabulary", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const scorePronunciation = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(audioInput(), {
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
    // Azure would score the Korean word against an English pin, so no call.
    expect(scorePronunciation).not.toHaveBeenCalled();
  });

  it("keeps a proper name exactly as spoken in the learner transcript", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(audioInput(), {
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
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    // A deterministic decision made before any evaluator ran carries no
    // classifications, so the learner surface must show nothing at all.
    const result = await uploadAttemptAudioClip(audioInput(), {
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

  it("gives the repeat turn a learner-safe display while storing the raw repeat", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(
      audioInput({ turnOrder: 2, clipKind: "repeat_attempt", body: "repeat" }),
      {
        transcribeAudioFile: successfulTranscriber("I like 아이스크림.", [
          { hangul: "아이스크림", romanized: "Aiseukeurim" },
        ]),
        evaluateRepeatTurn: successfulRepeatEvaluator({
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

  it("leaves all-English uploads on the concurrent scoring fast path", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    let evaluationResolved = false;
    let scoringStartedBeforeEvaluation = false;

    const scorePronunciation = vi.fn(async () => {
      scoringStartedBeforeEvaluation = !evaluationResolved;
      return {
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
      };
    });

    const evaluateOriginalTurn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      evaluationResolved = true;
      return successfulOriginalEvaluator()();
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I like apples."),
      evaluateOriginalTurn,
      scorePronunciation,
    });

    expect(result).toMatchObject({
      ok: true,
      displayTranscript: "I like apples.",
    });
    expect(scoringStartedBeforeEvaluation).toBe(true);
    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "I like apples." }),
    );
  });

  it("does not expose the raw transcript through the student audio route", async () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src/app/student/missions/[assignmentStudentId]/audio/route.ts",
      ),
      "utf8",
    );

    expect(routeSource).toContain("displayTranscript: result.displayTranscript");
    expect(routeSource).not.toContain("transcript: result.transcript");
  });
});
