import { describe, expect, it, vi } from "vitest";
import { createMission, updateMission } from "@/server/mission/mission-service";

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
  it("writes D-01 mission and ordered turn rows without a separate questions table", async () => {
    const missionId = "mission-1";
    const calls: Array<{ table: string; payload: unknown }> = [];
    const supabase = {
      from: vi.fn((table: string) => ({
        insert: vi.fn((payload: unknown) => {
          calls.push({ table, payload });
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

    vi.doMock("@/lib/supabase/server-auth", () => ({
      createSupabaseServerClient: async () => supabase,
    }));

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
});
