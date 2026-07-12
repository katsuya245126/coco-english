import { describe, expect, it, vi } from "vitest";
import { dismissAssignmentStudent, dismissAssignmentStudentById, markSubmissionReviewed, markSubmissionViewed, reopenSubmissionReview, requestSubmissionRetry, undoDismiss, undoDismissByAssignmentStudentId } from "@/server/teacher/assignment-operations";

function mutationClient(
  owned: boolean | Record<string, unknown> = true,
  rpcResult: { data: string | null; error: { message: string } | null } = { data: "ok", error: null },
) {
  const operations: Array<[string, ...unknown[]]> = [];
  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain, eq: (key: string, value: unknown) => { operations.push(["eq", table, key, value]); return chain; },
      maybeSingle: () => Promise.resolve({
        data: owned === false
          ? null
          : typeof owned === "object"
            ? owned
            : { id: "attempt-1", status: "completed", assignment_students: { id: "as-1", status: "completed" } },
        error: null,
      }),
      upsert: (payload: unknown, options: unknown) => { operations.push(["upsert", table, payload, options]); return Promise.resolve({ error: null }); },
      update: (payload: unknown) => { operations.push(["update", table, payload]); return chain; },
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }; return chain;
  };
  return { client: { from, rpc: vi.fn().mockResolvedValue(rpcResult) } as unknown as NonNullable<Parameters<typeof markSubmissionViewed>[1]>, operations };
}

describe("teacher review mutations", () => {
  it("by-id dismiss performs no RPC for a cross-teacher assignment student", async () => {
    const { client } = mutationClient(false);
    expect(await dismissAssignmentStudentById({ teacherId: "teacher-2", assignmentStudentId: "as-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("by-id dismiss calls the exact RPC for an owned assignment student", async () => {
    const { client } = mutationClient({ id: "as-1", status: "assigned", latest_attempt_id: null, dismissed_at: null });
    expect(await dismissAssignmentStudentById({ teacherId: "teacher-1", assignmentStudentId: "as-1" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("dismiss_assignment_student_by_id", {
      p_teacher_id: "teacher-1", p_assignment_student_id: "as-1", p_reason: "",
    });
  });

  it("by-id dismiss performs no RPC for an owned but ineligible assignment student", async () => {
    const { client } = mutationClient({ id: "as-1", status: "assigned", latest_attempt_id: "attempt-1", dismissed_at: null });
    expect(await dismissAssignmentStudentById({ teacherId: "teacher-1", assignmentStudentId: "as-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("by-id undo performs no RPC for a cross-teacher assignment student", async () => {
    const { client } = mutationClient(false);
    expect(await undoDismissByAssignmentStudentId({ teacherId: "teacher-2", assignmentStudentId: "as-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("by-id undo calls the exact RPC for an owned assignment student", async () => {
    const { client } = mutationClient({ id: "as-1", status: "missed", latest_attempt_id: null, dismissed_at: "2026-07-12T00:00:00.000Z" });
    expect(await undoDismissByAssignmentStudentId({ teacherId: "teacher-1", assignmentStudentId: "as-1" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("undo_dismiss_assignment_student_by_id", {
      p_teacher_id: "teacher-1", p_assignment_student_id: "as-1",
    });
  });

  it("by-id undo performs no RPC for an owned but ineligible assignment student", async () => {
    const { client } = mutationClient({ id: "as-1", status: "missed", latest_attempt_id: null, dismissed_at: null });
    expect(await undoDismissByAssignmentStudentId({ teacherId: "teacher-1", assignmentStudentId: "as-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("dismiss performs zero writes and returns not_found for a cross-teacher attempt", async () => {
    const { client, operations } = mutationClient(false);
    expect(await dismissAssignmentStudent({ teacherId: "teacher-2", attemptId: "attempt-1", reason: "test" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(operations.some((op) => ["upsert", "update"].includes(op[0]))).toBe(false);
  });

  it("dismiss calls the dismiss RPC with the reason for an owned attempt", async () => {
    const { client } = mutationClient();
    expect(await dismissAssignmentStudent({ teacherId: "teacher-1", attemptId: "attempt-1", reason: "absent" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("dismiss_assignment_student", expect.objectContaining({ p_teacher_id: "teacher-1", p_attempt_id: "attempt-1", p_reason: "absent" }));
  });

  it("undo dismiss calls the undo RPC for an owned attempt", async () => {
    const { client } = mutationClient();
    expect(await undoDismiss({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("undo_dismiss_assignment_student", expect.objectContaining({ p_teacher_id: "teacher-1", p_attempt_id: "attempt-1" }));
  });

  it("performs zero writes for a cross-teacher attempt", async () => {
    const { client, operations } = mutationClient(false);
    expect(await markSubmissionViewed({ teacherId: "teacher-2", attemptId: "attempt-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(operations.some((op) => ["upsert", "update"].includes(op[0]))).toBe(false);
  });

  it("viewing only inserts an immutable first-view receipt", async () => {
    const { client, operations } = mutationClient();
    expect(await markSubmissionViewed({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: true });
    const op = operations.find((item) => item[0] === "upsert");
    expect(op?.[2]).toMatchObject({ teacher_id: "teacher-1", attempt_id: "attempt-1" });
    expect(op?.[2]).not.toHaveProperty("reviewed_at");
    expect(op?.[3]).toMatchObject({ ignoreDuplicates: true });
  });

  it("review and retry are atomic RPC calls", async () => {
    const review = mutationClient();
    expect(await markSubmissionReviewed({ teacherId: "teacher-1", attemptId: "attempt-1" }, review.client)).toEqual({ ok: true });
    expect(review.client.rpc).toHaveBeenCalledWith("mark_submission_reviewed", expect.anything());
    const retry = mutationClient();
    expect(await requestSubmissionRetry({ teacherId: "teacher-1", attemptId: "attempt-1", reasonNote: "try again" }, retry.client)).toEqual({ ok: true });
    expect(retry.client.rpc).toHaveBeenCalledWith("request_submission_retry", expect.objectContaining({ p_reason_note: "try again" }));
  });

  it("marks an in-progress (started) attempt reviewed via the RPC", async () => {
    // A started, not-completed attempt opened from the Incomplete queue must no
    // longer be rejected client-side; the RPC decides and records the receipt.
    const rpc = vi.fn().mockResolvedValue({ data: "ok", error: null });
    const from = () => {
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: { id: "attempt-1", status: "started", assignment_students: { id: "as-1", status: "started" } }, error: null }),
        then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return chain;
    };
    const client = { from, rpc } as unknown as Parameters<typeof markSubmissionReviewed>[1];
    expect(await markSubmissionReviewed({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("mark_submission_reviewed", expect.anything());
  });

  it("reports RPC failure without a partial direct write", async () => {
    const { client, operations } = mutationClient(true, { data: null, error: { message: "boom" } });
    expect(await markSubmissionReviewed({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: false, error: "db_error" });
    expect(operations.some((op) => ["upsert", "update"].includes(op[0]))).toBe(false);
  });

  it("reopen clears receipt reviewed_at only", async () => {
    const { client, operations } = mutationClient();
    expect(await reopenSubmissionReview({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: true });
    expect(operations.find((op) => op[0] === "update")).toEqual(["update", "submission_review_receipts", { reviewed_at: null }]);
  });
});
