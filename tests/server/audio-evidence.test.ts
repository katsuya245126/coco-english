import { beforeEach, describe, expect, it, vi } from "vitest";

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
  clipObjectKey?: string | null;
  clipStatus?: string;
  clipDeletedAt?: string | null;
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
                      status: "teacher_review",
                      submitted_at: "2026-06-27T07:02:00Z",
                      students: { display_name: "Mina" },
                      assignments: {
                        title: "Daily routines",
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
            data: [
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
    });
    expect(evidence?.turns[0]).toMatchObject({
      turnOrder: 1,
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
        },
        {
          id: "clip-2",
          clipKind: "repeat_attempt",
          processingStatus: "transcribed",
        },
      ],
    });
    expect(evidence?.turns[1]).toMatchObject({
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
