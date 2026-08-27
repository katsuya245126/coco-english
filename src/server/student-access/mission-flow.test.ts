import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db/types";

// Mission-flow cap gate + coco_line persistence (CHAT-03/05/06, T-11-08, T-11-11).
//
// canGenerateNextDynamicTurn is pure and tested directly. recordCocoLine
// touches Supabase, so it uses the same chained-query-builder mock shape as
// tests/server/mission-assign.test.ts — no live DB, no Supabase env required.

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

type Operation = {
  table: string;
  action: "select" | "upsert" | "update";
  payload?: unknown;
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
  assignmentFound?: boolean;
  attemptFound?: boolean;
  attemptStatus?: string;
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
  assignmentStatus?: "assigned" | "started";
  latestAttemptId?: string | null;
  missionSnapshot?: unknown;
  attemptTurns?: Array<{
    turn_order: number;
    original_transcript: string;
    repeat_transcript: string;
    repeat_accepted: boolean;
    evaluation: null;
  }>;
  rpcData?: string;
  startRpcData?: Database["public"]["Functions"]["start_student_attempt"]["Returns"];
} = {}) {
  const operations: Operation[] = [];

  function createQuery(table: string) {
    const operation: Operation = { table, action: "select", filters: [] };

    const query: Record<string, unknown> & PromiseLike<{ error: unknown }> = {
      select: vi.fn(() => query),
      upsert: vi.fn((payload: unknown) => {
        operation.action = "upsert";
        operation.payload = payload;
        operations.push(operation);
        return Promise.resolve({ error: options.upsertError ?? null });
      }),
      update: vi.fn((payload: unknown) => {
        operation.action = "update";
        operation.payload = payload;
        operations.push(operation);
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      }),
      // Makes `query` itself awaitable so the update().eq().eq().eq() chain
      // in flagAttemptForTeacherReview (no terminal .select()) resolves.
      then: (<TResult1, TResult2 = never>(
        onFulfilled?:
          | ((value: { error: unknown }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => {
        if (operation.action === "update" && !operations.includes(operation)) {
          operations.push(operation);
        }
        const result =
          operation.action === "select" && table === "attempt_turns"
            ? { data: options.attemptTurns ?? [], error: null }
            : { error: options.updateError ?? null };
        return Promise.resolve(result).then(
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
                    latest_attempt_id:
                      "latestAttemptId" in options
                        ? options.latestAttemptId
                        : "attempt-1",
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
        if (table === "attempts") {
          return {
            data:
              options.attemptFound === false ||
              (options.attemptStatus !== undefined &&
                options.attemptStatus !== "in_progress")
                ? null
                : {
                    id: "attempt-1",
                    assignment_student_id: "as-1",
                    status: options.attemptStatus ?? "in_progress",
                  },
            error: null,
          };
        }
        if (table === "assignments") {
          return {
            data: {
              mission_snapshot:
                "missionSnapshot" in options
                  ? options.missionSnapshot
                  : makeCompleteSnapshot(),
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
    rpc: vi.fn(async (name: string) =>
      name === "start_student_attempt"
        ? {
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
          }
        : { data: options.rpcData ?? "ok", error: null },
    ),
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

describe("Coco line persistence (recordCocoLine, CHAT-06, T-11-11)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
  });

  it("upserts coco_line + moderation_event on (attempt_id, turn_order)", async () => {
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );

    const result = await recordCocoLine({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 2,
      cocoLine: "That sounds fun! What did you do next?",
      moderationEvent: null,
    });

    expect(result).toEqual({ ok: true });

    const upsertOp = mockSupabase.operations.find(
      (op) => op.table === "attempt_turns" && op.action === "upsert",
    );
    expect(upsertOp?.payload).toMatchObject({
      attempt_id: "attempt-1",
      turn_order: 2,
      coco_line: "That sounds fun! What did you do next?",
      moderation_event: null,
    });
    expect(upsertOp?.payload).not.toHaveProperty("evaluation");
  });

  it("includes evaluation evidence only when supplied", async () => {
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );

    const evaluation = {
      outcome: "retry_original",
      retryReason: "unclear_meaning",
    };
    const result = await recordCocoLine({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 2,
      cocoLine: "Who do you play soccer with?",
      moderationEvent: null,
      evaluation,
    });

    expect(result).toEqual({ ok: true });
    expect(mockSupabase.operations.at(-1)?.payload).toMatchObject({
      coco_line: "Who do you play soccer with?",
      evaluation,
    });
  });

  it("a second call with the same turn_order overwrites, not duplicates (idempotent)", async () => {
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );

    const base = {
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 2,
    };

    await recordCocoLine({ ...base, cocoLine: "First line", moderationEvent: null });
    const result = await recordCocoLine({
      ...base,
      cocoLine: "Retried line",
      moderationEvent: { kind: "retried" },
    });

    expect(result).toEqual({ ok: true });

    const upserts = mockSupabase.operations.filter(
      (op) => op.table === "attempt_turns" && op.action === "upsert",
    );
    // Both calls target the same (attempt_id, turn_order); no duplicate row
    // is implied — each call is a fresh upsert with onConflict set.
    expect(upserts).toHaveLength(2);
    expect(upserts[1]?.payload).toMatchObject({
      attempt_id: "attempt-1",
      turn_order: 2,
      coco_line: "Retried line",
      moderation_event: { kind: "retried" },
    });
  });

  it("persists an attributable policy fallback event without rejected text", async () => {
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );
    const event = {
      kind: "canned_fallback" as const,
      cause: "reply_policy_failed" as const,
      violations: ["either_or_question" as const, "topic_drift" as const],
    };

    const result = await recordCocoLine({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 2,
      cocoLine: "That's interesting! Tell me more about that.",
      moderationEvent: event,
    });

    expect(result).toEqual({ ok: true });
    expect(mockSupabase.operations.at(-1)?.payload).toMatchObject({
      moderation_event: event,
    });
    expect(JSON.stringify(event)).not.toContain("line");
  });

  it("returns not_found for a mismatched student/attempt (ownership enforced, V4)", async () => {
    mockSupabase = createMockSupabase({ assignmentFound: false });
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );

    const result = await recordCocoLine({
      studentId: "wrong-student",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      cocoLine: "Hello!",
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("returns not_found when the attempt does not belong to the assignment_student", async () => {
    mockSupabase = createMockSupabase({ attemptFound: false });
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );

    const result = await recordCocoLine({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "wrong-attempt",
      turnOrder: 1,
      cocoLine: "Hello!",
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("returns not_found when the owned attempt is no longer in progress", async () => {
    mockSupabase = createMockSupabase({ attemptStatus: "completed" });
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );

    const result = await recordCocoLine({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      cocoLine: "Hello!",
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "attempt_turns" && operation.action === "upsert",
      ),
    ).toBe(false);
  });

  it("returns db_error when the upsert fails", async () => {
    mockSupabase = createMockSupabase({
      upsertError: { message: "constraint violation" },
    });
    const { recordCocoLine } = await import(
      "@/server/student-access/mission-flow"
    );

    const result = await recordCocoLine({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      turnOrder: 1,
      cocoLine: "Hello!",
    });

    expect(result).toEqual({ ok: false, error: "db_error" });
  });
});

describe("flagAttemptForTeacherReview", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
  });

  it("records an owned review reason without terminalizing assignment or attempt", async () => {
    const { flagAttemptForTeacherReview } = await import(
      "@/server/student-access/mission-flow"
    );

    const result = await flagAttemptForTeacherReview({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      reviewReason: "ambiguous",
    });

    expect(result).toEqual({ ok: true });
    expect(
      mockSupabase.operations.find(
        (operation) =>
          operation.table === "attempts" && operation.action === "update",
      )?.payload,
    ).toEqual({ needs_review_reason: "ambiguous" });
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "assignment_students" && operation.action === "update",
      ),
    ).toBe(false);
    expect(JSON.stringify(mockSupabase.operations)).not.toContain(
      '"status":"teacher_review"',
    );
  });

  it("rejects a non-owned or non-active attempt", async () => {
    mockSupabase = createMockSupabase({ attemptFound: false });
    const { flagAttemptForTeacherReview } = await import(
      "@/server/student-access/mission-flow"
    );
    await expect(
      flagAttemptForTeacherReview({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "wrong-attempt",
        reviewReason: "low_confidence",
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
  });
});

describe("startOrResumeAttempt RPC boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase({
      assignmentStatus: "assigned",
      latestAttemptId: null,
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
