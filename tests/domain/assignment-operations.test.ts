import { describe, expect, it } from "vitest";
import {
  compareSubmissionRecency,
  countIncompleteItems,
  groupIncompleteAssignments,
  isSubmissionPendingReview,
} from "@/domain/teacher/assignment-operations";

describe("isSubmissionPendingReview", () => {
  const eligible = {
    isLatestAttempt: true,
    reviewedAt: null,
    status: "completed" as const,
    attemptStatus: "completed",
    needsReviewReason: null,
    reviewPolicy: "every_submission" as const,
  };

  it("requires the latest attempt and an unreviewed receipt", () => {
    expect(isSubmissionPendingReview({ ...eligible, isLatestAttempt: false })).toBe(false);
    expect(isSubmissionPendingReview({ ...eligible, reviewedAt: "2026-01-01" })).toBe(false);
  });

  it("includes ordinary completed or in-review submissions when every submission is reviewed", () => {
    expect(isSubmissionPendingReview(eligible)).toBe(true);
    expect(isSubmissionPendingReview({ ...eligible, status: "teacher_review", attemptStatus: "teacher_review" })).toBe(true);
  });

  it("includes only durable flagged submissions under flagged-only review", () => {
    expect(isSubmissionPendingReview({ ...eligible, reviewPolicy: "flagged_only" })).toBe(false);
    expect(isSubmissionPendingReview({ ...eligible, reviewPolicy: "flagged_only", needsReviewReason: "low_confidence" })).toBe(true);
  });

  it("excludes in-progress attempts under either policy", () => {
    expect(isSubmissionPendingReview({ ...eligible, status: "started", attemptStatus: "in_progress" })).toBe(false);
    expect(isSubmissionPendingReview({ ...eligible, attemptStatus: "in_progress", reviewPolicy: "flagged_only", needsReviewReason: "low_confidence" })).toBe(false);
  });
});

describe("groupIncompleteAssignments", () => {
  const now = new Date("2026-07-12T00:00:00.000Z");
  const row = (id: string, assignmentId: string, status: "assigned" | "started" | "missed" | "completed", dueAt: string | null) => ({ id, assignmentId, assignmentTitle: assignmentId, status, dueAt });

  it("orders missed, due soon, and later groups and preserves progress labels", () => {
    const result = groupIncompleteAssignments([
      row("later", "a3", "assigned", "2026-07-16T00:00:00.001Z"),
      row("soon", "a2", "started", "2026-07-13T00:00:00.000Z"),
      row("missed", "a1", "missed", "2026-07-11T00:00:00.000Z"),
      row("none", "a3", "started", null),
      row("done", "a4", "completed", null),
    ], now);

    expect(result.map((group) => group.urgency)).toEqual(["missed", "due_soon", "later"]);
    expect(result[1].items[0].progress).toBe("started");
    expect(result[2].items.map((item) => item.progress)).toEqual(["not_started", "started"]);
  });

  it("treats deadlines through 3 days as due soon", () => {
    const result = groupIncompleteAssignments([
      row("boundary", "a1", "assigned", "2026-07-15T00:00:00.000Z"),
      row("after", "a2", "assigned", "2026-07-15T00:00:00.001Z"),
    ], now);

    expect(result.map((group) => [group.assignmentId, group.urgency])).toEqual([
      ["a1", "due_soon"],
      ["a2", "later"],
    ]);
  });

  it("counts only missed and due-soon items in the Incomplete badge", () => {
    const result = groupIncompleteAssignments([
      row("missed", "a1", "missed", "2026-07-11T00:00:00.000Z"),
      row("soon", "a2", "assigned", "2026-07-15T00:00:00.000Z"),
      row("later", "a3", "assigned", "2026-07-15T00:00:00.001Z"),
      row("undated", "a4", "assigned", null),
    ], now);

    expect(countIncompleteItems(result)).toBe(2);
  });

  it("excludes retry and review workflow rows", () => {
    const result = groupIncompleteAssignments([
      { ...row("retry", "a1", "assigned", null), status: "needs_retry" as const },
      { ...row("review", "a1", "assigned", null), status: "teacher_review" as const },
    ], now);
    expect(result).toEqual([]);
  });

  it("excludes dismissed rows", () => {
    const result = groupIncompleteAssignments([
      { ...row("live", "a1", "missed", "2026-07-11T00:00:00.000Z") },
      { ...row("dismissed", "a1", "missed", "2026-07-11T00:00:00.000Z"), dismissedAt: "2026-07-12T00:00:00.000Z" },
    ], now);
    const ids = result.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["live"]);
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
