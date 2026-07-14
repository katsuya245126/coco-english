import { afterEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { updateClassReviewPolicyAction } from "@/app/teacher/assignment-actions";
import * as assignmentOperations from "@/server/teacher/assignment-operations";
import { dismissAssignmentStudent, dismissAssignmentStudentById, markSubmissionReviewed, markSubmissionViewed, reopenSubmissionReview, requestSubmissionRetry, undoDismiss, undoDismissByAssignmentStudentId, updateClassReviewPolicy } from "@/server/teacher/assignment-operations";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/teacher/auth", () => ({ requireTeacherProfile: vi.fn().mockResolvedValue({ id: "teacher-1" }) }));

afterEach(() => vi.restoreAllMocks());

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
    const { client } = mutationClient({ id: "attempt-1", status: "started", assignment_students: { id: "as-1", status: "started", latest_attempt_id: "attempt-1", dismissed_at: null } });
    expect(await dismissAssignmentStudent({ teacherId: "teacher-1", attemptId: "attempt-1", reason: "absent" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("dismiss_assignment_student", expect.objectContaining({ p_teacher_id: "teacher-1", p_attempt_id: "attempt-1", p_reason: "absent" }));
  });

  it("dismiss performs no RPC when an owned attempt is already dismissed", async () => {
    const { client } = mutationClient({ id: "attempt-1", status: "started", assignment_students: { id: "as-1", status: "started", latest_attempt_id: "attempt-1", dismissed_at: "2026-07-12T00:00:00.000Z" } });
    expect(await dismissAssignmentStudent({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("dismiss performs no RPC when the owned attempt is not latest", async () => {
    const { client } = mutationClient({ id: "attempt-1", status: "started", assignment_students: { id: "as-1", status: "started", latest_attempt_id: "attempt-2", dismissed_at: null } });
    expect(await dismissAssignmentStudent({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("undo dismiss calls the undo RPC for an owned attempt", async () => {
    const { client } = mutationClient({ id: "attempt-1", status: "started", assignment_students: { id: "as-1", status: "missed", latest_attempt_id: "attempt-1", dismissed_at: "2026-07-12T00:00:00.000Z" } });
    expect(await undoDismiss({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("undo_dismiss_assignment_student", expect.objectContaining({ p_teacher_id: "teacher-1", p_attempt_id: "attempt-1" }));
  });

  it("undo dismiss performs no RPC when an owned attempt is not dismissed", async () => {
    const { client } = mutationClient({ id: "attempt-1", status: "started", assignment_students: { id: "as-1", status: "started", latest_attempt_id: "attempt-1", dismissed_at: null } });
    expect(await undoDismiss({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("undo dismiss performs no RPC for a completed assignment student", async () => {
    const { client } = mutationClient({ id: "attempt-1", status: "completed", assignment_students: { id: "as-1", status: "completed", latest_attempt_id: "attempt-1", dismissed_at: "2026-07-12T00:00:00.000Z" } });
    expect(await undoDismiss({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
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

function reviewPolicyClient(result: { data: { id: string } | null; error: { message: string } | null }) {
  const operations: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {
    update: (payload: unknown) => { operations.push(["update", "classes", payload]); return chain; },
    eq: (key: string, value: unknown) => { operations.push(["eq", "classes", key, value]); return chain; },
    select: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return {
    client: { from: () => chain } as unknown as NonNullable<Parameters<typeof updateClassReviewPolicy>[1]>,
    operations,
  };
}

describe("class review policy mutation", () => {
  it("updates only a class owned by the authenticated teacher", async () => {
    const { client, operations } = reviewPolicyClient({ data: { id: "class-1" }, error: null });
    expect(await updateClassReviewPolicy({ teacherId: "teacher-1", classId: "class-1", reviewPolicy: "flagged_only" }, client)).toEqual({ ok: true });
    expect(operations).toContainEqual(["update", "classes", { review_policy: "flagged_only" }]);
    expect(operations).toContainEqual(["eq", "classes", "id", "class-1"]);
    expect(operations).toContainEqual(["eq", "classes", "teacher_id", "teacher-1"]);
  });

  it("returns not_found when no owned class matches", async () => {
    const { client } = reviewPolicyClient({ data: null, error: null });
    expect(await updateClassReviewPolicy({ teacherId: "teacher-2", classId: "class-1", reviewPolicy: "every_submission" }, client)).toEqual({ ok: false, error: "not_found" });
  });

  it("returns db_error when the update fails", async () => {
    const { client } = reviewPolicyClient({ data: null, error: { message: "boom" } });
    expect(await updateClassReviewPolicy({ teacherId: "teacher-1", classId: "class-1", reviewPolicy: "every_submission" }, client)).toEqual({ ok: false, error: "db_error" });
  });

  it("rejects malformed action input before any service write", async () => {
    const update = vi.spyOn(assignmentOperations, "updateClassReviewPolicy");
    expect(await updateClassReviewPolicyAction({ classId: "class-1", reviewPolicy: "all" as never })).toEqual({ ok: false, error: "invalid_policy" });
    expect(update).not.toHaveBeenCalled();
  });

  it("revalidates global and class queues after a successful action", async () => {
    vi.spyOn(assignmentOperations, "updateClassReviewPolicy").mockResolvedValue({ ok: true });
    expect(await updateClassReviewPolicyAction({ classId: "class-1", reviewPolicy: "flagged_only" })).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/teacher");
    expect(revalidatePath).toHaveBeenCalledWith("/teacher/classes/class-1");
  });
});
