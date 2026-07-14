import { beforeEach, describe, expect, it, vi } from "vitest";

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
  action: "select" | "upsert";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

function createMockSupabase(options: {
  assignmentFound?: boolean;
  attemptFound?: boolean;
  attemptStatus?: string;
  upsertError?: { message: string } | null;
} = {}) {
  const operations: Operation[] = [];

  function createQuery(table: string) {
    const operation: Operation = { table, action: "select", filters: [] };

    const query = {
      select: vi.fn(() => query),
      upsert: vi.fn((payload: unknown) => {
        operation.action = "upsert";
        operation.payload = payload;
        operations.push(operation);
        return Promise.resolve({ error: options.upsertError ?? null });
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
                    assignment_id: "assignment-1",
                    student_id: "student-1",
                    status: "started",
                    latest_attempt_id: "attempt-1",
                    attempt_count: 1,
                    highest_hint_level: 0,
                    assignments: { canceled_at: null },
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
    };

    return query;
  }

  return {
    operations,
    from: vi.fn((table: string) => createQuery(table)),
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

describe("recordCocoLine (CHAT-06, T-11-11 idempotent upsert + ownership)", () => {
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
