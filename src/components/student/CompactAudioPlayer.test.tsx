// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompactAudioPlayer } from "./CompactAudioPlayer";

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
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("CompactAudioPlayer", () => {
  it("plays, pauses, and reports progress with semantic controls", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);

    await act(async () => {
      root.render(<CompactAudioPlayer src="https://signed.test/clip.mp3" />);
    });

    const audio = container.querySelector("audio");
    const playButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play recording"]',
    );
    expect(audio?.getAttribute("src")).toBe(
      "https://signed.test/clip.mp3",
    );
    expect(playButton).not.toBeNull();
    expect(container.querySelector('input[aria-label="Recording position"]'))
      .not.toBeNull();
    if (!audio) throw new Error("Expected the audio element to render.");

    await act(async () => {
      playButton?.click();
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('button[aria-label="Pause recording"]'),
    ).not.toBeNull();

    await act(async () => {
      Object.defineProperty(audio, "duration", {
        configurable: true,
        value: 2,
      });
      Object.defineProperty(audio, "currentTime", {
        configurable: true,
        writable: true,
        value: 1,
      });
      audio?.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
      audio?.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    });
    expect(container.textContent).toContain("0:01");
    expect(container.textContent).toContain("0:02");

    const pauseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Pause recording"]',
    );
    await act(async () => pauseButton?.click());
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error when playback fails", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("Playback blocked"),
    );

    await act(async () => {
      root.render(<CompactAudioPlayer src="https://signed.test/clip.mp3" />);
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Play recording"]')
        ?.click();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[role="alert"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Playback failed");
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="Play recording"]'),
    ).not.toBeNull();
  });

  it("updates the current time when seeking", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
      () => undefined,
    );

    await act(async () => {
      root.render(<CompactAudioPlayer src="https://signed.test/clip.mp3" />);
    });

    const audio = container.querySelector("audio");
    const range = container.querySelector<HTMLInputElement>(
      'input[aria-label="Recording position"]',
    );
    if (!audio) throw new Error("Expected the audio element to render.");
    if (!range) throw new Error("Expected the range input to render.");

    await act(async () => {
      Object.defineProperty(audio, "duration", {
        configurable: true,
        value: 3,
      });
      Object.defineProperty(audio, "currentTime", {
        configurable: true,
        writable: true,
        value: 0,
      });
      audio.dispatchEvent(new Event("loadedmetadata", { bubbles: true }));
      audio.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    });

    expect(container.textContent).toContain("0:00");
    expect(container.textContent).toContain("0:03");

    await act(async () => {
      range.value = "1.5";
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(audio.currentTime).toBe(1.5);
    expect(container.textContent).toContain("0:01");
  });
});
