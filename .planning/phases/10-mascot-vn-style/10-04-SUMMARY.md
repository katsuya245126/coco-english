---
phase: 10-mascot-vn-style
plan: 04
subsystem: ui
tags: [react, next.js, mascot, audio, vn-style, mission-flow]

# Dependency graph
requires:
  - phase: 10-mascot-vn-style (plans 02-03)
    provides: CocoSpeechAudio onAmplitudeFrame/onPlayingChange callbacks (Plan 02), MascotStage component + deriveExpression/mascot-speaking-state/mascot-perf-degrade domain helpers (Plan 03)
provides:
  - Persistent MascotStage mount in MissionFlowShell, above the step-card area, unconditional across all FlowSteps
  - Shell-owned ref-backed amplitude/playing callback bridge from the active CocoSpeechAudio to MascotStage
  - onAmplitudeFrame/onPlayingChange forwarding through all five Step* components to their CocoSpeechAudio instances
affects: [10-mascot-vn-style verification/UAT, any future mission-flow-shell changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shell-owned useCallback (empty deps) + useRef bridge so a per-step CocoSpeechAudio's amplitude/playing signal reaches a persistent parent-mounted component without new state machines"
    - "Decorative-only mount: MascotStage/CocoSpeechAudio callbacks are never awaited by or wired into mission-critical async handlers (startAttemptAction/completeMissionAction/revealHintAction)"

key-files:
  created: []
  modified:
    - src/components/student/MissionFlowShell.tsx
    - src/components/student/StepBuddyQuestion.tsx
    - src/components/student/StepImprovedRepeat.tsx
    - src/components/student/StepAiEvaluationFeedback.tsx
    - src/components/student/StepTurnTransition.tsx
    - src/components/student/StepMissionComplete.tsx

key-decisions:
  - "Tasks 1-2 code was found already fully implemented and committed on main (commit f52a9bd0, a WIP safety-checkpoint on the phase-10-mascot-wip branch, merged via 50efbfc0) before this executor run started — verified against every acceptance criterion in 10-04-PLAN.md rather than re-implementing from scratch."

requirements-completed: []  # MASCOT-01..04 are claimed complete only after Task 3/4 human-verify checkpoints pass — see below.

# Metrics
duration: 15min
completed: 2026-07-09
status: partial
---

# Phase 10 Plan 04: Mascot Integration Wiring Summary

**MascotStage mount + shell-owned amplitude/playing callback bridge across MissionFlowShell and all five Step* components — code complete and verified (Tasks 1-2); real-device human-verify checkpoints (Tasks 3-4) still pending.**

## Performance

- **Duration:** 15 min (verification-only; no new code required)
- **Started:** 2026-07-09T06:20:00Z
- **Completed:** 2026-07-09T06:35:00Z
- **Tasks:** 2 of 4 (Tasks 1-2 verified complete; Tasks 3-4 are blocking human-verify checkpoints, not yet run)
- **Files modified:** 0 (all target files already matched the plan's required end state)

## Accomplishments

- Confirmed all five `Step*` components (`StepBuddyQuestion`, `StepImprovedRepeat`, `StepAiEvaluationFeedback`, `StepTurnTransition`, `StepMissionComplete`) declare and forward `onAmplitudeFrame`/`onPlayingChange` to their `CocoSpeechAudio` instance, each with 3 occurrences (prop type + destructure + forward) — exceeding the plan's `>= 2` bar.
- Confirmed `MissionFlowShell.tsx` imports and mounts `<MascotStage>` unconditionally at line 648 — after the resume-notice block, before the `{/* Step card area */}` marker at line 677 — fed by `flow.step`, `flow.originalFeedback?.kind`, `flow.repeatFeedback?.kind` (existing `FlowState` fields, no new state machine per D-05).
- Confirmed shell-owned, ref-backed, stable (`useCallback` with empty deps) `handleMascotAmplitudeFrame`/`handleMascotPlayingChange` handlers exist and are passed into every `Step*` render site (7 call sites) so whichever step is active drives the same persistent mascot.
- Confirmed no mission-critical async handler (`startAttemptAction`, `completeMissionAction`, `revealHintAction`) was touched by the mascot wiring — the mascot mount and callbacks are additive-only, matching the threat model's "mitigate T-10-06" disposition (decorative, never awaited).
- Full verification suite run clean: `npx tsc --noEmit` (0 errors) and `npx vitest run` (48 test files, 444 passed, 4 skipped) — matches the plan's stated pre-execution baseline exactly, confirming zero regression.

## Task Commits

No new commits were made by this executor run. Tasks 1 and 2's target code was already present, verified, and committed on `main` prior to this run:

1. **Task 1 (thread callbacks through 5 Step components)** — already satisfied by commit `f52a9bd0` (`wip: phase 10 mascot VN-style work in progress`), merged to `main` via `50efbfc0` (`Merge branch 'phase-10-mascot-wip'`).
2. **Task 2 (mount MascotStage + shell-owned plumbing)** — same commits as above; `MissionFlowShell.tsx`'s `<MascotStage>` mount, `deriveExpression` input wiring, and `onAmplitudeFrame`/`onPlayingChange` threading were all present in that same WIP commit.

A related, out-of-scope bugfix landed afterward on `main`: `d104f16d fix(mascot): attach analyser before resuming AudioContext in handleReplay` — this fixed an unrelated `CocoSpeechAudio` analyser-ordering bug (pre-existing before this executor run started) and did not touch any Task 1/2 target behavior.

**No plan-metadata commit was made in this run** — since no code changed, there is nothing new to attribute to a Task 1/2 commit. This SUMMARY.md itself will be committed as the plan-metadata commit once written.

## Files Created/Modified

None modified by this executor run. Verified-as-already-correct:
- `src/components/student/MissionFlowShell.tsx` — MascotStage mount + shell-owned amplitude/playing bridge
- `src/components/student/StepBuddyQuestion.tsx` — forwards onAmplitudeFrame/onPlayingChange to its CocoSpeechAudio
- `src/components/student/StepImprovedRepeat.tsx` — forwards onAmplitudeFrame/onPlayingChange to its CocoSpeechAudio
- `src/components/student/StepAiEvaluationFeedback.tsx` — forwards onAmplitudeFrame/onPlayingChange to its CocoSpeechAudio
- `src/components/student/StepTurnTransition.tsx` — forwards onAmplitudeFrame/onPlayingChange to its CocoSpeechAudio
- `src/components/student/StepMissionComplete.tsx` — forwards onAmplitudeFrame/onPlayingChange to its CocoSpeechAudio

## Decisions Made

- Treated Tasks 1-2 as complete-by-verification rather than re-implementing: the target files already matched every acceptance criterion in `10-04-PLAN.md` byte-for-byte (mount position, callback wiring, prop counts, boundary checks). Re-writing identical code would have produced a no-op diff and risked introducing drift from the already-tested WIP implementation. All acceptance-criteria greps and the full `tsc`/`vitest` verification gate were re-run fresh in this session to confirm the claim rather than trusting git history alone.

## Deviations from Plan

None - Tasks 1-2 required no code changes; the target implementation was already present and verified. This is not a deviation from the plan's intent (MASCOT-01/02/03 wiring) — it is the plan's required end-state, already achieved by prior work on the `phase-10-mascot-wip` branch before this plan was formally executed via this workflow.

## Issues Encountered

None for Tasks 1-2. Verification (`tsc --noEmit`, `vitest run`) passed cleanly on the first attempt with no fixes required.

## Acceptance Criteria — Verified Fresh This Run

**Task 1:**
- `grep -l 'onAmplitudeFrame' <all 5 files>` → all 5 files listed. PASS
- Each file: `onAmplitudeFrame` and `onPlayingChange` each appear >= 2 times → all 5 files show 3/3. PASS
- `npx tsc --noEmit` clean. PASS
- `npx vitest run` → 48 files, 444 passed, 4 skipped. PASS
- Boundary check: no existing prop/CocoSpeechAudio attribute removed from any of the five components (confirmed via full-file read of each). PASS

**Task 2:**
- `grep -c 'MascotStage' MissionFlowShell.tsx` = 2 (import + mount) → `>= 2`. PASS
- `<MascotStage` mount (line 648) appears before `{/* Step card area */}` marker (line 677). PASS
- `grep -c 'deriveExpression\|originalFeedback?.kind\|repeatFeedback?.kind'` = 12 → `>= 1`. PASS
- `grep -c 'onAmplitudeFrame'` in MissionFlowShell.tsx = 7 → `>= 1`. PASS
- Boundary check: no existing `flow.step ===` conditional branch, resume-notice, or mission async handler (`startAttemptAction`/`completeMissionAction`/`revealHintAction`) was modified — confirmed by reading the full render tree and all async-handler call sites (lines 220, 378, 444, 477, 510, 586); mascot wiring is additive-only. PASS
- `npx tsc --noEmit` clean; `npx vitest run` full suite green. PASS

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Tasks 1-2 are code-complete and verified.** Plan 10-04 CANNOT be marked fully complete yet — Tasks 3 and 4 are `type="checkpoint:human-verify" gate="blocking"` and require a real human in a real browser (Task 3: mount persistence, no layout shift, real-audio-driven speaking animation, content-tied expressions — MASCOT-01/02/03) and on real low-end hardware (Task 4: degrade-path device testing — MASCOT-04). Neither can be satisfied by automated means; per the plan and execution instructions, this executor run stops here and surfaces both checkpoints to the human verbatim (see below).

`requirements-completed` is left empty in this SUMMARY's frontmatter because MASCOT-01..04 are only truly satisfied once the human-verify checkpoints pass — marking them complete now would be premature. Once Task 3/4 are approved, this SUMMARY (or a follow-up amendment) should record `requirements-completed: [MASCOT-01, MASCOT-02, MASCOT-03, MASCOT-04]`.

---

## CHECKPOINT REACHED

**Type:** human-verify
**Plan:** 10-04
**Progress:** 2/4 tasks complete (Tasks 1-2 verified; Tasks 3-4 blocking human-verify checkpoints)

### Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Thread amplitude/playing callbacks through the five Step components | f52a9bd0 (pre-existing on main, merged via 50efbfc0) | StepBuddyQuestion.tsx, StepImprovedRepeat.tsx, StepAiEvaluationFeedback.tsx, StepTurnTransition.tsx, StepMissionComplete.tsx |
| 2 | Mount MascotStage + wire shell-owned amplitude/playing plumbing | f52a9bd0 (pre-existing on main, merged via 50efbfc0) | MissionFlowShell.tsx |

### Current Task

**Task 3:** Checkpoint — mount persistence, no layout shift, real-audio speaking, content-tied expressions (MASCOT-01/02/03)
**Status:** awaiting verification
**Blocked by:** requires a human running a full mission end-to-end in a real browser (no jsdom-cheap automated assertion exists for MASCOT-01/02/03; mirrors Phase 8/9 human-verify gates)

### Checkpoint Details (Task 3 — verbatim from plan)

**What was built:** Persistent VN-style mascot stage mounted above the step-card area, with Coco's expression tied to flow outcomes and a speaking animation driven by the real audio clock — run a full mission end-to-end to confirm mount persistence, no layout shift, and audio-driven speaking (MASCOT-01/02/03).

**How to verify:**
1. `npm run dev`; open a mission as a student (`/student/missions/[assignmentStudentId]`) on a normal dev machine or phone.
2. MASCOT-01 (mount + no layout shift): step through question → aiFeedback → repeat → repeatFeedback → transition → complete. Confirm Coco + the gradient backdrop + the "Coco" dialogue box stay mounted the WHOLE time and never jump/reflow/disappear between steps; the step card swaps below the stage without pushing the actionable content off-screen on a ~700px phone viewport.
3. MASCOT-02 (real audio clock, not a timer): when a Coco line plays, confirm the speaking animation STARTS and STOPS with the actual voice (pause the audio / let it end — the animation should stop, not run on a fixed clock). Confirm a mid-sentence pause does NOT flicker the animation off (200ms hysteresis).
4. MASCOT-03 (content-tied expressions, no-harsh-failure): produce an accepted answer → confirm Coco shows happy; complete the mission → celebrate; produce a miss/retry → confirm Coco shows ENCOURAGING (never a sad/punishing face). Confirm the sad sprite never appears on any miss.
5. Confirm no "mascot failed" error copy ever appears; the browser console has no Web Audio / next/image errors.

**Resume signal:** Type "approved" once the stage persists with no layout shift, speaking tracks the real audio (with no mid-sentence flicker), and expressions are happy/celebrate/encouraging (never sad) — or describe the issue.

### Task 4 (next checkpoint after Task 3 is approved — verbatim from plan)

**Name:** Checkpoint — real low-end device performance + silent degrade, flow never blocks (MASCOT-04, D-07)

**What was built:** Low-end-device performance path — the amplitude animation self-measures its frame budget and silently degrades to a static sprite on a slow device, while the mission loop keeps working identically (MASCOT-04, D-07). This mirrors Phase 8 VOICE-04 / Phase 9 PRON-03 real-hardware gates.

**How to verify:**
1. On a REAL low-end school device (Chromebook or older tablet — the same class of device used for the Phase 8 VOICE-04 gate), open a mission and run it end-to-end.
2. Confirm the mission loop (record → submit → advance turns → complete) works identically to a fast device — the mascot NEVER blocks recording, submitting, or advancing.
3. Confirm rendering is acceptable: either the amplitude animation runs smoothly, OR it silently degrades to a static sprite (expression still swaps correctly on state) with NO visible stutter of the actionable UI and NO error copy.
4. Optionally set the OS "reduce motion" preference and reload: confirm the amplitude animation is skipped (static sprite, expression still swaps) — the reduced-motion gate shares the degrade path.
5. Record the device model + result in the SUMMARY, mirroring how Phase 8's VOICE-04 device coverage was documented. If no low-end device is available, record that explicitly as residual risk to be re-tested before broad rollout (matching the Phase 8 closeout precedent) rather than silently passing.

**Resume signal:** Type "approved" once the mission loop runs identically on real low-end hardware and the mascot either animates smoothly or degrades silently to a static sprite — or record the device result / residual-risk acceptance.

### Awaiting

A human must run the Task 3 verification steps in a real browser (dev server + student mission flow) and respond with "approved" or a description of any issue. Once Task 3 is approved, a continuation run will present Task 4 (real low-end device testing) using the same protocol. Only after both checkpoints are approved (or Task 4's residual risk is explicitly accepted, per Phase 8 precedent) can Plan 10-04 be marked fully complete and MASCOT-01..04 marked done in REQUIREMENTS.md.

---

## Self-Check: PASSED

- `[ -f src/components/student/MissionFlowShell.tsx ]` → FOUND
- `[ -f src/components/student/StepBuddyQuestion.tsx ]` → FOUND
- `[ -f src/components/student/StepImprovedRepeat.tsx ]` → FOUND
- `[ -f src/components/student/StepAiEvaluationFeedback.tsx ]` → FOUND
- `[ -f src/components/student/StepTurnTransition.tsx ]` → FOUND
- `[ -f src/components/student/StepMissionComplete.tsx ]` → FOUND
- `git log --oneline --all | grep -q f52a9bd0` → FOUND (commit exists, present on main via merge 50efbfc0)
- All Task 1/Task 2 acceptance-criteria greps and `tsc`/`vitest` verification re-run fresh in this session — all PASS (see "Acceptance Criteria — Verified Fresh This Run" above)

---
*Phase: 10-mascot-vn-style*
*Status: PARTIAL — Tasks 1-2 complete/verified, Tasks 3-4 blocked on human-verify checkpoints*
*Executor run completed: 2026-07-09*
