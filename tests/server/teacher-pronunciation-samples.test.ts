import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PronunciationScoreDetail,
  PronunciationScoreResult,
} from "@/server/audio/pronunciation-scorer";
import type { TranscriptionResult } from "@/server/audio/transcription";
import {
  MAX_PRONUNCIATION_SAMPLE_DURATION_MS,
  createSignedPronunciationSampleUrlForTeacher,
  getPronunciationSamplesForTeacher,
  uploadPronunciationSample,
} from "@/server/teacher/pronunciation-samples";

function wavForDuration(durationMs: number) {
  const dataBytes = Math.round((16_000 * durationMs) / 1_000) * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

const transcription: TranscriptionResult = {
  ok: true,
  text: "fan",
  koreanSpans: [],
  model: "test-transcriber",
  confidence: null,
};

const scoreDetail: PronunciationScoreDetail = {
  accuracyScore: 72,
  fluencyScore: 80,
  completenessScore: 90,
  pronunciationScore: 76,
  starBand: 2,
  referenceText: "fan",
  wordScores: [
    {
      word: "fan",
      accuracyScore: 72,
      errorType: "Mispronunciation",
      phonemes: [
        {
          phoneme: "f",
          accuracyScore: 20,
          candidates: [{ phoneme: "p", score: 80 }],
        },
      ],
    },
  ],
};
const score: PronunciationScoreResult = { ok: true, score: scoreDetail };

function createMockSupabase(options: {
  begin?: unknown;
  complete?: unknown;
} = {}) {
  const events: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    events.push(`rpc:${name}`);
    if (name === "begin_teacher_pronunciation_sample") {
      return {
        data:
          options.begin ??
          [{
            outcome: "ok",
            sample_id: "sample-1",
            object_key: "pronunciation-samples/student-1/sample-1.webm",
          }],
        error: null,
      };
    }
    if (name === "complete_teacher_pronunciation_sample") {
      return { data: options.complete ?? "ok", error: null };
    }
    if (name === "clear_teacher_pronunciation_sample") {
      return { data: "ok", error: null };
    }
    throw new Error(`unexpected RPC ${name} ${JSON.stringify(args)}`);
  });

  const storage = {
    from: vi.fn(() => ({
      upload: vi.fn(async () => {
        events.push("storage:upload");
        return { data: { path: "sample-1" }, error: null };
      }),
      remove: vi.fn(async () => {
        events.push("storage:remove");
        return { data: [], error: null };
      }),
    })),
  };

  return { events, rpc, storage };
}

function baseInput() {
  return {
    teacherId: "teacher-1",
    studentId: "student-1",
    file: new Blob(["audio"], { type: "audio/webm" }),
    mimeType: "audio/webm",
  };
}

function storedSample(overrides: Record<string, unknown> = {}) {
  return {
    id: "sample-1",
    student_id: "student-1",
    object_key: "pronunciation-samples/student-1/sample-1.webm",
    mime_type: "audio/webm",
    duration_ms: 3_000,
    byte_size: 100,
    status: "pending",
    automatic_transcript: "fan",
    teacher_confirmed_text: null,
    provisional_result: scoreDetail,
    audio_expires_at: "2026-09-20T00:00:00.000Z",
    created_at: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

function createReadMock(row: unknown = storedSample()) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(async () => ({ data: [row], error: null })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://storage.example/signed-sample" },
    error: null,
  }));
  return {
    query,
    createSignedUrl,
    from: vi.fn(() => query),
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  };
}

describe("uploadPronunciationSample", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects server-observed audio over 30 seconds before ownership or provider work", async () => {
    const supabase = createMockSupabase();
    const transcodeToWav = vi.fn(async () => ({
      ok: true as const,
      wav: wavForDuration(MAX_PRONUNCIATION_SAMPLE_DURATION_MS + 1),
    }));
    const transcribeAudioFile = vi.fn(async () => transcription);
    const scorePronunciation = vi.fn(async () => score);

    const result = await uploadPronunciationSample(baseInput(), {
      client: supabase as never,
      transcodeToWav,
      transcribeAudioFile,
      scorePronunciation,
      consumeRequestBudget: vi.fn(async () => ({ allowed: true as const })),
    });

    expect(result).toEqual({
      ok: false,
      error: "duration_too_long",
      message:
        "This recording is longer than 30 seconds. Trim it, then upload it again.",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(transcribeAudioFile).not.toHaveBeenCalled();
    expect(scorePronunciation).not.toHaveBeenCalled();
  });

  it("turns a transcode exception into a retryable upload failure", async () => {
    const result = await uploadPronunciationSample(baseInput(), {
      transcodeToWav: vi.fn(async () => {
        throw new Error("decoder unavailable");
      }),
    });

    expect(result).toEqual({ ok: false, error: "upload_failed_retryable" });
  });

  it("uploads, transcribes, scores, and publishes one pending sample", async () => {
    const supabase = createMockSupabase();
    const transcodeToWav = vi.fn(async () => ({
      ok: true as const,
      wav: wavForDuration(3_000),
    }));
    const transcribeAudioFile = vi.fn(async () => transcription);
    const scorePronunciation = vi.fn(async () => score);

    const result = await uploadPronunciationSample(baseInput(), {
      client: supabase as never,
      transcodeToWav,
      transcribeAudioFile,
      scorePronunciation,
      consumeRequestBudget: vi.fn(async () => ({ allowed: true as const })),
    });

    expect(result).toMatchObject({
      ok: true,
      sample: {
        id: "sample-1",
        studentId: "student-1",
        status: "pending",
        automaticTranscript: "fan",
        audioAvailable: true,
        durationMs: 3_000,
      },
    });
    expect(scorePronunciation).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "fan", durationMs: 3_000 }),
    );
    expect(supabase.events).toEqual([
      "rpc:begin_teacher_pronunciation_sample",
      "storage:upload",
      "rpc:complete_teacher_pronunciation_sample",
    ]);
  });

  it("clears the processing row and private object after a provider failure", async () => {
    const supabase = createMockSupabase();
    const transcodeToWav = vi.fn(async () => ({
      ok: true as const,
      wav: wavForDuration(3_000),
    }));
    const transcribeAudioFile = vi.fn(async () => ({
      ok: false as const,
      error: "transcription_failed" as const,
    }));

    const result = await uploadPronunciationSample(baseInput(), {
      client: supabase as never,
      transcodeToWav,
      transcribeAudioFile,
      scorePronunciation: vi.fn(async () => score),
      consumeRequestBudget: vi.fn(async () => ({ allowed: true as const })),
    });

    expect(result).toEqual({
      ok: false,
      error: "transcription_failed_retryable",
    });
    expect(supabase.events).toEqual([
      "rpc:begin_teacher_pronunciation_sample",
      "storage:upload",
      "storage:remove",
      "rpc:clear_teacher_pronunciation_sample",
    ]);
  });

  it("lists only pending/confirmed rows through the owning class filter", async () => {
    const supabase = createReadMock();
    const samples = await getPronunciationSamplesForTeacher(
      {
        teacherId: "teacher-1",
        studentId: "student-1",
        now: new Date("2026-08-31T00:00:00.000Z"),
      },
      { client: supabase as never },
    );

    expect(samples).toMatchObject([
      {
        id: "sample-1",
        studentId: "student-1",
        status: "pending",
        automaticTranscript: "fan",
        audioAvailable: true,
      },
    ]);
    expect(supabase.query.eq).toHaveBeenCalledWith(
      "students.classes.teacher_id",
      "teacher-1",
    );
    expect(supabase.query.in).toHaveBeenCalledWith("status", [
      "pending",
      "confirmed",
    ]);
  });

  it("creates a short-lived signed URL only for live owned sample audio", async () => {
    const supabase = createReadMock();
    const result = await createSignedPronunciationSampleUrlForTeacher(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        now: new Date("2026-08-31T00:00:00.000Z"),
      },
      { client: supabase as never },
    );

    expect(result).toEqual({
      signedUrl: "https://storage.example/signed-sample",
    });
    expect(supabase.query.eq).toHaveBeenCalledWith(
      "students.classes.teacher_id",
      "teacher-1",
    );
    expect(supabase.createSignedUrl).toHaveBeenCalledWith(
      "pronunciation-samples/student-1/sample-1.webm",
      300,
    );
  });

  it("does not offer playback after sample audio expires", async () => {
    const supabase = createReadMock({
      ...storedSample(),
      audio_expires_at: "2026-08-30T23:59:59.000Z",
    });

    const result = await createSignedPronunciationSampleUrlForTeacher(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        now: new Date("2026-08-31T00:00:00.000Z"),
      },
      { client: supabase as never },
    );

    expect(result).toBeNull();
    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
  });
});
