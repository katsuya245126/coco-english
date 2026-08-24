import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireOwnedAssignmentStudent,
  withOwnedInProgressAttempt,
  type OwnedAssignmentStudent,
} from "@/server/student-access/owned-assignment";

// Deterministic tests for the single owned-assignment proof seam (issue #67).
// Every ownership/cancellation/snapshot-parsing case crosses only this
// interface; the query shape itself is asserted via recorded operations.

const completeSnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Soccer chat",
  targetPattern: "How often do you _____?",
  level: "elementary",
  requiredTurns: 5,
  characterId: "default-buddy",
  conversationMode: true,
  turns: [
    {
      turnOrder: 1,
      prompt: "How often do you play soccer?",
      targetExample: "I play soccer twice a week.",
      hintLadder: {
        tier1: "How often do you _____?",
        tier2: "once, twice, every day",
        tier3: "I play soccer twice a week.",
      },
    },
  ],
};

type Options = {
  row?: Record<string, unknown> | null;
  attempt?: Record<string, unknown> | null;
  error?: Error | null;
};

let options: Options;
let operations: Array<{ table: string; filters: Array<[string, unknown]> }>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    from: vi.fn((table: string) => {
      const operation = { table, filters: [] as Array<[string, unknown]> };
      operations.push(operation);
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          operation.filters.push([column, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data:
            operation.table === "attempts"
              ? options.attempt ?? null
              : options.row ?? null,
          error: options.error ?? null,
        })),
        single: vi.fn(),
      };
      return query;
    }),
  }),
}));

function ownedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "as-1",
    assignment_id: "assignment-1",
    student_id: "student-1",
    status: "started",
    latest_attempt_id: "attempt-latest",
    attempt_count: 2,
    highest_hint_level: 1,
    submitted_at: null,
    assignments: {
      title: "Soccer homework",
      mission_snapshot: completeSnapshot,
      canceled_at: null,
    },
    ...overrides,
  };
}

describe("requireOwnedAssignmentStudent", () => {
  beforeEach(() => {
    options = {};
    operations = [];
  });

  it("returns the owned row with parsed snapshot when it belongs to the student", async () => {
    options = { row: ownedRow() };

    const result = await requireOwnedAssignmentStudent({
      studentId: "student-1",
      assignmentStudentId: "as-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const owned: OwnedAssignmentStudent = result.owned;
    expect(owned).toMatchObject({
      id: "as-1",
      assignmentId: "assignment-1",
      status: "started",
      latestAttemptId: "attempt-latest",
      attemptCount: 2,
      highestHintLevel: 1,
      canceledAt: null,
      assignmentTitle: "Soccer homework",
    });
    expect(owned.snapshot?.missionId).toBe(completeSnapshot.missionId);

    // The proof IS the filter: both the row id and the verified student_id.
    expect(operations[0]?.filters).toEqual(
      expect.arrayContaining([
        ["id", "as-1"],
        ["student_id", "student-1"],
      ]),
    );
  });

  it("collapses a missing row into the generic not-found failure", async () => {
    options = { row: null };

    const result = await requireOwnedAssignmentStudent({
      studentId: "student-1",
      assignmentStudentId: "as-other",
    });

    expect(result).toEqual({ ok: false, error: "not_found_or_canceled" });
  });

  it("collapses a canceled assignment into the same generic failure", async () => {
    options = {
      row: ownedRow({
        assignments: {
          title: "Soccer homework",
          mission_snapshot: completeSnapshot,
          canceled_at: "2026-08-01T00:00:00Z",
        },
      }),
    };

    const result = await requireOwnedAssignmentStudent({
      studentId: "student-1",
      assignmentStudentId: "as-1",
    });

    // Canceled is indistinguishable from missing — no oracle for attackers.
    expect(result).toEqual({ ok: false, error: "not_found_or_canceled" });
  });

  it("surfaces database errors distinctly from not-found", async () => {
    options = { error: new Error("connection reset") };

    const result = await requireOwnedAssignmentStudent({
      studentId: "student-1",
      assignmentStudentId: "as-1",
    });

    expect(result).toEqual({ ok: false, error: "db_error" });
  });

  it("returns the row with a null snapshot when the stored snapshot is not complete", async () => {
    options = {
      row: ownedRow({
        assignments: {
          title: "Soccer homework",
          mission_snapshot: { broken: true },
          canceled_at: null,
        },
      }),
    };

    const result = await requireOwnedAssignmentStudent({
      studentId: "student-1",
      assignmentStudentId: "as-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.owned.snapshot).toBeNull();
    expect(result.owned.status).toBe("started");
  });
});

describe("requireOwnedAssignmentStudent snapshot kinds", () => {
  beforeEach(() => {
    options = {};
    operations = [];
  });

  it("returns null snapshot for a legacy snapshot while keeping the owned row", async () => {
    options = {
      row: ownedRow({
        assignments: {
          title: "Foundation homework",
          mission_snapshot: {
            missionId: "11111111-1111-4111-8111-111111111111",
            title: "Foundation Smoke Assignment",
            characterId: "default-buddy",
            requiredTurns: 1,
            turns: [
              {
                order: 1,
                prompt: "Say hello.",
                targetExample: "Hello!",
              },
            ],
          },
          canceled_at: null,
        },
      }),
    };

    const result = await requireOwnedAssignmentStudent({
      studentId: "student-1",
      assignmentStudentId: "as-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.owned.snapshot).toBeNull();
    expect(result.owned.status).toBe("started");
  });
});

describe("withOwnedInProgressAttempt", () => {
  beforeEach(() => {
    options = {};
    operations = [];
  });

  it("invokes the callback only after both ownership proofs pass", async () => {
    options = {
      row: ownedRow(),
      attempt: { id: "attempt-1" },
    };

    const mutation = vi.fn(async (owned: OwnedAssignmentStudent) => owned.id);
    const result = await withOwnedInProgressAttempt(
      {
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
      },
      mutation,
    );

    expect(result).toEqual({ ok: true, value: "as-1" });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it("rejects an attempt without invoking the mutation callback", async () => {
    options = {
      row: ownedRow(),
      attempt: null,
    };

    const mutation = vi.fn(async () => ({ ok: true as const }));
    const result = await withOwnedInProgressAttempt(
      {
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
      },
      mutation,
    );

    expect(result).toEqual({ ok: false, error: "not_found_or_canceled" });
    expect(mutation).not.toHaveBeenCalled();
    expect(operations).toHaveLength(2);
    expect(operations[1]?.filters).toEqual(
      expect.arrayContaining([
        ["id", "attempt-1"],
        ["assignment_student_id", "as-1"],
        ["status", "in_progress"],
      ]),
    );
  });
});
