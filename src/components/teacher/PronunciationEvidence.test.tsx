// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttemptEvidence } from "@/server/teacher/audio-evidence";
import type { PronunciationTryEvidence } from "@/server/teacher/pronunciation-evidence";

vi.mock("@/components/teacher/AudioClipPlayer", () => ({
  AudioClipPlayer: ({
    audioClipId,
    label,
  }: {
    audioClipId: string;
    label: string;
  }) => (
    <audio
      aria-label={label}
      controls
      data-audio-clip-id={audioClipId}
      data-testid="audio-player"
    />
  ),
}));

import { PronunciationEvidence } from "./PronunciationEvidence";

const makeTry = (
  overrides: Partial<PronunciationTryEvidence> = {},
): PronunciationTryEvidence => ({
  id: "try-1",
  audioClipId: "clip-1",
  tryNumber: 1,
  transcript: "sent",
  outcome: "target_weak",
  wordAccuracy: 80,
  starBand: 2,
  fullWordPassed: false,
  targetSoundAccuracy: 60,
  targetSoundPassed: false,
  processingStatus: "ready",
  pronunciationScore: { starBand: 2 },
  createdAt: "2026-09-13T00:00:00.000Z",
  ...overrides,
});

function makeEvidence(
  firstTry: PronunciationTryEvidence | null,
  resultTry: PronunciationTryEvidence | null,
): AttemptEvidence {
  const tries = [firstTry, resultTry].filter(
    (tryRow, index, rows): tryRow is PronunciationTryEvidence =>
      tryRow !== null &&
      rows.findIndex((row) => row?.audioClipId === tryRow.audioClipId) ===
        index,
  );

  return {
    assignmentKind: "pronunciation",
    attemptId: "attempt-1",
    assignmentStudentId: "assignment-student-1",
    assignmentId: "assignment-1",
    classId: "class-1",
    className: "Class 1",
    missionTitle: "Pronunciation practice",
    studentName: "Mina",
    attemptStatus: "completed",
    assignmentStudentStatus: "completed",
    dismissedAt: null,
    submittedAt: "2026-09-13T00:00:00.000Z",
    completedAt: "2026-09-13T00:00:00.000Z",
    reviewReason: null,
    attemptCount: 1,
    highestHintLevel: 0,
    conversationMode: false,
    turns: [],
    pronunciationWords: [
      {
        order: 1,
        word: "sent",
        attemptCount: tries.length,
        tries,
        firstTry,
        resultTry,
      },
    ],
  };
}

let container: HTMLDivElement;
let root: Root;

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
  vi.restoreAllMocks();
});

async function renderEvidence(evidence: AttemptEvidence) {
  await act(async () => {
    root.render(<PronunciationEvidence evidence={evidence} />);
  });
}

function exactTextCount(text: string) {
  return [...container.querySelectorAll("p, span")].filter(
    (element) => element.textContent === text,
  ).length;
}

describe("PronunciationEvidence", () => {
  it("renders one summary and player when first and result tries share a recording", async () => {
    const onlyTry = makeTry({ id: "only-try", audioClipId: "shared-clip" });
    await renderEvidence(
      makeEvidence(onlyTry, { ...onlyTry, id: "same-recording-result" }),
    );

    expect(container.textContent).toContain("1 try");
    expect(exactTextCount("First try")).toBe(1);
    expect(exactTextCount("Result try")).toBe(0);
    expect(
      container.querySelectorAll('[data-testid="audio-player"]'),
    ).toHaveLength(1);
    expect(container.textContent).toContain("Automatic transcript");
    expect(container.textContent).toContain("sent");
  });

  it("keeps distinct first and result recordings separately labelled and playable", async () => {
    await renderEvidence(
      makeEvidence(
        makeTry({ id: "first-try", audioClipId: "first-clip" }),
        makeTry({
          id: "result-try",
          audioClipId: "result-clip",
          tryNumber: 3,
          outcome: "passed",
          transcript: "sent",
        }),
      ),
    );

    expect(exactTextCount("First try")).toBe(1);
    expect(exactTextCount("Result try")).toBe(1);
    expect(
      container.querySelectorAll('[data-testid="audio-player"]'),
    ).toHaveLength(2);
    expect(
      [...container.querySelectorAll("[data-testid=audio-player]")].map(
        (player) => player.getAttribute("data-audio-clip-id"),
      ),
    ).toEqual(["first-clip", "result-clip"]);
    expect(container.textContent?.match(/Automatic transcript/g)).toHaveLength(
      2,
    );
  });

  it.each(["센트", "ᄀ"])(
    "warns for Hangul transcript %s without changing the text",
    async (transcript) => {
      await renderEvidence(makeEvidence(makeTry({ transcript }), null));

      expect(container.textContent).toContain("Automatic transcript");
      expect(container.textContent).toContain(transcript);
      expect(container.textContent).toContain(
        "Speech recognition may have misheard English.",
      );
    },
  );
});
