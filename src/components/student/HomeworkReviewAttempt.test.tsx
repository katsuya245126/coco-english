// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentRecapAttempt } from "@/server/student-access/student-history";
import { HomeworkReviewAttempt } from "./HomeworkReviewAttempt";

const loadHistoryAudioActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/student/history/[assignmentStudentId]/actions", () => ({
  loadHistoryAudioAction: loadHistoryAudioActionMock,
}));

let container: HTMLDivElement;
let root: Root;

function availableAttempt(id: string): StudentRecapAttempt {
  return {
    transcript: `Transcript for ${id}`,
    audio: { id, playback: "available" },
    pronunciation: { starBand: 3, words: [] },
  };
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
  loadHistoryAudioActionMock.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("HomeworkReviewAttempt", () => {
  it("shows and announces which recording is being prepared while loading", async () => {
    let resolveLoad:
      | ((value: { ok: true; signedUrl: string }) => void)
      | undefined;
    loadHistoryAudioActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );

    await act(async () => {
      root.render(
        <HomeworkReviewAttempt attempt={availableAttempt("clip-pending")} />,
      );
    });

    const listen = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Listen to this recording"]',
    );

    await act(async () => {
      listen?.click();
      await Promise.resolve();
    });

    const preparingButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Preparing this recording"]',
    );
    const status = container.querySelector('[role="status"][aria-live="polite"]');

    expect(preparingButton?.disabled).toBe(true);
    expect(status?.textContent).toBe("Preparing recording…");
    expect(container.textContent).toContain("Transcript for clip-pending");

    preparingButton?.click();
    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLoad?.({
        ok: true,
        signedUrl: "https://signed.test/pending.mp3",
      });
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.test/pending.mp3",
    );
  });

  it("loads its exact clip once, then collapses and reopens the cached player", async () => {
    loadHistoryAudioActionMock.mockResolvedValue({
      ok: true,
      signedUrl: "https://signed.test/original.mp3",
    });

    await act(async () => {
      root.render(
        <HomeworkReviewAttempt attempt={availableAttempt("clip-original")} />,
      );
    });

    expect(container.textContent).toContain("Transcript for clip-original");
    expect(container.textContent).not.toContain("Pronunciation");
    expect(container.querySelector("audio")).toBeNull();

    const bubble = container.querySelector("div");
    const transcript = bubble?.querySelector("p");
    const listen = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Listen to this recording"]',
    );
    const listenIcon = listen?.querySelector("svg");

    expect(bubble).not.toBeNull();
    expect(transcript?.textContent).toBe("Transcript for clip-original");
    expect(listen).not.toBeNull();
    expect(listenIcon).not.toBeNull();
    expect(bubble?.contains(listen ?? null)).toBe(true);

    await act(async () => {
      listen?.click();
      await Promise.resolve();
    });

    expect(loadHistoryAudioActionMock).toHaveBeenCalledWith("clip-original");
    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.test/original.mp3",
    );

    const hide = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide this recording"]',
    );

    await act(async () => {
      hide?.click();
    });

    expect(container.querySelector("audio")).toBeNull();

    const reopen = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Listen to this recording"]',
    );

    await act(async () => {
      reopen?.click();
    });

    expect(container.querySelector("audio")).not.toBeNull();
    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);
  });

  it("shows an inline alert and clears loading when the signed url request rejects", async () => {
    loadHistoryAudioActionMock.mockRejectedValue(new Error("network failed"));

    await act(async () => {
      root.render(
        <HomeworkReviewAttempt attempt={availableAttempt("clip-failed")} />,
      );
    });

    const listen = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Listen to this recording"]',
    );

    await act(async () => {
      listen?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Recording unavailable",
    );
    expect(container.querySelector("audio")).toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Listen to this recording"]',
      )?.disabled,
    ).toBe(false);
  });

  it("does not reuse old audio state after rerendering with a different attempt clip", async () => {
    loadHistoryAudioActionMock
      .mockResolvedValueOnce({
        ok: true,
        signedUrl: "https://signed.test/original.mp3",
      })
      .mockResolvedValueOnce({
        ok: true,
        signedUrl: "https://signed.test/replaced.mp3",
      });

    await act(async () => {
      root.render(
        <HomeworkReviewAttempt attempt={availableAttempt("clip-original")} />,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Listen to this recording"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.test/original.mp3",
    );

    await act(async () => {
      root.render(
        <HomeworkReviewAttempt attempt={availableAttempt("clip-replaced")} />,
      );
    });

    expect(container.textContent).toContain("Transcript for clip-replaced");
    expect(container.querySelector("audio")).toBeNull();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Listen to this recording"]',
        )
        ?.click();
      await Promise.resolve();
    });

    expect(loadHistoryAudioActionMock).toHaveBeenNthCalledWith(2, "clip-replaced");
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.test/replaced.mp3",
    );
  });

  it("keeps expired and unavailable states non-interactive", async () => {
    const expiredAttempt: StudentRecapAttempt = {
      transcript: "Expired transcript",
      audio: { id: "clip-expired", playback: "expired" },
      pronunciation: null,
    };

    await act(async () => {
      root.render(
        <>
          <HomeworkReviewAttempt attempt={expiredAttempt} />
          <HomeworkReviewAttempt
            attempt={{
              transcript: "Unavailable transcript",
              audio: { id: "clip-unavailable", playback: "unavailable" },
              pronunciation: null,
            }}
          />
        </>,
      );
    });

    expect(container.textContent).toContain("Recording expired");
    expect(container.textContent).toContain("Recording unavailable");
    expect(container.querySelector("button")).toBeNull();
  });

  it("keeps original and repeat clip requests isolated", async () => {
    loadHistoryAudioActionMock.mockResolvedValue({
      ok: true,
      signedUrl: "https://signed.test/repeat.mp3",
    });

    await act(async () => {
      root.render(
        <>
          <HomeworkReviewAttempt attempt={availableAttempt("clip-original")} />
          <HomeworkReviewAttempt attempt={availableAttempt("clip-repeat")} />
        </>,
      );
    });

    const listenButtons = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Listen to this recording"]',
    );

    await act(async () => {
      listenButtons[1]?.click();
      await Promise.resolve();
    });

    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);
    expect(loadHistoryAudioActionMock).toHaveBeenCalledWith("clip-repeat");
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.test/repeat.mp3",
    );
  });
});
