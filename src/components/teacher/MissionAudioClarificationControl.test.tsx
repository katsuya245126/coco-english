// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockClarifyMissionAudioAction, mockRefresh } = vi.hoisted(() => ({
  mockClarifyMissionAudioAction: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("@/app/teacher/evidence/[attemptId]/actions", () => ({
  clarifyMissionAudioAction: mockClarifyMissionAudioAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { MissionAudioClarificationControl } from "./MissionAudioClarificationControl";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mockClarifyMissionAudioAction.mockReset();
  mockRefresh.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderControl(
  overrides: Partial<React.ComponentProps<typeof MissionAudioClarificationControl>> = {},
) {
  await act(async () => {
    root.render(
      <MissionAudioClarificationControl
        audioClipId="clip-1"
        attemptId="attempt-1"
        automaticTranscript="I wake up at seven."
        teacherConfirmedText={null}
        teacherConfirmedAt={null}
        clarificationAvailable
        {...overrides}
      />,
    );
  });
}

describe("MissionAudioClarificationControl", () => {
  it("starts from the automatic transcript and saves trimmed wording", async () => {
    mockClarifyMissionAudioAction.mockResolvedValue({ ok: true });
    await renderControl();

    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea?.value).toBe("I wake up at seven.");
    expect(container.textContent).toContain(
      "What was the student trying to say?",
    );

    await act(async () => {
      if (textarea) {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        setValue?.call(textarea, "  I wake up at eight.  ");
      }
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });

    expect(mockClarifyMissionAudioAction).toHaveBeenCalledWith({
      audioClipId: "clip-1",
      attemptId: "attempt-1",
      teacherConfirmedText: "I wake up at eight.",
    });
    expect(container.textContent).toContain("Teacher confirmation saved.");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows saved metadata and a retryable failure", async () => {
    await renderControl({
      teacherConfirmedText: "I wake up at eight.",
      teacherConfirmedAt: "2026-08-31T01:00:00.000Z",
    });

    expect(container.textContent).toContain("Confirmed by teacher");
    expect(container.textContent).toContain("2026");

    mockClarifyMissionAudioAction.mockResolvedValue({
      ok: false,
      error: "retryable",
      message: "Please try again.",
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Please try again.",
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("does not render a clarification action for unavailable audio", async () => {
    await renderControl({
      clarificationAvailable: false,
      teacherConfirmedText: null,
    });

    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
