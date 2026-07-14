import { describe, expect, it } from "vitest";
import { getTeacherQueueSnapshot, listActivityForTeacher, listNeedsReviewForTeacher, listAssignmentProgressForClass } from "@/server/teacher/assignment-operations";

function client(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => Promise.resolve({ data: rows, error: null });
  return { from: () => chain } as unknown as NonNullable<Parameters<typeof listNeedsReviewForTeacher>[1]>;
}

const ownedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "attempt-1", status: "completed", completed_at: "2026-07-12T00:00:00Z", needs_review_reason: null,
  assignment_students: { id: "as-1", status: "completed", submitted_at: "2026-07-12T00:00:00Z", latest_attempt_id: "attempt-1", students: { display_name: "Mina" }, assignments: { id: "a-1", title: "Hello", classes: { id: "c-1", name: "A", review_policy: "every_submission" } } },
  submission_review_receipts: [], ...overrides,
});

describe("teacher assignment reads", () => {
  it("returns eligible owned submissions newest first and excludes reviewed rows", async () => {
    const reviewed = ownedRow({ id: "attempt-2", assignment_students: { ...ownedRow().assignment_students, id: "as-2", latest_attempt_id: "attempt-2" }, submission_review_receipts: [{ reviewed_at: "2026-07-12T01:00:00Z" }] });
    expect((await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([reviewed, ownedRow()]))).map((r) => r.attemptId)).toEqual(["attempt-1"]);
  });

  it("applies live policy to Needs review without filtering All activity", async () => {
    const flaggedOnly = ownedRow({
      needs_review_reason: null,
      assignment_students: {
        ...ownedRow().assignment_students,
        assignments: {
          ...ownedRow().assignment_students.assignments,
          classes: { id: "c-1", name: "A", review_policy: "flagged_only" },
        },
      },
    });

    expect(await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([flaggedOnly]))).toEqual([]);
    expect(await listActivityForTeacher({ teacherId: "teacher-1" }, client([flaggedOnly]))).toHaveLength(1);
    expect(await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([ownedRow()]))).toHaveLength(1);
  });

  it("keeps durable flagged completions in flagged-only Needs review", async () => {
    const row = ownedRow({
      needs_review_reason: "low_confidence",
      assignment_students: {
        ...ownedRow().assignment_students,
        assignments: {
          ...ownedRow().assignment_students.assignments,
          classes: { id: "c-1", name: "A", review_policy: "flagged_only" },
        },
      },
    });
    expect(await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([row]))).toHaveLength(1);
  });

  it("exposes the owning class id for class-scoped filtering", async () => {
    const rows = await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([ownedRow()]));
    expect(rows[0].classId).toBe("c-1");
  });

  it("exposes only minimal snapshot metadata", async () => {
    const snapshot = await getTeacherQueueSnapshot({ teacherId: "teacher-1" }, client([ownedRow()]));
    expect(snapshot.newest).toEqual({ attemptId: "attempt-1", studentName: "Mina", assignmentTitle: "Hello", className: "A", href: "/teacher/evidence/attempt-1" });
    expect(JSON.stringify(snapshot)).not.toMatch(/transcript|audio|pin|reviewNote/i);
  });

  it("returns empty owned results without leaking another tenant", async () => {
    expect(await listNeedsReviewForTeacher({ teacherId: "teacher-2" }, client([]))).toEqual([]);
  });
});

function progressClient(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.is = () => Promise.resolve({ data: rows, error: null });
  return { from: () => chain } as unknown as NonNullable<Parameters<typeof listAssignmentProgressForClass>[1]>;
}

describe("listAssignmentProgressForClass", () => {
  it("aggregates per-assignment status buckets including dismissed rows at their truthful status", async () => {
    const progress = await listAssignmentProgressForClass({ teacherId: "teacher-1", classId: "c-1" }, progressClient([
      { assignment_id: "a-1", status: "completed" },
      { assignment_id: "a-1", status: "teacher_review" },
      { assignment_id: "a-1", status: "started" },
      { assignment_id: "a-1", status: "needs_retry" },
      { assignment_id: "a-1", status: "assigned" },
      { assignment_id: "a-1", status: "missed", dismissed_at: "2026-07-12T00:00:00Z" },
      { assignment_id: "a-2", status: "completed" },
    ]));
    expect(progress.get("a-1")).toEqual({ completed: 1, teacherReview: 1, started: 1, needsRetry: 1, assigned: 1, missed: 1, total: 6 });
    expect(progress.get("a-2")).toEqual({ completed: 1, teacherReview: 0, started: 0, needsRetry: 0, assigned: 0, missed: 0, total: 1 });
  });

  it("returns an empty map for a class with no assignment students", async () => {
    expect((await listAssignmentProgressForClass({ teacherId: "teacher-1", classId: "c-1" }, progressClient([]))).size).toBe(0);
  });
});
