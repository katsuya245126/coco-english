import { beforeEach, describe, expect, it, vi } from "vitest";

type Outcome = "passed" | "target_weak" | "word_weak" | "different_word";

type UploadState = {
  assignment: Record<string, unknown> | null;
  attempt: Record<string, unknown> | null;
  turns: Array<{ id: string; turn_order: number }>;
  tries: Array<{
    id: string;
    attempt_turn_id: string;
    try_number: number;
    outcome: Outcome;
  }>;
  audioClip: { id: string };
  storageError: unknown;
  storageUploads: Array<{ path: string }>;
  operations: Array<{ table: string; method: string; value?: unknown }>;
  updates: Array<{ table: string; value: unknown }>;
};

let state: UploadState;

function queryFor(table: string) {
  const filters: Record<string, unknown> = {};
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: unknown) => {
      filters[field] = value;
      state.operations.push({ table, method: `eq:${field}`, value });
      return query;
    }),
    order: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "assignment_students") return { data: state.assignment, error: null };
      if (table === "attempts") return { data: state.attempt, error: null };
      if (table === "audio_clips") return { data: state.audioClip, error: null };
      return { data: null, error: null };
    }),
    single: vi.fn(async () => {
      if (table === "audio_clips") return { data: state.audioClip, error: null };
      return { data: null, error: null };
    }),
    insert: vi.fn((value: unknown) => {
      state.operations.push({ table, method: "insert", value });
      return query;
    }),
    upsert: vi.fn((value: unknown) => {
      state.operations.push({ table, method: "upsert", value });
      return query;
    }),
    update: vi.fn((value: unknown) => {
      state.updates.push({ table, value });
      return query;
    }),
  };

  const resolve = async () => {
    if (table === "attempt_turns") return { data: state.turns, error: null };
    if (table === "pronunciation_word_tries") return { data: state.tries, error: null };
    return { data: [], error: null };
  };
  query.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    resolve().then(onFulfilled, onRejected);
  return query;
}

const mockSupabase = {
  from: vi.fn((table: string) => queryFor(table)),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async (path: string) => {
        state.storageUploads.push({ path });
        return { error: state.storageError };
      }),
    })),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

function snapshot(soundId: "s" | "f" = "s", firstWord = "sat") {
  return {
    kind: "pronunciation",
    version: 1,
    soundId,
    difficulty: "easy",
    requiredWords: 5,
    soundClipVersion: "v1",
    words: [1, 2, 3, 4, 5].map((order) => ({
      order,
      text: order === 1 ? firstWord : `word-${order}`,
      highlightStart: 0,
      highlightLength: 1,
      source: "verified",
      pronunciation: {
        phones: ["S", "AE1", "T"],
        targetPhoneIndex: 0,
        cmuVariant: 1,
      },
      wordAudio: {
        schemaVersion: 1,
        contentHash: `hash-${order}`,
        voice: "en-US-AvaNeural",
        format: "audio-24khz-48kbitrate-mono-mp3",
      },
    })),
  };
}

function resetState(soundId: "s" | "f" = "s", firstWord = "sat") {
  state = {
    assignment: {
      id: "assignment-student-1",
      student_id: "student-1",
      status: "started",
      assignments: {
        assignment_kind: "pronunciation",
        mission_snapshot: snapshot(soundId, firstWord),
        canceled_at: null,
      },
    },
    attempt: {
      id: "attempt-1",
      assignment_student_id: "assignment-student-1",
      status: "in_progress",
    },
    turns: [1, 2, 3, 4, 5].map((order) => ({
      id: `turn-${order}`,
      turn_order: order,
    })),
    tries: [],
    audioClip: { id: "clip-1" },
    storageError: null,
    storageUploads: [],
    operations: [],
    updates: [],
  };
  mockSupabase.from.mockClear();
  mockSupabase.storage.from.mockClear();
}

function transcribed(
  text = "sat",
  confidence: { minLogprob: number; tokenCount: number } | null = {
    minLogprob: -0.01,
    tokenCount: 1,
  },
  koreanSpans: ReadonlyArray<{ hangul: string; romanized: string }> = [],
) {
  return {
    ok: true as const,
    text,
    koreanSpans: [...koreanSpans],
    model: "test-transcriber",
    confidence,
  };
}

function scored(wordAccuracy: number, targetSoundAccuracy: number, word = "sat") {
  return {
    ok: true as const,
    score: {
      accuracyScore: wordAccuracy,
      fluencyScore: 20,
      completenessScore: 100,
      pronunciationScore: wordAccuracy,
      starBand: 1 as const,
      referenceText: word,
      wordScores: [
        {
          word,
          accuracyScore: wordAccuracy,
          errorType: "None",
          phonemes: [
            { phoneme: "s", accuracyScore: targetSoundAccuracy },
          ],
        },
      ],
    },
  };
}

function input() {
  return {
    studentId: "student-1",
    assignmentStudentId: "assignment-student-1",
    attemptId: "attempt-1",
    turnOrder: 1,
    file: new Blob(["voice"], { type: "audio/webm" }),
    mimeType: "audio/webm",
    durationMs: 1200,
    byteSize: 5,
  };
}

const allowBudget = vi.fn(async () => ({ allowed: true as const }));

beforeEach(() => {
  resetState();
  allowBudget.mockClear();
});

describe("uploadPronunciationTry", () => {
  it("proves assignment, attempt, and turn ownership before provider work", async () => {
    state.assignment = null;
    const transcribe = vi.fn();
    const score = vi.fn();
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({ ok: false, error: "not_found" });
    expect(transcribe).not.toHaveBeenCalled();
    expect(score).not.toHaveBeenCalled();
    expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    expect(state.operations).toEqual([
      { table: "assignment_students", method: "eq:id", value: "assignment-student-1" },
      { table: "assignment_students", method: "eq:student_id", value: "student-1" },
    ]);
  });

  it("derives original clip kind and try number on the server", async () => {
    const transcribe = vi.fn(async () => transcribed());
    const score = vi.fn(async () => scored(60, 50));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({ ok: true, tryNumber: 1, outcome: "passed" });
    expect(state.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "audio_clips",
          method: "insert",
          value: expect.objectContaining({
            attempt_turn_id: "turn-1",
            clip_kind: "original_answer",
          }),
        }),
        expect.objectContaining({
          table: "pronunciation_word_tries",
          method: "insert",
          value: expect.objectContaining({ try_number: 1, outcome: "passed" }),
        }),
      ]),
    );
  });

  it("rejects an out-of-order word without storing audio or spending budget", async () => {
    const transcribe = vi.fn();
    state.tries = [];
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(
      { ...input(), turnOrder: 2 },
      { consumeRequestBudget: allowBudget, transcribeAudioFile: transcribe },
    );

    expect(result).toMatchObject({ ok: false, error: "out_of_order" });
    expect(allowBudget).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(state.operations.some((op) => op.table === "audio_clips")).toBe(false);
  });

  it("stores a failed clip for no speech and consumes no try", async () => {
    const transcribe = vi.fn(async () => ({ ok: false as const, error: "no_speech" as const }));
    const score = vi.fn();
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({ ok: false, error: "transcription_failed" });
    expect(state.operations.some((op) => op.table === "pronunciation_word_tries" && op.method === "insert")).toBe(false);
    expect(state.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "audio_clips",
          value: expect.objectContaining({ processing_status: "failed" }),
        }),
      ]),
    );
    expect(score).not.toHaveBeenCalled();
  });

  it("uses repeat_attempt for failed recordings and valid tries two and three", async () => {
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    state.tries = [{
      id: "try-1",
      attempt_turn_id: "turn-1",
      try_number: 1,
      outcome: "target_weak",
    }];
    const failed = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: vi.fn(async () => ({ ok: false as const, error: "no_speech" as const })),
      scorePronunciation: vi.fn(),
    });
    expect(failed).toMatchObject({ ok: false, error: "transcription_failed" });
    expect(state.operations).toContainEqual({
      table: "audio_clips",
      method: "insert",
      value: {
        attempt_turn_id: "turn-1",
        clip_kind: "repeat_attempt",
        processing_status: "pending_upload",
      },
    });
    expect(state.storageUploads[0]?.path).toContain("repeat_attempt-clip-1");

    resetState();
    state.tries = [{
      id: "try-1",
      attempt_turn_id: "turn-1",
      try_number: 1,
      outcome: "target_weak",
    }];
    const second = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: vi.fn(async () => transcribed()),
      scorePronunciation: vi.fn(async () => scored(60, 50)),
    });
    expect(second).toMatchObject({ ok: true, tryNumber: 2 });
    expect(state.operations).toContainEqual({
      table: "audio_clips",
      method: "insert",
      value: expect.objectContaining({ clip_kind: "repeat_attempt" }),
    });
    expect(state.storageUploads[0]?.path).toContain("repeat_attempt-clip-1");

    resetState();
    state.tries = [1, 2].map((tryNumber) => ({
      id: `try-${tryNumber}`,
      attempt_turn_id: "turn-1",
      try_number: tryNumber,
      outcome: "target_weak" as const,
    }));
    const third = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: vi.fn(async () => transcribed()),
      scorePronunciation: vi.fn(async () => scored(60, 50)),
    });
    expect(third).toMatchObject({ ok: true, tryNumber: 3 });
    expect(state.operations).toContainEqual({
      table: "audio_clips",
      method: "insert",
      value: expect.objectContaining({ clip_kind: "repeat_attempt" }),
    });
    expect(state.storageUploads[0]?.path).toContain("repeat_attempt-clip-1");
  });

  it("stores the clip when scoring fails without consuming a try", async () => {
    const transcribe = vi.fn(async () => transcribed());
    const score = vi.fn(async () => ({ ok: false as const, error: "provider_failed" as const }));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({ ok: false, error: "scoring_failed" });
    expect(state.operations.some((op) => op.table === "pronunciation_scores")).toBe(false);
    expect(state.operations.some((op) => op.table === "pronunciation_word_tries" && op.method === "insert")).toBe(false);
    expect(state.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "audio_clips",
          value: expect.objectContaining({ processing_status: "transcribed" }),
        }),
      ]),
    );
  });

  it("uses a confident different word as one valid try without a score row", async () => {
    resetState("f", "face");
    const transcribe = vi.fn(async () => transcribed("ship"));
    const score = vi.fn();
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({
      ok: true,
      tryNumber: 1,
      outcome: "different_word",
      feedback: "Let's try face — listen again.",
    });
    expect(score).not.toHaveBeenCalled();
    expect(state.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "pronunciation_word_tries",
          method: "insert",
          value: {
            attempt_turn_id: "turn-1",
            audio_clip_id: "clip-1",
            try_number: 1,
            transcript: "ship",
            transcription_evidence: expect.any(Object),
            outcome: "different_word",
            word_accuracy: null,
            star_band: null,
            full_word_passed: null,
            target_sound_accuracy: null,
            target_sound_passed: null,
          },
        }),
      ]),
    );
    expect(state.operations.some((op) => op.table === "pronunciation_scores")).toBe(false);
  });

  it("assesses a finite low-confidence different transcript against the expected word", async () => {
    resetState("f", "face");
    const transcribe = vi.fn(async () =>
      transcribed("ship", { minLogprob: -2.9843010902404785, tokenCount: 3 }),
    );
    const score = vi.fn(async () => scored(90, 90, "face"));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({ ok: true, outcome: "passed", transcript: "ship" });
    expect(score).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "face" }),
    );
    expect(state.operations.some((op) => op.table === "pronunciation_word_tries" && op.method === "insert")).toBe(true);
  });

  it.each([
    ["nonfinite minimum logprob", "sat", { minLogprob: Number.NaN, tokenCount: 1 }],
    ["infinite minimum logprob", "sat", { minLogprob: Number.POSITIVE_INFINITY, tokenCount: 1 }],
    ["zero token count", "sat", { minLogprob: -0.01, tokenCount: 0 }],
    ["fractional token count", "sat", { minLogprob: -0.01, tokenCount: 1.5 }],
  ] as const)("does not consume a try for malformed confidence: %s", async (_label, text, confidence) => {
    const transcribe = vi.fn(async () => transcribed(text, confidence));
    const score = vi.fn(async () => scored(90, 90));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toEqual({
      ok: false,
      error: "unclear_transcript",
      retryable: true,
    });
    expect(score).not.toHaveBeenCalled();
    expect(state.operations.some((op) => op.table === "pronunciation_word_tries" && op.method === "insert")).toBe(false);
  });

  it.each([
    ["cent", { minLogprob: -1.436754584312439, tokenCount: 3 }, []],
    [
      "센트",
      { minLogprob: -2.9843010902404785, tokenCount: 3 },
      [{ hangul: "센트", romanized: "Senteu" }],
    ],
  ] as const)("scores finite low-confidence cent evidence from %s", async (transcript, confidence, koreanSpans) => {
    resetState("s", "cent");
    const transcribe = vi.fn(async () =>
      transcribed(transcript, confidence, koreanSpans),
    );
    const score = vi.fn(async () => scored(90, 90, "cent"));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: "passed",
      transcript,
    });
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "audio/webm",
        vocabularyHint: "Example answer: cent",
      }),
    );
    expect(score).toHaveBeenCalledWith(
      expect.objectContaining({ referenceText: "cent" }),
    );
    expect(state.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "pronunciation_scores",
          method: "upsert",
        }),
        expect.objectContaining({
          table: "pronunciation_word_tries",
          method: "insert",
          value: expect.objectContaining({
            transcript,
            outcome: "passed",
          }),
        }),
      ]),
    );
  });

  it("stores a weak low-confidence cent assessment as a weak try", async () => {
    resetState("s", "cent");
    const transcribe = vi.fn(async () =>
      transcribed("센트", { minLogprob: -2.9843010902404785, tokenCount: 3 }, [
        { hangul: "센트", romanized: "Senteu" },
      ]),
    );
    const score = vi.fn(async () => scored(80, 49, "cent"));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: "target_weak",
      starBand: 3,
      targetSoundAccuracy: 49,
      targetSoundPassed: false,
    });
    expect(state.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "pronunciation_word_tries",
          method: "insert",
          value: expect.objectContaining({ outcome: "target_weak" }),
        }),
      ]),
    );
  });

  it("keeps an expected transcript when the provider omits confidence", async () => {
    const transcribe = vi.fn(async () => transcribed("sat", null));
    const score = vi.fn(async () => scored(90, 90));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({ ok: true, outcome: "passed" });
    expect(score).toHaveBeenCalledOnce();
  });

  it("keeps an unknown-confidence different transcript retryable", async () => {
    const transcribe = vi.fn(async () => transcribed("ship", null));
    const score = vi.fn(async () => scored(90, 90));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toEqual({
      ok: false,
      error: "unclear_transcript",
      retryable: true,
    });
    expect(score).not.toHaveBeenCalled();
    expect(state.operations.some((op) => op.table === "pronunciation_word_tries" && op.method === "insert")).toBe(false);
  });

  it("does not consume a try when the scorer omits target phoneme evidence", async () => {
    resetState("s", "cent");
    const transcribe = vi.fn(async () =>
      transcribed("센트", { minLogprob: -1.436754584312439, tokenCount: 3 }, [
        { hangul: "센트", romanized: "Senteu" },
      ]),
    );
    const scoreResult = scored(90, 90);
    scoreResult.score.wordScores[0]!.word = "cent";
    scoreResult.score.wordScores[0]!.phonemes = [];
    const score = vi.fn(async () => scoreResult);
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toEqual({
      ok: false,
      error: "scoring_failed",
      retryable: true,
    });
    expect(state.operations.some((op) => op.table === "pronunciation_scores")).toBe(false);
    expect(state.operations.some((op) => op.table === "pronunciation_word_tries" && op.method === "insert")).toBe(false);
  });

  it("does not consume a try when the target phoneme score is unusable", async () => {
    const transcribe = vi.fn(async () => transcribed());
    const score = vi.fn(async () => scored(90, Number.NaN));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toEqual({
      ok: false,
      error: "scoring_failed",
      retryable: true,
    });
    expect(state.operations.some((op) => op.table === "pronunciation_scores")).toBe(false);
    expect(state.operations.some((op) => op.table === "pronunciation_word_tries" && op.method === "insert")).toBe(false);
  });

  it.each([
    [80, 49, "target_weak", "Almost! Teeth on your lip — fff. Try again."],
    [59, 80, "word_weak", "Great fff! Now say the whole word smoothly."],
    [60, 50, "passed", "Good job!"],
  ] as const)("returns sound-first feedback for %s", async (wordAccuracy, targetAccuracy, expected, feedback) => {
    resetState("f", "face");
    const transcribe = vi.fn(async () => transcribed("face"));
    const score = vi.fn(async () => scored(wordAccuracy, targetAccuracy, "face"));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: transcribe,
      scorePronunciation: score,
    });

    expect(result).toMatchObject({ ok: true, outcome: expected, feedback });
  });

  it("returns the transition copy after a non-passed third try", async () => {
    resetState("f", "face");
    state.tries = [1, 2].map((tryNumber) => ({
      id: `try-${tryNumber}`,
      attempt_turn_id: "turn-1",
      try_number: tryNumber,
      outcome: "target_weak" as const,
    }));
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );

    const result = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: vi.fn(async () => transcribed("face")),
      scorePronunciation: vi.fn(async () => scored(80, 49, "face")),
    });

    expect(result).toMatchObject({
      ok: true,
      tryNumber: 3,
      outcome: "target_weak",
      feedback: "Good try! Let's do the next word.",
    });
  });

  it("prevents a fourth valid try and retries after a pass", async () => {
    const { uploadPronunciationTry } = await import(
      "@/server/student-access/pronunciation-upload"
    );
    state.tries = [1, 2, 3].map((tryNumber) => ({
      id: `try-${tryNumber}`,
      attempt_turn_id: "turn-1",
      try_number: tryNumber,
      outcome: "target_weak" as const,
    }));
    const fourth = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: vi.fn(),
      scorePronunciation: vi.fn(),
    });
    expect(fourth).toMatchObject({ ok: false, error: "word_finished" });

    resetState();
    state.tries = [{
      id: "try-1",
      attempt_turn_id: "turn-1",
      try_number: 1,
      outcome: "passed",
    }];
    const afterPass = await uploadPronunciationTry(input(), {
      consumeRequestBudget: allowBudget,
      transcribeAudioFile: vi.fn(),
      scorePronunciation: vi.fn(),
    });
    expect(afterPass).toMatchObject({ ok: false, error: "word_finished" });
  });
});
