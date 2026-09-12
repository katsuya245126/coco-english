// @vitest-environment jsdom
import { act, useState } from "react";
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
    }) => {
      const [recorded, setRecorded] = useState(false);
      return (
        <button
          type="button"
          data-testid="practice-recorder"
          disabled={disabled || recorded}
          onClick={() =>
            void Promise.resolve(
              onRecorded(new Blob(["voice"], { type: "audio/webm" }), {
                mimeType: "audio/webm",
                durationMs: 1200,
              }),
            ).then(() => setRecorded(true))
          }
        >
          Record
        </button>
      );
    },
}));

vi.mock("./CocoSpeechAudio", () => ({
  CocoSpeechAudio: ({
    line,
    playbackKey,
  }: {
    line: { feedbackVariant?: string };
    playbackKey?: number;
  }) => (
    <button
      type="button"
      data-testid="feedback-audio"
      data-playback-key={playbackKey}
      aria-label="Play Coco"
    >
      {line.feedbackVariant}
    </button>
  ),
}));

/* eslint-disable @next/next/no-img-element -- the image mock needs a DOM node. */
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));
/* eslint-enable @next/next/no-img-element */

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
    feedback: "Almost! Keep your teeth close and let air hiss — sss. Try again.",
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
  it("uses one focused word card with a compact Coco feedback row", async () => {
    await renderShell(page());

    const card = container.querySelector('[data-testid="pronunciation-practice-card"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Word 1 of 5");
    expect(card?.querySelector('[data-testid="coco-feedback"]')).not.toBeNull();
    expect(card?.querySelector('img[src="/images/coco-happy-alpha.png"]')).not.toBeNull();
    expect(card?.querySelector('[data-testid="mascot-stage"]')).toBeNull();
    expect(card?.querySelector('button[aria-label="Hear the S sound"]')).not.toBeNull();
  });

  it("renders five progress dots for finished, current, and upcoming words", async () => {
    const finishedWords = [
      word(1, { finished: true, passed: true, validTryCount: 1, remainingTryCount: 2 }),
      word(2),
      word(3),
      word(4),
      word(5),
    ];
    await renderShell(page({ words: finishedWords, currentWordOrder: 2, finishedWordCount: 1 }));

    expect(container.querySelector('[aria-label="1 of 5 words completed"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="progress-dot-"]')).toHaveLength(5);
    expect(container.querySelector('[data-testid="progress-dot-1"]')?.getAttribute("data-state")).toBe(
      "finished",
    );
    expect(container.querySelector('[data-testid="progress-dot-2"]')?.getAttribute("data-state")).toBe(
      "current",
    );
    expect(container.querySelector('[data-testid="progress-dot-3"]')?.getAttribute("data-state")).toBe(
      "upcoming",
    );
  });

  it("loads one word clip and keeps both replay controls unlimited without Skip or transcript text", async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    await renderShell(page());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/word-audio");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ wordOrder: 1 }) });
    const wordArea = container.querySelector('[data-testid="practice-word-area"]');
    const wordAudioButton = wordArea?.querySelector<HTMLButtonElement>(
      'button[aria-label="Hear the word"]',
    );
    expect(wordAudioButton).not.toBeNull();
    expect(wordAudioButton?.textContent).toBe("");
    expect(wordAudioButton?.querySelector("svg")).not.toBeNull();
    const soundAudioButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hear the S sound"]',
    );
    expect(soundAudioButton?.textContent).toBe("S sound");
    expect(container.querySelector('[data-testid="coco-feedback-message"]')?.textContent).toBe(
      "Listen, then say it!",
    );
    expect(container.querySelector('img[src="/images/coco-happy-alpha.png"]')).not.toBeNull();
    expect(play).toHaveBeenCalledTimes(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Hear the S sound"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Hear the S sound"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Hear the word"]')?.click();
      container.querySelector<HTMLButtonElement>('button[aria-label="Hear the word"]')?.click();
    });

    expect(play).toHaveBeenCalledTimes(5);
    expect(container.textContent).not.toContain("Skip");
    expect(container.textContent).not.toContain("transcript");
  });

  it("keeps word and sound replay separate from compact Coco feedback audio", async () => {
    await renderShell(page());

    expect(container.querySelector('button[aria-label="Hear the word"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Hear the S sound"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="coco-feedback"]')).not.toBeNull();

    uploadResult = {
      ...uploadResult,
      outcome: "passed",
      targetSoundAccuracy: 80,
      targetSoundPassed: true,
      feedback: "Good job!",
    };
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const feedbackAudio = container.querySelector<HTMLButtonElement>(
      '[data-testid="feedback-audio"]',
    );
    expect(feedbackAudio).not.toBeNull();
    expect(feedbackAudio?.closest('[data-testid="coco-feedback"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Word and sound audio"] [data-testid="feedback-audio"]')).toBeNull();
  });

  it("advances the feedback playback key for consecutive identical results", async () => {
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="feedback-audio"]')?.getAttribute("data-playback-key")).toBe("1");

    uploadResult = { ...uploadResult, tryNumber: 2 };
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="feedback-audio"]')?.getAttribute("data-playback-key")).toBe("2");
  });

  it("explains missing word audio without blocking sound practice", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/audio")) {
        return new Response(JSON.stringify(uploadResult), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404 });
    });

    await renderShell(page());

    expect(container.textContent).toContain(
      "Word audio isn't ready right now. You can still practice the sound.",
    );
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Hear the S sound"]')?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Hear the word"]')?.disabled).toBe(true);
    expect(container.querySelector('button[aria-label="Try word audio again"]')).toBeNull();
  });

  it("offers a retry for temporary word-audio failures", async () => {
    let wordAudioRequests = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/audio")) {
        return new Response(JSON.stringify(uploadResult), { status: 200 });
      }
      wordAudioRequests += 1;
      if (wordAudioRequests === 1) {
        return new Response(JSON.stringify({ ok: false, error: "audio_unavailable" }), { status: 502 });
      }
      return new Response(JSON.stringify({ ok: true, audioUrl: "https://signed.test/word-1.mp3" }), { status: 200 });
    });

    await renderShell(page());

    expect(container.textContent).toContain("Word audio didn't load. Try again.");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Try word audio again"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(wordAudioRequests).toBe(2);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Hear the word"]')?.disabled).toBe(false);
    expect(container.querySelector('button[aria-label="Try word audio again"]')).toBeNull();
  });

  it("does not show Next word before a pass or third valid try", async () => {
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Almost! Keep your teeth close and let air hiss — sss. Try again.",
    );
    expect(container.querySelector('button[aria-label="Next word"]')).toBeNull();
    expect(container.querySelector('[aria-label="0 of 5 words completed"]')).not.toBeNull();
    expect(container.textContent).not.toContain("% complete");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="practice-recorder"]',
      )?.disabled,
    ).toBe(false);
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
    expect(container.querySelector('[aria-label="1 of 5 words completed"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Next word"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Next word"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("word-2");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="practice-recorder"]',
      )?.disabled,
    ).toBe(false);
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
    expect(container.textContent).toContain("word-5");
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
    expect(container.textContent).toContain("You did it!");
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
    expect(container.textContent).toContain("word-5");
    expect(container.querySelector('button[aria-label="Next word"]')).not.toBeNull();
    expect(container.textContent).not.toContain("You did it!");

    completionState.result = { ok: true };
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Next word"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("You did it!");
  });

  it("shows the celebrating finish view with one star group per word", async () => {
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
    expect(container.textContent).toContain("You did it!");
    expect(container.textContent).toContain("Good try!");
    const differentWordRow = container.querySelector(
      '[aria-label="Pronunciation practice result"] article',
    );
    expect(differentWordRow?.textContent).toContain("S sound not assessed");
    expect(differentWordRow?.textContent).not.toContain("Practice more");
    expect(container.textContent).not.toContain("Total score");
    expect(container.querySelector('[data-testid="practice-recorder"]')).toBeNull();
    expect(container.querySelectorAll('[aria-label$="stars for the whole word"]')).toHaveLength(5);
    expect(
      container.querySelector<HTMLElement>('[aria-label="Pronunciation practice result"] article mark')?.style.background,
    ).toBe("rgb(254, 249, 195)");
    expect(container.querySelector('[data-testid="completion-celebration"] img[src="/images/coco-celebrate-alpha.png"]')).not.toBeNull();
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
      feedback: "Good try! Let's do the next word.",
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

    expect(container.textContent).toContain("Good try! Let's do the next word.");
    expect(container.querySelector('[data-testid="feedback-audio"]')?.textContent).toBe(expectedVariant);
  });

  it("does not show stars for a weak scored try", async () => {
    await renderShell(page());

    expect(container.querySelector('[data-testid="try-stars"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="try-stars"]')).toBeNull();
    expect(container.textContent).not.toContain("whole word");
  });

  it("replaces sound-first dialogue with each successive try", async () => {
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="coco-feedback-message"]')?.textContent).toBe(
      "Almost! Keep your teeth close and let air hiss — sss. Try again.",
    );

    uploadResult = {
      ...uploadResult,
      tryNumber: 2,
      outcome: "passed",
      starBand: 2,
      targetSoundAccuracy: 80,
      targetSoundPassed: true,
      feedback: "Good job!",
    };
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="try-stars"]')).toBeNull();
    expect(container.querySelector('[data-testid="coco-feedback-message"]')?.textContent).toBe(
      "Good job!",
    );
  });

  it("names the expected word for a different-word try", async () => {
    uploadResult = {
      ...uploadResult,
      outcome: "different_word",
      starBand: null,
      fullWordPassed: false,
      targetSoundAccuracy: null,
      targetSoundPassed: false,
      feedback: "Let's try word-1 — listen again.",
    };
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="try-stars"]')).toBeNull();
    expect(container.querySelector('[data-testid="coco-feedback-message"]')?.textContent).toBe(
      "Let's try word-1 — listen again.",
    );
  });

  it("praises a clear sound before asking for a smoother whole word", async () => {
    uploadResult = {
      ...uploadResult,
      outcome: "word_weak",
      starBand: 1,
      fullWordPassed: false,
      targetSoundAccuracy: 80,
      targetSoundPassed: true,
      feedback: "Great sss! Now say the whole word smoothly.",
    };
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="coco-feedback-message"]')?.textContent).toBe(
      "Great sss! Now say the whole word smoothly.",
    );
    expect(container.querySelector('img[src="/images/coco-encouraging-alpha.png"]')).not.toBeNull();
  });

  it("shows only sound-first feedback when a strong word carries a weak target sound", async () => {
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="try-stars"]')).toBeNull();
    expect(container.querySelectorAll('[aria-label*="stars for the whole word"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="coco-feedback-message"]')?.textContent).toBe(
      "Almost! Keep your teeth close and let air hiss — sss. Try again.",
    );
    expect(container.textContent).not.toContain("sound needs work");
    expect(container.textContent).not.toContain("whole word");
  });

  it("names Coco's expression for the try outcome", async () => {
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('img[src="/images/coco-encouraging-alpha.png"]')).not.toBeNull();

    uploadResult = { ...uploadResult, tryNumber: 2, outcome: "passed", targetSoundPassed: true, feedback: "Good job!" };
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('img[src="/images/coco-celebrate-alpha.png"]')).not.toBeNull();
  });

  it("keeps recording available after a weak try before the third", async () => {
    await renderShell(page());

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="try-stars"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="practice-recorder"]')?.disabled).toBe(false);
    expect(container.querySelector('button[aria-label="Next word"]')).toBeNull();
  });

  it("exposes two distinctly named routes to the homework list after completion", async () => {
    const finished = [1, 2, 3, 4, 5].map((order) =>
      word(order as 1 | 2 | 3 | 4 | 5, {
        validTryCount: 1,
        remainingTryCount: 2,
        passed: true,
        finished: true,
      }),
    );
    await renderShell(page({ words: finished, currentWordOrder: null, completed: true, readOnly: true, finishedWordCount: 5 }));

    const homeLinks = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/student/home"]')];
    expect(homeLinks).toHaveLength(2);

    const names = homeLinks.map((link) => link.getAttribute("aria-label") ?? link.textContent);
    expect(new Set(names).size).toBe(2);
    expect(names).toContain("Back to homework list");
    expect(names).toContain("Back to homework");
  });

  it("opens a resumed practice on the unfinished word", async () => {
    await renderShell(page({ currentWordOrder: 3, isResume: true }));
    expect(container.textContent).toContain("word-3");
    expect(container.querySelector('[aria-label="0 of 5 words completed"]')).not.toBeNull();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ wordOrder: 3 }) });
  });
});
