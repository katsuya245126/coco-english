---
phase: 06-ai-mission-and-turn-intelligence
plan: 04
subsystem: ai
tags: [openai, zod, turn-evaluation, student-flow, teacher-evidence]
requires:
  - phase: 06-ai-mission-and-turn-intelligence
    provides: original-turn evaluation, student feedback routing, and RED repeat/review tests
  - phase: 05-voice-capture-and-evidence-storage
    provides: transcript-gated audio upload and teacher-owned signed audio evidence
provides:
  - Repeat-turn evaluator inputs and app-owned repeat decisions
  - Repeat upload integration that persists accepted, retry, and teacher-review outcomes
  - Completion compatibility for accepted-original and accepted-repeat paths
  - Service-owned teacher-review status/reason/audit routing
  - Transcript-first teacher evidence annotations for AI outcomes
affects: [phase-07-teacher-review, student-mission-flow, teacher-evidence]
tech-stack:
  added: []
  patterns:
    - Repeat evaluation uses fake-client injection and local app decision helpers
    - AI output is stored as bounded evidence, while app service code owns status transitions
    - Teacher evidence maps stored AI fields into labels without dashboard or override scope
key-files:
  created: []
  modified:
    - src/server/ai/turn-evaluator.ts
    - src/server/student-access/audio-upload.ts
    - src/domain/flow/completion.ts
    - src/server/student-access/mission-flow.ts
    - src/components/student/MissionFlowShell.tsx
    - src/server/teacher/audio-evidence.ts
    - src/app/teacher/evidence/[attemptId]/page.tsx
    - tests/server/audio-upload.test.ts
    - tests/server/student-mission-flow.test.ts
    - tests/server/audio-evidence.test.ts
    - tests/e2e/teacher-audio-evidence.spec.ts
key-decisions:
  - "06-04: Repeat uploads now evaluate the transcript against the improved sentence before setting repeat_accepted."
  - "06-04: Teacher-review status changes are centralized in routeAssignmentStudentToTeacherReview and audited with actor_type ai_evaluator."
  - "06-04: Existing teacher evidence shows AI annotations, while Phase 7 dashboard buckets and manual override UI remain out of scope."
patterns-established:
  - "Review routing writes attempts.needs_review_reason and assignment_status_events from service-owned code, never directly from AI output."
  - "Teacher evidence maps meaning, target-pattern, repeat, and review reason labels from stored bounded evaluation fields."
requirements-completed: [AI-03, AI-04, AI-05]
duration: 15min
completed: 2026-06-30
status: complete
---

# Phase 06 Plan 04: Repeat Evaluation, Review Routing, and Evidence Handoff Summary

**Repeat attempts now receive app-owned AI closeness decisions, uncertain outcomes route to audited teacher review, and existing teacher evidence displays transcript-first AI annotations.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-29T23:35:04Z
- **Completed:** 2026-06-29T23:50:18Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added a TDD gate and implementation for repeat uploads so `repeat_accepted` is set only from app-owned repeat evaluation decisions.
- Updated repeat evaluator inputs to include the original transcript, improved sentence, target pattern, level, and repeat transcript while preserving fake-client test compatibility.
- Updated completion reads so accepted original-only turns and accepted-repeat turns can complete, while malformed or review-routed evaluation cannot satisfy completion.
- Added `routeAssignmentStudentToTeacherReview` for idempotent AI-attributed status routing with `attempts.needs_review_reason` and `assignment_status_events` audit rows.
- Extended teacher evidence mapping and the evidence page with meaning, target-pattern, repeat-result, review badge, and review-reason annotations without adding Phase 7 dashboard or manual override scope.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Repeat evaluation upload test** - `f7912cfd` (`test`)
2. **Task 1 GREEN: Repeat evaluation flow** - `69464c89` (`feat`)
3. **Task 2 RED: Teacher review evidence tests** - `d961db3e` (`test`)
4. **Task 2 GREEN: Review routing and evidence annotations** - `3d6600b0` (`feat`)

_Note: Both tasks were marked `tdd="true"`, so each produced a RED test commit followed by a GREEN implementation commit._

## Files Created/Modified

- `src/server/ai/turn-evaluator.ts` - Repeat evaluator prompt/input now carries original transcript, improved sentence, target pattern, level, and repeat transcript.
- `src/server/student-access/audio-upload.ts` - Repeat uploads call `evaluateRepeatTurn`, persist bounded repeat decisions, return repeat feedback payloads, and route review decisions through service code.
- `src/domain/flow/completion.ts` - Completion accepts only app-accepted original answers or accepted repeats; teacher-review/malformed evaluation does not complete a turn.
- `src/server/student-access/mission-flow.ts` - Added service-owned teacher-review routing with ownership checks, transition validation, attempt review reason writes, and AI audit events.
- `src/components/student/MissionFlowShell.tsx` - Added repeat feedback state for accepted, retry, and teacher-review repeat outcomes.
- `src/server/teacher/audio-evidence.ts` - Maps stored AI fields into meaning, target pattern, repeat result, and review reason evidence labels.
- `src/app/teacher/evidence/[attemptId]/page.tsx` - Renders transcript-first AI annotations and review reason copy while keeping audio on demand.
- `tests/server/audio-upload.test.ts` - Adds repeat evaluator integration coverage and fake repeat evaluators.
- `tests/server/student-mission-flow.test.ts` - Adds service-owned review routing source contract.
- `tests/server/audio-evidence.test.ts` - Adds evidence annotation mapping coverage.
- `tests/e2e/teacher-audio-evidence.spec.ts` - Adds teacher evidence source-contract checks for AI labels and absence of Phase 7 controls.

## Decisions Made

- Repeat review outcomes do not set completed status; completed assignment state is reserved for accepted-original or accepted-repeat completion.
- Review status routing is centralized in `mission-flow.ts` so AI output remains evidence and app code owns workflow transitions.
- Teacher evidence uses readable labels rather than raw provider JSON, model names, token counts, confidence decimals, or dashboard controls.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Playwright could not bind its configured local web server inside the sandbox (`listen EPERM 0.0.0.0:3000`). The same Playwright commands passed when rerun with approved escalation.
- An older repeat metadata unit test did not inject a fake repeat evaluator. After Task 2 added review routing for missing-key repeat evaluation, the test fixture was updated to keep automated tests fake-client only.

## Verification

- `npx vitest run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts` - passed, 18 tests.
- `npx vitest run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts tests/server/student-mission-flow.test.ts tests/server/audio-evidence.test.ts` - passed, 23 tests.
- `npx playwright test tests/e2e/student-ai-evaluation.spec.ts` - passed with escalation, 3 tests.
- `npx playwright test tests/e2e/teacher-audio-evidence.spec.ts` - passed with escalation, 4 tests.
- `npx playwright test tests/e2e/student-ai-evaluation.spec.ts tests/e2e/teacher-audio-evidence.spec.ts` - passed with escalation, 7 tests.
- `npx vitest run` - passed, 211 tests and 4 skipped across 27 files.
- `npm run typecheck` - passed.

## TDD Gate Compliance

- RED gate present: `f7912cfd` and `d961db3e` are test commits that failed before implementation for the intended missing behavior.
- GREEN gate present: `69464c89` and `3d6600b0` implement the behavior and pass the focused and plan-level verification commands.
- REFACTOR gate: not needed; no separate cleanup-only change was made.

## Known Stubs

None. The phrase "Audio is not available for this clip." is intentional UI fallback copy for unavailable signed playback, not placeholder data.

## Threat Flags

None. The modified trust boundaries match the plan threat model: repeat provider output is locally parsed into app decisions, status writes use service-owned transition checks and audit rows, and teacher evidence stays behind `requireTeacherProfile` plus teacher-owned evidence queries.

## User Setup Required

None for automated tests. Live mission/turn evaluation still requires `OPENAI_API_KEY`; `OPENAI_EVALUATION_MODEL` remains optional.

## Next Phase Readiness

Phase 6 now satisfies AI-03, AI-04, and AI-05. Phase 7 can build teacher dashboard buckets, review workflows, filters, and any manual override UI on top of the audited `teacher_review` status and evidence annotations created here.

## Self-Check: PASSED

- Key files exist: `src/server/ai/turn-evaluator.ts`, `src/server/student-access/audio-upload.ts`, `src/domain/flow/completion.ts`, `src/server/student-access/mission-flow.ts`, `src/components/student/MissionFlowShell.tsx`, `src/server/teacher/audio-evidence.ts`, `src/app/teacher/evidence/[attemptId]/page.tsx`, `tests/server/audio-upload.test.ts`, `tests/server/student-mission-flow.test.ts`, `tests/server/audio-evidence.test.ts`, and `tests/e2e/teacher-audio-evidence.spec.ts`.
- Task commits exist: `f7912cfd`, `69464c89`, `d961db3e`, and `3d6600b0`.
- No tracked files were deleted by task commits.
- Full Vitest, plan Playwright checks, and TypeScript passed.

---
*Phase: 06-ai-mission-and-turn-intelligence*
*Completed: 2026-06-30*
