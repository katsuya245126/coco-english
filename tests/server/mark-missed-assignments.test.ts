import { beforeEach, describe, expect, it, vi } from "vitest";

type AssignmentStudent = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: "assigned" | "started" | "missed";
  latest_attempt_id: string | null;
  attempt_count: number;
  highest_hint_level: number;
  due_at: string;
};

type Attempt = {
  id: string;
  assignment_student_id: string;
  status: "in_progress" | "completed" | "abandoned";
};

type Turn = {
  attempt_id: string;
  turn_order: number;
  original_transcript: string;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
  evaluation: { version: string; outcome: string; requireRepeat?: boolean };
};

type Operation = {
  table: string;
  kind: "select" | "update" | "insert";
  payload?: unknown;
  columns?: string;
};

let mockSupabase: ReturnType<typeof createMockSupabase>;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

function createMockSupabase() {
  const assignmentStudents: AssignmentStudent[] = [
    {
      id: "assigned-overdue",
      assignment_id: "assignment-1",
      student_id: "student-1",
      status: "assigned",
      latest_attempt_id: null,
      attempt_count: 0,
      highest_hint_level: 0,
      due_at: "2026-07-13T00:00:00.000Z",
    },
    {
      id: "stale-started",
      assignment_id: "assignment-1",
      student_id: "student-1",
      status: "started",
      latest_attempt_id: "attempt-stale",
      attempt_count: 1,
      highest_hint_level: 0,
      due_at: "2026-07-13T00:00:00.000Z",
    },
    {
      id: "late-opened",
      assignment_id: "assignment-1",
      student_id: "student-1",
      status: "started",
      latest_attempt_id: "attempt-live",
      attempt_count: 1,
      highest_hint_level: 0,
      due_at: "2026-07-13T00:00:00.000Z",
    },
  ];
  const attempts: Attempt[] = [
    {
      id: "attempt-stale",
      assignment_student_id: "stale-started",
      status: "abandoned",
    },
    {
      id: "attempt-live",
      assignment_student_id: "late-opened",
      status: "in_progress",
    },
  ];
  const turns: Turn[] = [
    {
      attempt_id: "attempt-live",
      turn_order: 1,
      original_transcript: "I played soccer.",
      repeat_transcript: null,
      repeat_accepted: null,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "accepted_original",
        requireRepeat: false,
      },
    },
  ];
  const operations: Operation[] = [];
  const auditEvents: unknown[] = [];
  let claimAssignedOverdueBeforeUpdate = false;

  class Query {
    private kind: Operation["kind"] = "select";
    private payload?: unknown;
    private columns?: string;
    private filters: Array<[string, unknown]> = [];
    private inFilter?: [string, unknown[]];

    constructor(private readonly table: string) {}

    select(columns: string) {
      this.columns = columns;
      return this;
    }

    update(payload: unknown) {
      if (
        this.table === "assignment_students" &&
        claimAssignedOverdueBeforeUpdate
      ) {
        const row = assignmentStudents.find(
          (candidate) => candidate.id === "assigned-overdue",
        )!;
        row.status = "started";
        row.latest_attempt_id = "attempt-claimed";
        attempts.push({
          id: "attempt-claimed",
          assignment_student_id: row.id,
          status: "in_progress",
        });
        claimAssignedOverdueBeforeUpdate = false;
      }
      this.kind = "update";
      this.payload = payload;
      return this;
    }

    insert(payload: unknown) {
      this.kind = "insert";
      this.payload = payload;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    }

    is(column: string, value: null) {
      this.filters.push([column, value]);
      return this;
    }

    in(column: string, values: unknown[]) {
      this.inFilter = [column, values];
      return this;
    }

    maybeSingle() {
      return this.execute(true);
    }

    single() {
      return this.execute(true);
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return this.execute(false).then(onfulfilled, onrejected);
    }

    private matches(row: Record<string, unknown>) {
      return this.filters.every(([column, value]) => row[column] === value);
    }

    private async execute(single: boolean) {
      operations.push({
        table: this.table,
        kind: this.kind,
        payload: this.payload,
        columns: this.columns,
      });

      if (this.kind === "insert") {
        if (this.table === "assignment_status_events") {
          auditEvents.push(this.payload);
          return { data: null, error: null };
        }
        if (this.table === "attempts") {
          throw new Error("resume must not insert another attempt");
        }
      }

      if (this.kind === "update" && this.table === "assignment_students") {
        const rows = assignmentStudents.filter((row) =>
          this.matches(row as unknown as Record<string, unknown>),
        );
        for (const row of rows) Object.assign(row, this.payload);
        return { data: single ? rows[0] ?? null : rows, error: null };
      }

      if (this.table === "assignment_students") {
        const rows = assignmentStudents
          .filter((row) =>
            this.inFilter
              ? this.inFilter[1].includes(row[this.inFilter[0] as keyof AssignmentStudent])
              : this.matches(row as unknown as Record<string, unknown>),
          )
          .map((row) => {
            const latestAttempt = attempts.find(
              (attempt) => attempt.id === row.latest_attempt_id,
            );
            return {
              ...row,
              assignments: this.columns?.includes("assignments(canceled_at)")
                ? { canceled_at: null }
                : { due_at: row.due_at },
              latest_attempt:
                row.id === "late-opened"
                  ? latestAttempt
                    ? [{ status: latestAttempt.status }]
                    : null
                  : latestAttempt
                    ? { status: latestAttempt.status }
                    : null,
            };
          });
        return { data: single ? rows[0] ?? null : rows, error: null };
      }

      if (this.table === "attempts") {
        const rows = attempts.filter((row) =>
          this.matches(row as unknown as Record<string, unknown>),
        );
        return { data: single ? rows[0] ?? null : rows, error: null };
      }

      if (this.table === "attempt_turns") {
        const rows = turns.filter((row) =>
          this.matches(row as unknown as Record<string, unknown>),
        );
        return { data: single ? rows[0] ?? null : rows, error: null };
      }

      if (this.table === "assignments") {
        return {
          data: { mission_snapshot: { requiredTurns: 3 } },
          error: null,
        };
      }

      return { data: single ? null : [], error: null };
    }
  }

  return {
    assignmentStudents,
    attempts,
    turns,
    operations,
    auditEvents,
    claimAssignedOverdueBeforeUpdate: () => {
      claimAssignedOverdueBeforeUpdate = true;
    },
    from: (table: string) => new Query(table),
  };
}

describe("markMissedAssignments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T00:00:00.000Z"));
    mockSupabase = createMockSupabase();
  });

  it("marks real candidates but preserves and resumes the exact live late-open attempt", async () => {
    const { markMissedAssignments } = await import(
      "@/server/foundation/markMissedAssignments"
    );
    const { startOrResumeAttempt } = await import(
      "@/server/student-access/mission-flow"
    );

    const before = structuredClone(
      mockSupabase.assignmentStudents.find((row) => row.id === "late-opened"),
    );
    const turnsBefore = structuredClone(mockSupabase.turns);

    const result = await markMissedAssignments();

    expect(result).toEqual({
      markedCount: 2,
      assignmentStudentIds: ["assigned-overdue", "stale-started"],
    });
    expect(
      mockSupabase.assignmentStudents.find((row) => row.id === "late-opened"),
    ).toEqual(before);
    expect(mockSupabase.turns).toEqual(turnsBefore);
    expect(mockSupabase.auditEvents).toHaveLength(2);

    const resumed = await startOrResumeAttempt({
      studentId: "student-1",
      assignmentStudentId: "late-opened",
    });

    expect(resumed).toEqual({
      ok: true,
      attemptId: "attempt-live",
      isResume: true,
      resumeTurnOrder: 2,
    });
    expect(
      mockSupabase.assignmentStudents.find((row) => row.id === "late-opened"),
    ).toEqual(before);
    expect(
      mockSupabase.operations.filter(
        (operation) => operation.table === "attempts" && operation.kind === "insert",
      ),
    ).toHaveLength(0);
    expect(
      mockSupabase.operations.find(
        (operation) =>
          operation.table === "assignment_students" &&
          operation.kind === "select" &&
          operation.columns?.includes(
            "latest_attempt:attempts!assignment_students_latest_attempt_fk(status)",
          ),
      ),
    ).toBeDefined();
  });

  it("does not overwrite, audit, or count an assignment claimed after candidate selection", async () => {
    const { markMissedAssignments } = await import(
      "@/server/foundation/markMissedAssignments"
    );
    mockSupabase.claimAssignedOverdueBeforeUpdate();

    const result = await markMissedAssignments();

    expect(
      mockSupabase.assignmentStudents.find(
        (row) => row.id === "assigned-overdue",
      ),
    ).toMatchObject({
      status: "started",
      latest_attempt_id: "attempt-claimed",
    });
    expect(result).toEqual({
      markedCount: 1,
      assignmentStudentIds: ["stale-started"],
    });
    expect(mockSupabase.auditEvents).toHaveLength(1);
  });
});
