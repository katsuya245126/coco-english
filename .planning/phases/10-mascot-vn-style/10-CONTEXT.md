# Phase 10: Mascot (VN-style) - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Coco becomes visually present during the student mission flow as a 2D, waist-up character over a background scene, with a named dialogue box, whose **speaking/idle/reaction state is driven by the real audio playback clock** (Web Audio amplitude off the existing `<audio>` element — not a timer, not full viseme lip-sync). Coco shows a **small fixed set of 3–5 content-tied expression states** (idle, speaking, happy/celebrating, encouraging/neutral). Mascot rendering must perform acceptably on low-end school devices, with a **fixed, small asset scope** (no per-scene background variants, no expression sprawl).

This phase is **wiring, not art authoring** — the expression sprites already exist and are committed (see Reusable Assets). We clarify HOW to integrate them into the flow; the art set and the audio-clock approach are already locked upstream.

Requirements: MASCOT-01, MASCOT-02, MASCOT-03, MASCOT-04.

</domain>

<decisions>
## Implementation Decisions

### Placement & Persistence
- **D-01:** The mascot is a **persistent stage rendered at the `MissionFlowShell` level, above the step cards** (MASCOT-01). Coco + background + dialogue frame stay mounted across every step (question, aiFeedback, repeat, repeatFeedback, transition, complete, reviewPending); the existing step cards render below/within the stage. This gives continuous VN-style character presence — Coco does not appear/disappear between beats.

### Dialogue Box (Claude's discretion — resolved)
- **D-02:** The VN dialogue box is an **additive frame around the mascot; existing step cards are NOT restructured this phase.** Coco's line text stays where it currently renders (in the step cards); the dialogue box + speaker name deliver the VN framing without a text-into-box reflow. Rationale: moving all Coco line text into the box would destabilize the working Phase 4/6 flow and overlaps the Phase 12 UI overhaul. **Full text-into-box migration is explicitly deferred to Phase 12.**

### Speaking State / Audio Wiring (MASCOT-02)
- **D-03:** The speaking state is **driven by real audio-playback amplitude off the existing `<audio>` element** (Web Audio API analyser), never a timer and never full viseme lip-sync. This requirement is LOCKED.
- **D-04 (Claude's discretion — deferred to research/planning):** The exact wiring seam is **left to the phase researcher/planner to finalize AFTER the Rive-vs-static-sprite spike**, because the spike outcome changes how amplitude is consumed (a Rive state machine ingests an amplitude input differently than a CSS/sprite-swap animation). **Recommended default (lower risk):** keep `CocoSpeechAudio` owning its per-step `<audio>` element and expose a `playing` + amplitude signal (callback/ref/context) that the shell-level mascot subscribes to — this preserves the working Phase 8 playback path (autoplay, replay, low-end buffering handling) rather than refactoring it. Lifting audio to a single shared shell-level element/AudioContext is the more VN-clean alternative but touches the load-bearing Phase 8 path; only adopt it if research shows the per-step subscription can't reliably bridge to a persistent mascot.

### Expression Selection (MASCOT-03)
- **D-05:** Expressions are **mapped from signals the flow already computes** — no new AI, no new data plumbing. Baseline mapping (to be finalized by planner against the existing sprite set):
  - **idle** → default / between actions (also the natural host for a future "Coco is thinking…" state, per Phase 11 D-12)
  - **speaking** → audio amplitude active (D-03)
  - **happy / celebrating** → accepted outcomes (`acceptedOriginal`, `repeatAccepted`), mission complete
  - **encouraging / neutral** → miss/retry paths (`needsCorrection`, `retryOriginal`, `repeatRetry`, forced-retry on 1-star)
  - Sprites already exist for neutral, happy, thinking, encouraging, celebrate, sad, surprised — the planner selects the 3–5 tied to these flow signals and MUST NOT exceed the fixed set.

### Background Scene (Claude's discretion — resolved)
- **D-06:** **One fixed, single background for v0** — honors MASCOT-04's explicit "no per-scene background variants" guardrail. Because no illustrated background asset exists yet, the recommended v0 is a **simple themed backdrop (solid/gradient or one lightweight illustrated scene if trivially producible)**; the planner picks whichever reads best behind the existing sprites without expanding art scope. **Scene-premise-driven / per-mission backgrounds stay DEFERRED** (Phase 11 owns scene premise text; a richer scene experience is Phase 12).

### Performance Guardrail (MASCOT-04)
- **D-07:** If the amplitude-driven animation is too heavy on a Chromebook/older tablet, Coco **gracefully degrades to a static expression sprite** — expression still swaps on state, only the per-frame amplitude animation drops. The **mission flow never blocks on mascot performance**, mirroring the Phase 8 principle ("voice degrades, homework loop never blocks"). Low-end device testing on real hardware is a success criterion, not optional.

### Claude's Discretion
- Exact audio-wiring seam (D-04) — pending the Rive-vs-static spike outcome; recommended default documented above.
- Dialogue-box framing (D-02) — resolved as additive; text migration deferred to Phase 12.
- Background choice (D-06) — resolved as one fixed simple backdrop; final visual left to planner within the no-variants guardrail.
- Whether reduced-motion is *also* honored on top of D-07's degrade path — a reasonable accessibility add the planner may include, but the perf guardrail chosen is the static-sprite degrade.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` — Phase 10 goal, the four success criteria (2D waist-up + dialogue box; audio-clock-driven speaking state; 3–5 content-tied expressions; low-end device performance), and the **research flag: a lightweight Rive-vs-static-sprite spike/decision is required at the START of planning before committing to an authoring pipeline — static sprites are an explicitly acceptable v0.** UI hint: yes.
- `.planning/REQUIREMENTS.md` — MASCOT-01 (2D waist-up over background + dialogue box), MASCOT-02 (speaking state off Web Audio amplitude, not timer/viseme), MASCOT-03 (3–5 fixed content-tied expressions, no-harsh-failure principle), MASCOT-04 (low-end performance + fixed small asset scope, guard against scope creep).

### Cross-phase separation
- `.planning/phases/11-coco-chat-dynamic-turns-scene-framing/11-CONTEXT.md` — Phase 11 (Coco Chat / scene premise) is downstream and **does not require the mascot to exist**; mascot visuals are explicitly Phase 10's job. Note **D-12**: the mascot's idle state is later expected to host a "Coco is thinking…" indicator during dynamic-turn generation — keep the idle state addressable for that future use.

### Prior decision context
- `/Users/john/.claude/projects/-Users-john-Desktop-my-portfolio-projects-coco-english/memory/coco-english-v2-roadmap.md` — locks the VN reference (waist-up, centered, background scene + named speaker/dialogue box, Archeia/VNMaker style), VN-feel-not-VN-structure thesis, audio-clock speaking state, content-tied expressions IN, Rive-vs-static spike in Ph10.
- `/Users/john/.claude/projects/-Users-john-Desktop-my-portfolio-projects-coco-english/memory/coco-english-sprite-alpha-pipeline.md` — provenance and transparency state of the committed sprites; pipeline archived at `.planning/debug/sprite-alpha-pipeline.py` if any sprite needs re-cutting.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`public/images/coco-*-alpha.png` (committed 2026-07-05, commit 8661cb65):** 7 authored, alpha-cut expression sprites — `coco-neutral-alpha.png`, `coco-happy-alpha.png`, `coco-thinking-alpha.png`, `coco-encouraging-alpha.png`, `coco-celebrate-alpha.png`, `coco-sad-alpha.png`, `coco-surprised-alpha.png` (plus white-bg originals `coco-*.png`). These ARE the mascot expression set — no art generation needed for the fixed 3–5 states. Verified transparent over teal/pastel/dark at display and full res.
- **`src/components/student/CocoSpeechAudio.tsx`:** owns the per-line `<audio>` element, autoplay/replay, and low-end buffering states (`loading/ready/playing/error`). This is the audio source the speaking state (MASCOT-02) must read from — the amplitude signal originates here.
- **`src/domain/character/profile.ts`:** static `CharacterProfile` (displayName "Coco", line templates). The expression-state mapping metadata (if any beyond flow signals) would live alongside this pure domain module — no DB/AI imports allowed here.

### Established Patterns
- **Single-step-card render (D-12 from Phase 4):** `MissionFlowShell` shows exactly ONE step card at a time (no scrolling thread). The persistent mascot stage sits ABOVE this single-card area and is the one always-mounted element while cards swap.
- **"Degrade, never block" (Phase 8):** the voice/audio layer degrades gracefully and never blocks the homework loop. D-07's static-sprite fallback follows the same principle for the mascot.
- **Forward-only, no backfill (Phase 9 D-08 / Phase 11 D-08):** if any per-mission data were needed it would apply forward-only — but this phase adds no new mission data (expressions map from existing flow signals, D-05).
- **Client components import only domain types + app routes** (Phase 8 boundary rule) — the mascot is a client component; it must not import server/AI/Supabase modules.

### Integration Points
- **`src/components/student/MissionFlowShell.tsx`** — the mount point for the persistent mascot stage (D-01). It already holds all the flow signals needed for expression mapping (`flow.step`, `originalFeedback.kind`, `repeatFeedback.kind`, `starBand`, `hasRetriedThisTurn`, completion). No new state machine is required — expressions derive from this existing `FlowState`.
- **`CocoSpeechAudio` → mascot** — the amplitude/`playing` bridge (D-03/D-04). Recommended seam: expose a signal from `CocoSpeechAudio` the shell-level mascot subscribes to; final seam pending the spike.
- **`src/app/student/missions/[assignmentStudentId]/page.tsx`** — the page rendering `MissionFlowShell`; where the stage layout (mascot + background + dialogue box + cards) is composed.

</code_context>

<specifics>
## Specific Ideas

- **VN reference (locked):** waist-up Coco, centered, over a background scene, with a named speaker + dialogue box at the bottom — the Archeia/VNMaker sample the user shared. Borrow the VN *feel*, not the VN *structure*.
- **Expression set is content-tied and reinforces no-harsh-failure** (MASCOT-03): a miss shows encouraging/neutral, never a punishing expression. Coco stays a supportive classmate.

</specifics>

<deferred>
## Deferred Ideas

- **Full Coco-line-text-into-dialogue-box migration** → Phase 12 (UI overhaul). This phase keeps step-card text in place (D-02).
- **Per-scene / scene-premise-driven backgrounds** → Phase 11 owns the scene-premise text; a richer per-mission scene experience is Phase 12. This phase ships one fixed background (D-06).
- **Mascot hosting the "Coco is thinking…" dynamic-turn indicator** → Phase 11 D-12; keep the idle state addressable but don't build the chat integration here.
- **Rive authoring pipeline (if the spike chooses Rive over static sprites)** → the spike + its follow-on authoring is a planning-time deliverable within this phase, but any pipeline build-out beyond a small fixed asset set is guarded against by MASCOT-04.

</deferred>

---

*Phase: 10-mascot-vn-style*
*Context gathered: 2026-07-05*
