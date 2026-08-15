// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentMissionRecap as Recap } from "@/server/student-access/student-history";
import { StudentMissionRecap } from "./StudentMissionRecap";

vi.mock("./StudentHistoryAudioPlayer", () => ({
  StudentHistoryAudioPlayer: () => <div data-testid="audio-player" />,
}));

let container: HTMLDivElement;
let root: Root;

function recapWith(transcript: string | null): Recap {
  return {
    assignmentStudentId: "assignment-student-1",
    title: "Weekend plans",
    completedAt: "2026-07-29T00:00:00.000Z",
    conversationMode: false,
    characterId: "default-buddy",
    finalCocoLine: null,
    turns: [
      {
        id: "turn-1",
        turnOrder: 1,
        targetPattern: "I like _____.",
        cocoPrompt: "Which ice cream is best?",
        transcript,
        audio: { id: "clip-1", playback: "available" },
        pronunciation: { starBand: 2, words: [] },
        original: { transcript, audio: null, pronunciation: null },
        improvedSentence: null,
        repeat: null,
        reviewState: "accepted",
      },
    ],
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("StudentMissionRecap", () => {
  it("shows the turn pattern and selected preset evidence", () => {
    act(() => {
      root.render(<StudentMissionRecap recap={recapWith("I like vanilla.")} />);
    });

    expect(container.textContent).toContain("Expected pattern: I like _____.");
    expect(container.textContent).toContain("You said");
    expect(container.textContent).toContain("I like vanilla.");
    expect(container.textContent).toContain("★★ Pronunciation");
    expect(container.textContent).toContain("Great job!");
  });

  it("hides the You said label when the transcript is withheld, keeping audio", () => {
    act(() => {
      root.render(<StudentMissionRecap recap={recapWith(null)} />);
    });

    expect(container.textContent).not.toContain("You said");
    expect(
      container.querySelector("[data-testid='audio-player']"),
    ).not.toBeNull();
  });
});
