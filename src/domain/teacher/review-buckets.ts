/**
 * Per-assignment status bucketing helper (D-03, D-05).
 *
 * Buckets are SCOPED to a single assignment: each call receives only the
 * assignment_students rows for one assignment_id, so a student who has
 * rows across multiple assignments never appears in two buckets for the
 * same call (Pitfall 6 — no cross-assignment bleed).
 *
 * Five D-05 buckets:
 *   completed      — student finished and was accepted
 *   not_started    — student has not yet submitted (covers "assigned" and "started")
 *   missed         — due date passed without completion
 *   needs_retry    — teacher or AI asked the student to re-record
 *   teacher_review — flagged for manual teacher review
 *
 * Pure function — no Supabase import, no side effects, fully unit-testable.
 */

type StatusRow = {
  status: string;
  [key: string]: unknown;
};

type BucketResult<T extends StatusRow> = {
  completed: T[];
  not_started: T[];
  missed: T[];
  needs_retry: T[];
  teacher_review: T[];
};

/**
 * Distribute assignment_student rows into the five D-05 review buckets.
 *
 * @param rows - Array of objects with at least a `status` string field.
 *               Typically assignment_students rows for ONE assignment.
 * @returns Five arrays keyed by bucket name. Every input row appears in
 *          exactly one bucket. Unknown statuses fall into not_started.
 */
export function bucketAssignmentStudents<T extends StatusRow>(
  rows: T[],
): BucketResult<T> {
  const result: BucketResult<T> = {
    completed: [],
    not_started: [],
    missed: [],
    needs_retry: [],
    teacher_review: [],
  };

  for (const row of rows) {
    const s = row.status;
    if (s === "completed") {
      result.completed.push(row);
    } else if (s === "missed") {
      result.missed.push(row);
    } else if (s === "needs_retry") {
      result.needs_retry.push(row);
    } else if (s === "teacher_review") {
      result.teacher_review.push(row);
    } else {
      // "assigned", "started", or any unknown status → not yet submitted
      result.not_started.push(row);
    }
  }

  return result;
}
