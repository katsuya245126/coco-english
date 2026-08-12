import { beforeEach, describe, expect, it, vi } from "vitest";

const { service, state } = vi.hoisted(() => ({ service: {
  changeAttemptReview: vi.fn(),
  requestSubmissionRetry: vi.fn(),
}, state: { row: null as Record<string, unknown> | null, filters: [] as Array<[string, unknown]> } }));
vi.mock("@/server/teacher/assignment-operations", () => service);
vi.mock("@/server/teacher/auth", () => ({ requireTeacherProfile: vi.fn().mockResolvedValue({ id: "teacher-1" }) }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: () => ({ from: () => ({ select() { return this; }, eq(key: string, value: unknown) { state.filters.push([key, value]); return this; }, single: () => Promise.resolve({ data: state.row, error: null }) }) }) }));

import { overrideAssignmentStatusAction } from "@/app/teacher/evidence/[attemptId]/actions";

beforeEach(() => { state.row = { id: "as-1", status: "teacher_review", latest_attempt_id: "attempt-1" }; state.filters.length = 0; vi.clearAllMocks(); });

describe("owned legacy override action", () => {
  it("adds the authenticated teacher ownership constraint before delegating review", async () => {
    service.changeAttemptReview.mockResolvedValue({ ok: true });
    expect(await overrideAssignmentStatusAction({ assignmentStudentId: "as-1", nextStatus: "completed" })).toEqual({ ok: true });
    expect(state.filters).toContainEqual(["assignments.classes.teacher_id", "teacher-1"]);
    expect(service.changeAttemptReview).toHaveBeenCalledWith({ teacherId: "teacher-1", attemptId: "attempt-1", action: "mark_reviewed" });
  });

  it("delegates retry to the atomic owned RPC service", async () => {
    service.requestSubmissionRetry.mockResolvedValue({ ok: true });
    await overrideAssignmentStatusAction({ assignmentStudentId: "as-1", nextStatus: "needs_retry", reasonNote: "again" });
    expect(service.requestSubmissionRetry).toHaveBeenCalledWith({ teacherId: "teacher-1", attemptId: "attempt-1", reasonNote: "again" });
  });

  it("performs no mutation for an unowned assignment", async () => {
    state.row = null;
    expect(await overrideAssignmentStatusAction({ assignmentStudentId: "other", nextStatus: "completed" })).toEqual({ ok: false, error: "not_found" });
    expect(service.changeAttemptReview).not.toHaveBeenCalled();
    expect(service.requestSubmissionRetry).not.toHaveBeenCalled();
  });
});
