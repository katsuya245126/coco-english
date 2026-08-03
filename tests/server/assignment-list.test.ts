import { beforeEach, describe, expect, it, vi } from "vitest";

let rows: ReturnType<typeof row>[] = [];
const eq = vi.fn(() => ({ order: vi.fn(async () => ({ data: rows, error: null })) }));
const select = vi.fn(() => ({ eq }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ from: vi.fn(() => ({ select })) }),
}));

const snapshot = {
  missionId: "00000000-0000-0000-0000-000000000001", title: "Mission",
  level: "beginner", requiredTurns: 1, characterId: "default-buddy",
  turns: [{ turnOrder: 1, prompt: "What?", targetPattern: "I like X.", targetExample: "I like it.", hintLadder: { tier1: "One", tier2: "Two", tier3: "Three" } }],
};

const legacySnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [{
    order: 1,
    prompt: "What are you going to do this weekend?",
    targetExample: "I am going to play soccer.",
  }],
};

function row(id: string, status: string, dueAt: string | null = null, completedAt: string | null = null, missionSnapshot: unknown = snapshot): {
  id: string; status: string; submitted_at: string | null; latest_attempt_id: string | null;
  assignments: { title: string; mission_snapshot: unknown; assignment_kind?: "mission" | "pronunciation"; due_at: string | null; canceled_at: string | null };
  latest_attempt: { completed_at: string | null; attempt_turns?: Array<{ turn_order?: number; count?: number; pronunciation_word_tries?: Array<{ try_number: number; outcome: string }> }> } | null;
} {
  return { id, status, submitted_at: completedAt, latest_attempt_id: completedAt ? `attempt-${id}` : null,
    assignments: { title: id, mission_snapshot: missionSnapshot, due_at: dueAt, canceled_at: null },
    latest_attempt: completedAt ? { completed_at: completedAt } : null };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-12T12:00:00Z")); rows = []; vi.clearAllMocks(); });

describe("listStudentAssignmentPage", () => {
  it("hides unfinished legacy work from Current and shows completed legacy work in Past", async () => {
    rows = [
      row("legacy-open", "assigned", null, null, legacySnapshot),
      row("legacy-done", "completed", null, "2026-07-11T10:00:00Z", legacySnapshot),
    ];
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");

    const current = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });
    const past = await listStudentAssignmentPage("student-1", { tab: "past", page: 1 });

    expect(current.items).toEqual([]);
    expect(past.items).toEqual([
      expect.objectContaining({
        assignmentStudentId: "legacy-done",
        turnCount: 1,
        displayStatus: "done",
      }),
    ]);
  });

  it("labels pronunciation work and counts finished words instead of mission turns", async () => {
    const pronunciation = row("pronunciation", "started");
    pronunciation.assignments.assignment_kind = "pronunciation";
    pronunciation.assignments.mission_snapshot = {
      kind: "pronunciation",
      version: 1,
      soundId: "s",
      difficulty: "easy",
      requiredWords: 5,
      soundClipVersion: "v1",
      words: [1, 2, 3, 4, 5].map((order) => ({
        order,
        text: `word-${order}`,
        highlightStart: 0,
        highlightLength: 1,
        source: "verified",
        pronunciation: { phones: ["S"], targetPhoneIndex: 0, cmuVariant: 1 },
        wordAudio: { schemaVersion: 1, contentHash: `hash-${order}`, voice: "en-US-AvaNeural", format: "audio-24khz-48kbitrate-mono-mp3" },
      })),
    } as never;
    pronunciation.latest_attempt = {
      completed_at: null,
      attempt_turns: [
        { turn_order: 1, pronunciation_word_tries: [{ try_number: 1, outcome: "passed" }] },
        { turn_order: 2, pronunciation_word_tries: [{ try_number: 3, outcome: "different_word" }] },
        { turn_order: 3, pronunciation_word_tries: [{ try_number: 1, outcome: "target_weak" }] },
      ],
    };
    rows = [pronunciation];

    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    const page = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });

    expect(page.items[0]).toMatchObject({
      assignmentKind: "pronunciation",
      label: "Pronunciation",
      turnCount: 5,
      completedTurnCount: 2,
    });
  });

  it("orders retry, due within exactly 24h, then later/no-date stably", async () => {
    rows = [row("later", "assigned", "2026-07-14T12:00:00Z"), row("boundary", "started", "2026-07-13T12:00:00Z"), row("soon", "assigned", "2026-07-12T13:00:00Z"), row("retry", "needs_retry")];
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    const page = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });
    expect(page.items.map((item) => item.assignmentStudentId)).toEqual(["retry", "soon", "boundary", "later"]);
    expect(page.items[0]).toMatchObject({
      completedTurnCount: 0,
      targetPattern: "I like X.",
    });
    expect(eq).toHaveBeenCalledWith("student_id", "student-1");
  });

  it("keeps missed work Current and hides canceled work", async () => {
    const canceled = row("canceled", "assigned"); canceled.assignments.canceled_at = "2026-07-01T00:00:00Z";
    rows = [row("missed", "missed", "2026-07-01T00:00:00Z"), canceled, row("done", "completed", null, "2026-07-10T00:00:00Z")];
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    const page = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });
    // Overdue and never started reports 'late_start' (action: "Start mission"),
    // not 'late' (action: "Continue mission") — a missed row has no attempt to
    // continue, and the old label wrongly implied the student had begun.
    expect(page.items.map((item) => [item.assignmentStudentId, item.displayStatus])).toEqual([["missed", "late_start"]]);
  });

  it("distinguishes overdue started work from overdue never-started work", async () => {
    rows = [
      row("started-late", "started", "2026-07-01T00:00:00Z"),
      row("never-opened", "assigned", "2026-07-01T00:00:00Z"),
    ];
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    const page = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });
    const byId = new Map(page.items.map((item) => [item.assignmentStudentId, item.displayStatus]));
    expect(byId.get("started-late")).toBe("late");
    expect(byId.get("never-opened")).toBe("late_start");
  });

  it("presents teacher-reviewed submissions as completed Past work", async () => {
    rows = [
      row("review", "teacher_review", null, "2026-07-11T10:00:00Z"),
      row("done", "completed", null, "2026-07-10T10:00:00Z"),
    ];
    const { listStudentAssignmentPage } = await import(
      "@/server/student-access/assignment-list"
    );

    const current = await listStudentAssignmentPage("student-1", {
      tab: "current",
      page: 1,
    });
    const past = await listStudentAssignmentPage("student-1", {
      tab: "past",
      page: 1,
    });

    expect(current.items).toEqual([]);
    expect(past.items.map((item) => [item.assignmentStudentId, item.displayStatus])).toEqual([
      ["review", "done"],
      ["done", "done"],
    ]);
  });

  it("returns completed-only Past newest first with stable id tie-break and five items", async () => {
    rows = Array.from({ length: 7 }, (_, index) => row(`done-${index}`, "completed", null, index < 2 ? "2026-07-12T10:00:00Z" : `2026-07-${String(11-index).padStart(2, "0")}T10:00:00Z`));
    rows.push(row("open", "assigned"));
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    const page = await listStudentAssignmentPage("student-1", { tab: "past", page: 1, pageSize: 5 });
    expect(page.items).toHaveLength(5); expect(page.total).toBe(7); expect(page.totalPages).toBe(2);
    expect(page.items.slice(0, 2).map((item) => item.assignmentStudentId)).toEqual(["done-0", "done-1"]);
    expect(page.items.every((item) => item.displayStatus === "done" && !("attempts" in item))).toBe(true);
  });

  it("clamps pages and sorts invalid completion timestamps deterministically", async () => {
    rows = [row("b", "completed", null, "invalid"), row("a", "completed", null, "invalid")];
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    expect((await listStudentAssignmentPage("student-1", { tab: "past", page: -3 })).page).toBe(1);
    const high = await listStudentAssignmentPage("student-1", { tab: "past", page: 99, pageSize: 1 });
    expect(high.page).toBe(2); expect(high.items[0].assignmentStudentId).toBe("b");
  });
});
