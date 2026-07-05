# Phase 10: Mascot (VN-style) - Research

**Researched:** 2026-07-05
**Domain:** Client-side 2D character presentation driven by Web Audio amplitude, in a Next.js 15 / React 19 app with a hand-rolled CSS design system
**Confidence:** HIGH

## Summary

This phase wires four already-committed static PNG sprites into a persistent VN-style mascot stage, with a "speaking" state driven by real Web Audio amplitude off the existing `<audio>` element. The single blocking research question — Rive vs static sprites — resolves cleanly in favor of **static sprites**: the committed assets are raster PNGs (not vector), the fixed 4-state set has no need for a visual state-machine authoring tool, this is explicitly a "wiring not art authoring" phase, and Rive would add a new runtime dependency, a new asset pipeline (.riv files, Rive editor re-authoring of already-finished raster art), and CPU/bundle overhead with zero corresponding benefit given raster-only content. The ROADMAP's "static sprites are an explicitly acceptable v0" language is confirmed correct by this research, not merely accepted by default.

With that settled, the audio-amplitude wiring seam follows D-04's recommended default: `CocoSpeechAudio` keeps owning its per-step `<audio>` element (preserving the working Phase 8 autoplay/replay/degrade path untouched) and additionally attaches a `MediaElementAudioSourceNode` + `AnalyserNode` once per element instance, exposing a small `onAmplitude(level: number)` / `onPlayingChange(playing: boolean)` callback pair that a shell-level, persistent `MascotStage` component subscribes to via a ref-held callback (not React Context — there is exactly one producer and one consumer per mounted mission page, so Context adds indirection without benefit). This is a viable bridge: nothing about persisting the mascot at `MissionFlowShell` level conflicts with `CocoSpeechAudio` continuing to mount/unmount per step-card render, because the callback prop, not the DOM node, is what crosses the boundary.

**Primary recommendation:** Ship static sprites (`next/image`, not raw `<img>`, to solve the 1.7–4.5MB native PNG problem) with a shell-level `MascotStage` subscribing to an amplitude callback exposed from `CocoSpeechAudio` via a lifted `AnalyserNode`, degrading to a static sprite-only rendering (no amplitude animation) on a self-measured rAF frame-time budget breach or `prefers-reduced-motion: reduce`, and never blocking the mission flow regardless of mascot render health.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mascot stage layout (background, sprite, dialogue frame) | Browser / Client | — | Pure presentational client component; no server data needed beyond existing flow state |
| Expression-state derivation (idle/happy/celebrate/encouraging) | Browser / Client | — | Pure function over `FlowState` fields already computed client-side in `MissionFlowShell`; no new server round-trip |
| Speaking-state amplitude signal | Browser / Client | — | Web Audio `AnalyserNode` is a browser-only API reading the client-side `<audio>` element; server has no role |
| Audio playback (source of amplitude) | Browser / Client | — | Unchanged Phase 8 `CocoSpeechAudio` ownership — server only issues signed TTS URLs, never touches playback |
| Low-end performance degrade detection | Browser / Client | — | Self-measured `requestAnimationFrame` delta and `matchMedia('(prefers-reduced-motion: reduce)')`; no server signal involved |
| Sprite asset delivery | CDN / Static | Frontend Server (SSR) | `next/image` re-encodes/resizes at request time (Next.js image optimization API) but the source files are static assets in `public/images/` — no database or business logic involved |

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The mascot is a **persistent stage rendered at the `MissionFlowShell` level, above the step cards** (MASCOT-01). Coco + background + dialogue frame stay mounted across every step (question, aiFeedback, repeat, repeatFeedback, transition, complete, reviewPending); the existing step cards render below/within the stage. This gives continuous VN-style character presence — Coco does not appear/disappear between beats.
- **D-02:** The VN dialogue box is an **additive frame around the mascot; existing step cards are NOT restructured this phase.** Coco's line text stays where it currently renders (in the step cards); the dialogue box + speaker name deliver the VN framing without a text-into-box reflow. Full text-into-box migration is explicitly deferred to Phase 12.
- **D-03:** The speaking state is **driven by real audio-playback amplitude off the existing `<audio>` element** (Web Audio API analyser), never a timer and never full viseme lip-sync. This requirement is LOCKED.
- **D-04 (Claude's discretion — deferred to research/planning):** The exact wiring seam is **left to the phase researcher/planner to finalize AFTER the Rive-vs-static-sprite spike**, because the spike outcome changes how amplitude is consumed. **Recommended default (lower risk):** keep `CocoSpeechAudio` owning its per-step `<audio>` element and expose a `playing` + amplitude signal (callback/ref/context) that the shell-level mascot subscribes to — this preserves the working Phase 8 playback path rather than refactoring it. Lifting audio to a single shared shell-level element/AudioContext is the more VN-clean alternative but touches the load-bearing Phase 8 path; only adopt it if research shows the per-step subscription can't reliably bridge.
- **D-05:** Expressions are **mapped from signals the flow already computes** — no new AI, no new data plumbing. Baseline mapping: idle → default/between actions (also future host for Phase 11 "Coco is thinking…"); speaking → audio amplitude active; happy/celebrating → accepted outcomes, mission complete; encouraging/neutral → miss/retry paths. Sprites already exist for neutral, happy, thinking, encouraging, celebrate, sad, surprised — planner selects the 3–5 tied to flow signals and MUST NOT exceed the fixed set.
- **D-06:** **One fixed, single background for v0** — honors MASCOT-04's "no per-scene background variants" guardrail. Recommended v0 is a simple themed backdrop (solid/gradient). Scene-premise-driven/per-mission backgrounds stay DEFERRED (Phase 11/12).
- **D-07:** If the amplitude-driven animation is too heavy on a Chromebook/older tablet, Coco **gracefully degrades to a static expression sprite** — expression still swaps on state, only the per-frame amplitude animation drops. The mission flow never blocks on mascot performance (mirrors Phase 8's "voice degrades, homework loop never blocks"). Low-end device testing on real hardware is a success criterion, not optional.

### Claude's Discretion

- Exact audio-wiring seam (D-04) — pending the Rive-vs-static spike outcome; recommended default documented above. **This research resolves it: static sprites win, and the per-step-subscription bridge (callback, not Context/DOM-lifting) is confirmed viable.**
- Dialogue-box framing (D-02) — resolved as additive; text migration deferred to Phase 12.
- Background choice (D-06) — resolved as one fixed simple backdrop (UI-SPEC locks this as a CSS gradient, zero new art files).
- Whether reduced-motion is *also* honored on top of D-07's degrade path — a reasonable accessibility add the planner may include, but the perf guardrail chosen is the static-sprite degrade. **This research recommends including it — it is a one-line `matchMedia` check that reuses the exact same degrade code path.**

### Deferred Ideas (OUT OF SCOPE)

- Full Coco-line-text-into-dialogue-box migration → Phase 12 (UI overhaul). This phase keeps step-card text in place (D-02).
- Per-scene / scene-premise-driven backgrounds → Phase 11 owns the scene-premise text; a richer per-mission scene experience is Phase 12. This phase ships one fixed background (D-06).
- Mascot hosting the "Coco is thinking…" dynamic-turn indicator → Phase 11 D-12; keep the idle state addressable but don't build the chat integration here.
- Rive authoring pipeline (if the spike had chosen Rive) → **moot: this research concludes static sprites win; no Rive pipeline is built.**

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MASCOT-01 | Coco appears on screen as a 2D character (waist-up over background) with a dialogue box | Mount seam confirmed at `MissionFlowShell` render tree (line ~591-627, above `{/* Step card area */}` block); `next/image` sizing pattern for the ~1792×2389px native sprites documented below |
| MASCOT-02 | Speaking state driven by Web Audio amplitude off `<audio>`, not a timer/viseme | `AnalyserNode`/`MediaElementAudioSourceNode` attachment pattern, single-source-node-per-element gotcha, autoplay/AudioContext-resume gotcha, and the callback-signal bridge from `CocoSpeechAudio` to the shell all documented below |
| MASCOT-03 | 3-5 fixed content-tied expression states, no-harsh-failure | Pure mapping function from existing `FlowState` fields (`originalFeedback.kind`, `repeatFeedback.kind`, `flow.step`) documented below; confirms `coco-sad-alpha.png` must never be wired |
| MASCOT-04 | Low-end performance + fixed small asset scope | rAF frame-time-budget degrade heuristic documented below; static-sprite decision itself is the primary asset-scope guardrail (no Rive pipeline, no new art) |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

No project-level `./CLAUDE.md` or `./.claude/CLAUDE.md` file exists in this repository. No additional directives beyond the CONTEXT.md decisions and the established codebase patterns below apply.

---

## 1. Rive vs Static Sprite Decision (BLOCKING — RESOLVED)

**Decision: Static sprites. Do not adopt Rive for this phase.**

### Rationale

1. **The art is already raster, not vector.** The 7 committed sprites (`public/images/coco-*-alpha.png`) are alpha-cut PNG exports at native ~1792×2389px — they were produced by an AI-art + background-removal pipeline (`.planning/debug/sprite-alpha-pipeline.py`), not authored as vector shapes in a design tool. Rive's entire value proposition — a vector state machine with designer-authored interpolated states — requires vector source art. Importing these PNGs into Rive would only let you swap between them as static "art board" states; you would get zero interpolation benefit while paying Rive's runtime and pipeline cost. `[ASSUMED — reasoned from file provenance in project memory, not independently re-verified this session]`

2. **The fixed state set is a discrete swap, not a continuum.** MASCOT-03/D-05 lock exactly 4 active sprites (idle/happy/celebrate/encouraging) plus one behavioral overlay (speaking = amplitude animation on top of the current sprite). This is a "swap discrete states" problem, which CSS/React conditional rendering solves natively. Rive earns its cost when a mascot needs continuous, interpolated, designer-tunable motion across many states — not when swapping between 4 fixed PNGs. `[CITED: dev.to/uianimation — "an animated tool is overkill if your mascot never has to move [beyond simple swaps]... you can always start with a free static image"]`

3. **Bundle/runtime cost is real, even though Rive itself is efficient.** Rive's own numbers are good in isolation (an 18KB `.riv` file vs 181KB Lottie equivalent; ~32% vs ~92% CPU in one Android comparison) `[CITED: pixelpoint.io/blog/rive-react-optimizations]` — but that comparison is Rive-vs-Lottie, not Rive-vs-static-sprite. Against a static sprite (zero JS runtime, zero new dependency, browser-native `<img>`/`next/image` decode), Rive is strictly additive cost: a new npm dependency (`@rive-app/react-canvas` or `rive-react`, ~zero KB "free" but still shipped JS + WASM/canvas runtime), a Canvas or WebGL render surface competing for the same low-end-device budget MASCOT-04 is explicitly worried about, and a new asset-authoring toolchain the team does not currently use.

4. **This is explicitly a "wiring not art authoring" phase.** Re-authoring 7 finished raster sprites into a Rive vector rig (or hand-tracing them) is art-authoring work the phase's own scope statement rules out. Static sprites require zero re-authoring — the committed PNGs are used exactly as-is.

5. **No npm dependency change required.** Static sprites use only `next/image` (already part of Next.js core) and the browser's built-in Web Audio API. This satisfies the "no new npm deps if static sprites win" question directly — confirmed, zero new dependencies.

6. **The ROADMAP's framing is validated, not just accepted.** ROADMAP.md explicitly names this as a required spike outcome ("static sprites are an explicitly acceptable v0"), and `REQUIREMENTS.md` carries `MASCOT-F2` ("Advanced rig (Rive/Live2D) if static sprites prove insufficient — decide via a v2.3 spike") as an explicitly deferred future item. This research confirms MASCOT-F2 should stay deferred: nothing in this phase's requirements needs Rive's interpolation/state-machine authoring value, and adopting it now would be scope creep against MASCOT-04's own guardrail.

### When to revisit this decision

If a future phase requires: (a) genuinely continuous/interpolated animation (not discrete swaps), (b) non-technical designers authoring new expressions without code changes, or (c) vector art that scales losslessly across device sizes — Rive becomes worth reconsidering. None of those conditions hold for Phase 10.

---

## 2. Web Audio Amplitude Seam off `CocoSpeechAudio` (MASCOT-02, D-03/D-04)

### Current `CocoSpeechAudio` shape (verified by direct read)

`src/components/student/CocoSpeechAudio.tsx` owns exactly one `<audio>` element per mounted instance (`audioRef`), fetches a signed URL keyed by a line descriptor, and drives a `PlaybackState` state machine (`"loading" | "ready" | "playing" | "error"`) off native audio events (`onCanPlay`, `onPlaying`, `onPlay`, `onWaiting`, `onEnded`, `onError`). Autoplay is attempted from `handleCanPlay()`, with a rejected `play()` promise caught and left in `"ready"` state for manual replay. The component re-fetches (and therefore its `<audio>` element's `src` changes) whenever the `line` descriptor prop changes — this happens on every new step/turn.

### Gotcha 1: one `MediaElementAudioSourceNode` per `<audio>` element, ever

Browsers permit only **one** `MediaElementAudioSourceNode` to ever be created from a given `HTMLMediaElement`. A second `createMediaElementSource()` call on the same element throws (`"HTMLMediaElement already connected previously to a different MediaElementSourceNode"`). `[CITED: developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode]` `[CITED: github.com/shaka-project/shaka-player#1372]`

This matters here specifically because `CocoSpeechAudio`'s `<audio>` element is **conditionally rendered** (`{audioUrl ? <audio ...> : null}`) and its `src` changes on every line descriptor change — but the underlying DOM node persists across `src` reassignments within one mount (React reuses the `<audio>` element across re-renders as long as the JSX position/key is stable; it does NOT reuse it across full unmount/remount, e.g. when `audioUrl` goes from a value back to `null` and then to a new value). **Practical rule for the planner:** create the `MediaElementAudioSourceNode` exactly once per `<audio>` DOM node lifetime, in the same effect/ref that first sees a non-null `audioRef.current`, and never attempt to create a second one for the same element — reuse the existing node across `src` changes, matching the browser's own constraint. `[CITED: MDN + shaka-player issue]`

### Gotcha 2: must still route to `destination` or audio goes silent

Connecting an `<audio>` element to a `MediaElementAudioSourceNode` re-routes its audio graph through the Web Audio API. If you attach an `AnalyserNode` but never connect anything through to `audioContext.destination`, playback becomes silent (the `AnalyserNode` is a pass-through analysis node, not an audio sink). The correct graph is: `sourceNode -> analyserNode -> destination` (or `sourceNode -> destination` directly plus `sourceNode -> analyserNode` as a parallel tap — either topology works since `AnalyserNode` doesn't need to be the terminal node). Any wiring omitting the final connection to `destination` is a silent-audio regression risk against the load-bearing Phase 8 playback path — this is the single highest-risk mistake in this seam.

### Gotcha 3: AudioContext autoplay/gesture policy

An `AudioContext` created before any user gesture starts in `"suspended"` state in Chrome and most modern browsers; it must be resumed via `context.resume()` inside or immediately after a user-gesture handler (click/tap). `[CITED: developer.chrome.com/blog/autoplay]` `[CITED: developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay]` This directly interacts with the existing opportunistic-autoplay pattern in `CocoSpeechAudio`: the `<audio>` element's own `.play()` can succeed or be blocked independently of the `AudioContext`'s suspended state, but if the `AudioContext` itself is suspended, the `AnalyserNode` will read all-zero/flat data even while audio is (or isn't) audibly playing. **Practical rule:** create the shared `AudioContext` lazily (on first audio/interaction), and call `.resume()` opportunistically on every subsequent user gesture already present in the flow (e.g., the existing replay button's `onClick`, or the recorder start button) — this reuses gesture events the flow already has, requiring no new UI.

### Recommended seam (confirms D-04's recommended default is viable)

**Per-step audio ownership stays in `CocoSpeechAudio`; amplitude crosses the boundary via a callback prop, not Context and not DOM-lifting.**

```typescript
// src/components/student/CocoSpeechAudio.tsx (sketch — additive to existing component)

type CocoSpeechAudioProps = {
  assignmentStudentId: string;
  line: CocoSpeechLine;
  label?: string;
  /** MASCOT-02: fired on each analyser tick while playing; omit to opt out. */
  onAmplitudeFrame?: (level: number) => void;
  /** MASCOT-02: fired on playing-state transitions (drives idle<->speaking). */
  onPlayingChange?: (playing: boolean) => void;
};

// Module-scope singleton — one AudioContext for the whole tab, lazily created,
// resumed on every user gesture already present in the flow.
let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedAudioContext) sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}

// Per-element source-node cache — satisfies the "one source node per element,
// ever" browser constraint even if this component instance re-renders.
const sourceNodeCache = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

function attachAnalyser(el: HTMLMediaElement, ctx: AudioContext): AnalyserNode {
  let source = sourceNodeCache.get(el);
  if (!source) {
    source = ctx.createMediaElementSource(el);
    sourceNodeCache.set(el, source);
    source.connect(ctx.destination); // never omit — silent-audio regression risk
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256; // small FFT — cheap, amplitude doesn't need resolution
  source.connect(analyser); // parallel tap; does not replace the destination connection
  return analyser;
}
```

The shell-level `MascotStage` never touches the `<audio>` DOM node or the `AudioContext` directly — it only receives `onAmplitudeFrame`/`onPlayingChange` callbacks, which it stores in a ref and reads from its own `requestAnimationFrame` loop (see Section 5). This keeps `CocoSpeechAudio`'s existing autoplay/replay/error-degrade logic (the load-bearing Phase 8 path) completely untouched — the new code is additive, not a refactor of existing branches.

**Verdict on D-04's open question:** the per-step subscription bridges reliably to a persistent shell-level mascot. Nothing about persistence requires the audio *element* to be shared — only the *callback* needs to reach a stable, persistently-mounted consumer, and callbacks/refs cross React component-unmount boundaries trivially (the shell always exists; only the leaf `CocoSpeechAudio` instances mount/unmount as steps change, and each new instance simply re-invokes the same stable `onAmplitudeFrame` prop it's given). No DOM-audio-lifting refactor is needed.

---

## 3. Persistent Stage Mount at `MissionFlowShell` (MASCOT-01, D-01)

### Confirmed mount seam

`MissionFlowShell.tsx`'s render function (`src/components/student/MissionFlowShell.tsx`, lines 591-627 in the version read this session) is:

```tsx
return (
  <div>
    <h1 style={displayTitleStyle}>{missionTitle}</h1>
    <TurnProgressBar current={currentTurnNumber} total={requiredTurns} />
    {showResumeNotice && ( /* ... */ )}
    {/* Step card area */}
    <div style={{ marginTop: 24 }} aria-live="polite">
      {/* per-flow.step conditional rendering */}
    </div>
  </div>
);
```

**Mount point:** insert `<MascotStage ... />` between the `TurnProgressBar`/resume-notice block and the `{/* Step card area */}` `<div>` — i.e., immediately before line 620 (`<div style={{ marginTop: 24 }} ...>`). This is unconditional JSX at the top level of the single `return`, so it never unmounts as `flow.step` changes; only the step-card `<div>`'s children swap. This satisfies "no layout shift between steps" directly: the stage's own dimensions are independent of which step-card branch renders below it.

### Expression-mapping inputs available without a new state machine (confirmed by direct read)

All of the following live in the existing `FlowState` type already defined in `MissionFlowShell.tsx` — no new field is needed:

| Field | Type | Used for |
|-------|------|----------|
| `flow.step` | `FlowStep` (`"question" \| "aiFeedback" \| "repeat" \| "repeatFeedback" \| "transition" \| "reviewPending" \| "complete"`) | Distinguishes `complete` (celebrate) from in-flow accepted turns (happy) |
| `flow.originalFeedback?.kind` | `"acceptedOriginal" \| "needsCorrection" \| "retryOriginal" \| "teacherReview"` | Drives happy vs encouraging mapping on the original-answer path |
| `flow.repeatFeedback?.kind` | `"repeatAccepted" \| "repeatRetry" \| "repeatReview"` | Drives happy vs encouraging mapping on the repeat path |
| `flow.hasRetriedThisTurn` | `boolean` | Available if the planner wants a distinct signal for forced-retry-on-1-star, though D-05's mapping does not require branching on it separately (all miss/retry kinds already map to encouraging) |

No `starBand` field exists directly on `FlowState` — star bands live inside `originalFeedback`/`repeatFeedback` objects as `starBand?: PronunciationStarBand | null` (optional). The mapping function should treat `starBand` as available-but-optional metadata; the primary signal for expression selection is the feedback `.kind` discriminant, which is always present when feedback exists.

**Recommended location for the mapping function:** a new pure module, e.g. `src/domain/character/expression.ts`, sibling to `src/domain/character/profile.ts` (which is explicitly named in CONTEXT.md as the natural home for expression-mapping metadata and is already a DB/AI-import-free domain module). Signature sketch:

```typescript
// src/domain/character/expression.ts — pure, no DB/AI/server imports
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
  return "idle"; // question/repeat/transition/reviewPending/teacherReview default
}
```

`teacherReview` outcomes intentionally fall through to `idle` rather than either happy or encouraging — CONTEXT.md's D-05 mapping does not name teacher-review as a happy or encouraging trigger, and idle is the safe, non-committal default (avoids accidentally implying a verdict before the teacher has reviewed).

This function is trivially unit-testable against `FlowState`-shaped fixtures with zero DOM/audio mocking — see Validation Architecture below.

---

## 4. Expression Mapping (MASCOT-03, D-05) — Final Table

| State | Sprite file | Triggered by (confirmed fields) |
|-------|------------|--------------|
| idle | `coco-neutral-alpha.png` | Default; `question`, `repeat`, `transition`, `reviewPending` steps, and `teacherReview` outcomes. Also the future host for Phase 11 D-12's "Coco is thinking…" — the mapping function's `idle` branch must stay reachable and not be special-cased away. |
| speaking | (idle/neutral sprite + amplitude animation layer) | `CocoSpeechAudio`'s `onPlayingChange(true)` + amplitude above the silence threshold (Section 5) — layered on top of whichever static sprite the state above selects, NOT a 5th sprite file |
| happy | `coco-happy-alpha.png` | `originalFeedback.kind === "acceptedOriginal"` OR `repeatFeedback.kind === "repeatAccepted"`, **except** when `flow.step === "complete"` (celebrate takes precedence) |
| celebrate | `coco-celebrate-alpha.png` | `flow.step === "complete"` only |
| encouraging | `coco-encouraging-alpha.png` | `originalFeedback.kind` in `{"needsCorrection", "retryOriginal"}` OR `repeatFeedback.kind === "repeatRetry"` |
| (reserved, unused this phase) | `coco-thinking-alpha.png`, `coco-sad-alpha.png`, `coco-surprised-alpha.png` | Explicitly out of scope. `coco-sad-alpha.png` must NEVER be wired (no-harsh-failure principle) — this is a hard constraint the planner should encode as an explicit test assertion, not just a convention. |

This yields exactly 4 static sprites in rotation + 1 behavioral (speaking) state, matching the UI-SPEC's locked count and staying within the MASCOT-03 3–5 ceiling.

---

## 5. Speaking Animation Approach + Silence Hysteresis (MASCOT-02)

### Recommended v0 approach: amplitude-scaled scale/bounce pulse

Per the UI-SPEC's own simplest-first ordering, the recommended v0 is **(a) a subtle scale/bounce pulse on the sprite, scaled by amplitude** — cheapest to implement (a single CSS `transform: scale(...)` driven by a ref-read value, no extra image assets, no mouth-overlay art needed), and clearly non-lip-sync (satisfies the explicit "Out of Scope: full viseme/phoneme lip-sync" requirement).

### Amplitude read loop

`AnalyserNode.getByteFrequencyData()` (or `getByteTimeDomainData()` for a more literal waveform-amplitude read) into a pre-allocated `Uint8Array` sized by `analyser.frequencyBinCount`, read once per animation frame inside a `requestAnimationFrame` loop owned by the shell-level `MascotStage` (not by `CocoSpeechAudio` — the stage is what needs a continuous animation loop; the audio component just needs to expose the `AnalyserNode` or a derived amplitude value via the callback). Average the byte array (or read a peak) to a single 0–1 normalized "amplitude level" per frame; this becomes the scale/bounce coefficient.

`fftSize` should stay small (e.g. `256`, giving a 128-bin frequency array, or even smaller) — this is a coarse amplitude gauge, not a spectrum visualizer, so a large FFT only costs CPU for no visual benefit. This is directly relevant to the MASCOT-04 low-end-device requirement.

### Silence hysteresis (150-250ms hold window)

Per the UI-SPEC's explicit recommendation, apply a hold/smoothing window so natural mid-sentence pauses don't flicker the speaking animation off and on: track "last frame where amplitude exceeded the silence threshold" in a ref; only transition the visible speaking-state to `false` if more than the hold window (recommend 200ms as the midpoint of the UI-SPEC's 150-250ms range) has elapsed since that last-above-threshold frame. This is a simple debounce-style pattern implementable with a single timestamp ref compared against `performance.now()` each rAF tick — no timer/interval needed, it rides the same rAF loop already reading amplitude.

```typescript
// Sketch — lives in the MascotStage's rAF loop, not a separate setInterval
const SILENCE_HYSTERESIS_MS = 200;
const SILENCE_THRESHOLD = 0.05; // normalized 0-1 amplitude floor, tune empirically

function updateSpeakingVisual(amplitude: number, now: number, state: {
  lastAboveThresholdAt: number;
  isSpeakingVisually: boolean;
}) {
  if (amplitude > SILENCE_THRESHOLD) {
    state.lastAboveThresholdAt = now;
    state.isSpeakingVisually = true;
  } else if (now - state.lastAboveThresholdAt > SILENCE_HYSTERESIS_MS) {
    state.isSpeakingVisually = false;
  }
  // else: still within the hold window — keep isSpeakingVisually true
}
```

---

## 6. Low-End Performance Degrade (MASCOT-04, D-07)

### Recommended detection method: self-measured rAF frame-time budget

Rather than user-agent sniffing (unreliable, and Chromebooks/tablets don't have a single identifiable UA signature), measure the actual delta between consecutive `requestAnimationFrame` callback timestamps at runtime. A healthy 60fps device produces ~16.6ms deltas; sustained deltas well above budget (e.g., consistently >33ms, i.e. sub-30fps) over a short rolling window (e.g., the last 30-60 frames) indicate the device cannot keep up with even the lightweight amplitude animation. `[CITED: web.dev/articles/speed-rendering — 16ms/frame budget]` `[CITED: general rAF-delta-measurement pattern from search: "the interval between frames can be measured... compared to an expected interval"]`

This is the same rAF loop already reading amplitude (Section 5) — the frame-time check is a near-zero-cost addition (one more `performance.now()` subtraction per tick), not a second monitoring system.

```typescript
// Sketch — one rolling check, reuses the existing amplitude rAF loop
const FRAME_BUDGET_MS = 33; // ~30fps floor
const DEGRADE_SAMPLE_SIZE = 30;
const DEGRADE_TRIGGER_RATIO = 0.5; // half the recent frames over budget -> degrade

function shouldDegrade(recentFrameDeltas: number[]): boolean {
  if (recentFrameDeltas.length < DEGRADE_SAMPLE_SIZE) return false;
  const overBudgetCount = recentFrameDeltas.filter((d) => d > FRAME_BUDGET_MS).length;
  return overBudgetCount / recentFrameDeltas.length > DEGRADE_TRIGGER_RATIO;
}
```

Once `shouldDegrade()` trips, cancel the rAF loop entirely and render the currently-selected expression sprite as a plain static `<img>`/`next/image` with no per-frame transform — the expression mapping (Section 4) is untouched and keeps swapping normally; only the amplitude-driven scale/bounce layer is dropped. This satisfies "expression still swaps on state; only per-frame amplitude motion drops" exactly as UI-SPEC requires.

### `prefers-reduced-motion` — recommended inclusion

Add `window.matchMedia('(prefers-reduced-motion: reduce)').matches` as a second, independent trigger for the identical degrade path (skip starting the rAF loop at all if the media query matches on mount). This is a one-line addition that reuses the same degrade rendering branch — no new code path, just an additional gate before starting the loop. Recommended per the UI-SPEC's own framing ("low-cost to add since the degrade path already exists").

### Never blocks the flow

Both the amplitude rAF loop and the degrade check live entirely inside the `MascotStage` client component's own effect/render cycle. Nothing in the mission-flow's recording/submitting/advancing logic (`handleSubmitOriginalVoice`, `uploadVoiceClip`, `completeMissionAction`, etc.) reads from or awaits anything mascot-related — the two systems are already architecturally decoupled by the mount-point separation in Section 3. No explicit "don't block" code is needed beyond simply not wiring the mascot into any of the flow's async handlers, which the recommended seam (Section 2-3) does not do.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Amplitude extraction from audio | A custom PCM-sampling/FFT implementation | Web Audio `AnalyserNode.getByteFrequencyData()`/`getByteTimeDomainData()` | Browser-native, hardware-accelerated in most engines, zero bytes of JS shipped |
| Image responsive sizing/format negotiation | Manual multi-size PNG exports + `<picture>` breakpoints | `next/image` (built into Next.js 15, already in `package.json`) | Automatic WebP/AVIF re-encode + responsive sizing solves the 1.7-4.5MB native PNG problem with zero new dependencies |
| Low-end device detection | User-agent string parsing / device allowlists | Self-measured rAF frame-time budget (Section 6) | UA sniffing is brittle and Chromebook/tablet UAs vary widely; runtime self-measurement adapts to actual capability, not a device label |
| Vector character rigging | Hand-building a Rive-equivalent interpolation system, or paying Rive's runtime/pipeline cost for raster art | Plain conditional rendering of the 4 fixed static sprites | The art is raster; a vector rig has no source material to operate on (Section 1) |

**Key insight:** every piece of this phase's technical surface (amplitude read, image delivery, performance detection) has a zero-new-dependency, browser/framework-native solution already available in this stack. The temptation to reach for a specialized library (Rive, a UA-sniffing device-detection package, a client image-resizing library) is explicitly the wrong direction for a phase whose own guardrail (MASCOT-04) is "don't grow scope."

---

## Common Pitfalls

### Pitfall 1: Creating a second `MediaElementAudioSourceNode` on step change
**What goes wrong:** Each new `CocoSpeechAudio` instance (one per step/turn) naively calls `audioContext.createMediaElementSource(audioRef.current)` in its own effect, throwing on the second and subsequent instances if any prior instance's underlying `<audio>` DOM node is somehow reused, OR — more subtly — throwing if React's reconciliation reuses the same `<audio>` DOM node across a conditional-render toggle (`audioUrl` truthy -> falsy -> truthy again) within one `CocoSpeechAudio` mount.
**Why it happens:** The one-source-node-per-element browser rule is a lifetime constraint on the DOM node, not on the React component instance wrapping it.
**How to avoid:** Cache the source node per DOM element (e.g., `WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>`, see Section 2 sketch) and check the cache before creating.
**Warning signs:** A thrown `DOMException` in the console mentioning "already connected"; audio playback silently stopping mid-flow after a retry/replay action.

### Pitfall 2: Forgetting to connect to `destination`
**What goes wrong:** Wiring an `AnalyserNode` for amplitude reading but never completing `source -> destination` (directly or via the analyser as a non-terminal node) makes Coco's speech silent.
**Why it happens:** It's easy to think of the analyser as "the thing you connect the source to" and forget that connecting a source into the Web Audio graph re-routes it away from the native `<audio>` element's default output — the graph MUST explicitly reach `destination` again.
**How to avoid:** Always call `.connect(ctx.destination)` explicitly as part of the same setup that creates the source/analyser nodes; write a smoke test/checkpoint that audibly confirms Coco's voice plays after this wiring lands (this is a manual-verification item, not unit-testable, since it needs real audio hardware).
**Warning signs:** VOICE-01/VOICE-02 regression — Coco's lines stop being audible even though the UI shows a "playing" state.

### Pitfall 3: Starting the AudioContext/analyser loop before any user gesture
**What goes wrong:** Creating the shared `AudioContext` eagerly on component mount (rather than lazily, tied to the first playback attempt) risks it staying `"suspended"` indefinitely on browsers with strict autoplay policies, silently starving the amplitude signal (analyser reads all-zero) even if the `<audio>` element itself somehow plays.
**Why it happens:** AudioContext suspension is a separate gate from `<audio>` element autoplay blocking — the existing `CocoSpeechAudio` code only handles the latter (catching a rejected `play()` promise).
**How to avoid:** Create the `AudioContext` lazily on first use, and call `.resume()` opportunistically inside any existing gesture handler already in the flow (replay button click, recorder start button, "continue" button) — don't require a new dedicated "enable sound" UI element.
**Warning signs:** Speaking animation never triggers even though audio audibly plays; `audioContext.state === "suspended"` when logged.

### Pitfall 4: Wiring `coco-sad-alpha.png` by accident via a loose mapping
**What goes wrong:** A tempting shortcut is mapping "low star band" or "any negative outcome" broadly to whichever sprite "looks most fitting," which could pull in `coco-sad-alpha.png` since it exists in the committed asset set.
**Why it happens:** The sprite exists and is visually apt for a miss — but the no-harsh-failure principle (established across Phases 4/6/9) explicitly rules this out.
**How to avoid:** Encode the mapping function (Section 3) as an explicit enum-to-enum switch that can only ever return one of the 4 named `MascotExpression` values — never leave a code path that could reference `coco-sad-alpha.png`'s filename at all in the mascot-rendering code, so it's structurally unreachable, not just conventionally avoided.
**Warning signs:** Code review or grep finding `"sad"` anywhere in the mascot rendering path outside of a comment noting it's intentionally excluded.

### Pitfall 5: Shipping native ~1.7-4.5MB PNGs unresized
**What goes wrong:** Using a plain `<img src="/images/coco-happy-alpha.png">` (matching the existing `ShareClassDialog.tsx` QR-code precedent) ships the full multi-megabyte original file on every mission-flow page load, directly working against MASCOT-04's "performs acceptably on low-end school devices" requirement and hurting LCP.
**Why it happens:** The existing codebase has zero `next/image` precedent (confirmed: only plain `<img>` is used elsewhere, for a small QR code) — the natural instinct is to follow that existing pattern.
**How to avoid:** Use `next/image` specifically for the mascot sprite (the QR-code precedent doesn't apply — that image is small and rarely re-rendered; the mascot sprite is large, native-res, and persistently mounted). Set explicit `width`/`height` (or `fill` inside a sized, `position: relative` parent) matching the fixed max-height the UI-SPEC calls for, to get both format re-encoding and correctly-sized delivery, avoiding CLS.
**Warning signs:** Network tab showing several-megabyte PNG downloads on mission-flow page load; Lighthouse LCP regression after this phase ships.

---

## Code Examples

### Attaching an analyser to an existing `<audio>` element (full pattern)

```typescript
// Source: MDN Web Audio API docs (AnalyserNode, MediaElementAudioSourceNode,
// AudioContext) — synthesized pattern, not a single copy-pasted snippet.
// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
// https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource

let sharedCtx: AudioContext | null = null;
const sourceCache = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

function ensureAnalyser(el: HTMLMediaElement): AnalyserNode {
  const ctx = (sharedCtx ??= new AudioContext());
  let source = sourceCache.get(el);
  if (!source) {
    source = ctx.createMediaElementSource(el);
    sourceCache.set(el, source);
    source.connect(ctx.destination); // keep audio audible
  }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  return analyser;
}

function readAmplitude(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
  return avg / 255; // normalize to 0-1
}
```

### `next/image` fixed-max-height sprite render

```tsx
// Source: Next.js docs, Image component — https://nextjs.org/docs/app/getting-started/images
import Image from "next/image";

<div style={{ position: "relative", width: "100%", height: 240 }}>
  <Image
    src={`/images/${spriteFile}`}
    alt="" // decorative — the speaker-name label + step-card text carry the meaning
    fill
    style={{ objectFit: "contain", objectPosition: "bottom center" }}
    sizes="(max-width: 420px) 100vw, 420px"
    priority // above-the-fold, persistent element — do not lazy-load
  />
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ScriptProcessorNode` for audio analysis | `AnalyserNode` (or `AudioWorklet` for sample-accurate processing) | `ScriptProcessorNode` deprecated since ~2014, removal has been long-threatened across browsers | `AnalyserNode` is the correct, non-deprecated API for simple amplitude/frequency reads and is what this phase should use — no reason to reach for `AudioWorklet`'s added complexity for a coarse amplitude gauge |
| Next.js Pages Router `next/legacy/image` | App Router `next/image` (this project already uses the App Router — confirmed via `src/app/student/missions/[assignmentStudentId]/page.tsx`) | Next.js 13+ | Use the current `next/image` API (`fill`, `sizes`, no `layout` prop) — this project is already on Next 15 App Router, so no legacy API concerns apply |

**Deprecated/outdated:**
- `ScriptProcessorNode`: superseded by `AnalyserNode` for read-only analysis (this phase's use case) and `AudioWorklet` for sample-level processing (not needed here).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 7 committed sprite PNGs were produced from raster/AI-generated art (not vector source), making Rive's vector-authoring value inapplicable | Section 1 (Rive decision) | If some vector source actually exists upstream of the PNG export, the case against Rive weakens slightly — but the "wiring not authoring" scope constraint and the discrete-4-state requirement still independently support the static-sprite decision, so this assumption is not solely load-bearing for the recommendation |
| A2 | Standard hosting (Vercel-style Node runtime) is in use, so `next/image`'s server-side optimization API is available and not disabled by a static-export (`output: "export"`) build mode | Section 6, Code Examples | Verified this session: `next.config.ts` sets no `output` field, so the default (server-rendered, optimization-API-enabled) mode applies. This is `[VERIFIED: next.config.ts read directly]`, not assumed — listed here only because it underlies the `next/image` recommendation's validity |

**Note:** Both prior open items from the original scoping (Rive-vs-static and the audio-wiring seam) were fully resolved by this research, not left as assumptions — see Sections 1-2.

---

## Open Questions

1. **Exact stage aspect ratio (4:3 vs 1:1) and exact fixed max-height in px**
   - What we know: UI-SPEC explicitly defers this to the planner ("recommend 4:3 or 1:1, planner's call") with a ~700px minimum mobile viewport assumption.
   - What's unclear: The precise max-height value that keeps at least one step card visible below the fold across common device viewports (iPhone SE ~667px, standard Android ~740-800px).
   - Recommendation: Planner should pick a concrete px value (e.g., 200-240px sprite render height) and verify visually on a real small-viewport device during the low-end-device checkpoint (D-07's mandated real-hardware test) rather than resolving this purely by research.

2. **Exact silence-amplitude threshold value**
   - What we know: The UI-SPEC recommends a 150-250ms hysteresis hold window; this research recommends 200ms as the midpoint.
   - What's unclear: The exact normalized-amplitude floor (this research suggested `0.05` as a starting point) will need empirical tuning against real TTS output loudness, which varies by line/voice.
   - Recommendation: Treat the threshold as a named constant, tune it during manual verification against actual Coco TTS audio rather than guessing a final value now.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Web Audio API (`AudioContext`, `AnalyserNode`, `MediaElementAudioSourceNode`) | MASCOT-02 | Browser built-in — not an installable dependency | N/A (browser-native) | None needed; supported in all current evergreen browsers targeted by this app |
| `next/image` optimization API | MASCOT-01 sprite delivery | Yes — Next.js 15 already in `package.json`, no `output: "export"` set in `next.config.ts` | Next.js `^15.0.0` (confirmed in `package.json`) | Plain `<img>` with manually pre-resized PNGs, if the optimization API is ever disabled for a hosting-platform reason |
| jsdom (for potential DOM-touching component tests) | Validation Architecture (optional) | Present only transitively (`npm ls jsdom` returns empty at top level); `vitest.config.ts` sets `environment: "node"`, no DOM globals by default | 29.1.1 (transitive) | Keep tests to pure-function units (expression mapping, hysteresis/degrade logic) that take primitive inputs and never touch real DOM/Audio APIs — this avoids needing to add jsdom as a direct dependency or reconfigure the test environment |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** jsdom / DOM test environment — fallback is to structure all new logic as pure functions injectable with fake inputs (amplitude values, frame-time deltas, `FlowState` fixtures), which the Validation Architecture below assumes throughout.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.6 (already configured — `vitest.config.ts`) |
| Config file | `vitest.config.ts` (environment: `"node"`, no jsdom) |
| Quick run command | `npx vitest run tests/domain/character-expression.test.ts` (new file — see Wave 0 Gaps) |
| Full suite command | `npx vitest run` (matches `config.json`'s `workflow.test_command`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MASCOT-01 | Mascot stage mounts once, persists across all `FlowStep` values, no layout shift | manual (visual/DOM structure) — no jsdom in this project's test environment makes a full-render assertion costly to add; recommend a manual checkpoint during execution instead | N/A — human-verify checkpoint | N/A |
| MASCOT-02 | Amplitude → speaking-visual mapping (hysteresis logic) is a pure function of `(amplitude, now, priorState)` | unit | `npx vitest run tests/domain/mascot-speaking-state.test.ts -x` | ❌ Wave 0 |
| MASCOT-02 | `AnalyserNode`/`AudioContext` wiring itself (real audio graph, real hardware) | manual (requires real audio playback + human ear/eye) | N/A — human-verify checkpoint, same as Phase 8's audio smoke tests | N/A |
| MASCOT-03 | `deriveExpression()` mapping is a pure function over `FlowState`-shaped fixtures; `coco-sad-alpha.png` is structurally unreachable | unit | `npx vitest run tests/domain/character-expression.test.ts -x` | ❌ Wave 0 |
| MASCOT-04 | `shouldDegrade()` frame-time-budget logic is a pure function over an array of frame deltas | unit | `npx vitest run tests/domain/mascot-perf-degrade.test.ts -x` | ❌ Wave 0 |
| MASCOT-04 | Real low-end device (Chromebook/older tablet) does not visibly stutter and mission flow completes | manual (real hardware) | N/A — human-verify checkpoint, mirrors Phase 8's VOICE-04 device-test precedent | N/A |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/domain/<new-file>.test.ts` (targeted, fast)
- **Per wave merge:** `npx vitest run` (full suite — matches existing project convention; last known-good baseline was 411 passed / 4 skipped per STATE.md)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the two manual real-device checkpoints (mount/layout visual check, low-end performance/perceived-smoothness check) — mirroring how Phase 8's VOICE-04 and Phase 9's PRON-03 calibration were handled as explicit human-verify gates rather than forced into automated assertions.

### Wave 0 Gaps

- [ ] `tests/domain/character-expression.test.ts` — covers MASCOT-03 (`deriveExpression()` pure function against `FlowState`-shaped fixtures, including an explicit assertion that no code path can select `coco-sad-alpha.png`)
- [ ] `tests/domain/mascot-speaking-state.test.ts` — covers MASCOT-02 (hysteresis hold-window logic against injected `(amplitude, timestamp)` sequences — no real `AnalyserNode` needed, the function under test takes primitives)
- [ ] `tests/domain/mascot-perf-degrade.test.ts` — covers MASCOT-04 (`shouldDegrade()` against injected frame-delta arrays)
- [ ] No new test framework or fixture setup required — existing `vitest.config.ts` (`environment: "node"`) is sufficient since all recommended unit tests operate on pure functions taking primitive/plain-object inputs, deliberately avoiding any dependency on jsdom or real Web Audio/DOM APIs in the automated suite (consistent with this project's existing pattern of injectable-fake-client testing for Azure/OpenAI in Phases 6/9).

---

## Security Domain

`security_enforcement` is not explicitly set to `false` in `.planning/config.json`, so this section is included per policy. This phase, however, introduces no new authentication, session, access-control, or data-handling surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged — mascot rendering reads only client-side flow state already gated by the existing student-unlock cookie (Phase 2) |
| V3 Session Management | No | No new session/cookie surface introduced |
| V4 Access Control | No | No new server route, RPC, or database access — the mascot is 100% client-rendered from data the page already fetched and validated server-side (Phase 4's snapshot/ownership checks are untouched) |
| V5 Input Validation | No | No new user input is accepted; expression mapping consumes only internally-computed enum values already validated elsewhere in the flow |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| None specific to this phase's surface | — | This phase adds a client-rendered visual/audio-analysis layer with no new network calls, no new writable data, and no new trust boundary. The only "new" browser API surface (Web Audio `AnalyserNode`) reads audio the app itself already serves via a signed URL (Phase 8's existing security boundary) — it does not expand what the client can read or write. |

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reads: `src/components/student/CocoSpeechAudio.tsx`, `src/components/student/MissionFlowShell.tsx`, `src/app/student/missions/[assignmentStudentId]/page.tsx`, `src/domain/character/profile.ts`, `src/components/student/styles.ts`, `next.config.ts`, `package.json`, `vitest.config.ts`, `.planning/config.json` — confirmed component shapes, mount points, existing FlowState fields, no `output: export`, Next 15/React 19 versions, no jsdom/DOM test environment, no existing `next/image` usage.
- `.planning/phases/10-mascot-vn-style/10-CONTEXT.md` and `10-UI-SPEC.md` — locked decisions and design contract, treated as authoritative scope boundaries.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — requirement text, phase dependency chain, sprite-commit provenance, test-suite baseline (411 passed/4 skipped).

### Secondary (MEDIUM confidence — WebSearch, cross-checked against MDN/official-adjacent sources)
- [MediaElementAudioSourceNode - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaElementAudioSourceNode) — one-source-node-per-element constraint
- [AudioContext: createMediaElementSource() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource)
- [Impossible to bind an AudioContext... - shaka-player #1372](https://github.com/google/shaka-player/issues/1372) — real-world confirmation of the reconnect error
- [Autoplay policy in Chrome - Chrome for Developers](https://developer.chrome.com/blog/autoplay) — AudioContext suspended-state/resume-on-gesture behavior
- [Autoplay guide for media and Web Audio APIs - MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- [Jank busting for better rendering performance - web.dev](https://web.dev/articles/speed-rendering) — 16ms/frame budget concept
- [Optimization techniques for Rive animations in React apps - Pixel Point](https://pixelpoint.io/blog/rive-react-optimizations/) — Rive vs Lottie bundle/CPU numbers
- [Engineering Interactive Mascots with Rive's State Machine - DEV Community](https://dev.to/uianimation/engineering-interactive-mascots-with-rives-state-machine-and-runtime-architecture-4e2h) — when Rive's value applies (vector, state-driven, designer-authored)
- [Getting Started: Image Optimization - Next.js docs](https://nextjs.org/docs/app/getting-started/images) — `next/image` responsive/format behavior

### Tertiary (LOW confidence — noted, not treated as authoritative)
- General blog-post framing of "when Rive is overkill" (multiple DEV Community / Medium posts) — directionally consistent across sources but not official Rive documentation; used only to corroborate the reasoning in Section 1, not as the sole basis for the recommendation (the sole basis is the raster-art-provenance + discrete-4-state-scope argument, which stands independent of these sources).

---

## Metadata

**Confidence breakdown:**
- Standard stack (Web Audio API, next/image, Vitest): HIGH — all core APIs are browser/framework built-ins verified directly against this project's own `package.json`/`next.config.ts`/`vitest.config.ts`, with no new external dependency to validate.
- Architecture (mount seam, expression mapping, amplitude bridge): HIGH — verified by direct reads of the exact files the planner will modify; the recommended seam is derived from the actual current code shape, not a hypothetical.
- Rive-vs-static decision: HIGH — the raster-art-provenance and discrete-4-state arguments are independent of any single WebSearch source and hold regardless of exact Rive performance numbers.
- Pitfalls (Web Audio gotchas): MEDIUM — cross-checked across MDN + a real-world GitHub issue, but not independently reproduced against this exact codebase's audio element in this research session (no live browser test was run).
- Low-end degrade heuristic: MEDIUM — the rAF frame-time-budget approach is a well-established pattern (web.dev, MDN-adjacent sources) but the specific threshold constants (33ms, 30-frame sample, 50% trigger ratio) are this research's own reasoned starting values, not independently validated against real low-end hardware this session — the planner/executor should treat them as tunable defaults, confirmed only during the mandated real-device checkpoint.

**Research date:** 2026-07-05
**Valid until:** 2026-08-04 (30 days — all core findings rest on stable, slow-moving web platform APIs and this project's own current codebase state, not fast-moving library churn)
