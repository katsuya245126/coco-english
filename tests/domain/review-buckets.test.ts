/**
 * RED test — per-assignment status bucketing (Wave 0, Plan 07-01).
 *
 * Imports from the not-yet-existing bucketAssignmentStudents helper.
 * Fails with "Cannot find module" until Wave 1 (Plan 07-02) implements it.
 *
 * Requirements locked here:
 *   D-05: Five status buckets — completed, not_started, missed, needs_retry, teacher_review
 *   D-03: Per-assignment scope (each assignment's rows bucket independently)
 *   REV-01: Teacher sees all five status buckets
 */

import { describe, expect, it } from "vitest";

// This import will fail (RED) until Wave 1 creates
// src/domain/teacher/review-buckets.ts
import { bucketAssignmentStudents } from "@/domain/teacher/review-buckets";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusRow = {
  id: string;
  status: string;
};

function row(status: string, id = `row-${status}`): StatusRow {
  return { id, status };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bucketAssignmentStudents — five D-05 buckets always present", () => {
  it("returns all five bucket keys for an empty input array", () => {
    const result = bucketAssignmentStudents([]);

    expect(result).toHaveProperty("completed");
    expect(result).toHaveProperty("not_started");
    expect(result).toHaveProperty("missed");
    expect(result).toHaveProperty("needs_retry");
    expect(result).toHaveProperty("teacher_review");
  });

  it("all buckets are empty arrays when input is empty", () => {
    const result = bucketAssignmentStudents([]);

    expect(result.completed).toHaveLength(0);
    expect(result.not_started).toHaveLength(0);
    expect(result.missed).toHaveLength(0);
    expect(result.needs_retry).toHaveLength(0);
    expect(result.teacher_review).toHaveLength(0);
  });
});

describe("bucketAssignmentStudents — placement by status", () => {
  it("places a 'completed' row in the completed bucket", () => {
    const result = bucketAssignmentStudents([row("completed", "c1")]);

    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].id).toBe("c1");
  });

  it("places an 'assigned' row in the not_started bucket", () => {
    const result = bucketAssignmentStudents([row("assigned", "a1")]);

    expect(result.not_started).toHaveLength(1);
    expect(result.not_started[0].id).toBe("a1");
  });

  it("places a 'started' row in the not_started bucket (in-progress counts as not_started for review)", () => {
    // started is still not submitted — teachers see it as "not completed yet"
    const result = bucketAssignmentStudents([row("started", "s1")]);

    // started maps to not_started bucket (per D-05 review bucketing)
    expect(result.not_started).toHaveLength(1);
    expect(result.not_started[0].id).toBe("s1");
  });

  it("places a 'missed' row in the missed bucket", () => {
    const result = bucketAssignmentStudents([row("missed", "m1")]);

    expect(result.missed).toHaveLength(1);
    expect(result.missed[0].id).toBe("m1");
  });

  it("places a 'needs_retry' row in the needs_retry bucket", () => {
    const result = bucketAssignmentStudents([row("needs_retry", "nr1")]);

    expect(result.needs_retry).toHaveLength(1);
    expect(result.needs_retry[0].id).toBe("nr1");
  });

  it("places a 'teacher_review' row in the teacher_review bucket", () => {
    const result = bucketAssignmentStudents([row("teacher_review", "tr1")]);

    expect(result.teacher_review).toHaveLength(1);
    expect(result.teacher_review[0].id).toBe("tr1");
  });
});

describe("bucketAssignmentStudents — multiple rows sorted into correct buckets", () => {
  it("distributes a mixed-status array into the correct buckets", () => {
    const rows: StatusRow[] = [
      row("completed", "c1"),
      row("assigned", "a1"),
      row("missed", "m1"),
      row("needs_retry", "nr1"),
      row("teacher_review", "tr1"),
      row("completed", "c2"),
      row("missed", "m2"),
    ];

    const result = bucketAssignmentStudents(rows);

    expect(result.completed).toHaveLength(2);
    expect(result.not_started).toHaveLength(1);
    expect(result.missed).toHaveLength(2);
    expect(result.needs_retry).toHaveLength(1);
    expect(result.teacher_review).toHaveLength(1);
  });

  it("no row appears in more than one bucket (no duplicate placement)", () => {
    const rows: StatusRow[] = [
      row("completed", "c1"),
      row("assigned", "a1"),
      row("missed", "m1"),
      row("needs_retry", "nr1"),
      row("teacher_review", "tr1"),
    ];

    const result = bucketAssignmentStudents(rows);

    const allIds = [
      ...result.completed.map((r) => r.id),
      ...result.not_started.map((r) => r.id),
      ...result.missed.map((r) => r.id),
      ...result.needs_retry.map((r) => r.id),
      ...result.teacher_review.map((r) => r.id),
    ];

    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it("total rows across all buckets equals the input length", () => {
    const rows: StatusRow[] = [
      row("completed", "c1"),
      row("assigned", "a1"),
      row("started", "s1"),
      row("missed", "m1"),
      row("needs_retry", "nr1"),
      row("teacher_review", "tr1"),
    ];

    const result = bucketAssignmentStudents(rows);

    const total =
      result.completed.length +
      result.not_started.length +
      result.missed.length +
      result.needs_retry.length +
      result.teacher_review.length;

    expect(total).toBe(rows.length);
  });
});

describe("bucketAssignmentStudents — only five buckets, no extras", () => {
  it("returns an object with exactly five keys", () => {
    const result = bucketAssignmentStudents([]);

    const keys = Object.keys(result);
    expect(keys).toHaveLength(5);
    expect(keys.sort()).toEqual(
      ["completed", "missed", "needs_retry", "not_started", "teacher_review"].sort(),
    );
  });
});
