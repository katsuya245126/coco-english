import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSupabase: unknown;

vi.mock("@/lib/supabase/server-auth", () => ({
  createSupabaseServerClient: async () => mockSupabase,
}));

const {
  applyAnswerShapes,
  archiveMission,
  cancelMissionAssignment,
  createMission,
  deleteMission,
  listArchivedMissionsForTeacher,
  listMissionsForTeacher,
  mapTurn,
  restoreMission,
  toTurnRows,
  updateMission,
} = await import("@/server/mission/mission-service");

const completeInput = {
  teacherId: "teacher-1",
  title: "Daily routines",
  targetPattern: "I ___ at seven.",
  level: "elementary" as const,
  requiredTurns: 1,
  characterId: "default-buddy",
  conversationMode: false,
  requireCompleteSentenceAnswers: true,
  turns: [
    {
      prompt: "What do you do at seven?",
      targetExample: "I wake up at seven.",
      hintLadder: {
        tier1: "I ___ at seven.",
        tier2: "wake up, eat, sleep",
        tier3: "I wake up at seven.",
      },
      answerShape: "fixed" as const,
    },
  ],
};

const presetInput = {
  ...completeInput,
  targetPattern: undefined,
  requiredTurns: 2,
  turns: [
    { ...completeInput.turns[0], targetPattern: "I ___ at seven." },
    {
      ...completeInput.turns[0],
      prompt: "What will you do tomorrow?",
      targetPattern: "I will ___.",
      targetExample: "I will study.",
    },
  ],
};

describe("mission service authoring behavior (MISS-01, MISS-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes D-01 mission and ordered turn rows without a separate questions table", async () => {
    const missionId = "mission-1";
    const calls: Array<{ table: string; payload: unknown }> = [];
    const supabase = {
      from: vi.fn((table: string) => ({
        insert: vi.fn((payload: unknown) => {
          calls.push({ table, payload });
          if (table === "mission_turn_templates") {
            return { error: null };
          }
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data:
                  table === "missions"
                    ? {
                        id: missionId,
                        title: presetInput.title,
                        target_pattern: null,
                        topic: "",
                        level: presetInput.level,
                        required_turns: presetInput.requiredTurns,
                        character_id: "default-buddy",
                        conversation_mode: false,
                        require_complete_sentence_answers: true,
                        archived_at: null,
                      }
                    : { id: "turn-1" },
                error: null,
              })),
            })),
          };
        }),
      })),
    };
    mockSupabase = supabase;

    await createMission(presetInput);

    expect(calls.map((call) => call.table)).toEqual([
      "missions",
      "mission_turn_templates",
    ]);
    expect(calls.some((call) => call.table === "questions")).toBe(false);
    expect(calls.find((call) => call.table === "missions")?.payload).toMatchObject({
      target_pattern: null,
      require_complete_sentence_answers: true,
      topic: "",
    });
    expect(calls.find((call) => call.table === "mission_turn_templates")?.payload)
      .toMatchObject([
        { turn_order: 1, target_pattern: "I ___ at seven." },
        { turn_order: 2, target_pattern: "I will ___." },
      ]);
    expect(calls.find((call) => call.table === "missions")?.payload).not.toHaveProperty(
      "scene_premise",
    );
  });

  it("does not overwrite retired metadata when updating an existing mission", async () => {
    let missionPayload: unknown;
    const missionRow = {
      id: "mission-1",
      title: presetInput.title,
      target_pattern: null,
      level: presetInput.level,
      required_turns: presetInput.requiredTurns,
      character_id: "default-buddy",
      conversation_mode: false,
      require_complete_sentence_answers: true,
      archived_at: null,
    };
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") {
          return {
            update: vi.fn((payload: unknown) => {
              missionPayload = payload;
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(async () => ({ data: missionRow, error: null })),
                    })),
                  })),
                })),
              };
            }),
          };
        }
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
          insert: vi.fn(async () => ({ error: null })),
        };
      }),
    };

    await updateMission({ ...presetInput, missionId: "mission-1" });

    expect(missionPayload).not.toHaveProperty("topic");
    expect(missionPayload).not.toHaveProperty("scene_premise");
    expect(missionPayload).not.toHaveProperty("teacher_id");
  });

  it("rejects D-02 required turn count mismatch on create and update", async () => {
    const badInput = { ...presetInput, requiredTurns: 1 };

    await expect(createMission(badInput)).rejects.toThrow(/required turns/i);
    await expect(
      updateMission({ ...badInput, missionId: "mission-1" }),
    ).rejects.toThrow(/required turns/i);
  });

  it("archives an assigned mission without calling DELETE", async () => {
    const calls: Array<{ table: string; action: string; payload?: unknown; filters: Array<[string, unknown]> }> = [];
    const makeUpdateQuery = (table: string, payload: unknown) => {
      const filters: Array<[string, unknown]> = [];
      return {
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return {
            eq: vi.fn((nextColumn: string, nextValue: unknown) => {
              filters.push([nextColumn, nextValue]);
              calls.push({ table, action: "update", payload, filters });
              return { error: null };
            }),
          };
        }),
      };
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") {
          return {
            update: vi.fn((payload: unknown) => makeUpdateQuery(table, payload)),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockSupabase = supabase;

    await deleteMission({ teacherId: "teacher-1", missionId: "mission-1" });

    expect(calls).toEqual([
      {
        table: "missions",
        action: "update",
        payload: { archived_at: expect.any(String) },
        filters: [
          ["id", "mission-1"],
          ["teacher_id", "teacher-1"],
        ],
      },
    ]);
  });

  it("archives and restores missions with soft updates scoped to the teacher", async () => {
    const calls: Array<{ table: string; payload: unknown; filters: Array<[string, unknown]> }> = [];
    const makeUpdateQuery = (table: string, payload: unknown) => {
      const filters: Array<[string, unknown]> = [];
      return {
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return {
            eq: vi.fn((nextColumn: string, nextValue: unknown) => {
              filters.push([nextColumn, nextValue]);
              calls.push({ table, payload, filters });
              return { error: null };
            }),
          };
        }),
      };
    };
    mockSupabase = {
      from: vi.fn((table: string) => ({
        update: vi.fn((payload: unknown) => makeUpdateQuery(table, payload)),
      })),
    };

    await archiveMission({ teacherId: "teacher-1", missionId: "mission-1" });
    await restoreMission({ teacherId: "teacher-1", missionId: "mission-1" });

    expect(calls[0]).toMatchObject({
      table: "missions",
      filters: [
        ["id", "mission-1"],
        ["teacher_id", "teacher-1"],
      ],
    });
    expect(calls[0].payload).toHaveProperty("archived_at");
    expect(calls[1]).toEqual({
      table: "missions",
      payload: { archived_at: null },
      filters: [
        ["id", "mission-1"],
        ["teacher_id", "teacher-1"],
      ],
    });
  });

  it("reports required turns for conversation-mode missions that store only the opener template", async () => {
    const missionRow = {
      id: "mission-1",
      title: "Test homework",
      target_pattern: "I like ___.",
      topic: "Hobbies",
      level: "elementary",
      required_turns: 5,
      character_id: "default-buddy",
      conversation_mode: true,
      scene_premise: null,
      archived_at: null,
    };
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(async () => ({ data: [missionRow], error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "mission_turn_templates") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [{ mission_id: "mission-1" }],
                error: null,
              })),
            })),
          };
        }
        if (table === "assignments") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                is: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const missions = await listMissionsForTeacher({ teacherId: "teacher-1" });

    expect(missions).toHaveLength(1);
    expect(missions[0].conversationMode).toBe(true);
    expect(missions[0].turnCount).toBe(5);
  });

  it("lists active and archived missions separately", async () => {
    const calls: Array<{ action: string; column: string; value?: unknown; operator?: string }> = [];
    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table !== "missions") {
          throw new Error(`Unexpected table ${table}`);
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              calls.push({ action: "eq", column, value });
              return {
                is: vi.fn((isColumn: string, isValue: unknown) => {
                  calls.push({ action: "is", column: isColumn, value: isValue });
                  return {
                    order: vi.fn(async () => ({ data: [], error: null })),
                  };
                }),
                not: vi.fn((notColumn: string, operator: string, notValue: unknown) => {
                  calls.push({
                    action: "not",
                    column: notColumn,
                    operator,
                    value: notValue,
                  });
                  return {
                    order: vi.fn(async () => ({ data: [], error: null })),
                  };
                }),
              };
            }),
          })),
        };
      }),
    };

    await listMissionsForTeacher({ teacherId: "teacher-1" });
    await listArchivedMissionsForTeacher({ teacherId: "teacher-1" });

    expect(calls).toContainEqual({
      action: "is",
      column: "archived_at",
      value: null,
    });
    expect(calls).toContainEqual({
      action: "not",
      column: "archived_at",
      operator: "is",
      value: null,
    });
  });

  it("cancels a class-specific mission assignment without deleting assignment history", async () => {
    const calls: Array<{ table: string; payload: unknown; filters: Array<[string, unknown]> }> = [];
    const makeUpdateQuery = (table: string, payload: unknown) => {
      const filters: Array<[string, unknown]> = [];
      return {
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return {
            eq: vi.fn((nextColumn: string, nextValue: unknown) => {
              filters.push([nextColumn, nextValue]);
              calls.push({ table, payload, filters });
              return { error: null };
            }),
          };
        }),
      };
    };
    mockSupabase = {
      from: vi.fn((table: string) => ({
        update: vi.fn((payload: unknown) => makeUpdateQuery(table, payload)),
      })),
    };

    await cancelMissionAssignment({
      teacherId: "teacher-1",
      missionId: "mission-1",
      assignmentId: "assignment-1",
    });

    expect(calls[0]).toMatchObject({
      table: "assignments",
      filters: [
        ["id", "assignment-1"],
        ["mission_id", "mission-1"],
      ],
    });
    expect(calls[0].payload).toHaveProperty("canceled_at");
  });

  // toTurnRows must emit answer_shape; mapTurn must read it back.
  it("round-trips answerShape through toTurnRows and mapTurn", () => {
    const rows = toTurnRows("mission-1", [
      {
        prompt: "Which is best?",
        targetExample: "I think vanilla is the best.",
        hintLadder: { tier1: "a", tier2: "b", tier3: "c" },
        answerShape: "fixed",
      },
    ]);
    expect(rows[0].answer_shape).toBe("fixed");

    const mapped = mapTurn({
      id: "t1",
      turn_order: 1,
      prompt: "Which is best?",
      target_example: "I think vanilla is the best.",
      hint_ladder: { tier1: "a", tier2: "b", tier3: "c" },
      answer_shape: "fixed",
    } as never);
    expect(mapped.answerShape).toBe("fixed");
  });

  it("round-trips an optional target pattern on turn rows", () => {
    const rows = toTurnRows("mission-1", [
      {
        prompt: "What do you do after school?",
        targetPattern: "I like ___ing.",
        targetExample: "I like reading.",
        hintLadder: {
          tier1: "Try I like...",
          tier2: "read",
          tier3: "I like reading.",
        },
        answerShape: "open",
      },
    ]);

    expect(rows[0].target_pattern).toBe("I like ___ing.");
    expect(
      mapTurn({
        id: "t1",
        turn_order: 1,
        prompt: "What do you do after school?",
        target_pattern: "I like ___ing.",
        target_example: "I like reading.",
        hint_ladder: {
          tier1: "Try I like...",
          tier2: "read",
          tier3: "I like reading.",
        },
        answer_shape: "open",
      } as never).targetPattern,
    ).toBe("I like ___ing.");
  });

  it("does not derive a preset turn pattern from a mission-level value", () => {
    const rows = toTurnRows("mission-1", completeInput.turns);
    expect(rows[0].target_pattern).toBeNull();
  });

  it("applies classified shapes to turns in order", () => {
    const turns = [
      { prompt: "q1", targetExample: "a1", hintLadder: { tier1: "x", tier2: "y", tier3: "z" }, answerShape: "open" as const },
      { prompt: "q2", targetExample: "a2", hintLadder: { tier1: "x", tier2: "y", tier3: "z" }, answerShape: "open" as const },
    ];
    const result = applyAnswerShapes(turns, ["fixed", "open"]);
    expect(result.map((t) => t.answerShape)).toEqual(["fixed", "open"]);
  });

  it("leaves turns unchanged when shape count mismatches", () => {
    const turns = [
      { prompt: "q1", targetExample: "a1", hintLadder: { tier1: "x", tier2: "y", tier3: "z" }, answerShape: "open" as const },
    ];
    const result = applyAnswerShapes(turns, []);
    expect(result.map((t) => t.answerShape)).toEqual(["open"]);
  });
});
