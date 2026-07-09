---
phase: 10-mascot-vn-style
plan: 01
subsystem: domain
tags: [mascot, expression, web-audio, performance, vitest]
requires:
  - phase: 09-pronunciation-scoring
    provides: Existing mission flow feedback kinds consumed by expression mapping
provides:
  - Pure mascot expression mapping for four no-harsh-failure states
  - Pure speaking-state silence hysteresis helper
  - Pure frame-budget degrade helper for low-end devices
affects: [phase-10-mascot-stage, student-mission-flow]
tech-stack:
  added: []
  patterns: [pure domain modules, RED-first domain tests]
key-files:
  created:
    - src/domain/character/expression.ts
    - src/domain/character/mascot-speaking-state.ts
    - src/domain/character/mascot-perf-degrade.ts
    - tests/domain/character-expression.test.ts
    - tests/domain/mascot-speaking-state.test.ts
    - tests/domain/mascot-perf-degrade.test.ts
  modified: []
key-decisions:
  - "Expression mapping uses exactly idle, happy, celebrate, and encouraging; no sad expression is exported."
  - "Speaking hysteresis and performance degradation stay pure and DOM-free for node-environment tests."
patterns-established:
  - "Mascot behavior logic is isolated in pure domain modules before UI wiring."
requirements-completed: [MASCOT-02, MASCOT-03, MASCOT-04]
duration: 5min
completed: 2026-07-05
status: complete
---

# Phase 10 Plan 01 Summary

**Pure mascot behavior modules with exhaustive expression, speaking hysteresis, and frame-budget tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-05T07:44:19Z
- **Completed:** 2026-07-05T07:47:56Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `deriveExpression()` with the fixed four-expression mascot set.
- Added `updateSpeakingVisual()` with 200ms silence hysteresis and mutation-safety coverage.
- Added `shouldDegrade()` with a 30-frame, strict-majority over-budget threshold.
- Wrote RED-first tests, then made all three targeted domain suites pass.

## Task Commits

Changes are not committed yet in this Codex checkpoint; the working tree is paused at the Phase 10 Plan 02 human-verification gate.

## Files Created/Modified

- `src/domain/character/expression.ts` - Maps mission flow feedback to four safe mascot expressions.
- `src/domain/character/mascot-speaking-state.ts` - Holds speaking visuals through short pauses and returns new state objects.
- `src/domain/character/mascot-perf-degrade.ts` - Detects sustained low-frame-rate conditions from measured frame deltas.
- `tests/domain/character-expression.test.ts` - Covers precedence, teacher-review fallback, and sad-unreachable behavior.
- `tests/domain/mascot-speaking-state.test.ts` - Covers threshold, boundary, and mutation-safety behavior.
- `tests/domain/mascot-perf-degrade.test.ts` - Covers sample-size and strict-ratio boundaries.

## Decisions Made

None beyond the verified plan decisions.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

Plan 03 can consume these helpers after Plan 02's audio checkpoint is approved.

## Self-Check: PASSED

- `npx vitest run tests/domain/character-expression.test.ts tests/domain/mascot-speaking-state.test.ts tests/domain/mascot-perf-degrade.test.ts` - passed, 15 tests.
- `npx tsc --noEmit` - passed.
- `npx vitest run` - passed, 426 passed / 4 skipped.

---
*Phase: 10-mascot-vn-style*
*Completed: 2026-07-05*
