import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeAttemptReview,
  type AttemptReviewAction,
} from "@/server/teacher/assignment-operations";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ rpc }),
}));

beforeEach(() => rpc.mockReset());

describe("changeAttemptReview", () => {
  it.each([
    ["mark_viewed", "mark_submission_viewed"],
    ["mark_reviewed", "mark_submission_reviewed"],
    ["reopen_review", "reopen_submission_review"],
  ] as const)("handles %s through the owned database operation", async (action, rpcName) => {
    rpc.mockResolvedValueOnce({ data: "ok", error: null });

    await expect(changeAttemptReview({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
      action,
    })).resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_teacher_id: "teacher-1",
      p_attempt_id: "attempt-1",
    });
  });

  it.each([
    ["not_found", { ok: false, error: "not_found" }],
    ["invalid_status", { ok: false, error: "not_allowed" }],
  ] as const)("maps %s database results", async (data, expected) => {
    rpc.mockResolvedValueOnce({ data, error: null });

    await expect(changeAttemptReview({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
      action: "mark_reviewed",
    })).resolves.toEqual(expected);
  });

  it("maps an RPC error to failed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await expect(changeAttemptReview({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
      action: "mark_viewed",
    })).resolves.toEqual({ ok: false, error: "failed" });
  });

  it("maps an unexpected database result to failed", async () => {
    rpc.mockResolvedValueOnce({ data: "unexpected", error: null });

    await expect(changeAttemptReview({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
      action: "reopen_review",
    })).resolves.toEqual({ ok: false, error: "failed" });
  });

  it("rejects an invalid runtime action without an RPC", async () => {
    await expect(changeAttemptReview({
      teacherId: "teacher-1",
      attemptId: "attempt-1",
      action: "invalid" as AttemptReviewAction,
    })).resolves.toEqual({ ok: false, error: "not_allowed" });

    expect(rpc).not.toHaveBeenCalled();
  });
});
