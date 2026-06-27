---
phase: 04-guided-student-attempt-loop
plan: 03
subsystem: server
tags: [typescript, supabase, server-actions, service-layer, zod, vitest, tdd]

requires:
  - phase: 01-foundation
    provides: "foundation schema (attempts, attempt_turns, assignment_students, assignment_status_events tables + enums)"
  - phase: 04-01
    provides: "PlaceholderEvaluation + buildPlaceholderEvaluation (D-02 swap point), AttemptTurnRow/AssignmentStudentRow db types, AI-06 boundary test"
  - phase: 02-04
    provides: "readStudentUnlock cookie gate, createSupabaseServiceClient"
provides:
  - "isAttemptComplete + nextUnfinishedTurnOrder pure helpers (D-06 completion rule, never reads evaluation)"
  - "startOrResumeAttempt service: one attempt per assignment, resumes in_progress at next unfinished turn (D-04)"
  - "recordAnswer service: upsert with placeholder eval + truthful target_attempted (D-01/D-02)"
  - "recordRepeat service: accept-any-non-empty, sets repeat_accepted=true (D-05)"
  - "recordHintReveal service: record-only with GREATEST rollup, never affects completion (D-07/D-08)"
  - "Four server actions: startAttemptAction, submitAnswerAction, submitRepeatAction, revealHintAction (unlock-gated, Zod-validated)"
affects: [04-04, 04-05, phase-05, phase-06]

tech-stack:
  added: []
  patterns:
    - "Service-layer pattern: mission-flow.ts mirrors unlock.ts shape (try/catch, discriminated-union results, service-role client)"
    - "Completion isolation: flow control keys on transcript + repeat_accepted only, never reads evaluation (D-02 swap safety)"
    - "Server action delegate pattern: gate + validate + delegate, zero business logic in actions.ts"
    - "GREATEST rollup via Math.max: hint_level_used and highest_hint_level never regress"

key-files:
  created:
    - src/domain/flow/completion.ts
    - src/server/student-access/mission-flow.ts
    - src/app/student/missions/[assignmentStudentId]/actions.ts
  modified:
    - tests/server/mission-flow.test.ts

key-decisions:
  - "Completion helpers use Map<turn_order, turn> for O(1) lookups, handling out-of-order arrays gracefully"
  - "GREATEST semantics implemented via Math.max in app code (Supabase JS client lacks SQL GREATEST in update)"
  - "Service functions take studentId as param (from unlock cookie) rather than reading cookies themselves, keeping service-role logic testable"
  - "Test scaffold imports updated from old names (startAttempt etc.) to actual exports (startOrResumeAttempt etc.) via dynamic import"

patterns-established:
  - "Mission flow service pattern: ownership-checked, audited, idempotent, zero AI imports"
  - "Pure completion module: no DB/server/AI imports, flow control independent of evaluation field"

requirements-completed: [FLOW-01, FLOW-02, FLOW-04, FLOW-05, FLOW-07, AI-06, CHAR-01]

duration: 5min
completed: 2026-06-27
status: complete
---

# Phase 04 Plan 03: Mission Flow Service Summary

**Server-side mission-flow state machine with start/resume, answer/repeat/hint services behind unlock-gated Zod-validated server actions, plus pure completion helpers keyed only on transcripts (never evaluation)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-27T00:45:52Z
- **Completed:** 2026-06-27T00:51:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Pure completion helpers (isAttemptComplete, nextUnfinishedTurnOrder) encode D-06 deterministic completion rule keyed only on transcripts + repeat_accepted, structurally preventing Phase 6 AI eval swap from breaking flow control
- Mission-flow service delivers four ownership-checked, idempotent operations: start-or-resume (one attempt per assignment), record-answer (placeholder eval + truthful target_attempted), record-repeat (accept-any-non-empty), record-hint-reveal (GREATEST rollup, record-only)
- Server actions wrap each service function with readStudentUnlock gate + Zod input validation, exposing zero business logic to the browser
- AI-06 structural boundary holds: zero AI/LLM imports in service + actions; ai-boundary.test.ts passes with new directories

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure completion + resume helpers (TDD)** - `86eea043` (test: RED) + `65e33925` (feat: GREEN)
2. **Task 2: Mission-flow service** - `fa11b0c7` (feat: start/resume, answer, repeat, hint)
3. **Task 3: Server-action surface** - `85113c7b` (feat: unlock-gated Zod-validated actions)

## Files Created/Modified
- `src/domain/flow/completion.ts` - Pure isAttemptComplete + nextUnfinishedTurnOrder helpers (D-06, zero DB/server/AI imports)
- `src/server/student-access/mission-flow.ts` - Service-role mission flow service: startOrResumeAttempt, recordAnswer, recordRepeat, recordHintReveal
- `src/app/student/missions/[assignmentStudentId]/actions.ts` - Four server actions with unlock gate + Zod validation + service delegation
- `tests/server/mission-flow.test.ts` - Extended with 15 completion helper tests (all GREEN) + updated service import scaffolds to actual export names

## Decisions Made
- Completion helpers use `Map<turn_order, turn>` for O(1) lookups, handling out-of-order turn arrays gracefully
- GREATEST semantics for hint rollup implemented via `Math.max` in application code because Supabase JS client does not support SQL GREATEST in update calls
- Service functions accept `studentId` as a parameter (injected by the action layer from the unlock cookie) rather than reading cookies directly, keeping the service-role logic isolated and testable
- Updated Wave 0 test scaffold imports from plan-01 placeholder names (`startAttempt` etc.) to actual export names (`startOrResumeAttempt` etc.) using dynamic imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated test scaffold imports to match actual export names**
- **Found during:** Task 2
- **Issue:** Plan 01 scaffold used placeholder names (startAttempt, submitAnswer, submitRepeat, revealHint, completeMission) that do not match the actual service exports (startOrResumeAttempt, recordAnswer, recordRepeat, recordHintReveal)
- **Fix:** Updated scaffold tests to use dynamic imports with actual export names
- **Files modified:** tests/server/mission-flow.test.ts
- **Committed in:** fa11b0c7 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import name alignment was necessary for the tests to resolve. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in `tests/schema/mission-assign-rpc-schema.test.ts` (regex flag requires es2018 target) -- unrelated to this plan, not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Completion helpers ready for plan 05 (completeAttempt calls isAttemptComplete)
- Mission-flow service ready for UI consumption in plan 04 (MissionFlowShell)
- Server actions ready for plan 04 UI to call via React transitions
- completeMissionAction deferred to plan 05 as specified

## Self-Check: PASSED

All 3 created files verified present on disk. All 4 task commits verified in git history.

---
*Phase: 04-guided-student-attempt-loop*
*Completed: 2026-06-27*
