// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PronunciationPracticePageState,
  PronunciationPracticeWordState,
} from "@/server/student-access/pronunciation-flow";
import { PronunciationPracticeShell } from "./PronunciationPracticeShell";

const completionState = vi.hoisted(() => ({
  result: { ok: true } as { ok: boolean; error?: string },
}));

vi.mock("./VoiceRecorderControl", () => ({
  VoiceRecorderControl: ({
    disabled,
    onRecorded,
  }: {
    disabled?: boolean;
    onRecorded: (blob: Blob, metadata: { mimeType: string; durationMs: number }) => void | Promise<void>;
  }) => (
    <button
      type="button"
      data-testid="practice-recorder"
      disabled={disabled}
      onClick={() =>
        void onRecorded(new Blob(["voice"], { type: "audio/webm" }), {
          mimeType: "audio/webm",
          durationMs: 1200,
        })
      }
    >
      Record
    </button>
  ),
}));

vi.mock("./CocoSpeechAudio", () => ({
  CocoSpeechAudio: ({ line }: { line: { feedbackVariant?: string } }) => (
    <span data-testid="feedback-audio">{line.feedbackVariant}</span>
  ),
}));

vi.mock("@/app/student/pronunciation/[assignmentStudentId]/actions", () => ({
  completePronunciationAttemptAction: vi.fn(async () => completionState.result),
}));

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let uploadResult: Record<string, unknown>;

function word(order: 1 | 2 | 3 | 4 | 5, overrides: Partial<PronunciationPracticeWordState> = {}): PronunciationPracticeWordState {
  return {
    order,
    text: `word-${order}`,
    highlightStart: 0,
    highlightLength: 1,
    source: "verified",
    pronunciation: { phones: ["S", "AE1", "T"], targetPhoneIndex: 0, cmuVariant: 1 },
    wordAudio: {
      schemaVersion: 1,
      contentHash: `hash-${order}`,
      voice: "en-US-AvaNeural",
      format: "audio-24khz-48kbitrate-mono-mp3",
    },
    validTryCount: 0,
    remainingTryCount: 3,
    passed: false,
    finished: false,
    firstTry: null,
    resultTry: null,
    ...overrides,
  };
}

function page(overrides: Partial<PronunciationPracticePageState> = {}): PronunciationPracticePageState {
  return {
    assignmentStudentId: "assignment-student-1",
    title: "S Sound Practice",
    dueAt: null,
    status: "started",
    attemptId: "attempt-1",
    soundId: "s",
    difficulty: "easy",
    soundClipVersion: "v1",
    words: [1, 2, 3, 4, 5].map((order) => word(order as 1 | 2 | 3 | 4 | 5)),
    currentWordOrder: 1,
    passedWordCount: 0,
    finishedWordCount: 0,
    completed: false,
    readOnly: false,
    isResume: false,
    ...overrides,
  };
}

async function renderShell(input: PronunciationPracticePageState) {
  await act(async () => {
    root.render(<PronunciationPracticeShell page={input} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  completionState.result = { ok: true };
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  uploadResult = {
    ok: true,
    audioClipId: "clip-1",
    tryNumber: 1,
    transcript: "word-1",
    outcome: "target_weak",
    starBand: 3,
    fullWordPassed: true,
    targetSoundAccuracy: 49,
    targetSoundPassed: false,
    feedback: "Try S again!",
  };
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/audio")) {
      return new Response(JSON.stringify(uploadResult), { status: 200 });
    }
    const order = Number(url.match(/word-audio/) ? 1 : 1);
    return new Response(JSON.stringify({ ok: true, audioUrl: `https://signed.test/word-${order}.mp3` }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PronunciationPracticeShell", () => {
  it("loads one word clip and keeps both replay controls unlimited without Skip or transcript text", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    await renderShell(page());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/word-audio");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ wordOrder: 1 }) });
    expect(container.querySelector('button[aria-label="Play sound"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Play word"]')).not.toBeNull();
    expect(play).toHaveBeenCalledTimes(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Play sound"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Play sound"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Play word"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Play word"]')?.click();
    });

    expect(play).toHaveBeenCalledTimes(5);
    expect(container.textContent).not.toContain("Skip");
    expect(container.textContent).not.toContain("transcript");
  });

  it("does not show Next word before a pass or third valid try", async () => {
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Try S again!");
    expect(container.querySelector('button[aria-label="Next word"]')).toBeNull();
    expect(container.textContent).toContain("Word 1 of 5");
  });

  it("waits for an explicit Next word click after a pass", async () => {
    uploadResult = {
      ...uploadResult,
      outcome: "passed",
      targetSoundAccuracy: 80,
      targetSoundPassed: true,
      feedback: "Good job!",
      starBand: 2,
    };
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Good job!");
    expect(container.textContent).toContain("Word 1 of 5");
    expect(container.querySelector('button[aria-label="Next word"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Next word"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Word 2 of 5");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the fifth-word feedback until an explicit Next word completes practice", async () => {
    uploadResult = {
      ...uploadResult,
      outcome: "passed",
      targetSoundAccuracy: 80,
      targetSoundPassed: true,
      feedback: "Good job!",
      starBand: 2,
    };
    const finishedWords = [1, 2, 3, 4].map((order) =>
      word(order as 1 | 2 | 3 | 4, {
        validTryCount: 1,
        remainingTryCount: 2,
        passed: true,
        finished: true,
      }),
    );
    await renderShell(page({ currentWordOrder: 5, words: [...finishedWords, word(5)] }));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const { completePronunciationAttemptAction } = await import(
      "@/app/student/pronunciation/[assignmentStudentId]/actions"
    );
    expect(container.textContent).toContain("Good job!");
    expect(container.textContent).toContain("Word 5 of 5");
    expect(container.querySelector('button[aria-label="Next word"]')).not.toBeNull();
    expect(vi.mocked(completePronunciationAttemptAction)).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Next word"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(vi.mocked(completePronunciationAttemptAction)).toHaveBeenCalledWith({
      assignmentStudentId: "assignment-student-1",
      attemptId: "attempt-1",
    });
    expect(container.textContent).toContain("Practice result");
  });

  it("keeps a failed final completion retryable with bounded feedback", async () => {
    completionState.result = { ok: false, error: "db_error" };
    uploadResult = {
      ...uploadResult,
      outcome: "passed",
      targetSoundAccuracy: 80,
      targetSoundPassed: true,
      feedback: "Good job!",
      starBand: 2,
    };
    const finishedWords = [1, 2, 3, 4].map((order) =>
      word(order as 1 | 2 | 3 | 4, {
        validTryCount: 1,
        remainingTryCount: 2,
        passed: true,
        finished: true,
      }),
    );
    await renderShell(page({ currentWordOrder: 5, words: [...finishedWords, word(5)] }));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Next word"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("We couldn't finish this practice. Try again.");
    expect(container.textContent).toContain("Word 5 of 5");
    expect(container.querySelector('button[aria-label="Next word"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Practice result");

    completionState.result = { ok: true };
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Next word"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Practice result");
  });

  it("shows three empty stars and Good try for a different-word result", async () => {
    const resultWord = word(1, {
      validTryCount: 3,
      remainingTryCount: 0,
      finished: true,
      resultTry: {
        id: "try-1-3",
        tryNumber: 3,
        transcript: "ship",
        outcome: "different_word",
        wordAccuracy: null,
        starBand: null,
        fullWordPassed: false,
        targetSoundAccuracy: null,
        targetSoundPassed: false,
        createdAt: "2026-08-03T00:00:00Z",
      },
    });
    const result = page({
      words: [resultWord, ...[2, 3, 4, 5].map((order) => word(order as 2 | 3 | 4 | 5))],
      currentWordOrder: null,
      completed: true,
      readOnly: true,
      finishedWordCount: 5,
    });
    await renderShell(result);

    expect(container.textContent).toContain("☆☆☆");
    expect(container.textContent).toContain("Good try!");
    expect(container.textContent).toContain("Practice more");
    expect(container.textContent).not.toContain("Total score");
    expect(container.querySelector('[data-testid="practice-recorder"]')).toBeNull();
  });

  it.each([
    ["target_weak", "pronunciation_good_try"],
    ["word_weak", "pronunciation_good_try"],
    ["different_word", "pronunciation_good_try"],
  ] as const)("uses the Good try spoken variant for a third %s result", async (outcome, expectedVariant) => {
    uploadResult = {
      ...uploadResult,
      tryNumber: 3,
      outcome,
      feedback: "Good try!",
      starBand: outcome === "different_word" ? null : 1,
      fullWordPassed: false,
      targetSoundAccuracy: outcome === "different_word" ? null : 49,
      targetSoundPassed: false,
    };
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Good try!");
    expect(container.querySelector('[data-testid="feedback-audio"]')?.textContent).toBe(expectedVariant);
  });

  it("opens a resumed practice on the unfinished word", async () => {
    await renderShell(page({ currentWordOrder: 3, isResume: true }));
    expect(container.textContent).toContain("Word 3 of 5");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ wordOrder: 3 }) });
  });
});
