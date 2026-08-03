import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

function snapshot() {
  return {
    kind: "pronunciation",
    version: 1,
    soundId: "s",
    difficulty: "easy",
    requiredWords: 5,
    soundClipVersion: "v1",
    words: [1, 2, 3, 4, 5].map((order) => ({
      order,
      text: `word-${order}`,
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

function createMockSupabase(options: { attemptFound?: boolean } = {}) {
  const attemptTurns = [1, 2, 3, 4, 5].map((order) => ({
    id: `turn-${order}`,
    turn_order: order,
  }));
  const tries = [
    {
      id: "try-1-1",
      attempt_turn_id: "turn-1",
      audio_clip_id: "clip-1-1",
      try_number: 1,
      transcript: "word-1",
      outcome: "target_weak",
      word_accuracy: 60,
      star_band: 2,
      full_word_passed: true,
      target_sound_accuracy: 49,
      target_sound_passed: false,
      created_at: "2026-08-03T00:00:01Z",
      audio_clips: {
        id: "clip-1-1",
        processing_status: "transcribed",
        pronunciation_scores: [{ star_band: 2 }],
      },
    },
    {
      id: "try-1-2",
      attempt_turn_id: "turn-1",
      audio_clip_id: "clip-1-2",
      try_number: 2,
      transcript: "word-1",
      outcome: "passed",
      word_accuracy: 85,
      star_band: 3,
      full_word_passed: true,
      target_sound_accuracy: 80,
      target_sound_passed: true,
      created_at: "2026-08-03T00:00:02Z",
      audio_clips: {
        id: "clip-1-2",
        processing_status: "transcribed",
        pronunciation_scores: [{ star_band: 3 }],
      },
    },
    {
      id: "try-2-1",
      attempt_turn_id: "turn-2",
      audio_clip_id: "clip-2-1",
      try_number: 1,
      transcript: "word-2",
      outcome: "target_weak",
      word_accuracy: 60,
      star_band: 2,
      full_word_passed: true,
      target_sound_accuracy: 49,
      target_sound_passed: false,
      created_at: "2026-08-03T00:00:03Z",
      audio_clips: {
        id: "clip-2-1",
        processing_status: "transcribed",
        pronunciation_scores: [],
      },
    },
    {
      id: "try-2-2",
      attempt_turn_id: "turn-2",
      audio_clip_id: "clip-2-2",
      try_number: 2,
      transcript: "word-2",
      outcome: "target_weak",
      word_accuracy: 60,
      star_band: 2,
      full_word_passed: true,
      target_sound_accuracy: 49,
      target_sound_passed: false,
      created_at: "2026-08-03T00:00:04Z",
      audio_clips: {
        id: "clip-2-2",
        processing_status: "transcribed",
        pronunciation_scores: [],
      },
    },
    {
      id: "try-2-3",
      attempt_turn_id: "turn-2",
      audio_clip_id: "clip-2-3",
      try_number: 3,
      transcript: "word-2",
      outcome: "word_weak",
      word_accuracy: 60,
      star_band: 2,
      full_word_passed: true,
      target_sound_accuracy: 80,
      target_sound_passed: true,
      created_at: "2026-08-03T00:00:05Z",
      audio_clips: {
        id: "clip-2-3",
        processing_status: "transcribed",
        pronunciation_scores: [{ star_band: 2 }],
      },
    },
  ];

  function query(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.maybeSingle = async () => ({
      data: options.attemptFound === false
        ? null
        : {
            id: "attempt-1",
            status: "teacher_review",
            completed_at: "2026-08-03T00:01:00Z",
            needs_review_reason: "pronunciation_practice",
            assignment_students: {
              id: "assignment-student-1",
              status: "teacher_review",
              dismissed_at: null,
              submitted_at: "2026-08-03T00:01:00Z",
              students: { display_name: "Mina" },
              assignments: {
                id: "assignment-1",
                title: "S Sound Practice",
                assignment_kind: "pronunciation",
                mission_snapshot: snapshot(),
                classes: { id: "class-1", name: "Class 1", teacher_id: "teacher-1" },
              },
            },
            attempt_turns: attemptTurns,
          },
      error: null,
    });
    chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve({
        data: table === "pronunciation_word_tries" ? tries : [],
        error: null,
      }).then(resolve);
    return chain;
  }

  return { from: vi.fn((table: string) => query(table)) };
}

describe("teacher pronunciation evidence", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
  });

  it("rejects a foreign teacher before loading pronunciation tries", async () => {
    mockSupabase = createMockSupabase({ attemptFound: false });
    const { getPronunciationEvidenceForTeacher } = await import(
      "@/server/teacher/pronunciation-evidence"
    );

    await expect(
      getPronunciationEvidenceForTeacher({
        teacherId: "teacher-2",
        attemptId: "attempt-1",
      }),
    ).resolves.toBeNull();
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });

  it("returns all tries while selecting first and result recordings exactly", async () => {
    const { getPronunciationEvidenceForTeacher } = await import(
      "@/server/teacher/pronunciation-evidence"
    );

    const evidence = await getPronunciationEvidenceForTeacher({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
    });

    expect(evidence?.pronunciationWords[0]).toMatchObject({
      order: 1,
      word: "word-1",
      attemptCount: 2,
      firstTry: { id: "try-1-1", audioClipId: "clip-1-1" },
      resultTry: { id: "try-1-2", audioClipId: "clip-1-2", outcome: "passed" },
    });
    expect(evidence?.pronunciationWords[0]?.tries.map((tryRow) => tryRow.audioClipId)).toEqual([
      "clip-1-1",
      "clip-1-2",
    ]);
    expect(evidence?.pronunciationWords[1]?.resultTry).toMatchObject({
      id: "try-2-3",
      audioClipId: "clip-2-3",
    });
  });
});
