import { beforeEach, describe, expect, it, vi } from "vitest";

type PracticeTry = {
  id: string;
  attempt_turn_id: string;
  try_number: number;
  transcript: string;
  outcome: "passed" | "target_weak" | "word_weak" | "different_word";
  word_accuracy: number | null;
  star_band: number | null;
  full_word_passed: boolean | null;
  target_sound_accuracy: number | null;
  target_sound_passed: boolean | null;
  created_at: string;
};

type FlowState = {
  assignment: Record<string, unknown> | null;
  attempts: Record<string, Record<string, unknown>>;
  turns: Array<Record<string, unknown>>;
  tries: PracticeTry[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  rpcResults: Array<Record<string, unknown>>;
  filters: Array<{ table: string; field: string; value: unknown }>;
};

let state: FlowState;

function queryFor(table: string) {
  const filters: Array<{ field: string; value: unknown }> = [];
  const query: Record<string, unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: unknown) => {
      filters.push({ field, value });
      state.filters.push({ table, field, value });
      return query;
    }),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "assignment_students") {
        return { data: state.assignment, error: null };
      }
      if (table === "attempts") {
        const id = filters.find((filter) => filter.field === "id")?.value;
        return { data: id ? state.attempts[String(id)] ?? null : null, error: null };
      }
      return { data: null, error: null };
    }),
    single: vi.fn(async () => ({ data: null, error: null })),
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
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ name, args });
    return { data: state.rpcResults.shift() ?? null, error: null };
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

function practiceWord(order: 1 | 2 | 3 | 4 | 5, text = `word-${order}`) {
  return {
    order,
    text,
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
  } as const;
}

function practiceSnapshot() {
  return {
    kind: "pronunciation",
    version: 1,
    soundId: "s",
    difficulty: "easy",
    requiredWords: 5,
    soundClipVersion: "v1",
    words: [1, 2, 3, 4, 5].map((order) =>
      practiceWord(order as 1 | 2 | 3 | 4 | 5),
    ),
  };
}

function assignment(
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "assignment-student-1",
    assignment_id: "assignment-1",
    student_id: "student-1",
    status,
    latest_attempt_id: "attempt-1",
    assignments: {
      id: "assignment-1",
      title: "S Sound Practice",
      assignment_kind: "pronunciation",
      mission_snapshot: practiceSnapshot(),
      due_at: null,
      canceled_at: null,
    },
    ...overrides,
  };
}

function turn(order: number) {
  return { id: `turn-${order}`, turn_order: order };
}

function wordTry(
  turnOrder: number,
  tryNumber: 1 | 2 | 3,
  outcome: PracticeTry["outcome"],
): PracticeTry {
  return {
    id: `try-${turnOrder}-${tryNumber}`,
    attempt_turn_id: `turn-${turnOrder}`,
    try_number: tryNumber,
    transcript: `word-${turnOrder}`,
    outcome,
    word_accuracy: outcome === "passed" ? 80 : 40,
    star_band: outcome === "passed" ? 3 : 1,
    full_word_passed: outcome === "passed",
    target_sound_accuracy: outcome === "passed" ? 80 : 30,
    target_sound_passed: outcome === "passed",
    created_at: "2026-08-03T00:00:00Z",
  };
}

beforeEach(() => {
  state = {
    assignment: null,
    attempts: {
      "attempt-1": {
        id: "attempt-1",
        assignment_student_id: "assignment-student-1",
        status: "in_progress",
      },
    },
    turns: [1, 2, 3, 4, 5].map(turn),
    tries: [],
    rpcCalls: [],
    rpcResults: [],
    filters: [],
  };
  mockSupabase.from.mockClear();
  mockSupabase.rpc.mockClear();
});

describe("pronunciation flow", () => {
  it("returns not_found for a foreign student assignment", async () => {
    state.assignment = null;
    state.rpcResults = [{ out_attempt_id: "attempt-1", out_created: true }];

    const { getPronunciationPracticePage } = await import(
      "@/server/student-access/pronunciation-flow"
    );
    const result = await getPronunciationPracticePage({
      studentId: "foreign-student",
      assignmentStudentId: "assignment-student-1",
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.filters).toEqual(
      expect.arrayContaining([
        { table: "assignment_students", field: "id", value: "assignment-student-1" },
        { table: "assignment_students", field: "student_id", value: "foreign-student" },
      ]),
    );
  });

  it("never enters the pronunciation route for a mission assignment", async () => {
    state.assignment = {
      ...assignment("assigned"),
      assignments: {
        ...assignment("assigned").assignments,
        assignment_kind: "mission",
      },
    };

    const { getPronunciationPracticePage } = await import(
      "@/server/student-access/pronunciation-flow"
    );
    await expect(
      getPronunciationPracticePage({
        studentId: "student-1",
        assignmentStudentId: "assignment-student-1",
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("creates one attempt with five turns for a fresh assignment", async () => {
    state.assignment = assignment("assigned", { latest_attempt_id: null });
    state.rpcResults = [{ out_attempt_id: "attempt-1", out_created: true }];

    const { getPronunciationPracticePage } = await import(
      "@/server/student-access/pronunciation-flow"
    );
    const result = await getPronunciationPracticePage({
      studentId: "student-1",
      assignmentStudentId: "assignment-student-1",
    });

    expect(result).toMatchObject({
      ok: true,
      page: {
        attemptId: "attempt-1",
        isResume: false,
        currentWordOrder: 1,
        passedWordCount: 0,
        finishedWordCount: 0,
      },
    });
    expect(state.rpcCalls).toEqual([
      {
        name: "start_pronunciation_attempt",
        args: {
          p_student_id: "student-1",
          p_assignment_student_id: "assignment-student-1",
        },
      },
    ]);
    expect(state.turns).toHaveLength(5);
  });

  it("returns the same in-progress attempt when started twice", async () => {
    state.assignment = assignment("assigned", { latest_attempt_id: null });
    mockSupabase.rpc.mockImplementationOnce(async (name, args) => {
      state.rpcCalls.push({ name, args });
      state.assignment = assignment("started");
      return { data: { out_attempt_id: "attempt-1", out_created: true }, error: null };
    });
    mockSupabase.rpc.mockImplementationOnce(async (name, args) => {
      state.rpcCalls.push({ name, args });
      return { data: { out_attempt_id: "attempt-1", out_created: false }, error: null };
    });

    const { startOrResumePronunciationAttempt } = await import(
      "@/server/student-access/pronunciation-flow"
    );
    const first = await startOrResumePronunciationAttempt({
      studentId: "student-1",
      assignmentStudentId: "assignment-student-1",
    });
    const second = await startOrResumePronunciationAttempt({
      studentId: "student-1",
      assignmentStudentId: "assignment-student-1",
    });

    expect(first).toEqual({ ok: true, attemptId: "attempt-1", isResume: false });
    expect(second).toEqual({ ok: true, attemptId: "attempt-1", isResume: true });
  });

  it("resumes the first word when it has neither a pass nor three valid tries", async () => {
    state.assignment = assignment("started");
    state.rpcResults = [{ out_attempt_id: "attempt-1", out_created: false }];
    state.tries = [wordTry(1, 1, "target_weak")];

    const { getPronunciationPracticePage } = await import(
      "@/server/student-access/pronunciation-flow"
    );
    const result = await getPronunciationPracticePage({
      studentId: "student-1",
      assignmentStudentId: "assignment-student-1",
    });

    expect(result).toMatchObject({
      ok: true,
      page: {
        currentWordOrder: 1,
        passedWordCount: 0,
        finishedWordCount: 0,
      },
    });
    if (result.ok) {
      expect(result.page.words[0]).toMatchObject({
        order: 1,
        validTryCount: 1,
        remainingTryCount: 2,
        passed: false,
        firstTry: { outcome: "target_weak" },
        resultTry: { outcome: "target_weak" },
      });
    }
  });

  it("returns a completed terminal practice as read-only", async () => {
    state.assignment = assignment("teacher_review");
    state.attempts["attempt-1"].status = "teacher_review";
    state.tries = [1, 2, 3, 4, 5].map((order) => wordTry(order, 1, "passed"));

    const { getPronunciationPracticePage } = await import(
      "@/server/student-access/pronunciation-flow"
    );
    const result = await getPronunciationPracticePage({
      studentId: "student-1",
      assignmentStudentId: "assignment-student-1",
    });

    expect(result).toMatchObject({
      ok: true,
      page: {
        readOnly: true,
        completed: true,
        currentWordOrder: null,
        passedWordCount: 5,
        finishedWordCount: 5,
      },
    });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("blocks overdue and canceled work", async () => {
    const { getPronunciationPracticePage } = await import(
      "@/server/student-access/pronunciation-flow"
    );

    state.assignment = assignment("assigned", {
      assignments: {
        ...assignment("assigned").assignments,
        due_at: "2026-08-02T00:00:00Z",
      },
    });
    await expect(
      getPronunciationPracticePage({
        studentId: "student-1",
        assignmentStudentId: "assignment-student-1",
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });

    state.assignment = assignment("assigned", {
      assignments: {
        ...assignment("assigned").assignments,
        canceled_at: "2026-08-01T00:00:00Z",
      },
    });
    await expect(
      getPronunciationPracticePage({
        studentId: "student-1",
        assignmentStudentId: "assignment-student-1",
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
  });
});
