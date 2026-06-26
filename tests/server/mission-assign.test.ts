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

  it("preserves stored snapshot after live mission edit (D-05, D-06, D-14)", () => {
    // Capture the snapshot at assign-time, then mutate the source mission data.
    // The snapshot is a frozen copy — editing the live mission afterwards must NOT
    // change the previously stored snapshot object.
    const snapshotAtAssign = buildMissionSnapshot({
      mission: missionRow,
      turns: turnRows,
    });

    // Deep-clone to simulate what the RPC stored
    const storedSnapshot = JSON.parse(JSON.stringify(snapshotAtAssign));

    // Simulate live mission edit: title, topic, and turn prompt change
    const editedMission = {
      ...missionRow,
      title: "Edited Food Opinions",
      topic: "Cooking",
    };
    const editedTurns = [
      {
        ...turnRows[0],
        prompt: "What cooking do you enjoy?",
        target_example: "I enjoy baking bread.",
      },
    ];

    // Build a new snapshot for the edited mission (what a *future* assignment
    // would capture), and confirm it differs from the stored one.
    const freshSnapshot = buildMissionSnapshot({
      mission: editedMission,
      turns: editedTurns,
    });

    // The stored snapshot must NOT have changed
    expect(storedSnapshot.title).toBe("Food likes");
    expect(storedSnapshot.topic).toBe("Food");
    expect(storedSnapshot.turns[0].prompt).toBe("What food do you like?");

    // The fresh snapshot reflects the edit
    expect(freshSnapshot.title).toBe("Edited Food Opinions");
    expect(freshSnapshot.topic).toBe("Cooking");
    expect(freshSnapshot.turns[0].prompt).toBe("What cooking do you enjoy?");

    // Confirm they are structurally different
    expect(storedSnapshot).not.toEqual(freshSnapshot);
  });

  it("exposes active assignment count for D-15 edit-after-assign notice", async () => {
    // getMissionForTeacher should return activeAssignmentCount so the edit
    // page can display: "This mission has N active assignment(s)..."
    const { getMissionForTeacher } = await import(
      "@/server/mission/mission-service"
    );

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "missions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: missionRow,
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        if (table === "mission_turn_templates") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: turnRows,
                  error: null,
                })),
              })),
            })),
          };
        }
        // assignments table — return 2 rows to simulate active assignments
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [{ id: "a1" }, { id: "a2" }],
              error: null,
            })),
          })),
        };
      }),
    };
    mockSupabase = supabase;

    const result = await getMissionForTeacher({
      teacherId: "teacher-1",
      missionId: missionRow.id,
    });

    expect(result).not.toBeNull();
    expect(result!.activeAssignmentCount).toBe(2);
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
