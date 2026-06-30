/**
 * RED test — teacher override action for assignment status (Wave 0, Plan 07-01).
 *
 * Imports from the not-yet-existing actions module in the evidence page.
 * Fails with "does not provide an export" / "Cannot find module" until
 * Wave 2 (Plan 07-03) implements overrideAssignmentStatusAction.
 *
 * Requirements locked here:
 *   REV-06: Teacher can override assignment status.
 *   D-09:   Illegal transitions are rejected server-side with no DB write.
 *   D-10:   needs_retry reset clears latest_attempt_id.
 *   T-07-02 / T-OVERRIDE-OWN / T-TRANSITION-GUARD: No unauthorized state changes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth helper — teacher profile must already exist
vi.mock("@/server/teacher/auth", () => ({
  requireTeacherProfile: vi.fn(),
}));

// Mock Supabase service client
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

// This import will fail (RED) until Wave 2 creates the actions file.
import { overrideAssignmentStatusAction } from "@/app/teacher/evidence/[attemptId]/actions";
import { requireTeacherProfile } from "@/server/teacher/auth";

// ---------------------------------------------------------------------------
// Minimal mock Supabase builder
// ---------------------------------------------------------------------------

type Operation = {
  table: string;
  action: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

const _ops: Operation[] = [];
let _mockRows: Record<string, unknown>[] = [];

function recordedChain(table: string, action: string, payload?: unknown) {
  const filters: Array<[string, unknown]> = [];
  const op: Operation = { table, action, payload, filters };
  _ops.push(op);

  const chain = {
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    },
    select: (_cols?: string) => chain,
    single: () => Promise.resolve({ data: _mockRows[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return chain;
}

const mockSupabase = {
  from: (table: string) => ({
    select: (_cols?: string) => {
      const op: Operation = { table, action: "select", filters: [] };
      _ops.push(op);
      const chain = {
        eq: (col: string, val: unknown) => {
          op.filters.push([col, val]);
          return chain;
        },
        single: () => Promise.resolve({ data: _mockRows[0] ?? null, error: null }),
      };
      return chain;
    },
    update: (payload: unknown) => recordedChain(table, "update", payload),
    insert: (payload: unknown) => recordedChain(table, "insert", payload),
  }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setMockRow(row: Record<string, unknown>) {
  _mockRows = [row];
}

beforeEach(() => {
  vi.clearAllMocks();
  _ops.length = 0;
  _mockRows = [];

  vi.mocked(requireTeacherProfile).mockResolvedValue({ id: "teacher-1" } as never);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("overrideAssignmentStatusAction — legal transition (REV-06, D-09)", () => {
  it("updates assignment_students.status to 'completed' when current status is 'teacher_review'", async () => {
    setMockRow({ id: "as-1", status: "teacher_review", latest_attempt_id: "attempt-1" });

    const result = await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "completed",
    });

    expect(result).toMatchObject({ ok: true });

    const updateOp = _ops.find(
      (op) => op.table === "assignment_students" && op.action === "update",
    );
    expect(updateOp).toBeDefined();
    expect((updateOp?.payload as Record<string, unknown>)?.status).toBe("completed");
  });

  it("inserts an assignment_status_events row with actor_type 'teacher', actor_id, and reason_code 'teacher_override'", async () => {
    setMockRow({ id: "as-1", status: "teacher_review", latest_attempt_id: "attempt-1" });

    await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "completed",
    });

    const insertOp = _ops.find(
      (op) => op.table === "assignment_status_events" && op.action === "insert",
    );
    expect(insertOp).toBeDefined();

    const payload = insertOp?.payload as Record<string, unknown>;
    expect(payload?.actor_type).toBe("teacher");
    expect(payload?.actor_id).toBe("teacher-1");
    expect(payload?.reason_code).toBe("teacher_override");
    expect(payload?.assignment_student_id).toBe("as-1");
  });
});

describe("overrideAssignmentStatusAction — illegal transition (T-07-02, T-TRANSITION-GUARD)", () => {
  it("returns { ok: false, error: 'invalid_transition' } for missed → completed (illegal)", async () => {
    // missed → completed is not in LEGAL_TRANSITIONS
    setMockRow({ id: "as-1", status: "missed", latest_attempt_id: null });

    const result = await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "completed",
    });

    expect(result).toMatchObject({ ok: false, error: "invalid_transition" });
  });

  it("performs NO status update when the transition is illegal", async () => {
    setMockRow({ id: "as-1", status: "missed", latest_attempt_id: null });

    await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "completed",
    });

    const updateOp = _ops.find(
      (op) => op.table === "assignment_students" && op.action === "update",
    );
    expect(updateOp).toBeUndefined();
  });

  it("performs NO audit event insert when the transition is illegal", async () => {
    setMockRow({ id: "as-1", status: "missed", latest_attempt_id: null });

    await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "completed",
    });

    const insertOp = _ops.find(
      (op) => op.table === "assignment_status_events" && op.action === "insert",
    );
    expect(insertOp).toBeUndefined();
  });
});

describe("overrideAssignmentStatusAction — needs_retry reopen (D-10)", () => {
  it("sets latest_attempt_id to null when transitioning to needs_retry", async () => {
    setMockRow({ id: "as-1", status: "teacher_review", latest_attempt_id: "attempt-old" });

    const result = await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "needs_retry",
    });

    expect(result).toMatchObject({ ok: true });

    const updateOp = _ops.find(
      (op) => op.table === "assignment_students" && op.action === "update",
    );
    expect(updateOp).toBeDefined();
    const payload = updateOp?.payload as Record<string, unknown>;
    expect(payload?.latest_attempt_id).toBeNull();
  });
});

describe("overrideAssignmentStatusAction — optional reasonNote (metadata)", () => {
  it("stores reasonNote under metadata.note in the audit event when provided", async () => {
    setMockRow({ id: "as-1", status: "teacher_review", latest_attempt_id: "attempt-1" });

    await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "completed",
      reasonNote: "Student spoke clearly on playback",
    });

    const insertOp = _ops.find(
      (op) => op.table === "assignment_status_events" && op.action === "insert",
    );
    const payload = insertOp?.payload as Record<string, unknown>;
    const metadata = payload?.metadata as Record<string, unknown> | undefined;
    expect(metadata?.note).toBe("Student spoke clearly on playback");
  });

  it("does not include metadata.note when reasonNote is omitted", async () => {
    setMockRow({ id: "as-1", status: "teacher_review", latest_attempt_id: "attempt-1" });

    await overrideAssignmentStatusAction({
      assignmentStudentId: "as-1",
      nextStatus: "completed",
    });

    const insertOp = _ops.find(
      (op) => op.table === "assignment_status_events" && op.action === "insert",
    );
    const payload = insertOp?.payload as Record<string, unknown>;
    const metadata = payload?.metadata as Record<string, unknown> | undefined;
    // Either no metadata or metadata.note is absent/undefined
    expect(metadata?.note ?? undefined).toBeUndefined();
  });
});
