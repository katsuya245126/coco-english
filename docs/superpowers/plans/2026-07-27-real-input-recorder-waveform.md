# Real-Input Recorder Waveform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live recorder waveform that confirms actual microphone input while preserving the existing student audio upload flow.

**Architecture:** Keep `VoiceRecorderControl` as the owner of permission, `MediaRecorder`, countdown, stop, and upload behavior. Add a pure waveform-shaping helper plus a small client component that reads `AnalyserNode.getByteTimeDomainData()` from the active stream and renders flat vertical rounded bars for quiet input or varying vertical rounded bars for voice input. Do not persist waveform data or fake movement.

**Implementation revision:** The approved visual direction changed during inline execution. Use `buildWaveformBars`, SVG `<rect>` bars, and a pre-recording button label of `Record` with the mic icon. Do not use `buildWaveformPath`, SVG `<path>`, a continuous line, or a smooth curve, even where older task snippets below mention paths.

**Tech Stack:** Next.js App Router, React, TypeScript, browser `MediaRecorder`, Web Audio `AudioContext`, `AnalyserNode`, SVG, Vitest, jsdom

## Global Constraints

- The waveform must be driven by real time-domain audio samples from `AudioContext` and `AnalyserNode.getByteTimeDomainData()`.
- Quiet input must stay flat or nearly flat.
- Do not use a fake pulse, equalizer loop, or repeating CSS animation to imply voice input.
- Do not store waveform samples locally, in Supabase, or in teacher evidence.
- Do not change transcription, pronunciation scoring, AI evaluation, assignment state transitions, per-turn audio storage, or signed playback URLs.
- Do not add a new dependency for waveform rendering.
- Stop recording remains the whole button action while recording.
- The waveform graphic must be `aria-hidden="true"`; the button accessible name remains `Stop recording`.
- Preserve unrelated working-tree changes and the existing unrelated root `TASK.md`.

---

## File Structure

- Create `src/domain/audio/waveform.ts`: pure functions for building bounded vertical rounded-bar heights from `Uint8Array` time-domain samples.
- Create `src/components/student/LiveRecorderWaveform.tsx`: client component that receives `stream: MediaStream | null`, owns Web Audio analyser setup/cleanup, samples while active, and renders the SVG waveform.
- Modify `src/components/student/VoiceRecorderControl.tsx`: pass the active stream to `LiveRecorderWaveform`, simplify recording-state visual styling, keep the timer bar, and keep recorder behavior unchanged.
- Modify `tests/domain/audio-recorder.test.ts`: add deterministic helper tests for flat, voiced, and empty sample buffers.
- Modify `tests/e2e/student-audio.spec.ts`: add source-contract checks for no fake waveform animation and for recorder/waveform integration.
- Do not create a component test unless the source-contract and helper tests fail to cover a regression found during implementation review; if that happens, add the jsdom test in the same task as the defect fix.

---

### Task 1: Add Pure Waveform Shaping

**Files:**
- Create: `src/domain/audio/waveform.ts`
- Modify: `tests/domain/audio-recorder.test.ts`

**Interfaces:**
- Produces: `buildWaveformPath(samples: Uint8Array | null, options?: WaveformPathOptions): string`
- Produces: `isMeaningfulWaveform(samples: Uint8Array | null, silenceThreshold?: number): boolean`
- Consumes: raw time-domain samples where `128` is the centerline.

- [ ] **Step 1: Write the failing helper tests**

Add these imports to `tests/domain/audio-recorder.test.ts`:

```ts
import {
  buildWaveformPath,
  isMeaningfulWaveform,
} from "@/domain/audio/waveform";
```

Add these tests inside the existing `describe("browser audio recorder helpers", ...)` block:

```ts
  it("renders quiet time-domain samples as a flat waveform path", () => {
    const samples = new Uint8Array(32).fill(128);

    expect(isMeaningfulWaveform(samples)).toBe(false);
    expect(buildWaveformPath(samples, { width: 120, height: 32, points: 8 })).toBe(
      "M0 16 L17.14 16 L34.29 16 L51.43 16 L68.57 16 L85.71 16 L102.86 16 L120 16",
    );
  });

  it("renders voiced time-domain samples as a non-flat waveform path", () => {
    const samples = new Uint8Array([
      128, 132, 148, 176, 145, 118, 96, 82,
      112, 128, 142, 170, 156, 130, 104, 88,
    ]);

    expect(isMeaningfulWaveform(samples)).toBe(true);
    expect(buildWaveformPath(samples, { width: 120, height: 32, points: 8 })).not.toBe(
      "M0 16 L17.14 16 L34.29 16 L51.43 16 L68.57 16 L85.71 16 L102.86 16 L120 16",
    );
  });

  it("falls back to a flat path when waveform samples are missing", () => {
    expect(isMeaningfulWaveform(null)).toBe(false);
    expect(buildWaveformPath(null, { width: 120, height: 32, points: 8 })).toBe(
      "M0 16 L17.14 16 L34.29 16 L51.43 16 L68.57 16 L85.71 16 L102.86 16 L120 16",
    );
  });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run tests/domain/audio-recorder.test.ts
```

Expected: fail because `@/domain/audio/waveform` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `src/domain/audio/waveform.ts`:

```ts
export type WaveformPathOptions = {
  width?: number;
  height?: number;
  points?: number;
  silenceThreshold?: number;
};

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 32;
const DEFAULT_POINTS = 24;
const DEFAULT_SILENCE_THRESHOLD = 3;
const BYTE_CENTER = 128;
const BYTE_HALF_RANGE = 128;

export function isMeaningfulWaveform(
  samples: Uint8Array | null,
  silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
): boolean {
  if (!samples || samples.length === 0) return false;

  for (const sample of samples) {
    if (Math.abs(sample - BYTE_CENTER) > silenceThreshold) {
      return true;
    }
  }
  return false;
}

export function buildWaveformPath(
  samples: Uint8Array | null,
  options: WaveformPathOptions = {},
): string {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const points = Math.max(2, options.points ?? DEFAULT_POINTS);
  const centerY = height / 2;
  const meaningful = isMeaningfulWaveform(samples, options.silenceThreshold);

  const coordinates = Array.from({ length: points }, (_, index) => {
    const x = points === 1 ? 0 : (index / (points - 1)) * width;
    const sample =
      meaningful && samples && samples.length > 0
        ? samples[Math.min(samples.length - 1, Math.floor((index / (points - 1)) * (samples.length - 1)))]
        : BYTE_CENTER;
    const normalized = (sample - BYTE_CENTER) / BYTE_HALF_RANGE;
    const y = centerY - normalized * (height * 0.42);
    return `${formatNumber(x)} ${formatNumber(y)}`;
  });

  return `M${coordinates[0]} ${coordinates
    .slice(1)
    .map((point) => `L${point}`)
    .join(" ")}`;
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}
```

- [ ] **Step 4: Run the focused helper tests and verify GREEN**

Run:

```bash
npm test -- --run tests/domain/audio-recorder.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/domain/audio/waveform.ts tests/domain/audio-recorder.test.ts
git commit -m "feat: add recorder waveform shaping"
```

Expected: commit succeeds with only Task 1 files staged.

---

### Task 2: Add the Live Web Audio Waveform Component

**Files:**
- Create: `src/components/student/LiveRecorderWaveform.tsx`
- Modify: `tests/e2e/student-audio.spec.ts`

**Interfaces:**
- Consumes: `buildWaveformPath(samples, { width, height, points })` from `src/domain/audio/waveform.ts`
- Produces: `LiveRecorderWaveform({ stream, active }: { stream: MediaStream | null; active: boolean })`

- [ ] **Step 1: Write the failing source-contract test**

Add this test to `tests/e2e/student-audio.spec.ts`:

```ts
test("student recorder waveform uses real Web Audio samples without fake pulse animation", async () => {
  const recorderSource = readFileSync(
    "src/components/student/VoiceRecorderControl.tsx",
    "utf8",
  );
  const waveformSource = readFileSync(
    "src/components/student/LiveRecorderWaveform.tsx",
    "utf8",
  );

  expect(recorderSource).toContain("<LiveRecorderWaveform");
  expect(recorderSource).toContain("stream={state === \"recording\" ? streamRef.current : null}");
  expect(waveformSource).toContain("createAnalyser()");
  expect(waveformSource).toContain("createMediaStreamSource(stream)");
  expect(waveformSource).toContain("getByteTimeDomainData");
  expect(waveformSource).toContain("buildWaveformPath");
  expect(waveformSource).toContain('aria-hidden="true"');
  expect(waveformSource).not.toContain("@keyframes");
  expect(waveformSource).not.toContain("animation:");
  expect(waveformSource).not.toContain("setInterval");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx playwright test tests/e2e/student-audio.spec.ts
```

Expected: fail because `LiveRecorderWaveform.tsx` does not exist and `VoiceRecorderControl` does not render it.

- [ ] **Step 3: Implement `LiveRecorderWaveform`**

Create `src/components/student/LiveRecorderWaveform.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { buildWaveformPath } from "@/domain/audio/waveform";

type LiveRecorderWaveformProps = {
  stream: MediaStream | null;
  active: boolean;
};

const WIDTH = 180;
const HEIGHT = 32;
const POINTS = 28;
const FLAT_PATH = buildWaveformPath(null, {
  width: WIDTH,
  height: HEIGHT,
  points: POINTS,
});

export function LiveRecorderWaveform({
  stream,
  active,
}: LiveRecorderWaveformProps) {
  const [path, setPath] = useState(FLAT_PATH);

  useEffect(() => {
    if (!active || !stream || typeof window === "undefined") {
      setPath(FLAT_PATH);
      return;
    }

    const AudioContextCtor =
      window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) {
      setPath(FLAT_PATH);
      return;
    }

    let frameId: number | null = null;
    let cancelled = false;
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    function tick() {
      analyser.getByteTimeDomainData(samples);
      setPath(
        buildWaveformPath(samples, {
          width: WIDTH,
          height: HEIGHT,
          points: POINTS,
        }),
      );
      if (!cancelled) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
      setPath(FLAT_PATH);
    };
  }, [active, stream]);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      style={{
        display: "block",
        width: "min(180px, 100%)",
        height: HEIGHT,
      }}
    >
      <path
        d={FLAT_PATH}
        fill="none"
        stroke="rgba(37, 99, 235, 0.22)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

If TypeScript reports `webkitAudioContext` is missing, add this local type near the top of the file:

```ts
type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
```

Then replace the constructor lookup with:

```ts
const AudioContextCtor =
  window.AudioContext ??
  (window as WindowWithWebkitAudioContext).webkitAudioContext;
```

- [ ] **Step 4: Run the focused test and keep it RED for recorder integration**

Run:

```bash
npx playwright test tests/e2e/student-audio.spec.ts
```

Expected: the waveform file assertions pass; the recorder integration assertions still fail because `VoiceRecorderControl` has not imported or rendered `LiveRecorderWaveform`.

---

### Task 3: Integrate the Waveform into the Recorder Button

**Files:**
- Modify: `src/components/student/VoiceRecorderControl.tsx`
- Modify: `tests/e2e/student-audio.spec.ts`

**Interfaces:**
- Consumes: `LiveRecorderWaveform({ stream, active })`
- Preserves: `VoiceRecorderControlProps`, `RecorderState`, `onRecorded(blob, metadata)`, `maxSeconds`, upload timing, and stream cleanup behavior.

- [ ] **Step 1: Add exact source-contract assertions for the visual simplification**

Extend the Task 2 source-contract test in `tests/e2e/student-audio.spec.ts` with:

```ts
  expect(recorderSource).toContain('aria-label={state === "recording" ? "Stop recording" : undefined}');
  expect(recorderSource).not.toContain("recorderRecordingStyle");
  expect(recorderSource).not.toContain("Your answer</p>");
  expect(recorderSource).not.toContain("Your repeat</p>");
```

Keep the existing classroom-safe copy test unchanged unless it needs to stop asserting a removed visible label.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx playwright test tests/e2e/student-audio.spec.ts
```

Expected: fail because the recorder still uses the recording panel style and does not render the waveform.

- [ ] **Step 3: Import the waveform and remove red recording panel styling**

In `src/components/student/VoiceRecorderControl.tsx`, add:

```ts
import { LiveRecorderWaveform } from "@/components/student/LiveRecorderWaveform";
```

Remove `recorderRecordingStyle` from the style import.

Change `panelStyleForState()` so recording uses the base panel style:

```ts
  function panelStyleForState() {
    if (isProcessing) return recorderProcessingStyle;
    if (state === "success") return recorderSuccessStyle;
    if (isError) return recorderErrorStyle;
    return recorderPanelStyle;
  }
```

- [ ] **Step 4: Keep accessible status while removing visible recorder labels**

Replace the visible label paragraph and status block with an off-screen status that remains available to assistive technology:

```tsx
      <span
        aria-live="polite"
        role={isError ? "alert" : undefined}
        style={visuallyHiddenStyle}
      >
        {state === "waiting-permission"
          ? "Your browser will ask to use the microphone."
          : currentStatusText}
      </span>
```

Add this style near `MicIcon`:

```ts
const visuallyHiddenStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};
```

If keeping visible error messages is required by existing tests, render the visible error paragraph only for `isError` and keep normal recording status off-screen.

- [ ] **Step 5: Render the timer bar and waveform button**

Keep the existing countdown bar block, but keep it above the button while recording:

```tsx
      {state === "recording" && maxSeconds && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, borderRadius: 3, background: "#E5E7EB", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: secondsLeft <= 5 ? "#B42318" : "#2563EB",
                width: `${(secondsLeft / maxSeconds) * 100}%`,
                transition: "width 1s linear, background 0.3s",
              }}
            />
          </div>
        </div>
      )}
```

Inside the button content, replace the recording state with the waveform:

```tsx
            {state === "recording" ? (
              <LiveRecorderWaveform
                stream={state === "recording" ? streamRef.current : null}
                active={state === "recording"}
              />
            ) : (
              <>
                {isError ? <MicIcon /> : null}
                {actionLabel()}
              </>
            )}
```

Add `aria-label` to preserve the stop action when the visible text is waveform-only:

```tsx
        aria-label={state === "recording" ? "Stop recording" : undefined}
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
npm test -- --run tests/domain/audio-recorder.test.ts
npx playwright test tests/e2e/student-audio.spec.ts
```

Expected: pass.

- [ ] **Step 7: Commit Tasks 2 and 3 together**

Run:

```bash
git add src/components/student/LiveRecorderWaveform.tsx src/components/student/VoiceRecorderControl.tsx tests/e2e/student-audio.spec.ts
git commit -m "feat: show live recorder waveform"
```

Expected: commit succeeds with only waveform integration files staged.

---

### Task 4: Verify UI, Types, and Build

**Files:**
- No planned source modifications unless verification exposes a defect.

**Interfaces:**
- Consumes: completed waveform helper, waveform component, and recorder integration.
- Produces: verification evidence for implementation completion.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- --run tests/domain/audio-recorder.test.ts
npx playwright test tests/e2e/student-audio.spec.ts
```

Expected: pass.

- [ ] **Step 2: Run broader automated checks**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0. If the known unrelated lint warning in `scripts/check-student-feedback-states.mjs:435` appears, record it as pre-existing rather than changing it.

- [ ] **Step 3: Verify localhost visuals**

Start the app only when the user approves the local server target. Use a real browser microphone if available; fake media devices cannot prove real-input waveform behavior.

Check:

```text
Before tap: button shows mic icon and Start recording.
After tap with quiet mic: countdown bar appears and waveform stays flat.
After tap while speaking: waveform moves irregularly from actual mic input.
After stop: waveform disappears, upload proceeds through the existing flow.
```

Capture phone-width and desktop-width screenshots and label them as localhost evidence.

- [ ] **Step 4: Final review**

Inspect:

```bash
git status --short
git diff --stat HEAD~2..HEAD
git diff HEAD~2..HEAD -- src/domain/audio/waveform.ts src/components/student/LiveRecorderWaveform.tsx src/components/student/VoiceRecorderControl.tsx tests/domain/audio-recorder.test.ts tests/e2e/student-audio.spec.ts
```

Confirm:

```text
No waveform samples are persisted.
No new dependency was added.
No storage, transcription, evaluation, assignment, or teacher evidence code changed.
No fake animation implies audio input.
Unrelated dirty files remain untouched.
```

- [ ] **Step 5: Await approval before external action**

Do not push, deploy, publish, or run live classroom UAT without separate explicit approval naming the exact target.

---

## Self-Review

- Spec coverage: covered real-input waveform, quiet flat state, no fake pulse, no persistence, accessible stop action, cleanup, and verification.
- Placeholder scan: no placeholder steps remain.
- Type consistency: the plan defines `buildWaveformPath`, `isMeaningfulWaveform`, and `LiveRecorderWaveform` before consuming them.
