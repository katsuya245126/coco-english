import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PronunciationScoreDetail,
  PronunciationScoreResult,
} from "@/server/audio/pronunciation-scorer";
import type { TranscriptionResult } from "@/server/audio/transcription";
import {
  MAX_PRONUNCIATION_SAMPLE_DURATION_MS,
  confirmPronunciationSample,
  createSignedPronunciationSampleUrlForTeacher,
  getPronunciationSamplesForTeacher,
  removePronunciationSample,
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
            student_id: "student-1",
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
    confirmed_by_teacher_id: null,
    confirmed_at: null,
    audio_expires_at: "2026-09-20T00:00:00.000Z",
    created_at: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

function createReadMock(row: Record<string, unknown> = storedSample()) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(async () => ({ data: [row], error: null })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://storage.example/signed-sample" },
    error: null,
  }));
  const rpc = vi.fn(async (name: string) => {
    if (name !== "begin_teacher_pronunciation_sample_playback") {
      throw new Error(`unexpected RPC ${name}`);
    }
    const expired =
      typeof row.audio_expires_at === "string" &&
      new Date(row.audio_expires_at) <= new Date("2026-08-31T00:00:00.000Z");
    return {
      data: [{
        outcome:
          row.deletion_started_at || expired || !row.object_key
            ? "not_found"
            : "ok",
        object_key: row.object_key ?? null,
      }],
      error: null,
    };
  });
  return {
    query,
    rpc,
    createSignedUrl,
    from: vi.fn(() => query),
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  };
}

function confirmationRow(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "ok",
    sample_id: "sample-1",
    student_id: "student-1",
    object_key: "pronunciation-samples/student-1/sample-1.webm",
    duration_ms: 3_000,
    byte_size: 100,
    mime_type: "audio/webm",
    automatic_transcript: "fan",
    provisional_result: scoreDetail,
    audio_expires_at: "2026-09-20T00:00:00.000Z",
    created_at: "2026-08-21T00:00:00.000Z",
    confirmation_token: "claim-1",
    ...overrides,
  };
}

function createConfirmationMock(options: {
  preflight?: unknown;
  begin?: unknown;
  complete?: unknown;
  clear?: unknown;
  clearError?: boolean;
} = {}) {
  const events: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    events.push(`rpc:${name}`);
    if (name === "read_teacher_pronunciation_sample_confirmation") {
      return {
        data: options.preflight ?? [confirmationRow()],
        error: null,
      };
    }
    if (name === "begin_teacher_pronunciation_sample_confirmation") {
      return {
        data: options.begin ?? [confirmationRow()],
        error: null,
      };
    }
    if (name === "complete_teacher_pronunciation_sample_confirmation") {
      return { data: options.complete ?? "ok", error: null };
    }
    if (name === "clear_teacher_pronunciation_sample_confirmation") {
      return options.clearError
        ? { data: null, error: new Error("clear failed") }
        : { data: options.clear ?? "ok", error: null };
    }
    throw new Error(`unexpected RPC ${name} ${JSON.stringify(args)}`);
  });

  const storage = {
    from: vi.fn(() => ({
      download: vi.fn(async () => {
        events.push("storage:download");
        return { data: new Blob(["audio"], { type: "audio/webm" }), error: null };
      }),
    })),
  };

  return { events, rpc, storage };
}

function createRemovalMock(options: {
  begin?: unknown;
  finalize?: unknown;
  storageError?: boolean;
} = {}) {
  const events: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    events.push(`rpc:${name}`);
    if (name === "begin_teacher_pronunciation_sample_deletion") {
      return {
        data: options.begin ?? [{
          outcome: "ok",
          sample_id: "sample-1",
          student_id: "student-1",
          object_key: "pronunciation-samples/student-1/sample-1.webm",
          deletion_token: "deletion-1",
        }],
        error: null,
      };
    }
    if (name === "finalize_teacher_pronunciation_sample_deletion") {
      return { data: options.finalize ?? "ok", error: null };
    }
    throw new Error(`unexpected RPC ${name} ${JSON.stringify(args)}`);
  });
  const storage = {
    from: vi.fn(() => ({
      remove: vi.fn(async () => {
        events.push("storage:remove");
        return options.storageError
          ? { data: null, error: new Error("storage unavailable") }
          : { data: [], error: null };
      }),
    })),
  };
  return { events, rpc, storage };
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
    expect(supabase.query.is).toHaveBeenCalledWith("deletion_started_at", null);
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
    expect(supabase.rpc).toHaveBeenCalledWith(
      "begin_teacher_pronunciation_sample_playback",
      { p_teacher_id: "teacher-1", p_sample_id: "sample-1" },
    );
    expect(supabase.createSignedUrl).toHaveBeenCalledWith(
      "pronunciation-samples/student-1/sample-1.webm",
      300,
    );
  });

  it("rejects playback while a deletion claim is active", async () => {
    const supabase = createReadMock({
      ...storedSample(),
      deletion_started_at: "2026-08-31T00:00:00.000Z",
    });

    await expect(
      createSignedPronunciationSampleUrlForTeacher(
        { teacherId: "teacher-1", sampleId: "sample-1" },
        { client: supabase as never },
      ),
    ).resolves.toBeNull();
    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
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

  it("keeps confirmed evidence readable after expiry when audio metadata is cleared", async () => {
    const supabase = createReadMock({
      ...storedSample(),
      status: "confirmed",
      object_key: null,
      audio_expires_at: "2026-08-30T23:59:59.000Z",
    });

    await expect(
      getPronunciationSamplesForTeacher(
        {
          teacherId: "teacher-1",
          studentId: "student-1",
          now: new Date("2026-08-31T00:00:00.000Z"),
        },
        { client: supabase as never },
      ),
    ).resolves.toMatchObject([
      {
        status: "confirmed",
        automaticTranscript: "fan",
        provisionalResult: scoreDetail,
        mimeType: "audio/webm",
        durationMs: 3_000,
        byteSize: 100,
        audioAvailable: false,
      },
    ]);
  });

  it("does not map a row that still carries an active deletion claim", async () => {
    const supabase = createReadMock({
      ...storedSample(),
      deletion_started_at: "2026-08-31T00:00:00.000Z",
    });

    await expect(
      getPronunciationSamplesForTeacher(
        { teacherId: "teacher-1", studentId: "student-1" },
        { client: supabase as never },
      ),
    ).resolves.toEqual([]);
  });

  it("removes storage before finalizing an owned sample", async () => {
    const supabase = createRemovalMock();

    await expect(
      removePronunciationSample(
        { teacherId: "teacher-1", sampleId: "sample-1" },
        { client: supabase as never },
      ),
    ).resolves.toEqual({ ok: true, studentId: "student-1" });

    expect(supabase.events).toEqual([
      "rpc:begin_teacher_pronunciation_sample_deletion",
      "storage:remove",
      "rpc:finalize_teacher_pronunciation_sample_deletion",
    ]);
  });

  it("leaves a failed storage deletion retryable and does not finalize", async () => {
    const supabase = createRemovalMock({ storageError: true });

    await expect(
      removePronunciationSample(
        { teacherId: "teacher-1", sampleId: "sample-1" },
        { client: supabase as never },
      ),
    ).resolves.toEqual({ ok: false, error: "storage_failed_retryable" });

    expect(supabase.events).toEqual([
      "rpc:begin_teacher_pronunciation_sample_deletion",
      "storage:remove",
    ]);
    expect(supabase.events).not.toContain(
      "rpc:clear_teacher_pronunciation_sample_deletion",
    );
    expect(supabase.events).not.toContain(
      "rpc:finalize_teacher_pronunciation_sample_deletion",
    );
  });

  it("leaves the deletion claim fenced when finalization fails after Storage succeeds", async () => {
    const supabase = createRemovalMock({ finalize: "failed" });

    await expect(
      removePronunciationSample(
        { teacherId: "teacher-1", sampleId: "sample-1" },
        { client: supabase as never },
      ),
    ).resolves.toEqual({ ok: false, error: "failed" });

    expect(supabase.events).toEqual([
      "rpc:begin_teacher_pronunciation_sample_deletion",
      "storage:remove",
      "rpc:finalize_teacher_pronunciation_sample_deletion",
    ]);
    expect(supabase.events).not.toContain(
      "rpc:clear_teacher_pronunciation_sample_deletion",
    );
  });
});

describe("confirmPronunciationSample", () => {
  it("rejects overlong teacher wording before ownership or provider work", async () => {
    const supabase = createConfirmationMock();
    const scorePronunciation = vi.fn(async () => score);
    const consumeRequestBudget = vi.fn(async () => ({ allowed: true as const }));

    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "a".repeat(501),
      },
      {
        client: supabase as never,
        scorePronunciation,
        consumeRequestBudget,
      },
    );

    expect(result).toEqual({ ok: false, error: "invalid_text" });
    expect(supabase.events).toEqual([]);
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(consumeRequestBudget).not.toHaveBeenCalled();
  });

  it("promotes unchanged provisional evidence without pronunciation provider work", async () => {
    const supabase = createConfirmationMock();
    const scorePronunciation = vi.fn(async () => score);
    const consumeRequestBudget = vi.fn(async () => ({ allowed: true as const }));

    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: " fan ",
      },
      {
        client: supabase as never,
        scorePronunciation,
        consumeRequestBudget,
        now: () => new Date("2026-08-31T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      sample: {
        id: "sample-1",
        status: "confirmed",
        automaticTranscript: "fan",
        teacherConfirmedText: "fan",
        confirmedByTeacherId: "teacher-1",
        confirmedAt: "2026-08-31T00:00:00.000Z",
        provisionalResult: scoreDetail,
      },
    });
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(consumeRequestBudget).not.toHaveBeenCalled();
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
      "rpc:begin_teacher_pronunciation_sample_confirmation",
      "rpc:complete_teacher_pronunciation_sample_confirmation",
    ]);
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      3,
      "complete_teacher_pronunciation_sample_confirmation",
      expect.objectContaining({
        p_teacher_id: "teacher-1",
        p_sample_id: "sample-1",
        p_confirmation_token: "claim-1",
        p_teacher_confirmed_text: "fan",
        p_confirmed_result: scoreDetail,
      }),
    );
  });

  it("reanalyzes edited wording and publishes only after successful scoring", async () => {
    const supabase = createConfirmationMock();
    const consumeRequestBudget = vi.fn(async () => {
      supabase.events.push("budget");
      return { allowed: true as const };
    });
    const scorePronunciation = vi.fn(async (input: { referenceText: string }) => {
      supabase.events.push("provider:score");
      expect(input.referenceText).toBe("pan");
      return score;
    });

    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "pan",
      },
      {
        client: supabase as never,
        scorePronunciation: scorePronunciation as never,
        consumeRequestBudget,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      sample: {
        status: "confirmed",
        teacherConfirmedText: "pan",
        provisionalResult: { ...scoreDetail, referenceText: "pan" },
      },
    });
    expect(scorePronunciation).toHaveBeenCalledOnce();
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
      "budget",
      "rpc:begin_teacher_pronunciation_sample_confirmation",
      "storage:download",
      "provider:score",
      "rpc:complete_teacher_pronunciation_sample_confirmation",
    ]);
  });

  it("keeps a failed reanalysis pending and clears only its claim", async () => {
    const supabase = createConfirmationMock();
    const consumeRequestBudget = vi.fn(async () => {
      supabase.events.push("budget");
      return { allowed: true as const };
    });
    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "pan",
      },
      {
        client: supabase as never,
        scorePronunciation: vi.fn(async () => ({
          ok: false as const,
          error: "provider_failed" as const,
        })),
        consumeRequestBudget,
      },
    );

    expect(result).toEqual({ ok: false, error: "scoring_failed_retryable" });
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
      "budget",
      "rpc:begin_teacher_pronunciation_sample_confirmation",
      "storage:download",
      "rpc:clear_teacher_pronunciation_sample_confirmation",
    ]);
  });

  it.each([
    { label: "clear RPC error", clearError: true },
    { label: "unexpected clear outcome", clear: "not_found" },
  ])("does not report retryable scoring failure when $label", async (options) => {
    const supabase = createConfirmationMock(options);
    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "pan",
      },
      {
        client: supabase as never,
        scorePronunciation: vi.fn(async () => ({
          ok: false as const,
          error: "provider_failed" as const,
        })),
        consumeRequestBudget: vi.fn(async () => ({ allowed: true as const })),
      },
    );

    expect(result).toEqual({ ok: false, error: "failed" });
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
      "rpc:begin_teacher_pronunciation_sample_confirmation",
      "storage:download",
      "rpc:clear_teacher_pronunciation_sample_confirmation",
    ]);
  });

  it("returns not_found for a foreign or missing sample before provider work", async () => {
    const supabase = createConfirmationMock({
      preflight: [{ outcome: "not_found" }],
    });
    const scorePronunciation = vi.fn(async () => score);

    const result = await confirmPronunciationSample(
      {
        teacherId: "other-teacher",
        sampleId: "sample-1",
        teacherConfirmedText: "fan",
      },
      { client: supabase as never, scorePronunciation },
    );

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
    ]);
  });

  it("admits edited provider work before claiming the row or reading audio", async () => {
    const supabase = createConfirmationMock();
    const consumeRequestBudget = vi.fn(async () => {
      supabase.events.push("budget");
      return { allowed: false as const, retryAfterSeconds: 19 };
    });

    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "pan",
      },
      {
        client: supabase as never,
        consumeRequestBudget,
        scorePronunciation: vi.fn(async () => score),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 19,
    });
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
      "budget",
    ]);
  });

  it("promotes unchanged evidence after audio expiry without budget or provider work", async () => {
    const expired = confirmationRow({
      audio_expires_at: "2026-08-30T23:59:59.000Z",
    });
    const supabase = createConfirmationMock({
      preflight: [expired],
      begin: [expired],
    });
    const scorePronunciation = vi.fn(async () => score);
    const consumeRequestBudget = vi.fn(async () => ({ allowed: true as const }));

    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "fan",
      },
      {
        client: supabase as never,
        scorePronunciation,
        consumeRequestBudget,
        now: () => new Date("2026-08-31T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({ ok: true, sample: { status: "confirmed" } });
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(consumeRequestBudget).not.toHaveBeenCalled();
  });

  it("blocks edited reanalysis after audio expiry before budget or claim work", async () => {
    const supabase = createConfirmationMock({
      preflight: [
        confirmationRow({
          audio_expires_at: "2026-08-30T23:59:59.000Z",
        }),
      ],
    });
    const consumeRequestBudget = vi.fn(async () => ({ allowed: true as const }));
    const scorePronunciation = vi.fn(async () => score);

    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "pan",
      },
      {
        client: supabase as never,
        consumeRequestBudget,
        scorePronunciation,
        now: () => new Date("2026-08-31T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(consumeRequestBudget).not.toHaveBeenCalled();
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
    ]);
  });

  it("keeps an active confirmation claim blocked instead of taking it over", async () => {
    const supabase = createConfirmationMock({
      begin: [{ outcome: "unavailable" }],
    });

    const result = await confirmPronunciationSample(
      {
        teacherId: "teacher-1",
        sampleId: "sample-1",
        teacherConfirmedText: "fan",
      },
      { client: supabase as never },
    );

    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(supabase.events).toEqual([
      "rpc:read_teacher_pronunciation_sample_confirmation",
      "rpc:begin_teacher_pronunciation_sample_confirmation",
    ]);
  });
});
