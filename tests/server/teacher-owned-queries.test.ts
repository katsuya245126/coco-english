import { describe, expect, it } from "vitest";
import {
  getOwnedAssignmentStudentForTeacher,
  getOwnedAttemptForTeacher,
  getOwnedAudioClipForTeacher,
  listOwnedAssignmentProgressForClass,
  listOwnedAttemptClipsForTeacher,
  listOwnedAttemptTurnsForTeacher,
  listOwnedPronunciationScoresForTeacher,
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

describe("teacher-owned service-role queries", () => {
  it("proves attempt ownership for a supplied attempt id", async () => {
    const { client, operations } = ownedQueryClient({
      data: { attempts: { id: "attempt-1" } },
    });

    await expect(
      getOwnedAttemptForTeacher(
        { teacherId: "teacher-1", attemptId: "foreign-attempt" },
        client as never,
      ),
    ).resolves.toMatchObject({ data: { id: "attempt-1" }, error: null });

    expect(operations[0]).toMatchObject({
      table: "attempts",
      filters: expect.arrayContaining([
        ["id", "foreign-attempt"],
        ["assignment_students.assignments.classes.teacher_id", "teacher-1"],
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
    const { client, operations } = ownedQueryClient({
      data: { audio_clips: { id: "clip-1", object_key: "private/key" } },
    });

    await getOwnedAudioClipForTeacher(
      { teacherId: "teacher-1", audioClipId: "clip-from-another-student" },
      client as never,
    );

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
});
