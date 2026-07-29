// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CocoSpeechAudio } from "./CocoSpeechAudio";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          audioUrl: "https://signed.test/coco.mp3",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderLoadedAudio() {
  await act(async () => {
    root.render(
      <CocoSpeechAudio
        assignmentStudentId="assignment-student-1"
        line={{ lineKind: "mission_prompt", turnOrder: 1 }}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  const audio = container.querySelector("audio");
  if (!audio) throw new Error("Expected signed Coco audio to render.");
  return audio;
}

describe("CocoSpeechAudio", () => {
  it("keeps replay available when opportunistic autoplay is rejected", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValue(new Error("Autoplay blocked"));
    const audio = await renderLoadedAudio();

    await act(async () => {
      audio.dispatchEvent(new Event("canplay", { bubbles: true }));
      await Promise.resolve();
    });

    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Coco"]',
    );
    expect(play).toHaveBeenCalledTimes(1);
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute("aria-busy")).toBe("false");
    expect(container.textContent).not.toContain("Voice unavailable");
  });

  it("degrades to a visible status when audio playback fails", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const audio = await renderLoadedAudio();

    await act(async () => {
      audio.dispatchEvent(new Event("error", { bubbles: true }));
    });

    const status = container.querySelector('[role="status"]');
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Coco"]',
    );
    expect(status?.textContent).toBe("Voice unavailable");
    expect(button?.disabled).toBe(true);
  });
});
