import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeAssignedHomework } from "@/server/teacher/assignment-operations";

const teacherId = "00000000-0000-4000-8000-000000000001";
const assignedHomeworkId = "00000000-0000-4000-8000-000000000002";
const attemptId = "00000000-0000-4000-8000-000000000003";

let ownedRow: Record<string, unknown> | null = null;
const from = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ from, rpc }),
}));

beforeEach(() => {
  ownedRow = null;
  from.mockReset();
  rpc.mockReset();
  from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: ownedRow, error: null })),
  });
});

describe("changeAssignedHomework", () => {
  it("resolves the latest attempt internally for retry", async () => {
    ownedRow = { id: assignedHomeworkId, status: "completed", latest_attempt_id: attemptId, dismissed_at: null };
    rpc.mockResolvedValueOnce({ data: "ok", error: null });

    await expect(changeAssignedHomework({
      teacherId,
      assignedHomeworkId,
      action: "request_retry",
      reasonNote: "Try once more",
    })).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledWith("request_submission_retry", {
      p_teacher_id: teacherId,
      p_attempt_id: attemptId,
      p_reason_note: "Try once more",
    });
  });

  it.each([
    ["dismiss", "dismiss_assignment_student", { p_reason: "Absent" }],
    ["undo_dismiss", "undo_dismiss_assignment_student", {}],
  ] as const)("uses the attempt-keyed RPC for %s when an attempt exists", async (action, rpcName, extra) => {
    ownedRow = {
      id: assignedHomeworkId,
      status: "started",
      latest_attempt_id: attemptId,
      dismissed_at: action === "undo_dismiss" ? "2026-08-12T00:00:00Z" : null,
    };
    rpc.mockResolvedValueOnce({ data: "ok", error: null });

    const request = action === "dismiss"
      ? { teacherId, assignedHomeworkId, action, reason: "Absent" }
      : { teacherId, assignedHomeworkId, action };
    await expect(changeAssignedHomework(request)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_teacher_id: teacherId,
      p_attempt_id: attemptId,
      ...extra,
    });
  });

  it.each([
    ["dismiss", "dismiss_assignment_student_by_id", { p_reason: "" }],
    ["undo_dismiss", "undo_dismiss_assignment_student_by_id", {}],
  ] as const)("uses the assigned-homework-keyed RPC for %s when no attempt exists", async (action, rpcName, extra) => {
    ownedRow = {
      id: assignedHomeworkId,
      status: "assigned",
      latest_attempt_id: null,
      dismissed_at: action === "undo_dismiss" ? "2026-08-12T00:00:00Z" : null,
    };
    rpc.mockResolvedValueOnce({ data: "ok", error: null });

    await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action })).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_teacher_id: teacherId,
      p_assignment_student_id: assignedHomeworkId,
      ...extra,
    });
  });

  it("returns not_found without an RPC when no owned homework exists", async () => {
    ownedRow = null;
    await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action: "dismiss" }))
      .resolves.toEqual({ ok: false, error: "not_found" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { teacherId: "bad", assignedHomeworkId, action: "dismiss" as const },
    { teacherId, assignedHomeworkId: "bad", action: "dismiss" as const },
    { teacherId, assignedHomeworkId, action: "bad" as never },
  ])("rejects invalid input before a query", async (input) => {
    await expect(changeAssignedHomework(input)).resolves.toEqual({ ok: false, error: "not_allowed" });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "completed", latest_attempt_id: null, dismissed_at: null }, "request_retry"],
    [{ status: "assigned", latest_attempt_id: attemptId, dismissed_at: null }, "request_retry"],
    [{ status: "started", latest_attempt_id: attemptId, dismissed_at: "2026-08-12T00:00:00Z" }, "dismiss"],
    [{ status: "started", latest_attempt_id: attemptId, dismissed_at: null }, "undo_dismiss"],
    [{ status: "completed", latest_attempt_id: attemptId, dismissed_at: null }, "dismiss"],
  ] as const)("rejects disallowed lifecycle state without an RPC", async (row, action) => {
    ownedRow = { id: assignedHomeworkId, ...row };
    await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action } as never))
      .resolves.toEqual({ ok: false, error: "not_allowed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ data: "not_found", error: null }, { ok: false, error: "not_found" }],
    [{ data: "invalid_status", error: null }, { ok: false, error: "not_allowed" }],
    [{ data: "unexpected", error: null }, { ok: false, error: "failed" }],
    [{ data: null, error: { message: "boom" } }, { ok: false, error: "failed" }],
  ] as const)("maps the database result", async (rpcResult, expected) => {
    ownedRow = { id: assignedHomeworkId, status: "completed", latest_attempt_id: attemptId, dismissed_at: null };
    rpc.mockResolvedValueOnce(rpcResult);
    await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action: "request_retry" }))
      .resolves.toEqual(expected);
  });
});
