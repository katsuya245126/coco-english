import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSupabase: unknown;

vi.mock("@/lib/supabase/server-auth", () => ({
  createSupabaseServerClient: async () => mockSupabase,
}));

const { createMission, updateMission, deleteMission } = await import(
  "@/server/mission/mission-service"
);

const completeInput = {
  teacherId: "teacher-1",
  title: "Daily routines",
  targetPattern: "I ___ at seven.",
  topic: "Routines",
  level: "elementary" as const,
  requiredTurns: 1,
  characterId: "default-buddy",
  turns: [
    {
      prompt: "What do you do at seven?",
      targetExample: "I wake up at seven.",
      hintLadder: {
        tier1: "I ___ at seven.",
        tier2: "wake up, eat, sleep",
        tier3: "I wake up at seven.",
      },
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
                        title: completeInput.title,
                        target_pattern: completeInput.targetPattern,
                        topic: completeInput.topic,
                        level: completeInput.level,
                        required_turns: completeInput.requiredTurns,
                        character_id: "default-buddy",
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

    await createMission(completeInput);

    expect(calls.map((call) => call.table)).toEqual([
      "missions",
      "mission_turn_templates",
    ]);
    expect(calls.some((call) => call.table === "questions")).toBe(false);
  });

  it("rejects D-02 required turn count mismatch on create and update", async () => {
    const badInput = { ...completeInput, requiredTurns: 2 };

    await expect(createMission(badInput)).rejects.toThrow(/required turns/i);
    await expect(
      updateMission({ ...badInput, missionId: "mission-1" }),
    ).rejects.toThrow(/required turns/i);
  });

  it("deletes an unassigned mission owned by the teacher", async () => {
    const calls: Array<{ table: string; action: string; filters: Array<[string, unknown]> }> = [];
    const makeDeleteQuery = (table: string) => {
      const filters: Array<[string, unknown]> = [];
      return {
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          return {
            eq: vi.fn((nextColumn: string, nextValue: unknown) => {
              filters.push([nextColumn, nextValue]);
              calls.push({ table, action: "delete", filters });
              return { error: null };
            }),
          };
        }),
      };
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "assignments") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        }
        if (table === "missions") {
          return {
            delete: vi.fn(() => makeDeleteQuery(table)),
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
        action: "delete",
        filters: [
          ["id", "mission-1"],
          ["teacher_id", "teacher-1"],
        ],
      },
    ]);
  });

  it("rejects deleting a mission that already has assignments", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "assignments") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{ id: "assignment-1" }],
                error: null,
              })),
            })),
          };
        }
        if (table === "missions") {
          return {
            delete: vi.fn(() => {
              throw new Error("delete should not be called");
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockSupabase = supabase;

    await expect(
      deleteMission({ teacherId: "teacher-1", missionId: "mission-1" }),
    ).rejects.toThrow(/assigned/i);
  });
});
