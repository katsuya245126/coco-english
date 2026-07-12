import { describe, expect, it } from "vitest";
import { getTeacherQueueSnapshot, listNeedsReviewForTeacher } from "@/server/teacher/assignment-operations";

function client(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => Promise.resolve({ data: rows, error: null });
  return { from: () => chain } as unknown as NonNullable<Parameters<typeof listNeedsReviewForTeacher>[1]>;
}

const ownedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "attempt-1", status: "completed", completed_at: "2026-07-12T00:00:00Z", needs_review_reason: null,
  assignment_students: { id: "as-1", status: "completed", submitted_at: "2026-07-12T00:00:00Z", latest_attempt_id: "attempt-1", students: { display_name: "Mina" }, assignments: { id: "a-1", title: "Hello", classes: { name: "A", review_policy: "every_submission" } } },
  submission_review_receipts: [], ...overrides,
});

describe("teacher assignment reads", () => {
  it("returns eligible owned submissions newest first and excludes reviewed rows", async () => {
    const reviewed = ownedRow({ id: "attempt-2", assignment_students: { ...ownedRow().assignment_students, id: "as-2", latest_attempt_id: "attempt-2" }, submission_review_receipts: [{ reviewed_at: "2026-07-12T01:00:00Z" }] });
    expect((await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([reviewed, ownedRow()]))).map((r) => r.attemptId)).toEqual(["attempt-1"]);
  });

  it("uses durable flagged origin in flagged-only classes", async () => {
    const row = ownedRow({ needs_review_reason: "low_confidence", assignment_students: { ...ownedRow().assignment_students, assignments: { ...ownedRow().assignment_students.assignments, classes: { name: "A", review_policy: "flagged_only" } } } });
    expect(await listNeedsReviewForTeacher({ teacherId: "teacher-1" }, client([row]))).toHaveLength(1);
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
