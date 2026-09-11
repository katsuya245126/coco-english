import { describe, expect, it } from "vitest";
import { getAssignmentStudentEvidenceForTeacher } from "@/server/teacher/assignment-student-evidence";

const snapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "July 1st Homework",
  level: "elementary",
  requiredTurns: 2,
  characterId: "default-buddy",
  conversationMode: false,
  turns: [
    {
      turnOrder: 1,
      prompt: "What do you like?",
      targetPattern: "I like ___.",
      targetExample: "I like apples.",
      hintLadder: { tier1: "I like ...", tier2: "apples", tier3: "I like apples." },
      picture: {
        objectKey: "teachers/teacher-1/picture-1.jpg",
        description: "A child choosing an apple.",
      },
    },
    {
      turnOrder: 2,
      prompt: "What will you do?",
      targetPattern: "I will ___.",
      targetExample: "I will play soccer.",
      hintLadder: { tier1: "I will ...", tier2: "play soccer", tier3: "I will play soccer." },
    },
  ],
};

const historicalSnapshot = {
  ...snapshot,
  targetPattern: "I am going to...",
  turns: snapshot.turns.map(({ targetPattern: _targetPattern, ...turn }) => turn),
};

const conversationSnapshot = {
  ...snapshot,
  missionId: "33333333-3333-4333-8333-333333333333",
  title: "Weekend conversation",
  targetPattern: "I am going to...",
  requiredTurns: 1,
  conversationMode: true,
  turns: [{
    turnOrder: 1,
    prompt: "What are you doing this weekend?",
    targetExample: "I am going to play soccer.",
    hintLadder: { tier1: "Use a full sentence.", tier2: "Choose an activity.", tier3: "I am going to play soccer." },
  }],
};

const legacySnapshot = {
  missionId: "22222222-2222-4222-8222-222222222222",
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [{
    order: 1,
    prompt: "What are you going to do this weekend?",
    targetExample: "I am going to play soccer.",
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

    expect(result).not.toHaveProperty("targetPattern");
    expect(result).toMatchObject({
      assignmentStudentId: "as-1", studentName: "test", missionTitle: "July 1st Homework",
      status: "assigned", statusLabel: "Not started", submittedLabel: "Not yet submitted",
      attemptCount: 0, highestHintLabel: "No hints used", classId: "class-1",
      className: "Test class", assignmentId: "assignment-1", dismissedAt: null,
      turns: [
        {
          turnOrder: 1,
          prompt: "What do you like?",
          targetPattern: "I like ___.",
          targetExample: "I like apples.",
          picture: {
            objectKey: "teachers/teacher-1/picture-1.jpg",
            description: "A child choosing an apple.",
          },
        },
        { turnOrder: 2, prompt: "What will you do?", targetPattern: "I will ___.", targetExample: "I will play soccer." },
      ],
    });
    expect(result?.turns.map(({ turnOrder, targetPattern }) => ({ turnOrder, targetPattern }))).toEqual([
      { turnOrder: 1, targetPattern: "I like ___." },
      { turnOrder: 2, targetPattern: "I will ___." },
    ]);
    expect(result?.turns[0]?.picture).toEqual({
      objectKey: "teachers/teacher-1/picture-1.jpg",
      description: "A child choosing an apple.",
    });
    expect(filters).toContainEqual(["assignments.classes.teacher_id", "teacher-1"]);
  });

  it("falls back a historical complete preset pattern onto every turn", async () => {
    const { client } = evidenceClient({
      id: "as-1", status: "assigned", submitted_at: null, latest_attempt_id: null, dismissed_at: null,
      students: { display_name: "test" },
      assignments: { id: "assignment-1", title: "Assignment title", mission_snapshot: historicalSnapshot, classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" } },
    });

    const result = await getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "as-1" },
      client as never,
    );

    expect(result).not.toHaveProperty("targetPattern");
    expect(result?.turns.map(({ turnOrder, targetPattern }) => ({ turnOrder, targetPattern }))).toEqual([
      { turnOrder: 1, targetPattern: "I am going to..." },
      { turnOrder: 2, targetPattern: "I am going to..." },
    ]);
  });

  it("shows known legacy assigned work without inventing a target pattern", async () => {
    const { client } = evidenceClient({
      id: "as-1",
      status: "assigned",
      submitted_at: null,
      latest_attempt_id: null,
      dismissed_at: null,
      students: { display_name: "test" },
      assignments: {
        id: "assignment-1",
        title: "Assignment fallback title",
        mission_snapshot: legacySnapshot,
        classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" },
      },
    });

    const result = await getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "as-1" },
      client as never,
    );

    expect(result).toMatchObject({
      missionTitle: "Foundation Smoke Assignment",
      turns: [{
        turnOrder: 1,
        targetPattern: null,
        prompt: "What are you going to do this weekend?",
        targetExample: "I am going to play soccer.",
      }],
    });
  });

  it("keeps invalid assigned work free of invented mission content", async () => {
    const { client } = evidenceClient({
      id: "as-1",
      status: "assigned",
      submitted_at: null,
      latest_attempt_id: null,
      dismissed_at: null,
      students: { display_name: "test" },
      assignments: {
        id: "assignment-1",
        title: "Assignment fallback title",
        mission_snapshot: {
          conversationMode: true,
          turns: [{ turnOrder: 1, prompt: "Untrusted question" }],
        },
        classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" },
      },
    });

    const result = await getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "as-1" },
      client as never,
    );

    expect(result).toMatchObject({
      missionTitle: "Assignment fallback title",
      turns: [],
    });
  });

  it("does not turn conversation context into a per-turn requirement", async () => {
    const { client } = evidenceClient({
      id: "as-1", status: "assigned", submitted_at: null, latest_attempt_id: null, dismissed_at: null,
      students: { display_name: "test" },
      assignments: { id: "assignment-1", title: "Assignment title", mission_snapshot: conversationSnapshot, classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" } },
    });

    const result = await getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "as-1" },
      client as never,
    );

    expect(result).not.toHaveProperty("targetPattern");
    expect(result?.turns[0]?.targetPattern).toBeNull();
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

  it("labels a missed assignment with no attempt as Not started", async () => {
    const { client } = evidenceClient({
      id: "as-1", status: "missed", submitted_at: null, latest_attempt_id: null, dismissed_at: null,
      students: { display_name: "test" },
      assignments: { id: "assignment-1", title: "Assignment title", mission_snapshot: snapshot, classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" } },
    });

    const result = await getAssignmentStudentEvidenceForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "as-1" },
      client as never,
    );

    expect(result?.statusLabel).toBe("Not started");
  });
});
