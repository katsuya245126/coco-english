/**
 * Unit tests for listStudentAssignments display-status computation.
 *
 * Focused on the needs_retry reopen path (D-10):
 *   - needs_retry not past due → displayStatus "start" (launchable)
 *   - needs_retry past due     → displayStatus "closed" (existing isPastDue guard)
 *
 * All other status mappings are covered by integration behavior; these tests
 * cover only the cases relevant to Plan 07-03 (needs_retry gate fix).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => mockSupabase,
}));

// Minimal valid mission_snapshot matching missionSnapshotSchema (JSONB — passed as object)
const SNAPSHOT = {
  missionId: "00000000-0000-0000-0000-000000000001",
  title: "Test Mission",
  targetPattern: "I like X.",
  topic: "Daily routines",
  level: "beginner",
  requiredTurns: 1,
  characterId: "default-buddy",
  turns: [
    {
      turnOrder: 1,
      prompt: "What do you like?",
      targetExample: "I like reading.",
      hintLadder: {
        tier1: "Pattern: I like + noun.",
        tier2: "Word bank: reading, music, soccer",
        tier3: "Full example: I like reading.",
      },
    },
  ],
};

type MockRow = {
  id: string;
  status: string;
  assignments: {
    id: string;
    title: string;
    mission_snapshot: unknown;
    due_at: string | null;
  };
};

let _mockRows: MockRow[] = [];

const mockSupabase = {
  from: (_table: string) => ({
    select: (_cols?: string) => ({
      eq: (_col: string, _val: unknown) => ({
        order: (_col: string, _opts?: unknown) =>
          Promise.resolve({ data: _mockRows, error: null }),
      }),
    }),
  }),
};

function makeRow(
  status: string,
  dueAt: string | null = null,
): MockRow {
  return {
    id: `as-${status}`,
    status,
    assignments: {
      id: `a-${status}`,
      title: `Assignment ${status}`,
      mission_snapshot: SNAPSHOT,
      due_at: dueAt,
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  _mockRows = [];
});

describe("listStudentAssignments — needs_retry reopen (D-10)", () => {
  it("maps needs_retry (not past due) to displayStatus 'start'", async () => {
    // Future due date — not past due
    const future = new Date(Date.now() + 1_000_000_000).toISOString();
    _mockRows = [makeRow("needs_retry", future)];

    const { listStudentAssignments } = await import(
      "@/server/student-access/assignment-list"
    );

    const items = await listStudentAssignments("student-1");
    expect(items).toHaveLength(1);
    expect(items[0].displayStatus).toBe("start");
  });

  it("maps needs_retry with no due_at to displayStatus 'start'", async () => {
    _mockRows = [makeRow("needs_retry", null)];

    const { listStudentAssignments } = await import(
      "@/server/student-access/assignment-list"
    );

    const items = await listStudentAssignments("student-1");
    expect(items).toHaveLength(1);
    expect(items[0].displayStatus).toBe("start");
  });

  it("maps past-due needs_retry to displayStatus 'closed'", async () => {
    // Past due date
    const past = new Date(Date.now() - 1_000_000_000).toISOString();
    _mockRows = [makeRow("needs_retry", past)];

    const { listStudentAssignments } = await import(
      "@/server/student-access/assignment-list"
    );

    const items = await listStudentAssignments("student-1");
    expect(items).toHaveLength(1);
    expect(items[0].displayStatus).toBe("closed");
  });

  it("maps missed to displayStatus 'closed' (not affected by needs_retry change)", async () => {
    _mockRows = [makeRow("missed", null)];

    const { listStudentAssignments } = await import(
      "@/server/student-access/assignment-list"
    );

    const items = await listStudentAssignments("student-1");
    expect(items).toHaveLength(1);
    expect(items[0].displayStatus).toBe("closed");
  });

  it("maps teacher_review to displayStatus 'closed'", async () => {
    _mockRows = [makeRow("teacher_review", null)];

    const { listStudentAssignments } = await import(
      "@/server/student-access/assignment-list"
    );

    const items = await listStudentAssignments("student-1");
    expect(items).toHaveLength(1);
    expect(items[0].displayStatus).toBe("closed");
  });
});
