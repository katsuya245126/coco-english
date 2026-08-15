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
  completedAt: "2026-07-14T00:00:00.000Z",
  conversationMode: false,
  characterId: "default-buddy",
  finalCocoLine: null,
  turns: [{
    id: "turn-1",
    turnOrder: 1,
    targetPattern: "I like ___.",
    cocoPrompt: "What do you like?",
    transcript: "I like apples.",
    audio: { id: "clip-repeat", playback: "available" as const },
    pronunciation: {
      starBand: 2 as const,
      words: [{ word: "apples", label: "Mispronounced" }],
    },
    original: { transcript: "I apples.", audio: null, pronunciation: null },
    improvedSentence: null,
    repeat: {
      transcript: "I like apples.",
      audio: { id: "clip-repeat", playback: "available" as const },
      pronunciation: {
        starBand: 2 as const,
        words: [{ word: "apples", label: "Mispronounced" }],
      },
    },
    reviewState: "repeat_accepted" as const,
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readStudentUnlock.mockResolvedValue({ studentId: "student-1", displayName: "Minji" });
});

describe("StudentHistoryPage recap selection", () => {
  it("keeps selected preset evidence and pronunciation beside the turn pattern", async () => {
    mocks.getCompletedMissionRecap.mockResolvedValue(baseRecap);

    const page = await StudentHistoryPage({
      params: Promise.resolve({ assignmentStudentId: "assignment-student-1" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Expected pattern: I like ___.");
    expect(html).toContain("★★ Pronunciation");
    expect(html).toContain("Words to practice: apples");
    expect(html).toContain("I like apples.");
    expect(html).not.toContain("I apples.");
    expect(html).not.toContain("Practice:");
  });

  it.each([
    ["complete conversation", { conversationMode: true, turns: [{ ...baseRecap.turns[0], targetPattern: null }] }],
    ["legacy", { conversationMode: false, turns: [{ ...baseRecap.turns[0], targetPattern: null }] }],
  ])("renders the real %s review without a target-pattern banner", async (_label, recapState) => {
    mocks.getCompletedMissionRecap.mockResolvedValue({ ...baseRecap, ...recapState });

    const page = await StudentHistoryPage({
      params: Promise.resolve({ assignmentStudentId: "assignment-student-1" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Look back at your conversation with Coco.");
    expect(html).not.toContain("Practice:");
    expect(html).not.toContain("Expected pattern:");
  });
});
