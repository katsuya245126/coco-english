import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readStudentUnlock: vi.fn(),
  getCompletedMissionRecap: vi.fn(),
}));

vi.mock("@/app/join/actions", () => ({ readStudentUnlock: mocks.readStudentUnlock }));
vi.mock("@/server/student-access/student-history", () => ({
  getCompletedMissionRecap: mocks.getCompletedMissionRecap,
}));

import StudentHistoryPage from "./page";

const baseRecap = {
  assignmentStudentId: "assignment-student-1",
  title: "Weekend plans",
  targetPattern: "I am going to..." as string | null,
  completedAt: "2026-07-14T00:00:00.000Z",
  conversationMode: false,
  characterId: "default-buddy",
  finalCocoLine: null,
  turns: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readStudentUnlock.mockResolvedValue({ studentId: "student-1", displayName: "Minji" });
});

describe("StudentHistoryPage recap selection", () => {
  it("keeps the complete preset recap and its target pattern", async () => {
    mocks.getCompletedMissionRecap.mockResolvedValue(baseRecap);

    const page = await StudentHistoryPage({
      params: Promise.resolve({ assignmentStudentId: "assignment-student-1" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Practice: “I am going to...”");
    expect(html).not.toContain("Look back at your conversation with Coco.");
  });

  it.each([
    ["complete conversation", { targetPattern: "I am going to...", conversationMode: true }],
    ["legacy", { targetPattern: null, conversationMode: false }],
  ])("renders the real %s review without a target-pattern banner", async (_label, recapState) => {
    mocks.getCompletedMissionRecap.mockResolvedValue({ ...baseRecap, ...recapState });

    const page = await StudentHistoryPage({
      params: Promise.resolve({ assignmentStudentId: "assignment-student-1" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Look back at your conversation with Coco.");
    expect(html).not.toContain("Practice:");
  });
});
