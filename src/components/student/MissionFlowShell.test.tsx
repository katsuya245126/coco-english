// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissionFlowShell, type MissionFlowShellProps } from "./MissionFlowShell";
import { completeMissionAction } from "@/app/student/missions/[assignmentStudentId]/actions";

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
  MascotStage: ({
    dialogueText,
    picture,
    onPictureReady,
  }: {
    dialogueText: string | null;
    picture?: { src: string; alt: string } | null;
    onPictureReady?: (ready: boolean) => void;
  }) => (
    <div>
      {dialogueText}
      {picture ? (
        <>
          <button
            type="button"
            data-picture-src={picture.src}
            data-picture-alt={picture.alt}
            onClick={() => onPictureReady?.(true)}
          >
            Load picture
          </button>
          <button
            type="button"
            aria-label="Retry picture"
            data-picture-retry="true"
            onClick={() => onPictureReady?.(false)}
          >
            Retry
          </button>
        </>
      ) : null}
    </div>
  ),
}));

  vi.mock("@/components/student/VoiceRecorderControl", () => ({
  VoiceRecorderControl: ({
    mode,
    onRecorded,
    disabled = false,
  }: {
    mode: "original" | "repeat";
    disabled?: boolean;
    onRecorded: (
      blob: Blob,
      metadata: { mimeType: string; durationMs: number },
    ) => void | Promise<void>;
  }) => (
    <button
      type="button"
      aria-label={mode === "original" ? "Record answer" : "Record repeat"}
      disabled={disabled}
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

const pictureTurns = [
  {
    ...turns[0],
    picture: {
      objectKey: "teachers/teacher-1/11111111-1111-4111-8111-111111111111.jpg",
      description: "An orange ball under a blue chair.",
    },
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

async function renderMission(
  responses: Record<string, UploadResponse>,
  props: MissionFlowShellProps = shellProps,
) {
  const uploadBodies: FormData[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: { body?: FormData }) => {
    if (!init?.body) throw new Error("Expected upload FormData");
    uploadBodies.push(init.body);
    const clipKind = init.body.get("clipKind");
    const response = responses[String(clipKind)];
    if (!response) throw new Error(`Unexpected clip kind: ${String(clipKind)}`);
    return {
      ok: true,
      json: async () => ({ ok: true, ...response }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);

  await act(async () => {
    root.render(<MissionFlowShell {...props} />);
    await flush();
  });

  return uploadBodies;
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
  it("keeps recording disabled until the active picture reports loaded", async () => {
    await renderMission(
      { original_answer: { displayTranscript: "I see a ball.", evaluation: {} } },
      { ...shellProps, turns: pictureTurns },
    );

    const record = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Record answer"]',
    );
    expect(record?.disabled).toBe(true);
    expect(
      container
        .querySelector<HTMLButtonElement>("[data-picture-src]")
        ?.getAttribute("data-picture-src"),
    ).toBe("/student/missions/assignment-student-1/picture/1");
    expect(container.querySelector("[data-picture-alt]")?.getAttribute("data-picture-alt"))
      .toBe("An orange ball under a blue chair.");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-picture-src]")?.click();
      await flush();
    });

    expect(record?.disabled).toBe(false);
  });

  it("blocks recording again when the picture stage requests a retry", async () => {
    await renderMission(
      { original_answer: { displayTranscript: "I see a ball.", evaluation: {} } },
      { ...shellProps, turns: pictureTurns },
    );

    const picture = container.querySelector<HTMLButtonElement>("[data-picture-src]");
    expect(picture?.getAttribute("data-picture-src")).toBe(
      "/student/missions/assignment-student-1/picture/1",
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-picture-retry]")?.click();
      await flush();
    });

    expect(container.querySelector<HTMLButtonElement>(
      'button[aria-label="Record answer"]',
    )?.disabled).toBe(true);
  });

  it("blocks a resumed correction recorder until its picture loads", async () => {
    await renderMission({}, {
      ...shellProps,
      turns: pictureTurns,
      initialReview: {
        step: "aiFeedback",
        outcome: "needsCorrection",
        transcript: "I like soccer.",
        improvedSentence: "I like playing soccer.",
        clipKind: "original_answer",
        cocoLine: null,
      },
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Try again")?.click();
      await flush();
    });
    const recorder = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Record repeat"]',
    );
    expect(recorder).not.toBeNull();
    expect(recorder?.disabled).toBe(true);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-picture-src]")?.click();
      await flush();
    });
    expect(recorder?.disabled).toBe(false);
  });

  it("keeps the picture through feedback and removes it on the next text turn", async () => {
    await renderMission({
      original_answer: {
        displayTranscript: "I like soccer.",
        evaluation: { kind: "original", outcome: "accepted_original" },
      },
    }, {
      ...shellProps,
      turns: [...pictureTurns, { ...turns[0], turnOrder: 2 }],
      requiredTurns: 2,
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-picture-src]")?.click();
      await flush();
      container.querySelector<HTMLButtonElement>('button[aria-label="Record answer"]')?.click();
      await flush();
    });
    expect(container.textContent).toContain("Nice answer!");
    expect(container.querySelector("[data-picture-src]")).not.toBeNull();
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Continue practice")?.click();
      await flush();
    });
    const nextTurn = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Next turn");
    if (nextTurn) {
      await act(async () => { nextTurn.click(); await flush(); });
    }
    expect(container.querySelector("[data-picture-src]")).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Record answer"]')?.disabled).toBe(false);
  });

  it("shows Continue mission without Record again after an original review", async () => {
    const uploadBodies = await renderMission({
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
    expect(uploadBodies).toHaveLength(1);
    expect(uploadBodies[0]?.has("status")).toBe(false);
  });

  it("renders a resumed Conversation follow-up and submits its current turn", async () => {
    const uploadBodies = await renderMission(
      {
        original_answer: {
          displayTranscript: "I play soccer.",
          evaluation: {
            kind: "original",
            outcome: "accepted_original",
          },
        },
      },
      {
        ...shellProps,
        turns,
        requiredTurns: 3,
        conversationMode: true,
        startingTurnIndex: 1,
        initialDynamicPrompt: {
          text: "Who do you play with?",
          sourceTurnOrder: 1,
        },
        isResume: true,
      },
    );

    expect(container.textContent).toContain("Who do you play with?");

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Record answer"]')
        ?.click();
      await flush();
    });

    expect(uploadBodies).toHaveLength(1);
    expect(uploadBodies[0]?.get("turnOrder")).toBe("2");
  });

  it("completes a final original review before showing review pending", async () => {
    const completion = vi.mocked(completeMissionAction);
    const calls: string[] = [];
    completion.mockImplementationOnce(async () => {
      calls.push("complete");
      return { ok: true };
    });

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

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Record answer"]')
        ?.click();
      await flush();
    });

    const continueMission = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Continue mission",
    );
    expect(continueMission).not.toBeUndefined();

    await act(async () => {
      continueMission?.click();
      await flush();
    });

    expect(completion).toHaveBeenCalledWith({
      assignmentStudentId: "assignment-student-1",
      attemptId: "attempt-1",
    });
    expect(calls).toEqual(["complete"]);
    expect(container.textContent).toContain("Teacher review sent");
  });

  it("applies the completion state only after the completion action succeeds", async () => {
    const completion = vi.mocked(completeMissionAction);
    completion.mockReset();

    let resolveCompletion!: (result: { ok: true }) => void;
    const pendingCompletion = new Promise<{ ok: true }>((resolve) => {
      resolveCompletion = resolve;
    });
    completion.mockReturnValueOnce(pendingCompletion);

    await renderMission({
      original_answer: {
        displayTranscript: "I like soccer.",
        evaluation: {
          kind: "original",
          outcome: "accepted_original",
        },
      },
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Record answer"]')
        ?.click();
      await flush();
    });

    const continuePractice = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Continue practice",
    );
    expect(continuePractice).not.toBeUndefined();

    await act(async () => {
      continuePractice?.click();
      await flush();
    });

    expect(completion).toHaveBeenCalledWith({
      assignmentStudentId: "assignment-student-1",
      attemptId: "attempt-1",
    });
    expect(container.textContent).toContain("Nice answer!");
    expect(container.textContent).not.toContain("You finished.");
    expect(buttonLabels()).toContain("Continue practice");

    await act(async () => {
      resolveCompletion({ ok: true });
      await flush();
    });

    expect(container.textContent).toContain("You finished.");
    expect(buttonLabels()).toContain("Back to homework");
  });

  it("shows Continue mission without Record again after a repeat review", async () => {
    const uploadBodies = await renderMission({
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
    expect(uploadBodies).toHaveLength(2);
    for (const uploadBody of uploadBodies) {
      expect(uploadBody.has("status")).toBe(false);
    }
  });

  it("discards an older upload result after a newer recording starts", async () => {
    const pendingResponses: Array<(response: unknown) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            pendingResponses.push(resolve);
          }),
      ),
    );

    await act(async () => {
      root.render(<MissionFlowShell {...shellProps} />);
      await flush();
    });

    const record = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Record answer"]',
    );
    expect(record).not.toBeNull();

    await act(async () => {
      record?.click();
      record?.click();
      await flush();
    });
    expect(pendingResponses).toHaveLength(2);

    await act(async () => {
      pendingResponses[1]?.({
        ok: true,
        json: async () => ({
          ok: true,
          displayTranscript: "New answer.",
          evaluation: {
            kind: "original",
            outcome: "accepted_original",
          },
        }),
      });
      await flush();
    });
    expect(container.textContent).toContain("Nice answer!");

    await act(async () => {
      pendingResponses[0]?.({
        ok: true,
        json: async () => ({
          ok: true,
          displayTranscript: "Old answer.",
          evaluation: {
            kind: "original",
            outcome: "retry_original",
          },
        }),
      });
      await flush();
    });
    expect(container.textContent).toContain("Nice answer!");
    expect(container.textContent).not.toContain("Try again.");
  });
});
