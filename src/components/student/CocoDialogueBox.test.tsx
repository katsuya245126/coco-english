// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CocoDialogueBox } from "./CocoDialogueBox";

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

describe("CocoDialogueBox", () => {
  it("toggles the translation hint layer off without refetching the cached hint", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          phrases: [{ source: "games", translation: "게임" }],
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <CocoDialogueBox
          assignmentStudentId="as-1"
          displayName="Coco"
          dialogueText="What games do you play after school?"
          translationLine={{ lineKind: "mission_prompt", turnOrder: 1 }}
        />,
      );
    });

    const hintButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hint"]',
    );
    expect(hintButton).not.toBeNull();

    await act(async () => {
      hintButton?.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("게임");
    expect(container.querySelector('button[aria-expanded="true"]')?.textContent)
      .toBe("games");

    await act(async () => {
      hintButton?.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('button[aria-expanded]')).toBeNull();
    expect(container.textContent).toContain(
      "What games do you play after school?",
    );

    await act(async () => {
      hintButton?.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("게임");
    expect(container.querySelector('button[aria-expanded="true"]')?.textContent)
      .toBe("games");
  });

  it("shows wait-and-retry copy when the hint is rate limited, and retries on the next click", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <CocoDialogueBox
          assignmentStudentId="as-1"
          displayName="Coco"
          dialogueText="What games do you play after school?"
          translationLine={{ lineKind: "mission_prompt", turnOrder: 1 }}
        />,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Hint"]')
        ?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Please wait a few minutes, then retry the hint.",
    );
    expect(container.textContent).toContain("Wait, then retry hint");

    const retryButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Wait, then retry hint"]',
    );
    expect(retryButton).not.toBeNull();

    await act(async () => {
      retryButton?.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
