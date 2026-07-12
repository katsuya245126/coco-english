import { describe, expect, it } from "vitest";
import {
  compareSubmissionRecency,
  countIncompleteItems,
  groupIncompleteAssignments,
  isSubmissionPendingReview,
} from "@/domain/teacher/assignment-operations";

describe("isSubmissionPendingReview", () => {
  it("requires the latest attempt and an unreviewed receipt", () => {
    expect(isSubmissionPendingReview({ isLatestAttempt: false, reviewedAt: null, needsReviewReason: "low", reviewPolicy: "flagged_only" })).toBe(false);
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: "2026-01-01", needsReviewReason: "low", reviewPolicy: "flagged_only" })).toBe(false);
  });

  it("keeps formerly flagged completed work eligible under flagged-only", () => {
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: null, needsReviewReason: "low_confidence", reviewPolicy: "flagged_only" })).toBe(true);
  });

  it("includes ordinary completions only under every-submission", () => {
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: null, needsReviewReason: null, reviewPolicy: "every_submission" })).toBe(true);
    expect(isSubmissionPendingReview({ isLatestAttempt: true, reviewedAt: null, needsReviewReason: null, reviewPolicy: "flagged_only" })).toBe(false);
  });
});

describe("groupIncompleteAssignments", () => {
  const now = new Date("2026-07-12T00:00:00.000Z");
  const row = (id: string, assignmentId: string, status: "assigned" | "started" | "missed" | "completed", dueAt: string | null) => ({ id, assignmentId, assignmentTitle: assignmentId, status, dueAt });

  it("orders missed, due soon, and later groups and preserves progress labels", () => {
    const result = groupIncompleteAssignments([
      row("later", "a3", "assigned", "2026-07-13T00:00:00.001Z"),
      row("soon", "a2", "started", "2026-07-13T00:00:00.000Z"),
      row("missed", "a1", "missed", "2026-07-11T00:00:00.000Z"),
      row("none", "a3", "started", null),
      row("done", "a4", "completed", null),
    ], now);

    expect(result.map((group) => group.urgency)).toEqual(["missed", "due_soon", "later"]);
    expect(result[1].items[0].progress).toBe("started");
    expect(result[2].items.map((item) => item.progress)).toEqual(["not_started", "started"]);
    expect(countIncompleteItems(result)).toBe(4);
  });

  it("excludes retry and review workflow rows", () => {
    const result = groupIncompleteAssignments([
      { ...row("retry", "a1", "assigned", null), status: "needs_retry" as const },
      { ...row("review", "a1", "assigned", null), status: "teacher_review" as const },
    ], now);
    expect(result).toEqual([]);
  });
});

describe("compareSubmissionRecency", () => {
  it("sorts newest first and breaks equal-time ties by assignment-student ID", () => {
    const rows = [
      { assignmentStudentId: "a", receivedAt: "2026-07-12T01:00:00Z" },
      { assignmentStudentId: "c", receivedAt: "2026-07-12T02:00:00Z" },
      { assignmentStudentId: "b", receivedAt: "2026-07-12T02:00:00Z" },
    ].sort(compareSubmissionRecency);
    expect(rows.map((row) => row.assignmentStudentId)).toEqual(["c", "b", "a"]);
  });
});
