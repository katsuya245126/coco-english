---
phase: 04-guided-student-attempt-loop
plan: 05
subsystem: server+ui
tags: [typescript, supabase, server-actions, react, next.js, vitest, playwright, tdd]

requires:
  - phase: 04-01
    provides: "CharacterProfile + getCharacterProfile, Phase 4 style tokens, db types"
  - phase: 04-03
    provides: "mission-flow service (startOrResumeAttempt, recordAnswer, recordRepeat, recordHintReveal), isAttemptComplete/nextUnfinishedTurnOrder completion helpers, server actions"
  - phase: 04-04
    provides: "MissionFlowShell step machine, SSR mission route, StepBuddyQuestion, StepImprovedRepeat, HintRevealer, TurnProgressBar"
provides:
  - "completeAttempt service: server-owned audited started->completed transition gated on isAttemptComplete (FLOW-06, D-06)"
  - "completeMissionAction: unlock-gated, Zod-validated action for mission completion"
  - "StepTurnTransition: between-turn success screen with Next turn advancement"
  - "StepMissionComplete: completion screen with Back to homework navigation"
  - "Resume notice: Welcome back auto-dismissing notice for returning students (D-04)"
  - "Full e2e mission walk green on mobile viewport (FLOW-04/05, PILOT-01)"
affects: [phase-05, phase-06, phase-07]

tech-stack:
  added: []
  patterns:
    - "Idempotent completion: conditional UPDATE WHERE status='started' returns 0 rows on re-call (Pitfall 3)"
    - "Server-owned completion gate: client requests completion but server re-derives from DB turns"
    - "Resume notice auto-dismiss: 5s timer OR first submit, whichever comes first"

key-files:
  created:
    - src/components/student/StepTurnTransition.tsx
    - src/components/student/StepMissionComplete.tsx
  modified:
    - src/server/student-access/mission-flow.ts
    - src/app/student/missions/[assignmentStudentId]/actions.ts
    - src/components/student/MissionFlowShell.tsx
    - tests/server/mission-flow.test.ts
    - tests/e2e/student-mission.spec.ts

key-decisions:
  - "Completion audit event written only when conditional UPDATE succeeds (0 rows = already completed = no duplicate)"
  - "Resume notice dismissed on first answer submit in addition to 5s timer for immediate UX feedback"
  - "E2e tests seed full assignment chain (teacher -> class -> student -> mission -> assignment -> assignment_student) for isolation"

patterns-established:
  - "Server-owned completion: client cannot force completion; server re-derives completeness from DB turns via isAttemptComplete"
  - "Audited status transition: every started->completed writes assignment_status_events with actor_type + reason_code"
  - "E2e env-aware seeding: full data chain created and cleaned up per test with hasSupabaseEnv guard"

requirements-completed: [FLOW-05, FLOW-06, PILOT-01]

duration: 8min
completed: 2026-06-27
status: complete
---

# Phase 04 Plan 05: Mission Completion + E2E Summary

**Server-owned audited completion with idempotent started->completed transition, turn transition/completion UI screens with resume notice, and full multi-turn e2e walk green on mobile**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-27T01:39:43Z
- **Completed:** 2026-06-27T01:48:28Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Server-owned `completeAttempt` service re-derives completeness from DB turns via `isAttemptComplete`, writes the audited `started->completed` transition with `assignment_status_events` row, and stamps `attempts.completed_at` + `assignment_students.submitted_at` -- all idempotent via conditional UPDATE (Pitfall 3)
- `StepTurnTransition` advances to next turn with "Good job!" success message; `StepMissionComplete` shows "Mission complete!" with "Back to homework" navigation to `/student/home`
- MissionFlowShell now fires `completeMissionAction` on final-turn repeat success, wires resume notice with 5s auto-dismiss + first-submit dismiss (D-04), and uses extracted `StepTurnTransition`/`StepMissionComplete` components
- Full e2e test drives a 2-turn mission through answer -> improved sentence -> repeat -> transition -> complete on mobile viewport (375x812), asserting content within 420px max-width (PILOT-01)
- AI-06 structural boundary holds: zero AI/LLM imports in any student-facing file; `ai-boundary.test.ts` green

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-owned audited completion (TDD)** - `b8da9d36` (test: RED) + `b7513493` (feat: GREEN)
2. **Task 2: Transition + completion screens + resume notice** - `b339390b` (feat: transition/completion UI + resume notice)
3. **Task 3: E2e mission walk green on mobile** - `3f959e1f` (feat: full multi-turn e2e + mobile viewport)

## Files Created/Modified
- `src/server/student-access/mission-flow.ts` - Extended: `completeAttempt` service with isAttemptComplete gate, audited transition, idempotent completion
- `src/app/student/missions/[assignmentStudentId]/actions.ts` - Extended: `completeMissionAction` unlock-gated Zod-validated action
- `src/components/student/StepTurnTransition.tsx` - New: success message + Next turn button between turns
- `src/components/student/StepMissionComplete.tsx` - New: Mission complete heading + body + Back to homework navigation
- `src/components/student/MissionFlowShell.tsx` - Extended: completeMissionAction on final turn, resume notice, StepTurnTransition/StepMissionComplete wiring
- `tests/server/mission-flow.test.ts` - Extended: 6 new completion tests (completeAttempt export, isAttemptComplete gate, audit fields, completeMissionAction)
- `tests/e2e/student-mission.spec.ts` - Fleshed out from RED scaffold: full multi-turn walk + mobile viewport assertion

## Decisions Made
- Completion audit event is only inserted when the conditional UPDATE succeeds (WHERE status='started' returns a row), preventing duplicate events on re-call while keeping the function idempotent
- Resume notice dismissed both on 5-second timer expiry AND on the student's first answer submit, giving immediate feedback that the notice is transient
- E2e tests seed a complete data chain per test (teacher_profiles -> classes -> students -> missions -> assignments -> assignment_students) with cleanup in finally block for test isolation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `tests/schema/mission-assign-rpc-schema.test.ts` (regex flag requires es2018 target) -- unrelated to this plan, not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 mission flow is complete end-to-end: assignment list -> start mission -> per-turn question/answer/repeat -> transition -> completion with audited status
- Phase 5 (voice) can attach recording UI to the answer/repeat input areas; transcript fields already wired
- Phase 6 (AI evaluation) swap will not affect flow control: completion keys only on transcript + repeat_accepted (D-06 isolation)
- Phase 7 (teacher review) can query assignment_status_events for the completed audit trail

## Self-Check: PASSED

All 7 created/modified files verified present on disk. All 4 task commits verified in git history.

---
*Phase: 04-guided-student-attempt-loop*
*Completed: 2026-06-27*
