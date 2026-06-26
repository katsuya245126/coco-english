import { beforeEach, describe, expect, it, vi } from "vitest";
import { missionSnapshotSchema } from "@/domain/mission/schemas";

let mockSupabase: unknown;

vi.mock("@/lib/supabase/server-auth", () => ({
  createSupabaseServerClient: async () => mockSupabase,
}));

const {
  assignMissionToClass,
  buildMissionSnapshot,
  listAssignableClassesForTeacher,
} = await import("@/server/mission/assign-service");

const missionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Food likes",
  target_pattern: "I like ___.",
  topic: "Food",
  level: "elementary",
  required_turns: 1,
  character_id: "default-buddy",
};

const turnRows = [
  {
    id: "turn-1",
    turn_order: 1,
    prompt: "What food do you like?",
    target_example: "I like apples.",
    hint_ladder: {
      tier1: "I like ___.",
      tier2: "like, apples",
      tier3: "I like apples.",
    },
  },
];

describe("mission assignment service (ASGN-01, ASGN-02, ASGN-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a D-05/D-07 full denormalized snapshot including MISS-04 character id", () => {
    const snapshot = buildMissionSnapshot({
      mission: missionRow,
      turns: turnRows,
    });

    expect(missionSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot).toMatchObject({
      missionId: missionRow.id,
      title: "Food likes",
      targetPattern: "I like ___.",
      topic: "Food",
      level: "elementary",
      requiredTurns: 1,
      characterId: "default-buddy",
    });
    expect(snapshot.turns[0]).toMatchObject({
      turnOrder: 1,
      prompt: "What food do you like?",
      targetExample: "I like apples.",
    });
  });

  it("calls the RPC with server-built snapshot, optional D-04 due date, and no browser snapshot input", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        assignment_id: "assignment-1",
        active_student_count: 2,
        class_name: "Blue Class",
      },
      error: null,
    }));
    const supabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: table === "missions" ? missionRow : null,
                error: null,
              })),
            })),
            order: vi.fn(async () => ({ data: turnRows, error: null })),
          })),
        })),
      })),
      rpc,
    };
    mockSupabase = supabase;

    const result = await assignMissionToClass({
      teacherId: "teacher-1",
      missionId: missionRow.id,
      classId: "22222222-2222-4222-8222-222222222222",
      dueAt: "2026-07-01T00:00:00.000Z",
    });

    expect(result.activeStudentCount).toBe(2);
    expect(rpc).toHaveBeenCalledWith(
      "assign_mission_to_class",
      expect.objectContaining({
        p_mission_id: missionRow.id,
        p_due_at: "2026-07-01T00:00:00.000Z",
        p_mission_snapshot: expect.objectContaining({
          title: "Food likes",
          characterId: "default-buddy",
        }),
      }),
    );
  });

  it("lists only classes with active students as assignable (D-08)", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "classes") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: [
                      { id: "class-1", name: "Has students" },
                      { id: "class-2", name: "Empty class" },
                    ],
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              is: vi.fn(async () => ({
                data: [
                  { class_id: "class-1" },
                  { class_id: "class-1" },
                ],
                error: null,
              })),
            })),
          })),
        };
      }),
    };
    mockSupabase = supabase;

    const classes = await listAssignableClassesForTeacher({
      teacherId: "teacher-1",
    });

    expect(classes).toEqual([
      { id: "class-1", name: "Has students", activeStudentCount: 2 },
    ]);
  });
});
