import { describe, expect, it } from "vitest";
import { getAssignmentStudentEvidenceForTeacher } from "@/server/teacher/assignment-student-evidence";

const snapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "July 1st Homework",
  targetPattern: "I like ...",
  topic: "favorites",
  level: "elementary",
  requiredTurns: 1,
  characterId: "default-buddy",
  turns: [{
    turnOrder: 1,
    prompt: "What do you like?",
    targetExample: "I like apples.",
    hintLadder: { tier1: "I like ...", tier2: "apples", tier3: "I like apples." },
  }],
};

function evidenceClient(data: unknown) {
  const filters: Array<[string, unknown]> = [];
  const chain = {
    select: () => chain,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
    maybeSingle: () => Promise.resolve({ data, error: null }),
  };
  return { client: { from: () => chain }, filters };
}

describe("assignment student evidence", () => {
  it("loads an owned no-attempt assignment summary", async () => {
    const { client, filters } = evidenceClient({
      id: "as-1", status: "assigned", submitted_at: null, latest_attempt_id: null, dismissed_at: null,
      students: { display_name: "test" },
      assignments: { id: "assignment-1", title: "Assignment title", mission_snapshot: snapshot, classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" } },
    });

    const result = await getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "as-1" },
      client as never,
    );

    expect(result).toEqual({
      assignmentStudentId: "as-1", studentName: "test", missionTitle: "July 1st Homework",
      status: "assigned", statusLabel: "Not started", submittedLabel: "Not yet submitted",
      attemptCount: 0, highestHintLabel: "No hints used", classId: "class-1",
      className: "Test class", assignmentId: "assignment-1", dismissedAt: null,
    });
    expect(filters).toContainEqual(["assignments.classes.teacher_id", "teacher-1"]);
  });

  it("returns null when no owned row exists", async () => {
    const { client } = evidenceClient(null);
    await expect(getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-2", assignmentStudentId: "as-1" },
      client as never,
    )).resolves.toBeNull();
  });

  it("returns null when the assignment already has an attempt", async () => {
    const { client } = evidenceClient({
      id: "as-1", status: "started", submitted_at: null, latest_attempt_id: "attempt-1", dismissed_at: null,
      students: { display_name: "test" },
      assignments: { id: "assignment-1", title: "Assignment title", mission_snapshot: snapshot, classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" } },
    });
    await expect(getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "as-1" },
      client as never,
    )).resolves.toBeNull();
  });
});
