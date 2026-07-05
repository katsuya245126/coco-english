# Phase 10: Mascot (VN-style) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 10-mascot-vn-style
**Areas discussed:** Placement & persistence, Audio wiring, Expression selection, Background scene, Dialogue box, Performance fallback

---

## Placement & Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Persistent stage above cards | Coco + background + dialogue box render once at MissionFlowShell level, stay mounted across every step; cards render below/within. Most VN-like. | ✓ |
| Per-step, only on Coco lines | Mascot appears only on Coco-speaking steps, absent on recording/UI steps. Simpler but Coco disappears between beats. | |
| Persistent, dialogue box only when speaking | Coco + background always present; dialogue box only when a Coco line exists. | |

**User's choice:** Persistent stage above cards
**Notes:** Delivers continuous VN character presence. Mascot mounts at `MissionFlowShell`, above the single-step-card area.

---

## Audio Wiring (MASCOT-02 speaking state)

| Option | Description | Selected |
|--------|-------------|----------|
| Lift audio to a shared context/provider | Single shell-level audio element / shared AudioContext + analyser; CocoSpeechAudio + mascot both subscribe. Cleanest for persistent mascot but touches Phase 8 path. | |
| Mascot subscribes to existing per-step audio | Keep CocoSpeechAudio owning its `<audio>`; expose amplitude/playing signal the mascot reads. Minimal disruption to Phase 8. | |
| Let research decide the seam | Lock the requirement (amplitude off the real `<audio>`) and let researcher/planner pick wiring after the spike. | ✓ |

**User's choice:** You decide
**Notes:** Resolved as — requirement LOCKED (amplitude off the real `<audio>`, no timer/viseme). Exact seam deferred to researcher/planner AFTER the Rive-vs-static spike, since the spike outcome changes how amplitude is consumed. Recommended lower-risk default: mascot subscribes to the existing per-step CocoSpeechAudio signal, preserving the working Phase 8 playback path. (CONTEXT D-03/D-04.)

---

## Expression Selection (MASCOT-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Map from existing flow signals | Drive expressions from state the flow already computes (idle, speaking, happy/celebrate on accepted, encouraging/neutral on miss). No new AI/data. Sprites already exist. | ✓ |
| Add explicit expression field per line | Tag each Coco line/feedback variant with an intended expression. More authorable control, new data plumbing. | |
| You decide the mapping | Claude picks sensible flow-signal → expression mappings. | |

**User's choice:** Map from existing flow signals
**Notes:** No new data plumbing; mapping derives from existing `FlowState` (`flow.step`, feedback kinds, `starBand`, completion). Planner selects the 3–5 from the committed sprite set. (CONTEXT D-05.)

---

## Background Scene

| Option | Description | Selected |
|--------|-------------|----------|
| One fixed neutral background for v0 | Single static background for all missions; honors "no per-scene variants" guardrail. | |
| Solid color / simple gradient | No illustrated background art; themed backdrop only. Lightest. | |
| You decide | Claude picks between single illustrated background vs simple backdrop. | ✓ |

**User's choice:** You decide
**Notes:** Resolved as one fixed background for v0 (MASCOT-04 guardrail). No background art exists yet, so recommended v0 is a simple themed backdrop (solid/gradient or one lightweight illustrated scene if trivial); planner picks within the no-variants guardrail. Per-scene backgrounds deferred to Phase 11/12. (CONTEXT D-06.)

---

## Dialogue Box

| Option | Description | Selected |
|--------|-------------|----------|
| Dialogue box becomes the Coco-line surface | Coco's spoken lines move into the VN dialogue box; cards keep interactive bits. More authentic, reflows step layouts. | |
| Dialogue box is additive, cards unchanged | Keep step cards as-is; dialogue box is a lighter VN frame. Lowest risk; text migration deferred to Phase 12. | |
| You decide | Claude picks based on how cleanly line text can move. | ✓ |

**User's choice:** You decide
**Notes:** Resolved as additive frame, cards unchanged this phase. Moving all line text risks destabilizing the Phase 4/6 flow and overlaps the Phase 12 UI overhaul. Full text-into-box migration deferred to Phase 12. (CONTEXT D-02.)

---

## Performance Fallback (MASCOT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful degrade to a static sprite | If animation too heavy, Coco falls back to static expression sprite; flow never blocks. Mirrors Phase 8 "voice degrades, loop never blocks". | ✓ |
| Respect reduced-motion / low-power setting | Honor prefers-reduced-motion / a toggle to disable amplitude animation. | |
| Both — degrade + reduced-motion | Fall back AND honor reduced-motion. | |

**User's choice:** Graceful degrade to a static sprite
**Notes:** Mission flow never blocks on mascot perf. Real low-end device testing is a success criterion. Reduced-motion noted as a reasonable optional add the planner may include. (CONTEXT D-07.)

---

## Claude's Discretion

- **Audio wiring seam (D-04):** deferred to research/planning after the Rive-vs-static spike; recommended default documented (subscribe to existing per-step audio).
- **Dialogue box (D-02):** resolved as additive; text migration deferred to Phase 12.
- **Background (D-06):** resolved as one fixed simple backdrop within the no-variants guardrail; final visual left to planner.
- **Reduced-motion:** optional add on top of the static-sprite degrade path (D-07).

## Deferred Ideas

- Full Coco-line-text-into-dialogue-box migration → Phase 12.
- Per-scene / scene-premise-driven backgrounds → Phase 11 (premise text) / Phase 12 (richer scene).
- Mascot hosting the "Coco is thinking…" dynamic-turn indicator → Phase 11 D-12 (keep idle state addressable).
- Rive authoring pipeline build-out (if the spike chooses Rive) → guarded by MASCOT-04's fixed small asset scope.
