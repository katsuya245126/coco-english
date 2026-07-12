import { beforeEach, describe, expect, it, vi } from "vitest";

let rows: ReturnType<typeof row>[] = [];
const eq = vi.fn(() => ({ order: vi.fn(async () => ({ data: rows, error: null })) }));
const select = vi.fn(() => ({ eq }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ from: vi.fn(() => ({ select })) }),
}));

const snapshot = {
  missionId: "00000000-0000-0000-0000-000000000001", title: "Mission", targetPattern: "I like X.",
  topic: "Daily routines", level: "beginner", requiredTurns: 1, characterId: "default-buddy",
  turns: [{ turnOrder: 1, prompt: "What?", targetExample: "I like it.", hintLadder: { tier1: "One", tier2: "Two", tier3: "Three" } }],
};

function row(id: string, status: string, dueAt: string | null = null, completedAt: string | null = null) {
  return { id, status, submitted_at: completedAt, latest_attempt_id: completedAt ? `attempt-${id}` : null,
    assignments: { title: id, mission_snapshot: snapshot, due_at: dueAt, canceled_at: null },
    latest_attempt: completedAt ? { completed_at: completedAt } : null };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-07-12T12:00:00Z")); rows = []; vi.clearAllMocks(); });

describe("listStudentAssignmentPage", () => {
  it("orders retry, due within exactly 24h, then later/no-date stably", async () => {
    rows = [row("later", "assigned", "2026-07-14T12:00:00Z"), row("boundary", "started", "2026-07-13T12:00:00Z"), row("soon", "assigned", "2026-07-12T13:00:00Z"), row("retry", "needs_retry")];
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    const page = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });
    expect(page.items.map((item) => item.assignmentStudentId)).toEqual(["retry", "soon", "boundary", "later"]);
    expect(eq).toHaveBeenCalledWith("student_id", "student-1");
  });

  it("keeps teacher-review and missed work Current and hides canceled work", async () => {
    const canceled = row("canceled", "assigned"); canceled.assignments.canceled_at = "2026-07-01T00:00:00Z";
    rows = [row("review", "teacher_review"), row("missed", "missed", "2026-07-01T00:00:00Z"), canceled, row("done", "completed", null, "2026-07-10T00:00:00Z")];
    const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");
    const page = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });
    expect(page.items.map((item) => [item.assignmentStudentId, item.displayStatus])).toEqual([["missed", "late"], ["review", "review"]]);
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
