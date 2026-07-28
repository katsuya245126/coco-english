import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

type Operation = {
  table: string;
  select?: string;
  filters: Array<[string, unknown]>;
  inFilters: Array<[string, unknown[]]>;
  orderBy: Array<[string, unknown]>;
};

function createMockSupabase(options: {
  evidenceFound?: boolean;
  clipFound?: boolean;
  attemptTurns?: unknown[];
  clipObjectKey?: string | null;
  clipStatus?: string;
  clipDeletedAt?: string | null;
  pronunciationScores?: Array<{
    audio_clip_id: string;
    star_band: number;
    word_scores: Array<{ word: string; errorType?: string }>;
  }>;
} = {}) {
  const operations: Operation[] = [];
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://storage.example/signed-audio" },
    error: null,
  }));

  function createQuery(table: string) {
    const operation: Operation = {
      table,
      filters: [],
      inFilters: [],
      orderBy: [],
    };

    const query = {
      select: vi.fn((select?: string) => {
        operation.select = select;
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        operation.inFilters.push([column, values]);
        return query;
      }),
      order: vi.fn((column: string, options?: unknown) => {
        operation.orderBy.push([column, options]);
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        operations.push(operation);

        if (table === "attempts") {
          return {
            data:
              options.evidenceFound === false
                ? null
                : {
                    id: "attempt-1",
                    status: "completed",
                    started_at: "2026-06-27T07:00:00Z",
                    completed_at: "2026-06-27T07:02:00Z",
                    needs_review_reason: "low_confidence",
                    assignment_students: {
                      id: "as-1",
                      status: "teacher_review",
                      submitted_at: "2026-06-27T07:02:00Z",
                      attempt_count: 2,
                      highest_hint_level: 1,
                      students: { display_name: "Mina" },
                      assignments: {
                        title: "Daily routines",
                        // Minimal/seeded snapshot shape: uses `order` (not
                        // `turnOrder`) and omits strict-schema fields. The
                        // evidence reader must still surface prompts.
                        mission_snapshot: {
                          missionId: "11111111-1111-1111-1111-111111111111",
                          title: "Daily routines",
                          requiredTurns: 2,
                          characterId: "default-buddy",
                          turns: [
                            {
                              order: 1,
                              prompt: "What time do you wake up?",
                              targetExample: "I wake up at seven.",
                            },
                            {
                              order: 2,
                              prompt: "What do you eat for breakfast?",
                              targetExample: "I eat breakfast.",
                            },
                          ],
                        },
                        classes: { teacher_id: "teacher-1" },
                      },
                    },
                  },
            error: null,
          };
        }

        if (table === "audio_clips") {
          return {
            data:
              options.clipFound === false
                ? null
                : {
                    id: "clip-1",
                    object_key:
                      options.clipObjectKey === undefined
                        ? "as-1/attempt-1/1/original_answer-clip-1.webm"
                        : options.clipObjectKey,
                    processing_status: options.clipStatus ?? "transcribed",
                    deleted_at: options.clipDeletedAt ?? null,
                  },
            error: null,
          };
        }

        return { data: null, error: null };
      }),
      then: (resolve: (value: unknown) => void) => {
        operations.push(operation);
        if (table === "attempt_turns") {
          return Promise.resolve({
            data: options.attemptTurns ?? [
              {
                id: "turn-1",
                turn_order: 1,
                original_transcript: "I wake up at seven.",
                improved_sentence: "I wake up at seven.",
                repeat_transcript: "I wake up at seven.",
                target_attempted: true,
                repeat_accepted: true,
                evaluation: {
                  version: "ai-eval-v1",
                  outcome: "accepted_repeat",
                  meaningUnderstood: true,
                  targetPatternAttempted: true,
                  reviewReason: null,
                  repeatAccepted: true,
                },
              },
              {
                id: "turn-2",
                turn_order: 2,
                original_transcript: "I eat breakfast.",
                improved_sentence: "I eat breakfast.",
                repeat_transcript: "I eat breakfast.",
                target_attempted: false,
                repeat_accepted: null,
                evaluation: {
                  version: "ai-eval-v1",
                  outcome: "teacher_review",
                  meaningUnderstood: true,
                  targetPatternAttempted: false,
                  reviewReason: "low_confidence",
                  repeatAccepted: null,
                },
              },
            ],
            error: null,
          }).then(resolve);
        }
        if (table === "audio_clips") {
          return Promise.resolve({
            data: [
              {
                id: "clip-1",
                attempt_turn_id: "turn-1",
                clip_kind: "original_answer",
                processing_status: "transcribed",
              },
              {
                id: "clip-2",
                attempt_turn_id: "turn-1",
                clip_kind: "repeat_attempt",
                processing_status: "transcribed",
              },
            ],
            error: null,
          }).then(resolve);
        }
        if (table === "pronunciation_scores") {
          return Promise.resolve({
            data: options.pronunciationScores ?? [
              {
                audio_clip_id: "clip-1",
                star_band: 3,
                word_scores: [
                  { word: "I", errorType: "None" },
                  { word: "wake", errorType: "Mispronunciation" },
                ],
              },
            ],
            error: null,
          }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };

    return query;
  }

  return {
    operations,
    createSignedUrl,
    storage: {
      from: vi.fn(() => ({ createSignedUrl })),
    },
    from: vi.fn((table: string) => createQuery(table)),
  };
}

describe("teacher audio evidence service", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("loads transcript-first attempt evidence scoped by teacher ownership", async () => {
    const { getAttemptEvidenceForTeacher } = await import(
      "@/server/teacher/audio-evidence"
    );

    const evidence = await getAttemptEvidenceForTeacher({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
    });

    expect(evidence).toMatchObject({
      missionTitle: "Daily routines",
      studentName: "Mina",
      attemptStatus: "completed",
      reviewReason: "low_confidence",
      submittedAt: "2026-06-27T07:02:00Z",
      completedAt: "2026-06-27T07:02:00Z",
      assignmentStudentId: "as-1",
      attemptCount: 2,
      highestHintLevel: 1,
    });
    expect(evidence?.turns[0]).toMatchObject({
      turnOrder: 1,
      question: "What time do you wake up?",
      originalTranscript: "I wake up at seven.",
      repeatTranscript: "I wake up at seven.",
      meaningResult: "Understood",
      targetPatternResult: "Target pattern used",
      repeatResult: "Accepted",
      audioClips: [
        {
          id: "clip-1",
          clipKind: "original_answer",
          processingStatus: "transcribed",
          pronunciationScore: {
            starBand: 3,
            words: [
              { word: "I", label: "Clear" },
              { word: "wake", label: "Mispronounced" },
            ],
          },
        },
        {
          id: "clip-2",
          clipKind: "repeat_attempt",
          processingStatus: "transcribed",
          pronunciationScore: null,
        },
      ],
    });
    expect(evidence?.turns[1]).toMatchObject({
      question: "What do you eat for breakfast?",
      meaningResult: "Needs teacher check",
      targetPatternResult: "Needs teacher check",
      repeatResult: "Needs teacher check",
      reviewReason: "low_confidence",
    });

    const attemptLookup = mockSupabase.operations.find(
      (operation) => operation.table === "attempts",
    );
    expect(attemptLookup?.filters).toEqual(
      expect.arrayContaining([
        ["id", "attempt-1"],
        ["assignment_students.assignments.classes.teacher_id", "teacher-1"],
      ]),
    );
    expect(JSON.stringify(evidence)).not.toContain("signedUrl");

    const scoresLookup = mockSupabase.operations.find(
      (operation) => operation.table === "pronunciation_scores",
    );
    expect(scoresLookup?.inFilters).toEqual(
      expect.arrayContaining([
        ["audio_clip_id", expect.arrayContaining(["clip-1", "clip-2"])],
      ]),
    );
    expect(JSON.stringify(evidence)).not.toContain("accuracy_score");
    expect(JSON.stringify(evidence)).not.toContain("accuracyScore");
    expect(JSON.stringify(evidence)).not.toContain("pronunciation_score");
  });

  it("attaches null pronunciationScore for a clip with no matching score row", async () => {
    mockSupabase = createMockSupabase({ pronunciationScores: [] });
    const { getAttemptEvidenceForTeacher } = await import(
      "@/server/teacher/audio-evidence"
    );

    const evidence = await getAttemptEvidenceForTeacher({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
    });

    expect(evidence?.turns[0].audioClips[0]).toMatchObject({
      id: "clip-1",
      pronunciationScore: null,
    });
    expect(evidence?.turns[0].audioClips[1]).toMatchObject({
      id: "clip-2",
      pronunciationScore: null,
    });
  });

  it("returns null when the teacher does not own the attempt", async () => {
    mockSupabase = createMockSupabase({ evidenceFound: false });
    const { getAttemptEvidenceForTeacher } = await import(
      "@/server/teacher/audio-evidence"
    );

    await expect(
      getAttemptEvidenceForTeacher({
        teacherId: "teacher-2",
        attemptId: "attempt-1",
      }),
    ).resolves.toBeNull();
  });

  it("creates a short-lived signed URL only after teacher ownership filtering", async () => {
    const { createSignedAudioUrlForTeacher } = await import(
      "@/server/teacher/audio-evidence"
    );

    const result = await createSignedAudioUrlForTeacher({
      teacherId: "teacher-1",
      audioClipId: "clip-1",
    });

    expect(result).toEqual({
      signedUrl: "https://storage.example/signed-audio",
    });

    const clipLookup = mockSupabase.operations.find(
      (operation) =>
        operation.table === "audio_clips" &&
        operation.filters.some(([column]) => column === "id"),
    );
    expect(clipLookup?.filters).toEqual(
      expect.arrayContaining([
        ["id", "clip-1"],
        [
          "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
          "teacher-1",
        ],
      ]),
    );
    expect(mockSupabase.storage.from).toHaveBeenCalledWith("student-audio");
    expect(mockSupabase.createSignedUrl).toHaveBeenCalledWith(
      "as-1/attempt-1/1/original_answer-clip-1.webm",
      300,
    );
  });

  it("does not sign missing, deleted, failed, or keyless clips", async () => {
    const { createSignedAudioUrlForTeacher } = await import(
      "@/server/teacher/audio-evidence"
    );

    mockSupabase = createMockSupabase({ clipFound: false });
    await expect(
      createSignedAudioUrlForTeacher({
        teacherId: "teacher-1",
        audioClipId: "missing",
      }),
    ).resolves.toBeNull();

    mockSupabase = createMockSupabase({ clipStatus: "deleted" });
    await expect(
      createSignedAudioUrlForTeacher({
        teacherId: "teacher-1",
        audioClipId: "deleted",
      }),
    ).resolves.toBeNull();

    mockSupabase = createMockSupabase({ clipStatus: "failed" });
    await expect(
      createSignedAudioUrlForTeacher({
        teacherId: "teacher-1",
        audioClipId: "failed",
      }),
    ).resolves.toBeNull();

    mockSupabase = createMockSupabase({ clipObjectKey: null });
    await expect(
      createSignedAudioUrlForTeacher({
        teacherId: "teacher-1",
        audioClipId: "keyless",
      }),
    ).resolves.toBeNull();

    expect(mockSupabase.createSignedUrl).not.toHaveBeenCalled();
  });
});

describe("teacher evidence keeps raw transcripts and labels interpretations", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  async function loadTurns(attemptTurns: unknown[]) {
    mockSupabase = createMockSupabase({ attemptTurns });
    const { getAttemptEvidenceForTeacher } = await import(
      "@/server/teacher/audio-evidence"
    );
    const evidence = await getAttemptEvidenceForTeacher({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
    });
    return evidence?.turns ?? [];
  }

  it("exposes raw and interpreted forms for accented English", async () => {
    const turns = await loadTurns([
      {
        id: "turn-1",
        turn_order: 1,
        original_transcript: "I like 바닐라.",
        improved_sentence: null,
        repeat_transcript: "바닐라.",
        target_attempted: true,
        repeat_accepted: true,
        evaluation: {
          outcome: "accepted_repeat",
          hangulInterpretations: [
            { hangul: "바닐라", kind: "accented_english", englishReading: "vanilla" },
          ],
          originalEvaluation: {
            hangulInterpretations: [
              { hangul: "바닐라", kind: "accented_english", englishReading: "vanilla" },
            ],
          },
        },
      },
    ]);

    expect(turns[0]).toMatchObject({
      originalTranscript: "I like 바닐라.",
      originalDisplayTranscript: "I like vanilla.",
      repeatTranscript: "바닐라.",
      repeatDisplayTranscript: "vanilla.",
    });
  });

  it("keeps the raw transcript visible when the interpretation is withheld", async () => {
    const turns = await loadTurns([
      {
        id: "turn-1",
        turn_order: 1,
        original_transcript: "I like 축구.",
        improved_sentence: null,
        repeat_transcript: null,
        target_attempted: true,
        repeat_accepted: null,
        evaluation: {
          outcome: "accepted_original",
          hangulInterpretations: [
            { hangul: "축구", kind: "korean_vocabulary", englishReading: null },
          ],
        },
      },
    ]);

    expect(turns[0]).toMatchObject({
      originalTranscript: "I like 축구.",
      originalDisplayTranscript: null,
      repeatTranscript: null,
      repeatDisplayTranscript: null,
    });
  });

  it("leaves a legacy all-English record's interpretation equal to the raw text", async () => {
    const turns = await loadTurns([
      {
        id: "turn-1",
        turn_order: 1,
        original_transcript: "I like vanilla.",
        improved_sentence: null,
        repeat_transcript: null,
        target_attempted: true,
        repeat_accepted: null,
        evaluation: { outcome: "accepted_original" },
      },
    ]);

    expect(turns[0]).toMatchObject({
      originalTranscript: "I like vanilla.",
      originalDisplayTranscript: "I like vanilla.",
    });
  });
});

describe("teacher evidence page transcript labelling", () => {
  const page = readFileSync(
    resolve(process.cwd(), "src/app/teacher/evidence/[attemptId]/page.tsx"),
    "utf8",
  );

  it("labels the learner-facing interpretation without calling it what the student said", () => {
    expect(page).toContain("Learner-facing interpretation");
    expect(page).not.toContain("what the student said");
  });

  it("renders the interpretation only when it differs from the raw transcript", () => {
    expect(page).toContain("originalDisplayTranscript");
    expect(page).toContain("repeatDisplayTranscript");
    expect(page.replace(/\s+/g, " ")).toContain(
      "interpretation !== null && interpretation !== transcript",
    );
  });

  it("explains a withheld interpretation to the teacher", () => {
    expect(page.replace(/\s+/g, " ")).toContain(
      "Learner transcript hidden because the Hangul reading was Korean vocabulary or could not be interpreted safely.",
    );
  });
});
