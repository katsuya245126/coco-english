// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReprocessPronunciationAction } = vi.hoisted(() => ({
  mockReprocessPronunciationAction: vi.fn(),
}));

vi.mock("@/app/teacher/evidence/[attemptId]/actions", () => ({
  reprocessPronunciationAction: mockReprocessPronunciationAction,
}));

import { PronunciationDiagnosticPanel } from "./PronunciationDiagnosticPanel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mockReprocessPronunciationAction.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderPanel(
  pronunciationScore: Parameters<typeof PronunciationDiagnosticPanel>[0]["pronunciationScore"] = null,
  studentSaidNothing = false,
) {
  await act(async () => {
    root.render(
      <PronunciationDiagnosticPanel
        pronunciationScore={pronunciationScore}
        audioClipId="clip-1"
        attemptId="attempt-1"
        studentSaidNothing={studentSaidNothing}
      />,
    );
  });
  return container.querySelector<HTMLButtonElement>("button");
}

describe("PronunciationDiagnosticPanel", () => {
  it("uses cautious closer-to wording only when candidate evidence exists", async () => {
    await renderPanel({
      starBand: 1,
      words: [{ word: "fan", label: "Mispronounced" }],
      soundsToWorkOn: [
        {
          label: "f",
          ipa: "f",
          exampleWord: "fan",
          candidate: { label: "p", ipa: "p" },
        },
      ],
    });

    expect(container.textContent).toContain("Sounded closer to /p/");
  });

  it("does not invent a closer-to claim without candidate evidence", async () => {
    await renderPanel({
      starBand: 1,
      words: [{ word: "fan", label: "Mispronounced" }],
      soundsToWorkOn: [{ label: "f", ipa: "f", exampleWord: "fan" }],
    });

    expect(container.textContent).not.toContain("Sounded closer to");
  });

  it("announces wait-and-retry copy when re-scoring is rate limited", async () => {
    mockReprocessPronunciationAction.mockResolvedValue({
      ok: false,
      error: "rate_limited",
    });

    const button = await renderPanel();
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "You’ve made several AI requests. Wait a few minutes and try again.",
    );
  });

  it("keeps the generic retry copy for provider failures", async () => {
    mockReprocessPronunciationAction.mockResolvedValue({
      ok: false,
      error: "failed",
    });

    const button = await renderPanel();
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Re-scoring didn't work this time. Please try again in a moment.",
    );
  });

  it("does not offer pronunciation scoring for a marked no-speech clip", async () => {
    await renderPanel(null, true);

    expect(container.textContent).toContain(
      "Marked as no speech. This clip is excluded from pronunciation evidence.",
    );
    expect(container.textContent).not.toContain("Re-score pronunciation");
    expect(container.querySelector("button")).toBeNull();
  });
});
