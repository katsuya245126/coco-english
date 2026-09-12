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

function feedbackAudio(playbackKey: number) {
  return (
    <CocoSpeechAudio
      assignmentStudentId="assignment-student-1"
      line={{
        lineKind: "coco_feedback",
        turnOrder: 1,
        feedbackVariant: "pronunciation_target_weak",
      }}
      playbackKey={playbackKey}
    />
  );
}

async function renderFeedbackAudio(playbackKey: number) {
  await act(async () => {
    root.render(feedbackAudio(playbackKey));
    await Promise.resolve();
    await Promise.resolve();
  });

  const audio = container.querySelector("audio");
  if (!audio) throw new Error("Expected signed Coco feedback audio to render.");
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

  it("replays a new identical feedback occurrence without fetching again", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const audio = await renderFeedbackAudio(1);

    await act(async () => {
      audio.dispatchEvent(new Event("canplay", { bubbles: true }));
    });
    audio.currentTime = 3;

    await renderFeedbackAudio(2);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(0);
  });

  it("replays only the latest occurrence after playback becomes ready", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);

    await act(async () => {
      root.render(feedbackAudio(1));
    });
    await act(async () => {
      root.render(feedbackAudio(2));
    });

    resolveFetch(
      new Response(
        JSON.stringify({ ok: true, audioUrl: "https://signed.test/coco.mp3" }),
        { status: 200 },
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const audio = container.querySelector("audio");
    if (!audio) throw new Error("Expected signed Coco feedback audio to render.");
    await act(async () => {
      root.render(feedbackAudio(3));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    await act(async () => {
      audio.dispatchEvent(new Event("canplay", { bubbles: true }));
    });

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("resets and plays the loaded audio on every manual speaker click", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const audio = await renderLoadedAudio();

    await act(async () => {
      audio.dispatchEvent(new Event("canplay", { bubbles: true }));
    });
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Coco"]',
    );
    expect(button?.disabled).toBe(false);

    audio.currentTime = 3;
    await act(async () => {
      button?.click();
    });
    expect(audio.currentTime).toBe(0);

    audio.currentTime = 3;
    await act(async () => {
      button?.click();
    });
    expect(audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(3);
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

  it("shows wait-and-retry copy instead of an outage message when rate limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

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

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe(
      "Please wait a few minutes, then try Coco’s voice again.",
    );
    expect(container.textContent).not.toContain("Voice unavailable");
  });

  it("shows the wait-and-retry message and a working retry in the dialogue tab", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <CocoSpeechAudio
          assignmentStudentId="assignment-student-1"
          line={{ lineKind: "mission_prompt", turnOrder: 1 }}
          presentation="dialogue-tab"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // The dialogue tab suppresses the generic outage text, but a budget denial
    // must still be visible and recoverable without reloading the mission.
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Please wait a few minutes, then try Coco’s voice again.",
    );
    expect(container.textContent).not.toContain("Voice unavailable");

    const retry = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Try Coco’s voice again"]',
    );
    expect(retry).not.toBeNull();
    expect(retry?.disabled).toBe(false);

    await act(async () => {
      retry?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
