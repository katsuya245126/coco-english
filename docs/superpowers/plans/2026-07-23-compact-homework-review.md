# Compact Homework Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visually heavy dynamic Homework Review evidence cards with the approved compact chat presentation, including Messenger-style Coco avatars and on-demand responsive audio.

**Architecture:** Keep the preset `StudentMissionRecap` and its shared audio player unchanged. Add a Homework Review-only custom audio control and attempt bubble, then compose those focused client components inside the existing server-renderable `HomeworkReview`. Treat the tracked HTML preview as the normative visual contract and require localhost screenshot comparison after automated verification.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS Modules, Vitest 3, jsdom 26.1.0, Playwright/Chrome for localhost visual UAT.

## Global Constraints

- Dynamic Homework Review only; the preset Read-only recap must remain unchanged.
- Use `/images/coco-happy-alpha.png` for Coco's portrait.
- The review column maximum is 590px.
- Available recordings use a minimum-44px SVG control inside their exact answer bubble.
- Signed playback URLs continue to come only from `loadHistoryAudioAction`.
- Pronunciation data remains stored and available to teacher/preset surfaces but is not rendered in dynamic Homework Review.
- Preserve original/repeat transcript and audio association, retry state, accepted-minor recast, neutral review state, final goodbye, and Back to homework behavior.
- Do not change database schema, RLS, ownership, signed-URL authorization, scoring, teacher review, mission flow, or recap mapping.
- Do not use emoji as interactive icons.
- The visual source of truth is `docs/superpowers/specs/previews/2026-07-23-homework-review-compact-chat.html`.
- Intentional visual deviation requires updating that preview and obtaining user approval before implementation continues.
- Screenshots of the implementation must be labeled as localhost evidence; the tracked preview remains synthetic planning evidence.
- Preserve all unrelated working-tree changes, especially the existing migration edits and private reset migration.

---

## File Structure

- Create `src/components/student/CompactAudioPlayer.tsx`: responsive custom playback controls for an already-authorized signed URL.
- Create `src/components/student/CompactAudioPlayer.module.css`: compact play/time/progress styling with 44px controls and focus states.
- Create `src/components/student/CompactAudioPlayer.test.tsx`: jsdom interaction coverage for playback, progress, and accessible controls.
- Create `src/components/student/HomeworkReviewAttempt.tsx`: owns signed-URL loading and renders one transcript with its exact audio state.
- Create `src/components/student/HomeworkReviewAttempt.module.css`: approved student bubble, trigger, expanded-player, loading, and unavailable presentation.
- Create `src/components/student/HomeworkReviewAttempt.test.tsx`: jsdom coverage for loading, failure, collapse/reopen caching, and original/repeat clip isolation.
- Modify `src/components/student/HomeworkReview.tsx`: remove pronunciation presentation, use the attempt component, and move Coco's portrait beside each message.
- Modify `src/components/student/HomeworkReview.module.css`: implement the approved 590px compact-chat layout and correction styling.
- Modify `src/components/student/HomeworkReview.test.tsx`: prove dynamic presentation states and absence of pronunciation UI.
- Modify `tests/server/student-history-ui.test.ts`: strengthen the contract that preset recap retains pronunciation while dynamic review omits it.
- Modify `package.json` and `package-lock.json`: add jsdom for real client interaction tests without changing Vitest's global Node environment.
- Modify `TASK.md`: record task milestones and final verification evidence.

---

### Task 1: Responsive Compact Audio Controls

**Files:**
- Create: `src/components/student/CompactAudioPlayer.tsx`
- Create: `src/components/student/CompactAudioPlayer.module.css`
- Create: `src/components/student/CompactAudioPlayer.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: an already-authorized signed URL as `src: string`.
- Produces: `CompactAudioPlayer({ src }: { src: string })`, a responsive custom player with semantic play/pause and seek controls.

- [ ] **Step 1: Install the DOM test environment**

Run:

```bash
npm install --save-dev jsdom@26.1.0
```

Expected: `package.json` and `package-lock.json` add jsdom; no runtime dependency changes.

- [ ] **Step 2: Write the failing interaction test**

Create `src/components/student/CompactAudioPlayer.test.tsx`:

```tsx
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
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npm test -- --run src/components/student/CompactAudioPlayer.test.tsx
```

Expected: FAIL because `./CompactAudioPlayer` does not exist.

- [ ] **Step 4: Implement the custom player**

Create `src/components/student/CompactAudioPlayer.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import styles from "./CompactAudioPlayer.module.css";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
    </svg>
  );
}

export function CompactAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onEnded={() => setPlaying(false)}
      >
        Audio unavailable
      </audio>
      <button
        className={styles.playButton}
        type="button"
        aria-label={playing ? "Pause recording" : "Play recording"}
        onClick={togglePlayback}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className={styles.time} aria-live="off">
        {formatTime(currentTime)}
      </span>
      <input
        className={styles.progress}
        type="range"
        aria-label="Recording position"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        disabled={!duration}
        onChange={(event) => seek(Number(event.currentTarget.value))}
      />
      <span className={styles.time}>{formatTime(duration)}</span>
    </div>
  );
}
```

Create `src/components/student/CompactAudioPlayer.module.css`:

```css
.player {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  border-radius: 14px;
  background: rgb(255 255 255 / 82%);
  padding: 8px;
  color: #172033;
}

.player audio {
  display: none;
}

.playButton {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: #2563eb;
  color: white;
  cursor: pointer;
}

.playButton svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.playButton:focus-visible,
.progress:focus-visible {
  outline: 3px solid #f97316;
  outline-offset: 2px;
}

.progress {
  min-width: 0;
  flex: 1;
  accent-color: #2563eb;
  cursor: pointer;
}

.progress:disabled {
  cursor: default;
}

.time {
  flex: 0 0 auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
npm test -- --run src/components/student/CompactAudioPlayer.test.tsx
```

Expected: 1 file and 1 test PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json package-lock.json \
  src/components/student/CompactAudioPlayer.tsx \
  src/components/student/CompactAudioPlayer.module.css \
  src/components/student/CompactAudioPlayer.test.tsx
git commit -m "feat(student): add compact recording controls"
```

---

### Task 2: On-Demand Homework Review Attempt Bubble

**Files:**
- Create: `src/components/student/HomeworkReviewAttempt.tsx`
- Create: `src/components/student/HomeworkReviewAttempt.module.css`
- Create: `src/components/student/HomeworkReviewAttempt.test.tsx`

**Interfaces:**
- Consumes: `StudentRecapAttempt` with transcript, exact audio clip, playback state, and ignored pronunciation data.
- Consumes: `CompactAudioPlayer({ src })` from Task 1.
- Produces: `HomeworkReviewAttempt({ attempt }: { attempt: StudentRecapAttempt })`.

- [ ] **Step 1: Write failing signed-URL interaction tests**

Create `src/components/student/HomeworkReviewAttempt.test.tsx`:

```tsx
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
  it("loads its exact clip once, then collapses and reopens the cached player", async () => {
    loadHistoryAudioActionMock.mockResolvedValue({
      ok: true,
      signedUrl: "https://signed.test/original.mp3",
    });
    await act(async () => {
      root.render(<HomeworkReviewAttempt attempt={availableAttempt("clip-original")} />);
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

    expect(loadHistoryAudioActionMock).toHaveBeenCalledWith("clip-original");
    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.test/original.mp3",
    );

    const hide = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide this recording"]',
    );
    await act(async () => hide?.click());
    expect(container.querySelector("audio")).toBeNull();

    const reopen = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Listen to this recording"]',
    );
    await act(async () => reopen?.click());
    expect(container.querySelector("audio")).not.toBeNull();
    expect(loadHistoryAudioActionMock).toHaveBeenCalledTimes(1);
  });

  it("shows an inline alert when the signed URL cannot be loaded", async () => {
    loadHistoryAudioActionMock.mockResolvedValue({ ok: false });
    await act(async () => {
      root.render(<HomeworkReviewAttempt attempt={availableAttempt("clip-failed")} />);
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Listen to this recording"]',
        )
        ?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Recording unavailable",
    );
  });

  it("keeps expired and unavailable states non-interactive", async () => {
    const expired: StudentRecapAttempt = {
      transcript: "Expired transcript",
      audio: { id: "clip-expired", playback: "expired" },
      pronunciation: null,
    };
    await act(async () => {
      root.render(<HomeworkReviewAttempt attempt={expired} />);
    });
    expect(container.textContent).toContain("Recording expired");
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
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- --run src/components/student/HomeworkReviewAttempt.test.tsx
```

Expected: FAIL because `./HomeworkReviewAttempt` does not exist.

- [ ] **Step 3: Implement the attempt component**

Create `src/components/student/HomeworkReviewAttempt.tsx`:

```tsx
"use client";

import { useState } from "react";
import { loadHistoryAudioAction } from "@/app/student/history/[assignmentStudentId]/actions";
import type { StudentRecapAttempt } from "@/server/student-access/student-history";
import { CompactAudioPlayer } from "./CompactAudioPlayer";
import styles from "./HomeworkReviewAttempt.module.css";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.7 6.7a1 1 0 0 1 1.4 0L12 10.6l3.9-3.9a1 1 0 1 1 1.4 1.4L13.4 12l3.9 3.9a1 1 0 0 1-1.4 1.4L12 13.4l-3.9 3.9a1 1 0 0 1-1.4-1.4l3.9-3.9-3.9-3.9a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

export function HomeworkReviewAttempt({
  attempt,
}: {
  attempt: StudentRecapAttempt;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const audioAvailable = attempt.audio?.playback === "available";

  async function toggleAudio() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (url) {
      setExpanded(true);
      return;
    }
    if (!audioAvailable || !attempt.audio) return;
    setPending(true);
    setUnavailable(false);
    const result = await loadHistoryAudioAction(attempt.audio.id);
    setPending(false);
    if (result.ok) {
      setUrl(result.signedUrl);
      setExpanded(true);
    } else {
      setUnavailable(true);
    }
  }

  return (
    <div
      className={`${styles.bubble} ${expanded ? styles.expanded : ""}`}
    >
      <div className={styles.transcriptRow}>
        <p>{attempt.transcript}</p>
        {audioAvailable ? (
          <button
            className={styles.audioToggle}
            type="button"
            aria-label={
              expanded ? "Hide this recording" : "Listen to this recording"
            }
            aria-expanded={expanded}
            disabled={pending}
            onClick={toggleAudio}
          >
            {pending ? (
              <span className={styles.spinner} aria-hidden="true" />
            ) : expanded ? (
              <CloseIcon />
            ) : (
              <PlayIcon />
            )}
            {pending ? (
              <span className={styles.srOnly}>Preparing recording</span>
            ) : null}
          </button>
        ) : null}
      </div>
      {attempt.audio?.playback === "expired" ? (
        <p className={styles.muted}>Recording expired</p>
      ) : attempt.audio && !audioAvailable ? (
        <p className={styles.muted}>Recording unavailable</p>
      ) : null}
      {unavailable ? (
        <p className={styles.muted} role="alert">
          Recording unavailable
        </p>
      ) : null}
      {expanded && url ? (
        <div className={styles.playerPanel}>
          <CompactAudioPlayer src={url} />
        </div>
      ) : null}
    </div>
  );
}
```

Create `src/components/student/HomeworkReviewAttempt.module.css`:

```css
.bubble {
  width: fit-content;
  max-width: min(82%, 390px);
  overflow-wrap: anywhere;
  border-radius: 18px 18px 5px 18px;
  background: #dbeafe;
  color: #1e3a8a;
  padding: 13px 14px 13px 16px;
  line-height: 1.45;
}

.expanded {
  width: min(82%, 390px);
}

.transcriptRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.transcriptRow p,
.muted {
  margin: 0;
}

.audioToggle {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: white;
  color: #1e3a8a;
  box-shadow: 0 2px 8px rgb(30 58 138 / 12%);
  cursor: pointer;
}

.audioToggle svg {
  width: 19px;
  height: 19px;
  fill: currentColor;
}

.audioToggle:focus-visible {
  outline: 3px solid #f97316;
  outline-offset: 2px;
}

.audioToggle:disabled {
  cursor: wait;
}

.playerPanel {
  margin-top: 10px;
}

.muted {
  margin-top: 9px;
  color: #475569;
  font-size: 14px;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #bfdbfe;
  border-top-color: #1e3a8a;
  border-radius: 999px;
  animation: spin 700ms linear infinite;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}

@media (max-width: 520px) {
  .bubble {
    max-width: min(88%, 390px);
  }

  .expanded {
    width: min(88%, 390px);
  }
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
npm test -- --run src/components/student/HomeworkReviewAttempt.test.tsx
```

Expected: 1 file and 4 tests PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/components/student/HomeworkReviewAttempt.tsx \
  src/components/student/HomeworkReviewAttempt.module.css \
  src/components/student/HomeworkReviewAttempt.test.tsx
git commit -m "feat(student): load review recordings on demand"
```

---

### Task 3: Approved Compact Chat Composition

**Files:**
- Modify: `src/components/student/HomeworkReview.tsx:1-139`
- Modify: `src/components/student/HomeworkReview.module.css:1-177`
- Modify: `src/components/student/HomeworkReview.test.tsx`
- Modify: `tests/server/student-history-ui.test.ts`

**Interfaces:**
- Consumes: `HomeworkReviewAttempt({ attempt })` from Task 2.
- Produces: the approved dynamic Homework Review presentation.
- Preserves: `StudentMissionRecap` and `StudentHistoryAudioPlayer` without edits.

- [ ] **Step 1: Extend the failing component fixture and assertions**

In `src/components/student/HomeworkReview.test.tsx`, give the accepted,
accepted-minor, and repeat attempts real audio and pronunciation data:

```tsx
const availableAudio = (id: string) => ({
  id,
  playback: "available" as const,
});

// In the accepted turn:
original: {
  transcript: "I am going to the park.",
  audio: availableAudio("clip-accepted"),
  pronunciation: { starBand: 3, words: [] },
},

// In the accepted-minor turn:
original: {
  transcript: "I go to library.",
  audio: availableAudio("clip-minor"),
  pronunciation: {
    starBand: 2,
    words: [{ word: "library", label: "Needs practice" }],
  },
},

// In the repeat turn:
original: {
  transcript: "I want read cartoon.",
  audio: availableAudio("clip-original"),
  pronunciation: { starBand: 1, words: [] },
},
repeat: {
  transcript: "I want to read cartoons.",
  audio: availableAudio("clip-repeat"),
  pronunciation: { starBand: 3, words: [] },
},
```

Replace the obsolete initial assertion and add the visual-contract assertions:

```tsx
expect(html).not.toContain(">K<");
expect(html).toContain("Look back at your conversation with Coco.");
expect(html.match(/Listen to this recording/g)).toHaveLength(4);
expect(html).not.toContain("Pronunciation");
expect(html).not.toContain("Words to practice");
expect(html).not.toContain("Great job!");
```

Strengthen the CSS assertions:

```tsx
expect(css).toMatch(/max-width:\s*590px/);
expect(css).toMatch(/grid-template-columns:\s*42px\s+minmax\(0,\s*1fr\)/);
expect(css).toMatch(/border-radius:\s*999px/);
expect(css).toMatch(/text-decoration:\s*underline/);
expect(css).not.toMatch(/\.pronunciation/);
```

In `tests/server/student-history-ui.test.ts`, extend the branch contract:

```ts
expect(homeworkReview).not.toContain("Pronunciation");
expect(homeworkReview).not.toContain("Great job!");
expect(recap).toContain("Pronunciation</strong>");
expect(recap).toContain("Great job!");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- --run \
  src/components/student/HomeworkReview.test.tsx \
  tests/server/student-history-ui.test.ts
```

Expected: FAIL because pronunciation still renders, the student initial remains,
the subtitle and attempt component are absent, and the panel is still 430px.

- [ ] **Step 3: Replace `HomeworkReview` with the approved composition**

Replace `src/components/student/HomeworkReview.tsx` with:

```tsx
import Image from "next/image";
import Link from "next/link";
import type { StudentMissionRecap } from "@/server/student-access/student-history";
import { buildImprovedSentenceParts } from "@/domain/student/homework-review";
import { HomeworkReviewAttempt } from "./HomeworkReviewAttempt";
import styles from "./HomeworkReview.module.css";

function CocoMessage({ children }: { children: string }) {
  return (
    <div className={styles.cocoMessage}>
      <div className={styles.cocoPortrait}>
        <Image
          src="/images/coco-happy-alpha.png"
          alt=""
          width={42}
          height={42}
        />
      </div>
      <div className={styles.cocoContent}>
        <strong className={styles.cocoName}>Coco</strong>
        <div className={styles.cocoBubble}>{children}</div>
      </div>
    </div>
  );
}

export function HomeworkReview({
  recap,
  studentDisplayName,
}: {
  recap: StudentMissionRecap;
  studentDisplayName: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <header className={styles.header}>
          <h1>Homework Review</h1>
          <p>Look back at your conversation with Coco.</p>
        </header>
        <div className={styles.messages}>
          {recap.turns.map((turn) => {
            const showGoodJob =
              turn.reviewState === "accepted" ||
              turn.reviewState === "accepted_minor" ||
              turn.reviewState === "repeat_accepted";
            return (
              <div className={styles.exchange} key={turn.id}>
                <CocoMessage>{turn.cocoPrompt}</CocoMessage>
                <div className={styles.studentMessage}>
                  <strong className={styles.studentName}>
                    {studentDisplayName}
                  </strong>
                  <div className={styles.attemptRow}>
                    {turn.reviewState === "repeat_accepted" ? (
                      <span className={styles.retryMark} aria-hidden="true">
                        !
                      </span>
                    ) : null}
                    {turn.reviewState === "repeat_accepted" ? (
                      <span className={styles.srOnly}>
                        This answer needed another try.
                      </span>
                    ) : null}
                    <HomeworkReviewAttempt attempt={turn.original} />
                  </div>
                  {turn.reviewState === "accepted_minor" &&
                  turn.improvedSentence ? (
                    <p className={styles.improvedSentence}>
                      {buildImprovedSentenceParts(
                        turn.original.transcript,
                        turn.improvedSentence,
                      ).map((part, index) => (
                        <span
                          className={
                            part.changed ? styles.changedWord : undefined
                          }
                          key={`${turn.id}-part-${index}`}
                        >
                          {part.text}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {turn.repeat ? (
                    <div className={styles.repeatAttempt}>
                      <HomeworkReviewAttempt attempt={turn.repeat} />
                    </div>
                  ) : null}
                  {showGoodJob ? (
                    <p className={styles.goodJob}>✓ Good job!</p>
                  ) : null}
                </div>
              </div>
            );
          })}
          {recap.finalCocoLine ? (
            <CocoMessage>{recap.finalCocoLine}</CocoMessage>
          ) : null}
        </div>
        <Link className={styles.backButton} href="/student/home">
          Back to homework
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Replace the page CSS with the visual contract**

Replace `src/components/student/HomeworkReview.module.css` with:

```css
.page {
  display: flex;
  justify-content: center;
  padding: 32px 16px 48px;
  background: #f8fafc;
}

.panel {
  width: 100%;
  max-width: 590px;
}

.header {
  margin-bottom: 24px;
}

.header h1 {
  margin: 0;
}

.header p {
  margin: 7px 0 0;
  color: #64748b;
  font-size: 14px;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.exchange {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cocoMessage {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: end;
}

.cocoPortrait {
  width: 42px;
  height: 42px;
  overflow: hidden;
  border: 2px solid white;
  border-radius: 999px;
  background: #fff1f2;
  box-shadow: 0 2px 8px rgb(30 58 138 / 12%);
}

.cocoPortrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 22%;
}

.cocoContent {
  min-width: 0;
}

.cocoName,
.studentName {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.cocoName {
  margin: 0 0 5px 5px;
}

.cocoBubble {
  width: fit-content;
  max-width: 390px;
  overflow-wrap: anywhere;
  border: 1px solid #dbe3ef;
  border-radius: 18px 18px 18px 5px;
  background: white;
  padding: 14px 16px;
  line-height: 1.45;
}

.studentMessage {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.studentName {
  margin: 0 4px 5px 0;
}

.attemptRow {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  gap: 9px;
}

.repeatAttempt {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-top: 8px;
}

.retryMark {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 17px;
  font-weight: 900;
}

.improvedSentence {
  max-width: 390px;
  overflow-wrap: anywhere;
  margin: 8px 4px 0 0;
  color: #475569;
  font-size: 14px;
  font-style: italic;
  text-align: right;
}

.changedWord {
  color: #b91c1c;
  font-style: normal;
  font-weight: 800;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.goodJob {
  margin: 8px 4px 0 0;
  color: #166534;
  font-size: 14px;
  font-weight: 800;
}

.backButton {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 50px;
  margin-top: 28px;
  border-radius: 999px;
  background: #2563eb;
  color: white;
  font-weight: 800;
  text-decoration: none;
}

.backButton:focus-visible {
  outline: 3px solid #f97316;
  outline-offset: 2px;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 520px) {
  .page {
    padding: 24px 14px 40px;
  }

  .cocoMessage {
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 8px;
  }

  .cocoPortrait {
    width: 38px;
    height: 38px;
  }

  .cocoBubble,
  .improvedSentence {
    max-width: min(88%, 390px);
  }
}
```

- [ ] **Step 5: Run focused UI tests**

Run:

```bash
npm test -- --run \
  src/components/student/CompactAudioPlayer.test.tsx \
  src/components/student/HomeworkReviewAttempt.test.tsx \
  src/components/student/HomeworkReview.test.tsx \
  tests/server/student-history-ui.test.ts
```

Expected: 4 files PASS. The preset source contract still contains
`Pronunciation</strong>` and `Great job!`; dynamic Homework Review contains
neither.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/student/HomeworkReview.tsx \
  src/components/student/HomeworkReview.module.css \
  src/components/student/HomeworkReview.test.tsx \
  tests/server/student-history-ui.test.ts
git commit -m "feat(student): compact the Homework Review chat"
```

---

### Task 4: Regression Gate and Preview-Based Visual UAT

**Files:**
- Modify: `TASK.md`
- Read-only reference: `docs/superpowers/specs/previews/2026-07-23-homework-review-compact-chat.html`
- Read-only reference: `docs/superpowers/specs/2026-07-23-homework-review-compact-chat-design.md`

**Interfaces:**
- Consumes: the completed Task 1-3 implementation.
- Produces: recorded automated evidence and localhost visual evidence, or an explicit visual-UAT blocker.

- [ ] **Step 1: Run the focused test matrix**

Run:

```bash
npm test -- --run \
  src/components/student/CompactAudioPlayer.test.tsx \
  src/components/student/HomeworkReviewAttempt.test.tsx \
  src/components/student/HomeworkReview.test.tsx \
  src/domain/student/homework-review.test.ts \
  tests/server/student-history-ui.test.ts \
  tests/server/student-history.test.ts \
  tests/server/student-mission-flow.test.ts
```

Expected: all 7 files PASS with no paid provider calls.

- [ ] **Step 2: Run static and full regression checks**

Run:

```bash
npm run typecheck
npm run lint
npm test -- --run
```

Expected: all commands exit 0. Record any pre-existing warnings separately;
do not claim an unrun check passed.

- [ ] **Step 3: Confirm the build directory is not in use, then build**

Run:

```bash
pgrep -af "next (dev|start)" || true
lsof +D .next || true
npm run build
```

Expected: no process is using this checkout's `.next` before the build; the
production build exits 0. If a process is using `.next`, stop and resolve that
specific process before building.

- [ ] **Step 4: Run localhost visual UAT against the tracked preview**

Use the user's existing unlocked localhost student session:

1. Start this checkout on `http://localhost:3000` if it is not already running.
2. Open **Past missions**, select the owned completed dynamic mission, and
   choose **View what I said**.
3. At a 390×844 viewport, capture localhost evidence showing:
   - no pronunciation cards;
   - Coco's real portrait clipped to a circle beside every left bubble;
   - the first-attempt retry marker and accepted repeat;
   - one success line per accepted turn;
   - no horizontal overflow.
4. Activate an original recording button and capture the expanded compact
   player. Collapse and reopen it; confirm it stays attached to the original
   transcript.
5. Activate a repeat recording separately; confirm it plays the repeat clip,
   not the original clip.
6. At a 1440×1200 viewport, capture the full 590px reading column and final
   Back to homework action.
7. Compare both screenshots with
   `docs/superpowers/specs/previews/2026-07-23-homework-review-compact-chat.html`.
8. Label every screenshot as **localhost application evidence**. Do not use the
   tracked preview or a synthetic render as application evidence.

Expected: hierarchy, relative spacing, avatar/bubble geometry, collapsed audio
placement, expanded player, and correction emphasis match the preview. If the
owned completed attempt or unlocked session is unavailable, record visual UAT
as blocked and do not mark the task complete.

- [ ] **Step 5: Record factual evidence**

Update `TASK.md` with the exact observed focused-test totals, typecheck exit
status, lint exit status and warning count, full-suite totals, build result,
and localhost screenshot paths. State whether the 390×844 and 1440×1200
comparisons matched the tracked preview, including collapsed and expanded
audio. If a check is blocked or skipped, state that directly rather than
inventing a result.

- [ ] **Step 6: Commit Task 4**

```bash
git add TASK.md
git commit -m "docs: record compact Homework Review verification"
```

---

## Plan Completion Criteria

- Tasks 1-3 are implemented and committed independently.
- The preset `StudentMissionRecap.tsx` and
  `StudentHistoryAudioPlayer.tsx` have no diff.
- Automated checks pass with observed evidence recorded.
- Mobile and desktop localhost screenshots match the tracked visual contract,
  including one expanded original or repeat recording.
- No intentional visual deviation is present without an updated preview and
  explicit user approval.
- No push, deploy, production mutation, or Supabase mutation has occurred.
