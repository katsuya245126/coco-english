---
phase: 10-mascot-vn-style
plan: 03
subsystem: ui
tags: [mascot, next-image, react, student-flow]

requires:
  - phase: 10-mascot-vn-style
    provides: 10-01 pure mascot expression, speaking-state, and degrade helpers
provides:
  - Persistent MascotStage client component
  - Shared Phase 10 mascot stage style tokens
  - Four-sprite expression mapping rendered through next/image
  - Silent reduced-motion and frame-budget animation degrade path
affects: [student-mission-flow, mascot-stage, phase-10]

tech-stack:
  added: []
  patterns:
    - "Client-only decorative stage composes pure mascot helpers and shared style tokens"
    - "Amplitude animation reads a shell-owned ref so audio analyser callbacks do not force React renders"

key-files:
  created:
    - src/components/student/MascotStage.tsx
  modified:
    - src/components/student/styles.ts

key-decisions:
  - "MascotStage accepts an amplitudeRef updated by the shell from CocoSpeechAudio callbacks, avoiding 60fps parent rerenders."
  - "Reduced motion and frame-budget degrade share the same silent static-sprite path."

patterns-established:
  - "Mascot sprites are selected from exactly four active alpha PNGs through a Record<MascotExpression, string> map."
  - "Dynamic mascot motion is limited to a transform overlay; expression selection stays a pure flow-state derivation."

requirements-completed: [MASCOT-01, MASCOT-03, MASCOT-04]

duration: 20min
completed: 2026-07-06
status: complete
---

# Phase 10 Plan 03: MascotStage Summary

**Persistent VN-style Coco stage with shared style tokens, next/image sprite rendering, audio-amplitude motion, and silent static fallback**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-06T01:35:00Z
- **Completed:** 2026-07-06T01:55:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added five Phase 10 shared mascot style tokens to `styles.ts`, using only existing palette colors and the established mobile 420px content width.
- Created `MascotStage` as a client component using `next/image`, the four approved alpha sprites, and the existing pure helpers `deriveExpression`, `updateSpeakingVisual`, and `shouldDegrade`.
- Implemented a silent animation degrade path for `prefers-reduced-motion` and sustained sub-30fps frame deltas; expression swaps remain active while per-frame amplitude motion drops.

## Task Commits

This Codex run did not create git commits because the worktree already contained uncommitted Phase 10 Wave 1 changes before Plan 10-03 started. The plan artifacts and code are present on disk for the orchestrator/user to commit together.

1. **Task 1: Phase 10 mascot style tokens in styles.ts** - pending commit
2. **Task 2: MascotStage client component** - pending commit

## Files Created/Modified

- `src/components/student/MascotStage.tsx` - Persistent decorative mascot stage with four-sprite `next/image` rendering, amplitude-scaled transform motion, and silent degrade logic.
- `src/components/student/styles.ts` - Phase 10 mascot stage, backdrop, sprite wrapper, dialogue box, and speaker label style tokens.

## Decisions Made

- Used an `amplitudeRef` prop instead of amplitude state so Plan 10-04 can bridge high-frequency analyser frames from `CocoSpeechAudio` without rerendering the shell on every audio frame.
- Kept `deriveExpression` inside `MascotStage`, so MissionFlowShell only needs to pass existing flow fields and does not gain a second mascot state machine.

## Deviations from Plan

None - plan executed as written, except git commits were deferred because the checkout already had uncommitted Phase 10 changes from earlier work.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** Implementation and verification are complete; only commit metadata is pending.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `grep` source assertions for all five style tokens, Phase 10 section comment, and existing palette gradient colors passed.
- `grep` source assertions for `"use client"`, the three pure helpers, `next/image`, no raw `<img>`, no reserved sad/thinking/surprised sprite references in code, `prefers-reduced-motion`, and no server/Supabase/OpenAI/Azure imports passed.
- `npx tsc --noEmit` passed.
- `npx vitest run` passed: 47 files, 430 tests passed, 4 skipped.

## Next Phase Readiness

Ready for Plan 10-04 to mount `MascotStage` in `MissionFlowShell` and thread `onAmplitudeFrame` / `onPlayingChange` through the five step components.

---
*Phase: 10-mascot-vn-style*
*Completed: 2026-07-06*
