// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionFlowShell } from "./MissionFlowShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/student/missions/[assignmentStudentId]/actions", () => ({
  startAttemptAction: vi.fn(),
  completeMissionAction: vi.fn(),
  revealHintAction: vi.fn(),
}));

vi.mock("@/components/student/CocoSpeechAudio", () => ({
  CocoSpeechAudio: () => null,
}));

vi.mock("@/components/student/MascotStage", () => ({
  MascotStage: ({ dialogueText }: { dialogueText: string | null }) => (
    <div>{dialogueText}</div>
  ),
}));

vi.mock("@/components/student/VoiceRecorderControl", () => ({
  VoiceRecorderControl: ({
    mode,
    onRecorded,
  }: {
    mode: "original" | "repeat";
    onRecorded: (
      blob: Blob,
      metadata: { mimeType: string; durationMs: number },
    ) => void | Promise<void>;
  }) => (
    <button
      type="button"
      aria-label={mode === "original" ? "Record answer" : "Record repeat"}
      onClick={async () => {
        await onRecorded(new Blob(["voice"], { type: "audio/webm" }), {
          mimeType: "audio/webm",
          durationMs: 1200,
        });
      }}
    >
      {mode === "original" ? "Record answer" : "Record repeat"}
    </button>
  ),
}));

let container: HTMLDivElement;
let root: Root;

const turns = [
  {
    turnOrder: 1,
    prompt: "What do you like?",
    targetPattern: "I like ___.",
    targetExample: "I like soccer.",
    hintLadder: {
      tier1: "I like ___.",
      tier2: "soccer",
      tier3: "I like soccer.",
    },
    answerShape: "open" as const,
  },
];

const shellProps = {
  assignmentStudentId: "assignment-student-1",
  attemptId: "attempt-1",
  missionTitle: "Talk about favorites",
  turns,
  requiredTurns: 1,
  conversationMode: false,
  characterProfile: {
    displayName: "Coco",
    questionIntro: "Answer Coco",
    questionLabel: "Question",
    turnTransition: "Next question",
    completionHeading: "Nice work!",
    completionBody: "You finished.",
    resumeNotice: "Welcome back!",
  },
  startingTurnIndex: 0,
  initialDynamicPrompt: null,
  isResume: false,
  initialReview: null,
} as const;

type UploadResponse = {
  displayTranscript: string;
  evaluation: Record<string, unknown>;
};

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderMission(responses: Record<string, UploadResponse>) {
  const fetchMock = vi.fn(async (_url: string, init?: { body?: FormData }) => {
    const clipKind = init?.body?.get("clipKind");
    const response = responses[String(clipKind)];
    if (!response) throw new Error(`Unexpected clip kind: ${String(clipKind)}`);
    return {
      ok: true,
      json: async () => ({ ok: true, ...response }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);

  await act(async () => {
    root.render(<MissionFlowShell {...shellProps} />);
    await flush();
  });

  return fetchMock;
}

function buttonLabels() {
  return Array.from(container.querySelectorAll("button"), (button) =>
    button.textContent?.trim(),
  );
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:recording"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MissionFlowShell teacher-review feedback", () => {
  it("shows Continue mission without Record again after an original review", async () => {
    await renderMission({
      original_answer: {
        displayTranscript: "Maybe.",
        evaluation: {
          kind: "original",
          outcome: "teacher_review",
          improvedSentence: null,
        },
      },
    });

    const record = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Record answer"]',
    );
    expect(record).not.toBeNull();

    await act(async () => {
      record?.click();
      await flush();
    });

    expect(container.textContent).toContain("Your teacher will check this answer.");
    expect(buttonLabels()).toContain("Continue mission");
    expect(buttonLabels()).not.toContain("Record again");
  });

  it("shows Continue mission without Record again after a repeat review", async () => {
    await renderMission({
      original_answer: {
        displayTranscript: "I like soccer.",
        evaluation: {
          kind: "original",
          outcome: "needs_correction",
          improvedSentence: "I like playing soccer.",
        },
      },
      repeat_attempt: {
        displayTranscript: "I like playing soccer.",
        evaluation: {
          kind: "repeat",
          outcome: "teacher_review",
        },
      },
    });

    const originalRecord = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Record answer"]',
    );
    expect(originalRecord).not.toBeNull();

    await act(async () => {
      originalRecord?.click();
      await flush();
    });

    const tryAgain = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Try again",
    );
    expect(tryAgain).not.toBeUndefined();

    await act(async () => {
      tryAgain?.click();
      await flush();
    });

    const repeatRecord = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Record repeat"]',
    );
    expect(repeatRecord).not.toBeNull();

    await act(async () => {
      repeatRecord?.click();
      await flush();
    });

    expect(container.textContent).toContain("Your teacher will check this answer.");
    expect(buttonLabels()).toContain("Continue mission");
    expect(buttonLabels()).not.toContain("Record again");
  });
});
