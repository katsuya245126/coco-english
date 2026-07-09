# Phase 10: Mascot (VN-style) - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 8 (3 new components/modules, 2 modified, 3 new test files)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/components/student/MascotStage.tsx` (NEW) | component | event-driven (rAF + amplitude callback) | `src/components/student/CocoSpeechAudio.tsx` | role-match (client component, `"use client"`, degrade-not-block philosophy) |
| `src/domain/character/expression.ts` (NEW) | utility (pure domain) | transform | `src/domain/character/profile.ts` | exact (same directory, same "pure, no DB/AI" doc-comment convention) |
| `src/domain/character/mascot-speaking-state.ts` (NEW, suggested name) | utility (pure domain) | transform | `src/domain/character/profile.ts` (module shape) + RESEARCH.md Section 5 sketch | role-match |
| `src/domain/character/mascot-perf-degrade.ts` (NEW, suggested name) | utility (pure domain) | transform | `src/domain/character/profile.ts` (module shape) + RESEARCH.md Section 6 sketch | role-match |
| `src/components/student/CocoSpeechAudio.tsx` (MODIFY) | component | streaming (Web Audio) | itself (additive change) | exact — preserve all existing branches verbatim |
| `src/components/student/MissionFlowShell.tsx` (MODIFY) | component | event-driven (state machine) | itself (additive mount point) | exact — insert one line, no existing logic touched |
| `src/app/student/missions/[assignmentStudentId]/page.tsx` (MODIFY, possibly) | route/page | request-response (server component composing client shell) | itself | exact — no analog needed, single prop-pass-through composition |
| `tests/domain/character-expression.test.ts` (NEW) | test | transform | `tests/domain/character-profile.test.ts` | exact (same directory, same pure-fixture style) |
| `tests/domain/mascot-speaking-state.test.ts` (NEW) | test | transform | `tests/domain/review-buckets.test.ts` (pure-function-over-fixtures pattern) | role-match |
| `tests/domain/mascot-perf-degrade.test.ts` (NEW) | test | transform | `tests/domain/review-buckets.test.ts` | role-match |

## Pattern Assignments

### `src/domain/character/expression.ts` (utility, transform)

**Analog:** `src/domain/character/profile.ts` (read in full, 48 lines)

**Module doc-comment + purity contract convention** (lines 1-10):
```typescript
/**
 * Character profile module (CHAR-04, D-11).
 *
 * Pure domain module — no DB, server, or AI/LLM imports.
 * Exports static template strings keyed by characterId.
 * Consumed by client components to render buddy speech.
 */
```
Copy this exact header shape for `expression.ts`, swapping the requirement IDs to MASCOT-03/D-05, and keep the "Pure domain module — no DB, server, or AI/LLM imports" sentence verbatim — this is the project's established purity-contract convention for `src/domain/character/*`.

**Type + lookup-function shape** (lines 14-47, full file):
```typescript
export type CharacterProfile = { /* ... */ };
export const DEFAULT_BUDDY: CharacterProfile = { /* ... */ };
export const CHARACTER_PROFILES: Record<string, CharacterProfile> = {
  [DEFAULT_CHARACTER_ID]: DEFAULT_BUDDY,
};
export function getCharacterProfile(characterId: string): CharacterProfile {
  return CHARACTER_PROFILES[characterId] ?? DEFAULT_BUDDY;
}
```
`expression.ts` should follow the same "exported type + exported pure function taking a plain object, returning an enum-like value" shape. RESEARCH.md Section 3 already provides the exact target implementation — use it verbatim, adapted to import `FlowStep`/`OriginalFeedback["kind"]`/`RepeatFeedback["kind"]` as types only (no runtime import) from `MissionFlowShell.tsx`, or re-declare narrower local types to avoid a component->domain reverse-dependency (component imports domain, not vice versa — check RESEARCH.md's own type table in Section 3 before deciding which types to import vs. re-declare):

```typescript
export type MascotExpression = "idle" | "happy" | "celebrate" | "encouraging";

export function deriveExpression(input: {
  step: FlowStep;
  originalFeedbackKind?: OriginalFeedback["kind"] | null;
  repeatFeedbackKind?: RepeatFeedback["kind"] | null;
}): MascotExpression {
  if (input.step === "complete") return "celebrate";
  if (input.repeatFeedbackKind === "repeatAccepted") return "happy";
  if (input.repeatFeedbackKind === "repeatRetry") return "encouraging";
  if (input.originalFeedbackKind === "acceptedOriginal") return "happy";
  if (
    input.originalFeedbackKind === "needsCorrection" ||
    input.originalFeedbackKind === "retryOriginal"
  ) {
    return "encouraging";
  }
  return "idle";
}
```

**Hard constraint (structural, not conventional):** the return type union (`MascotExpression`) must never include `"sad"` — this makes `coco-sad-alpha.png` structurally unreachable from this module, per RESEARCH.md Pitfall 4. Do not add a 5th branch "for completeness."

---

### `src/domain/character/mascot-speaking-state.ts` (utility, transform) — suggested filename

**Analog:** RESEARCH.md Section 5 sketch (no direct codebase analog exists for hysteresis logic; `src/domain/character/profile.ts` supplies the module-shape/purity convention only)

**Target implementation** (adapt RESEARCH.md's sketch into an exported pure function with the project's doc-comment convention):
```typescript
/**
 * Mascot speaking-state hysteresis (MASCOT-02).
 *
 * Pure domain module — no DOM/Web Audio/timer imports. Takes primitive
 * amplitude/timestamp inputs so it is unit-testable without jsdom or a real
 * AnalyserNode (this project's vitest environment is "node", no jsdom).
 */
export const SILENCE_HYSTERESIS_MS = 200;
export const SILENCE_THRESHOLD = 0.05;

export type SpeakingHysteresisState = {
  lastAboveThresholdAt: number;
  isSpeakingVisually: boolean;
};

export function updateSpeakingVisual(
  amplitude: number,
  now: number,
  state: SpeakingHysteresisState,
): SpeakingHysteresisState {
  if (amplitude > SILENCE_THRESHOLD) {
    return { lastAboveThresholdAt: now, isSpeakingVisually: true };
  }
  if (now - state.lastAboveThresholdAt > SILENCE_HYSTERESIS_MS) {
    return { ...state, isSpeakingVisually: false };
  }
  return state;
}
```
Note: return a new state object rather than mutating the input in place (matches this codebase's general preference for pure functions over mutation, seen in `profile.ts`'s `getCharacterProfile` and the domain modules under `tests/domain/`).

---

### `src/domain/character/mascot-perf-degrade.ts` (utility, transform) — suggested filename

**Analog:** RESEARCH.md Section 6 sketch (no direct codebase analog; same module-shape convention as above)

**Target implementation:**
```typescript
/**
 * Mascot low-end-device performance degrade (MASCOT-04, D-07).
 *
 * Pure domain module — takes an array of frame-time deltas (ms) already
 * measured by the caller's own requestAnimationFrame loop. No DOM import.
 */
export const FRAME_BUDGET_MS = 33;
export const DEGRADE_SAMPLE_SIZE = 30;
export const DEGRADE_TRIGGER_RATIO = 0.5;

export function shouldDegrade(recentFrameDeltas: number[]): boolean {
  if (recentFrameDeltas.length < DEGRADE_SAMPLE_SIZE) return false;
  const overBudgetCount = recentFrameDeltas.filter(
    (d) => d > FRAME_BUDGET_MS,
  ).length;
  return overBudgetCount / recentFrameDeltas.length > DEGRADE_TRIGGER_RATIO;
}
```

---

### `src/components/student/CocoSpeechAudio.tsx` (MODIFY, streaming)

**Analog:** itself — this is an additive change, not a rewrite. Full file already read (304 lines).

**Existing ownership boundary to preserve verbatim** (lines 1-19, doc comment):
```typescript
"use client";

/**
 * Inline Coco speech playback / replay control (VOICE-02, VOICE-04, D-01..D-15).
 * ...
 * This component NEVER renders the line's text — the parent card owns text so
 * that a route/audio failure degrades the speaker control only and never hides
 * the line or blocks the homework loop (D-03, D-06, D-15, T-08-06). It imports
 * ONLY domain types and calls the app route; no OpenAI / Supabase service /
 * server-audio import ever crosses this boundary (T-08-01, T-08-07).
 */
```
The new amplitude wiring must uphold this exact boundary: no new server/AI import, degrade-only-the-speaker-control philosophy extends 1:1 to "degrade-only-the-mascot-animation, never block playback or the flow."

**Props to extend** (lines 35-40, current shape):
```typescript
type CocoSpeechAudioProps = {
  assignmentStudentId: string;
  line: CocoSpeechLine;
  /** Accessible label for the icon-only replay control. */
  label?: string;
};
```
Add exactly two new optional callback props per RESEARCH.md Section 2:
```typescript
  /** MASCOT-02: fired on each analyser tick while playing; omit to opt out. */
  onAmplitudeFrame?: (level: number) => void;
  /** MASCOT-02: fired on playing-state transitions (drives idle<->speaking). */
  onPlayingChange?: (playing: boolean) => void;
```

**Existing playback-state event wiring to hook into, not replace** (lines 183-205, the `<audio>` JSX):
```tsx
{audioUrl ? (
  <audio
    ref={audioRef}
    src={audioUrl}
    preload="auto"
    onCanPlay={handleCanPlay}
    onWaiting={() => setState((prev) => (prev === "error" ? prev : "loading"))}
    onPlaying={() => setState("playing")}
    onPlay={() => setState("playing")}
    onEnded={() => setState("ready")}
    onError={() => setState("error")}
    style={hiddenAudioStyle}
  >
    Your browser does not support audio playback.
  </audio>
) : null}
```
`onPlayingChange` should be invoked from inside the existing `onPlaying`/`onPlay` (→ `true`) and `onEnded`/`onError` (→ `false`) handlers — add a call, do not replace the existing `setState(...)` calls. The `MediaElementAudioSourceNode`/`AnalyserNode` attachment (RESEARCH.md Section 2's `attachAnalyser`/`getAudioContext`/`sourceNodeCache` sketch) should be created in a `useEffect` keyed on `audioRef.current` becoming non-null (i.e., when `audioUrl` transitions from `null` to a value), guarded by the `WeakMap` cache to satisfy the one-source-node-per-element browser constraint (RESEARCH.md Pitfall 1). The `onAmplitudeFrame` callback is driven from a `requestAnimationFrame` loop that only runs while `state === "playing"`.

**Existing autoplay/replay branches — do not touch:**
```typescript
function handleCanPlay() { /* lines 129-144 — leave untouched */ }
function handleReplay() { /* lines 146-153 — leave untouched, but this onClick is
                              also a valid AudioContext.resume() gesture per
                              RESEARCH.md Pitfall 3 */ }
```

---

### `src/components/student/MascotStage.tsx` (NEW, component)

**Analog:** `src/components/student/CocoSpeechAudio.tsx` (client-component conventions: `"use client"`, doc-comment header citing requirement IDs, inline `React.CSSProperties` const styles at file bottom, degrade-never-block philosophy) + `src/components/student/styles.ts` (shared design tokens) + RESEARCH.md `next/image` code example.

**File header convention to copy** (from `CocoSpeechAudio.tsx` lines 1-19 — adapt requirement IDs to MASCOT-01..04):
```typescript
"use client";

/**
 * Persistent VN-style mascot stage (MASCOT-01..04, D-01..D-07).
 * ...
 */
```

**Design tokens to reuse from `src/components/student/styles.ts`** (do not invent new hex values or spacing):
```typescript
// panelStyle.maxWidth (420) — the stage must not exceed this width
// panelStyle.padding (24) — stage outer padding
// labelStyle (fontSize 14, fontWeight 600, lineHeight 1.4) — speaker name label, verbatim
// buddyCardStyle.background (#EFF6FF) — gradient top stop
// pageStyle.background (#F7F8FA) — gradient bottom stop
```
Per UI-SPEC, add new exported const styles to `styles.ts` itself (e.g. `mascotStageStyle`, `mascotDialogueBoxStyle`, `mascotSpeakerLabelStyle`) rather than inlining ad hoc styles in `MascotStage.tsx` — this matches the existing convention where every other student component imports its styles from `styles.ts` rather than defining local style objects for shared/reusable surfaces. `labelStyle` should be reused directly (not recreated) for the speaker-name tag per the UI-SPEC's own instruction ("reuses `labelStyle`'s existing 14px/600/1.4 values verbatim").

**Image pattern — explicit anti-pattern warning:** `src/components/teacher/ShareClassDialog.tsx` (lines 174-181) is the ONLY existing image-rendering precedent in this codebase, and it is the WRONG pattern to copy:
```tsx
{qrDataUrl ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={qrDataUrl}
    alt={`QR code linking to the join page for ${className}`}
    width={240}
    height={240}
  />
) : (
  <span style={{ fontSize: 14, color: "#6B7280" }}>Generating QR code…</span>
)}
```
This uses a plain `<img>` with an explicit lint-suppression comment because the QR code is a small, rarely-rerendered data URL — not comparable to the ~1.7-4.5MB native mascot PNGs that are persistently mounted. **There is no existing `next/image` usage anywhere in this codebase** — `MascotStage.tsx` will be the first. Use the RESEARCH.md-provided pattern instead (verified against Next.js 15 App Router docs, confirmed no `output: "export"` in `next.config.ts` so the optimization API is available):
```tsx
import Image from "next/image";

<div style={{ position: "relative", width: "100%", height: 240 }}>
  <Image
    src={`/images/${spriteFile}`}
    alt="" // decorative — speaker-name label + step-card text carry the meaning
    fill
    style={{ objectFit: "contain", objectPosition: "bottom center" }}
    sizes="(max-width: 420px) 100vw, 420px"
    priority // above-the-fold, persistent element — do not lazy-load
  />
</div>
```

**Perf/amplitude read loop + degrade wiring** — compose the two new domain helpers (`updateSpeakingVisual`, `shouldDegrade`) inside a single `requestAnimationFrame` loop owned by this component (not `CocoSpeechAudio`), per RESEARCH.md Section 5/6. Also gate on `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at mount per the UI-SPEC's recommended discretionary inclusion.

---

### `src/components/student/MissionFlowShell.tsx` (MODIFY, event-driven)

**Analog:** itself — single-line additive mount, no existing branch touched. Full render tree read (lines 591-767 span the return statement; relevant excerpt below).

**Exact insertion point** (current lines 591-620):
```tsx
return (
  <div>
    {/* Page header */}
    <h1 style={displayTitleStyle}>{missionTitle}</h1>
    <TurnProgressBar current={currentTurnNumber} total={requiredTurns} />

    {/* Resume notice (D-04) */}
    {showResumeNotice && (
      <div style={{ ...resumeNoticeStyle, marginTop: 16, marginBottom: 0 }}>
        <p style={{ fontSize: 16, color: "#4B5563", margin: 0, lineHeight: 1.5 }}>
          Welcome back! Picking up where you left off.
        </p>
      </div>
    )}

    {/* Step card area */}
    <div style={{ marginTop: 24 }} aria-live="polite">
      {/* ... per-flow.step conditional rendering, unchanged ... */}
```
Insert `<MascotStage ... />` immediately after the `showResumeNotice` block and before the `{/* Step card area */}` comment/div — this is unconditional JSX at the top level of the single `return`, so it mounts once and persists across every `flow.step` value without any new state machine (D-01 satisfied structurally, not by new logic).

**`FlowState` fields to pass as props — no new state needed** (type already defined, lines 100-113):
```typescript
type FlowState = {
  turnIndex: number;
  step: FlowStep;
  hintLevel: number;
  originalTranscript: string | null;
  repeatTranscript: string | null;
  improvedSentence: string | null;
  originalFeedback: OriginalFeedback | null;
  repeatFeedback: RepeatFeedback | null;
  hasRetriedThisTurn: boolean;
};
```
Pass `flow.step`, `flow.originalFeedback?.kind`, `flow.repeatFeedback?.kind` into `deriveExpression()` either inline in `MissionFlowShell` or inside `MascotStage` itself (planner's call on where the `deriveExpression()` call site lives — either is a pure-function call with no new plumbing either way).

**Import block convention** (lines 25-38 — follow this exact grouping: actions, styles, step components, then types):
```typescript
import {
  displayTitleStyle,
  primaryButtonStyle,
  resumeNoticeStyle,
  stepCardStyle,
} from "@/components/student/styles";
import { StepBuddyQuestion } from "@/components/student/StepBuddyQuestion";
import { StepImprovedRepeat } from "@/components/student/StepImprovedRepeat";
import { StepAiEvaluationFeedback } from "@/components/student/StepAiEvaluationFeedback";
import { StepTurnTransition } from "@/components/student/StepTurnTransition";
import { StepMissionComplete } from "@/components/student/StepMissionComplete";
import { TurnProgressBar } from "@/components/student/TurnProgressBar";
```
Add `import { MascotStage } from "@/components/student/MascotStage";` in the same block, alongside the other `Step*`/`TurnProgressBar` component imports.

---

### `src/app/student/missions/[assignmentStudentId]/page.tsx` (MODIFY, possibly)

**Analog:** itself — the page currently renders `<MissionFlowShell ... />` directly inside its return (line 129-132+). No analog needed beyond confirming this file only composes props through; no server data-fetch changes are expected since `MascotStage` needs nothing beyond what `MissionFlowShell` already receives.

---

### Test files

**Analog:** `tests/domain/character-profile.test.ts` (full 113-line file read) for `character-expression.test.ts` — same `describe`/`it` structure, same "static/pure fixture, no mocking" style:
```typescript
import { describe, expect, it } from "vitest";
import { CHARACTER_PROFILES, DEFAULT_BUDDY, getCharacterProfile } from "@/domain/character/profile";
import { DEFAULT_CHARACTER_ID } from "@/domain/mission/schemas";

describe("character profile module (CHAR-01/02/03/04, FLOW-02)", () => {
  it("resolves default-buddy to a profile with displayName Coco", () => {
    const profile = getCharacterProfile(DEFAULT_CHARACTER_ID);
    expect(profile.displayName).toBe("Coco");
    expect(profile.characterId).toBe(DEFAULT_CHARACTER_ID);
  });
  // ...
});
```
For `character-expression.test.ts`, follow this exact shape but add the RESEARCH.md-mandated hard-constraint test: an explicit assertion enumerating every reachable input combination and asserting the result is never a `"sad"`-adjacent value (structurally impossible since the return type has no such member, but add a test that would fail loudly if the type were ever loosened) — see RESEARCH.md Pitfall 4 and the Wave 0 Gaps table.

**Analog:** `tests/domain/review-buckets.test.ts` for `mascot-speaking-state.test.ts` and `mascot-perf-degrade.test.ts` — this file demonstrates the "RED test importing a not-yet-existing module, fixture-builder helper functions (`row(status, id)`), plain `describe`/`it` over primitive inputs" pattern that fits pure functions taking primitive/array arguments (no DOM/Audio mocking needed, consistent with `vitest.config.ts`'s `environment: "node"` / no jsdom):
```typescript
import { describe, expect, it } from "vitest";
import { bucketAssignmentStudents } from "@/domain/teacher/review-buckets";

type StatusRow = { id: string; status: string };
function row(status: string, id = `row-${status}`): StatusRow {
  return { id, status };
}

describe("bucketAssignmentStudents — five D-05 buckets always present", () => {
  it("returns all five bucket keys for an empty input array", () => {
    const result = bucketAssignmentStudents([]);
    expect(result).toHaveProperty("completed");
    // ...
  });
});
```
Adapt this fixture-builder-function + primitive-input style for:
- `mascot-speaking-state.test.ts`: build `(amplitude, now, state)` fixture triples and assert `updateSpeakingVisual(...)` transitions correctly across the 200ms hysteresis window.
- `mascot-perf-degrade.test.ts`: build frame-delta arrays (e.g., `Array(30).fill(16)` healthy vs `Array(30).fill(40)` degraded) and assert `shouldDegrade(...)` boolean output at the `DEGRADE_SAMPLE_SIZE`/`DEGRADE_TRIGGER_RATIO` boundaries.

## Shared Patterns

### "Pure domain module, no DB/AI/server imports" doc-comment contract
**Source:** `src/domain/character/profile.ts` lines 1-10
**Apply to:** `src/domain/character/expression.ts`, `mascot-speaking-state.ts`, `mascot-perf-degrade.ts` — all three new domain modules must open with this exact contract statement, adapted to cite MASCOT-01..04/D-05/D-07 instead of CHAR-04/D-11.

### "Degrade, never block" philosophy
**Source:** `src/components/student/CocoSpeechAudio.tsx` lines 14-19 (doc comment) — the component "NEVER renders the line's text... a route/audio failure degrades the speaker control only and never hides the line or blocks the homework loop."
**Apply to:** `MascotStage.tsx` and the perf-degrade wiring — extend verbatim: a mascot render/perf failure degrades the animation only, never blocks recording/submitting/advancing turns (D-07). No new try/catch around flow-critical actions is needed — the mascot code must simply never be awaited by or wired into `startAttemptAction`/`completeMissionAction`/`revealHintAction`.

### Shared style-token file, not local inline styles
**Source:** `src/components/student/styles.ts` (all 279 lines — consistently imported by every existing student component: `CocoSpeechAudio.tsx`, `MissionFlowShell.tsx`, `Step*.tsx`)
**Apply to:** `MascotStage.tsx` — add new exported const styles (`mascotStageStyle`, `mascotDialogueBoxStyle`, `mascotSpeakerLabelStyle`, gradient background style) to `styles.ts` itself rather than defining them inline in the component file, matching the established per-phase convention of appending a new `// ─── Phase N: ... tokens ───` section (see the `// ─── Phase 4 ───`, `// ─── Phase 5 ───`, `// ─── Phase 6 ───` section-comment convention already in the file, lines 101, 135, 169, 195, 212, 222).

### One-source-node-per-`<audio>`-element cache
**Source:** RESEARCH.md Section 2 (no direct codebase precedent — first Web Audio usage in this project)
**Apply to:** `CocoSpeechAudio.tsx`'s new analyser-attachment code — must use a module-scope `WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>` cache exactly as sketched, because the browser throws on a second `createMediaElementSource()` call for the same DOM node and React can reuse the `<audio>` DOM node across `src` reassignments within one component mount.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/domain/character/mascot-speaking-state.ts` (Web Audio hysteresis logic) | utility | transform | No prior Web Audio / audio-amplitude code exists anywhere in this codebase — this is the first phase to touch the Web Audio API. Use RESEARCH.md Section 5's sketch as the primary source, `profile.ts` only for module-shape/doc-comment conventions. |
| `src/domain/character/mascot-perf-degrade.ts` (rAF frame-budget heuristic) | utility | transform | No prior client-side performance-measurement code exists in this codebase. Use RESEARCH.md Section 6's sketch as the primary source. |
| `next/image` usage in `MascotStage.tsx` | component (image delivery) | file-I/O (static asset) | Zero existing `next/image` usage anywhere in the codebase (confirmed via grep) — `ShareClassDialog.tsx`'s plain `<img>` is the only image precedent and is explicitly the wrong pattern to copy (see Pattern Assignments above). Use RESEARCH.md's `next/image` code example as the primary source; it is a synthesized pattern from Next.js 15 official docs, not a codebase analog. |

## Metadata

**Analog search scope:** `src/components/student/`, `src/components/teacher/`, `src/domain/character/`, `tests/domain/`
**Files scanned:** `CocoSpeechAudio.tsx`, `MissionFlowShell.tsx`, `styles.ts`, `profile.ts`, `ShareClassDialog.tsx`, `character-profile.test.ts`, `review-buckets.test.ts`, `page.tsx` (mission page), plus a codebase-wide grep for `next/image`/`<img>` usage (only one hit, in `ShareClassDialog.tsx`)
**Pattern extraction date:** 2026-07-05
