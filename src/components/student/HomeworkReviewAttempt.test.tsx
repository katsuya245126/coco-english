// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

    const listen = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Listen to this recording"]',
    );

    await act(async () => {
      listen?.click();
      await Promise.resolve();
    });

    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);
    expect(loadHistoryAudioActionMock).toHaveBeenCalledWith("clip-original");
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

  it("keeps loading and failure feedback tied to the exact attempt", async () => {
    let resolveAction: ((value: { ok: false }) => void) | null = null;
    loadHistoryAudioActionMock.mockImplementation(
      () =>
        new Promise<{ ok: false }>((resolve) => {
          resolveAction = resolve;
        }),
    );

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

    expect(container.querySelectorAll('button[aria-label="Loading recording"]'))
      .toHaveLength(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => {
      resolveAction?.({ ok: false });
      await Promise.resolve();
    });

    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Recording unavailable",
    );
    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);
    expect(loadHistoryAudioActionMock).toHaveBeenCalledWith("clip-repeat");
  });

  it("keeps expired and unavailable recordings non-interactive", async () => {
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
    expect(container.textContent).toContain("Transcript for clip-original");
    expect(container.textContent).toContain("Transcript for clip-repeat");
  });

  it("defines accessible bubble and button CSS rules", () => {
    const cssPath = resolve(
      process.cwd(),
      "src/components/student/HomeworkReviewAttempt.module.css",
    );
    const css = readFileSync(cssPath, "utf8");

    expect(css).toMatch(/\.attempt/);
    expect(css).toMatch(/\.audioButton/);
    expect(css).toMatch(/min-width:\s*44px/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
