import { describe, expect, it } from "vitest";
import {
  getOwnedAssignmentStudentForTeacher,
  getOwnedAttemptForTeacher,
  getOwnedAudioClipForTeacher,
  listOwnedAssignmentProgressForClass,
  listOwnedAttemptClipsForTeacher,
  listOwnedAttemptTurnsForTeacher,
  listOwnedPronunciationScoresForTeacher,
  updateOwnedClassReviewPolicy,
} from "@/server/teacher/teacher-owned-queries";

type Operation = {
  table: string;
  select?: string;
  filters: Array<[string, unknown]>;
  inFilters: Array<[string, unknown[]]>;
  isFilters: Array<[string, unknown]>;
};

function ownedQueryClient(options: {
  data?: Record<string, unknown>;
  error?: Record<string, { message: string } | null>;
} = {}) {
  const operations: Operation[] = [];

  function queryFor(table: string) {
    const operation: Operation = {
      table,
      filters: [],
      inFilters: [],
      isFilters: [],
    };
    const query = {
      select: (select?: string) => {
        operation.select = select;
        return query;
      },
      eq: (column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        operation.inFilters.push([column, values]);
        return query;
      },
      is: (column: string, value: unknown) => {
        operation.isFilters.push([column, value]);
        return query;
      },
      order: () => query,
      maybeSingle: async () => {
        operations.push(operation);
        return {
          data: options.data?.[table] ?? null,
          error: options.error?.[table] ?? null,
        };
      },
      then: (resolve: (value: unknown) => unknown) => {
        operations.push(operation);
        return Promise.resolve({
          data: options.data?.[table] ?? [],
          error: options.error?.[table] ?? null,
        }).then(resolve);
      },
    };
    return query;
  }

  return {
    client: { from: (table: string) => queryFor(table) },
    operations,
  };
}

function classPolicyClient(result: { data: { id: string } | null; error: { message: string } | null }) {
  const operations: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {
    update: (payload: unknown) => { operations.push(["update", payload]); return chain; },
    eq: (key: string, value: unknown) => { operations.push(["eq", key, value]); return chain; },
    select: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return { client: { from: () => chain }, operations };
}

describe("teacher-owned service-role queries", () => {
  it("proves attempt ownership for a supplied attempt id", async () => {
    const { client, operations } = ownedQueryClient({
      data: { attempts: { id: "attempt-1" } },
    });

    await expect(
      getOwnedAttemptForTeacher(
        { teacherId: "teacher-1", attemptId: "attempt-1" },
        client as never,
      ),
    ).resolves.toMatchObject({ data: { id: "attempt-1" }, error: null });

    expect(operations[0]).toMatchObject({
      table: "attempts",
      filters: expect.arrayContaining([
        ["id", "attempt-1"],
        ["assignment_students.assignments.classes.teacher_id", "teacher-1"],
      ]),
    });
  });

  it.each([
    { attemptId: "foreign-attempt", teacherId: "teacher-1" },
    { attemptId: "attempt-1", teacherId: "wrong-teacher" },
  ])("returns null for an unowned attempt ($attemptId / $teacherId)", async ({ attemptId, teacherId }) => {
    const { client, operations } = ownedQueryClient({ data: { attempts: null } });

    await expect(
      getOwnedAttemptForTeacher({ teacherId, attemptId }, client as never),
    ).resolves.toEqual({ data: null, error: null });

    expect(operations[0]).toMatchObject({
      table: "attempts",
      filters: expect.arrayContaining([
        ["id", attemptId],
        ["assignment_students.assignments.classes.teacher_id", teacherId],
      ]),
    });
  });

  it("returns the database error instead of treating it as an ownership miss", async () => {
    const { client } = ownedQueryClient({
      error: { attempts: { message: "database unavailable" } },
    });

    await expect(
      getOwnedAttemptForTeacher(
        { teacherId: "teacher-1", attemptId: "attempt-1" },
        client as never,
      ),
    ).resolves.toMatchObject({
      data: null,
      error: { message: "database unavailable" },
    });
  });

  it("uses the assigned-homework root for a teacher-owned row", async () => {
    const { client, operations } = ownedQueryClient({
      data: { assignment_students: { id: "assigned-1" } },
    });

    await getOwnedAssignmentStudentForTeacher(
      { teacherId: "teacher-2", assignmentStudentId: "assigned-1" },
      client as never,
    );

    expect(operations[0]).toMatchObject({
      table: "assignment_students",
      filters: expect.arrayContaining([
        ["id", "assigned-1"],
        ["assignments.classes.teacher_id", "teacher-2"],
      ]),
      isFilters: [],
    });
  });

  it("keeps class-scoped cancellation policy explicit at the query seam", async () => {
    const { client, operations } = ownedQueryClient({
      data: { assignment_students: [] },
    });

    await listOwnedAssignmentProgressForClass(
      { teacherId: "teacher-1", classId: "class-1", excludeCanceled: true },
      client as never,
    );

    expect(operations[0]).toMatchObject({
      table: "assignment_students",
      filters: expect.arrayContaining([
        ["assignments.class_id", "class-1"],
        ["assignments.classes.teacher_id", "teacher-1"],
      ]),
      isFilters: [["assignments.canceled_at", null]],
    });

    await listOwnedAssignmentProgressForClass(
      { teacherId: "teacher-1", classId: "class-1" },
      client as never,
    );
    expect(operations[1]?.isFilters).toEqual([]);
  });

  it("keeps historical evidence roots visible while live class progress excludes canceled work", async () => {
    const { client, operations } = ownedQueryClient();

    await getOwnedAttemptForTeacher(
      { teacherId: "teacher-1", attemptId: "attempt-1" },
      client as never,
    );
    await getOwnedAssignmentStudentForTeacher(
      { teacherId: "teacher-1", assignmentStudentId: "assigned-1" },
      client as never,
    );
    await listOwnedAssignmentProgressForClass(
      { teacherId: "teacher-1", classId: "class-1", excludeCanceled: true },
      client as never,
    );

    expect(operations[0]?.isFilters).toEqual([]);
    expect(operations[1]?.isFilters).toEqual([]);
    expect(operations[2]?.isFilters).toEqual([["assignments.canceled_at", null]]);
  });

  it("proves ownership again for turns, clips, and scores derived from an attempt", async () => {
    const { client, operations } = ownedQueryClient();
    const input = { teacherId: "teacher-1", attemptId: "attempt-1" };

    await listOwnedAttemptTurnsForTeacher(input, client as never);
    await listOwnedAttemptClipsForTeacher(
      { ...input, turnIds: ["turn-1"] },
      client as never,
    );
    await listOwnedPronunciationScoresForTeacher(
      { ...input, audioClipIds: ["clip-1"] },
      client as never,
    );

    expect(operations.map(({ table }) => table)).toEqual([
      "attempt_turns",
      "audio_clips",
      "pronunciation_scores",
    ]);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "attempt_turns",
          filters: expect.arrayContaining([
            ["attempt_id", "attempt-1"],
            [
              "attempts.assignment_students.assignments.classes.teacher_id",
              "teacher-1",
            ],
          ]),
        }),
        expect.objectContaining({
          table: "audio_clips",
          filters: expect.arrayContaining([
            ["attempt_turns.attempt_id", "attempt-1"],
            [
              "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
              "teacher-1",
            ],
          ]),
          inFilters: [["attempt_turn_id", ["turn-1"]]],
        }),
        expect.objectContaining({
          table: "pronunciation_scores",
          filters: expect.arrayContaining([
            ["audio_clips.attempt_turns.attempt_id", "attempt-1"],
            [
              "audio_clips.attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
              "teacher-1",
            ],
          ]),
          inFilters: [["audio_clip_id", ["clip-1"]]],
        }),
      ]),
    );
  });

  it("proves clip ownership through the student's attempt before returning storage metadata", async () => {
    const { client, operations } = ownedQueryClient({ data: { audio_clips: null } });

    await expect(getOwnedAudioClipForTeacher(
      { teacherId: "teacher-1", audioClipId: "clip-from-another-student" },
      client as never,
    )).resolves.toEqual({ data: null, error: null });

    expect(operations[0]).toMatchObject({
      table: "audio_clips",
      filters: expect.arrayContaining([
        ["id", "clip-from-another-student"],
        [
          "attempt_turns.attempts.assignment_students.assignments.classes.teacher_id",
          "teacher-1",
        ],
      ]),
    });
  });

  it("updates a teacher-owned class", async () => {
    const { client, operations } = classPolicyClient({ data: { id: "class-1" }, error: null });

    await expect(updateOwnedClassReviewPolicy(
      { teacherId: "teacher-1", classId: "class-1", reviewPolicy: "flagged_only" },
      client as never,
    )).resolves.toEqual({ data: { id: "class-1" }, error: null });
    expect(operations).toContainEqual(["update", { review_policy: "flagged_only" }]);
    expect(operations).toContainEqual(["eq", "id", "class-1"]);
    expect(operations).toContainEqual(["eq", "teacher_id", "teacher-1"]);
  });

  it("returns no row when the teacher does not own the class", async () => {
    const { client, operations } = classPolicyClient({ data: null, error: null });

    await expect(updateOwnedClassReviewPolicy(
      { teacherId: "wrong-teacher", classId: "class-1", reviewPolicy: "every_submission" },
      client as never,
    )).resolves.toEqual({ data: null, error: null });
    expect(operations).toContainEqual(["eq", "id", "class-1"]);
    expect(operations).toContainEqual(["eq", "teacher_id", "wrong-teacher"]);
  });

  it("returns the database error for a class update", async () => {
    const { client } = classPolicyClient({ data: null, error: { message: "database unavailable" } });

    await expect(updateOwnedClassReviewPolicy(
      { teacherId: "teacher-1", classId: "class-1", reviewPolicy: "every_submission" },
      client as never,
    )).resolves.toEqual({ data: null, error: { message: "database unavailable" } });
  });
});
