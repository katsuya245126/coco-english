---
phase: 06-ai-mission-and-turn-intelligence
plan: 01
subsystem: testing
tags: [tdd, vitest, playwright, ai, mission-generation, turn-evaluation]
requires:
  - phase: 05-voice-capture-and-evidence-storage
    provides: transcript-gated audio upload and server-only OpenAI adapter pattern
  - phase: 04-guided-student-attempt-loop
    provides: mission flow completion helpers and placeholder evaluation swap point
provides:
  - Phase 6 RED validation scaffold for generated mission drafts
  - Phase 6 RED validation scaffold for original and repeat turn evaluation
  - Fake-client AI adapter tests that avoid paid provider calls
  - Teacher and student source-contract checks for preview/edit, review routing, and client AI boundaries
affects: [06-02, 06-03, 06-04, phase-07-teacher-review]
tech-stack:
  added: []
  patterns:
    - RED tests use dynamic imports for planned Phase 6 modules
    - AI adapter tests use injected fake Responses clients
    - Playwright source-contract checks avoid live Supabase and paid provider calls
key-files:
  created:
    - tests/domain/mission-generation.test.ts
    - tests/server/ai-mission-generator.test.ts
    - tests/e2e/teacher-ai-mission-draft.spec.ts
    - tests/domain/turn-evaluation.test.ts
    - tests/server/turn-evaluator.test.ts
    - tests/server/student-mission-flow.test.ts
    - tests/e2e/student-ai-evaluation.spec.ts
  modified: []
key-decisions:
  - "06-01: Phase 6 behavior is locked first through RED tests; implementation remains in 06-02 through 06-04."
  - "06-01: AI adapter tests use injected fake Responses clients and missing-key branches so automated verification makes no paid provider calls."
  - "06-01: Source-contract checks guard client/server AI boundaries and keep OpenAI out of student client modules."
patterns-established:
  - "Mission-generation RED tests assert strict schema rejection, preview/edit handoff copy, and no raw JSON/model/token UI."
  - "Turn-evaluation RED tests assert conditional correction, non-English retry, teacher-review routing, repeat closeness, and app-owned workflow decisions."
requirements-completed: [MISS-02, MISS-03, MISS-05, AI-01, AI-02, AI-03, AI-04, AI-05]
duration: 6min
completed: 2026-06-29
status: complete
---

# Phase 06 Plan 01: RED Validation Scaffold Summary

**Phase 6 AI mission generation and turn evaluation behavior locked with RED Vitest and Playwright tests using fake clients and source contracts**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-29T11:01:51Z
- **Completed:** 2026-06-29T11:07:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added mission-generation RED tests for strict generated draft parsing, required-turn mismatch rejection, malformed output rejection, missing API key handling, provider failure handling, and D-08 preview/edit source contracts.
- Added student turn-evaluation RED tests for correct original skip-repeat behavior, correction-required repeat behavior, non-English retry, low-confidence/ambiguous/failed-schema teacher review routing, repeat acceptance/retry/review outcomes, and app-owned flow decisions.
- Added fake-client server adapter tests for planned mission generator and turn evaluator modules with no live OpenAI calls.
- Added Playwright source-contract checks for teacher draft UI and student evaluation UI without seeded Supabase or paid provider requirements.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold teacher mission-generation RED tests** - `1f1ff144` (`test`)
2. **Task 2: Scaffold student turn-evaluation RED tests** - `9a15a256` (`test`)

## Files Created/Modified

- `tests/domain/mission-generation.test.ts` - RED schema tests for generated mission draft shape, D-08 previewable data, and D-09 strict rejection.
- `tests/server/ai-mission-generator.test.ts` - RED fake-client tests for `generateMissionDraft`, missing API key, provider failure, and schema failure.
- `tests/e2e/teacher-ai-mission-draft.spec.ts` - Source-contract checks for `MissionDraftPanel`, form handoff, failed-schema copy, and no raw provider metadata.
- `tests/domain/turn-evaluation.test.ts` - RED decision tests for original and repeat AI evaluation outcomes.
- `tests/server/turn-evaluator.test.ts` - RED fake-client tests for `evaluateOriginalTurn` and `evaluateRepeatTurn`.
- `tests/server/student-mission-flow.test.ts` - RED service/source tests for app-owned AI routing, skip-repeat completion, non-English rejection, and no client OpenAI boundary.
- `tests/e2e/student-ai-evaluation.spec.ts` - Source-contract checks for student evaluation feedback copy, noun-bearing CTAs, repeat outcomes, and client AI boundary.

## Decisions Made

- Use dynamic imports in RED tests so missing planned modules fail clearly without adding temporary production stubs.
- Keep Playwright checks source-contract based in 06-01 to avoid live Supabase fixtures while still locking UI copy and client/server boundaries.
- Treat the absent GREEN commit as intentional for this validation-scaffold plan; implementation plans 06-02 through 06-04 will make these RED tests pass.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Sandboxed Playwright could not bind the configured local web server (`listen EPERM 0.0.0.0:3000`). Re-running the same Playwright commands with approved escalation reached the expected RED failures.

## Verification

- `npx vitest run tests/domain/mission-generation.test.ts tests/server/ai-mission-generator.test.ts` - RED as expected: fails on missing `src/domain/ai/mission-generation.ts` and `src/server/ai/mission-generator.ts`.
- `npx playwright test tests/e2e/teacher-ai-mission-draft.spec.ts` - RED as expected with escalation: fails on missing `src/components/teacher/MissionDraftPanel.tsx`.
- `npx vitest run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts` - RED as expected: fails on missing `src/domain/ai/turn-evaluation.ts`, missing `src/server/ai/turn-evaluator.ts`, absent AI routing helpers, old completion behavior, and missing `StepAiEvaluationFeedback.tsx`; the non-English unsuccessful-practice guard passes.
- `npx playwright test tests/e2e/student-ai-evaluation.spec.ts` - RED as expected with escalation: fails on missing `src/components/student/StepAiEvaluationFeedback.tsx`.
- Plan-level `npx vitest run tests/domain/mission-generation.test.ts tests/domain/turn-evaluation.test.ts tests/server/ai-mission-generator.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts` - RED as expected: 25 tests run, 24 failing and 1 passing.
- Plan-level `npx playwright test tests/e2e/teacher-ai-mission-draft.spec.ts tests/e2e/student-ai-evaluation.spec.ts` - RED as expected with escalation: 5 source-contract tests fail on missing planned UI components.

## TDD Gate Compliance

- RED gate present: `1f1ff144` and `9a15a256` are test-only commits.
- GREEN gate warning: no `feat(06-01)` commit exists because 06-01 is intentionally the Phase 6 validation scaffold; GREEN implementation is split across plans 06-02, 06-03, and 06-04.

## Known Stubs

None. This plan added tests only and no production stubs or placeholder UI/data paths.

## Threat Flags

None. The new files are tests and source-contract checks only; no new network endpoint, auth path, file access surface in production code, or schema trust boundary was introduced.

## User Setup Required

None - no external service configuration required. Automated tests use fake clients or local source checks only.

## Next Phase Readiness

Plan 06-02 can implement `src/domain/ai/mission-generation.ts`, `src/server/ai/mission-generator.ts`, `MissionDraftPanel`, and MissionForm draft handoff against the RED tests. Plans 06-03 and 06-04 can implement turn evaluation, upload routing, completion compatibility, and student feedback against the RED tests.

## Self-Check: PASSED

- Key files exist: `tests/domain/mission-generation.test.ts`, `tests/server/ai-mission-generator.test.ts`, `tests/e2e/teacher-ai-mission-draft.spec.ts`, `tests/domain/turn-evaluation.test.ts`, `tests/server/turn-evaluator.test.ts`, `tests/server/student-mission-flow.test.ts`, and `tests/e2e/student-ai-evaluation.spec.ts`.
- Task commits exist: `1f1ff144` and `9a15a256`.

---
*Phase: 06-ai-mission-and-turn-intelligence*
*Completed: 2026-06-29*
