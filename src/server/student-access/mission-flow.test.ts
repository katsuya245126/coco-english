import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";

// Mission-flow cap gate and RPC boundaries.

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

type Operation = {
  table: string;
  action: "select";
  filters: Array<[string, unknown]>;
};

const missionId = "11111111-1111-4111-8111-111111111111";

const completeTurn = {
  prompt: "What do you like doing after school?",
  targetExample: "I like playing soccer.",
  hintLadder: {
    tier1: "I like ___ing.",
    tier2: "play, soccer, like",
    tier3: "I like playing soccer.",
  },
};

function makeCompleteSnapshot(conversationMode = false) {
  return {
    missionId,
    title: "After-school likes",
    targetPattern: "I like ___ing.",
    level: "elementary",
    requiredTurns: 5,
    characterId: "default-buddy",
    conversationMode,
    turns: Array.from(
      { length: conversationMode ? 1 : 5 },
      (_, index) => ({ ...completeTurn, turnOrder: index + 1 }),
    ),
  };
}

const legacySnapshot = {
  missionId,
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [
    {
      order: 1,
      prompt: "What are you going to do this weekend?",
      targetExample: "I am going to play soccer.",
    },
  ],
};

function createMockSupabase(options: {
  missionSnapshot?: unknown;
  attemptTurns?: Array<{
    turn_order: number;
    original_transcript: string;
    repeat_transcript: string;
    repeat_accepted: boolean;
    evaluation: null;
  }>;
  recordHintRpcData?: string | null;
  recordHintRpcError?: { message: string } | null;
  startRpcData?: Database["public"]["Functions"]["start_student_attempt"]["Returns"];
} = {}) {
  const operations: Operation[] = [];

  function createQuery(table: string) {
    const operation: Operation = { table, action: "select", filters: [] };

    const query: Record<string, unknown> & PromiseLike<{ error: unknown }> = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
      then: (<TResult1, TResult2 = never>(
        onFulfilled?:
          | ((value: { error: unknown }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => {
        const result =
          table === "attempt_turns"
            ? { data: options.attemptTurns ?? [], error: null }
            : { data: null, error: null };
        return Promise.resolve(result).then(
          onFulfilled ?? undefined,
          onRejected ?? undefined,
        );
      }) as PromiseLike<{ error: unknown }>["then"],
      maybeSingle: vi.fn(async () => {
        operations.push(operation);
        if (table === "assignment_students") {
          return {
            data: {
              id: "as-1",
              assignment_id: "assignment-1",
              student_id: "student-1",
              status: "started",
              latest_attempt_id: "attempt-1",
              attempt_count: 1,
              highest_hint_level: 0,
              assignments: {
                canceled_at: null,
                title: "Mock mission",
                mission_snapshot:
                  "missionSnapshot" in options
                    ? options.missionSnapshot
                    : makeCompleteSnapshot(),
              },
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
    };

    return query;
  }

  return {
    operations,
    from: vi.fn((table: string) => createQuery(table)),
    rpc: vi.fn(async (name: string) => {
      if (name === "start_student_attempt") {
        return {
          data:
            options.startRpcData ?? [
              {
                outcome: "ok",
                attempt_id: "attempt-1",
                is_resume: true,
                required_turns: 5,
              },
            ],
          error: null,
        };
      }
      if (name === "record_hint_reveal") {
        return {
          data:
            "recordHintRpcData" in options
              ? options.recordHintRpcData
              : "ok",
          error: options.recordHintRpcError ?? null,
        };
      }
      return { data: "ok", error: null };
    }),
  };
}

describe("canGenerateNextDynamicTurn (CHAT-03, T-11-08 hard cap)", () => {
  it("returns true for every turn 1..8 (within the fixed hard cap)", async () => {
    const { canGenerateNextDynamicTurn } = await import(
      "@/server/student-access/mission-flow"
    );

    for (let turnOrder = 1; turnOrder <= 8; turnOrder++) {
      expect(canGenerateNextDynamicTurn(turnOrder)).toBe(true);
    }
  });

  it("returns false for turnOrder 9 (one past the cap)", async () => {
    const { canGenerateNextDynamicTurn } = await import(
      "@/server/student-access/mission-flow"
    );

    expect(canGenerateNextDynamicTurn(9)).toBe(false);
  });

  it("held-out: returns false for a forged/unreasonable turnOrder of 99", async () => {
    const { canGenerateNextDynamicTurn } = await import(
      "@/server/student-access/mission-flow"
    );

    expect(canGenerateNextDynamicTurn(99)).toBe(false);
  });

  it("is independent of any mission.required_turns value (Pitfall 4) — no required_turns param exists", async () => {
    const { canGenerateNextDynamicTurn } = await import(
      "@/server/student-access/mission-flow"
    );

    // The function signature takes only turnOrder; a mission with
    // required_turns=3 still permits generation through turn 8.
    expect(canGenerateNextDynamicTurn(3)).toBe(true);
    expect(canGenerateNextDynamicTurn(8)).toBe(true);
  });
});

describe("recordHintReveal RPC boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
  });

  it("delegates the owned atomic operation without direct table writes", async () => {
    const { recordHintReveal } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      recordHintReveal({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
        turnOrder: 2,
        hintLevel: 3,
      }),
    ).resolves.toEqual({ ok: true });

    expect(mockSupabase.rpc).toHaveBeenCalledWith("record_hint_reveal", {
      p_student_id: "student-1",
      p_assignment_student_id: "as-1",
      p_attempt_id: "attempt-1",
      p_turn_order: 2,
      p_hint_level: 3,
    });
    expect(mockSupabase.operations).toEqual([]);
  });

  it.each([
    ["not_found", { ok: false, error: "not_found" }],
    ["invalid_hint_level", { ok: false, error: "invalid_hint_level" }],
    ["no_turn_row", { ok: false, error: "no_turn_row" }],
  ] as const)("maps the RPC outcome %s", async (rpcData, expected) => {
    mockSupabase = createMockSupabase({ recordHintRpcData: rpcData });
    const { recordHintReveal } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      recordHintReveal({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
        turnOrder: 1,
        hintLevel: 1,
      }),
    ).resolves.toEqual(expected);
  });

  it("maps an RPC error or unexpected result to db_error", async () => {
    mockSupabase = createMockSupabase({
      recordHintRpcError: { message: "transaction failed" },
    });
    const { recordHintReveal } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      recordHintReveal({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
        turnOrder: 1,
        hintLevel: 1,
      }),
    ).resolves.toEqual({ ok: false, error: "db_error" });

    mockSupabase = createMockSupabase({ recordHintRpcData: null });
    vi.resetModules();
    const reloaded = await import("@/server/student-access/mission-flow");
    await expect(
      reloaded.recordHintReveal({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
        turnOrder: 1,
        hintLevel: 1,
      }),
    ).resolves.toEqual({ ok: false, error: "db_error" });
  });
});

describe("startOrResumeAttempt RPC boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase({
      startRpcData: [
        {
          outcome: "ok",
          attempt_id: "attempt-2",
          is_resume: false,
          required_turns: 1,
        },
      ],
    });
  });

  it("maps a fresh RPC result without direct lifecycle writes", async () => {
    const { startOrResumeAttempt } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      startOrResumeAttempt({
        studentId: "student-1",
        assignmentStudentId: "as-1",
      }),
    ).resolves.toEqual({
      ok: true,
      attemptId: "attempt-2",
      isResume: false,
      resumeTurnOrder: 1,
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith("start_student_attempt", {
      p_student_id: "student-1",
      p_assignment_student_id: "as-1",
    });
    expect(
      mockSupabase.operations.some(
        (operation) =>
          (operation.table === "attempts" && operation.action !== "select") ||
          (operation.table === "assignment_students" && operation.action !== "select") ||
          (operation.table === "assignment_status_events" && operation.action !== "select"),
      ),
    ).toBe(false);
  });

  it("maps a denied RPC result to the existing service contract", async () => {
    mockSupabase = createMockSupabase({
      startRpcData: [
        {
          outcome: "not_assigned_or_started",
          attempt_id: null,
          is_resume: false,
          required_turns: null,
        },
      ],
    });
    const { startOrResumeAttempt } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      startOrResumeAttempt({
        studentId: "student-1",
        assignmentStudentId: "as-1",
      }),
    ).resolves.toEqual({ ok: false, error: "not_assigned_or_started" });
  });
});

describe("mission snapshot lifecycle boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
  });

  it("maps an RPC snapshot rejection without an application pre-read", async () => {
    mockSupabase = createMockSupabase({
      startRpcData: [
        {
          outcome: "not_found",
          attempt_id: null,
          is_resume: false,
          required_turns: null,
        },
      ],
    });
    const { startOrResumeAttempt } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      startOrResumeAttempt({
        studentId: "student-1",
        assignmentStudentId: "as-1",
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("start_student_attempt", {
      p_student_id: "student-1",
      p_assignment_student_id: "as-1",
    });
    expect(mockSupabase.operations).toHaveLength(0);
  });

  it.each([false, true])(
    "uses RPC required_turns when conversationMode is %s",
    async (conversationMode) => {
      mockSupabase = createMockSupabase({
        missionSnapshot: makeCompleteSnapshot(conversationMode),
        attemptTurns: Array.from({ length: 4 }, (_, index) => ({
          turn_order: index + 1,
          original_transcript: "I like playing soccer.",
          repeat_transcript: "I like playing soccer after school.",
          repeat_accepted: true,
          evaluation: null,
        })),
        startRpcData: [
          {
            outcome: "ok",
            attempt_id: "attempt-1",
            is_resume: true,
            required_turns: 3,
          },
        ],
      });
      const { startOrResumeAttempt } = await import(
        "@/server/student-access/mission-flow"
      );

      await expect(
        startOrResumeAttempt({
          studentId: "student-1",
          assignmentStudentId: "as-1",
        }),
      ).resolves.toEqual({
        ok: true,
        attemptId: "attempt-1",
        isResume: true,
        resumeTurnOrder: 4,
      });
    },
  );

  it.each([legacySnapshot, { requiredTurns: 5 }])(
    "rejects unsupported completion before the RPC",
    async (missionSnapshot) => {
      mockSupabase = createMockSupabase({ missionSnapshot });
      const { completeAttempt } = await import(
        "@/server/student-access/mission-flow"
      );

      await expect(
        completeAttempt({
          studentId: "student-1",
          assignmentStudentId: "as-1",
          attemptId: "attempt-1",
        }),
      ).resolves.toEqual({ ok: false, error: "not_found" });
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    },
  );

  it("keeps complete-snapshot completion in the atomic RPC", async () => {
    const { completeAttempt } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      completeAttempt({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("complete_student_attempt", {
      p_student_id: "student-1",
      p_assignment_student_id: "as-1",
      p_attempt_id: "attempt-1",
    });
  });
});
