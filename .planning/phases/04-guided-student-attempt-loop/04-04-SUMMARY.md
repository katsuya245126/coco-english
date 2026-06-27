---
phase: 04-guided-student-attempt-loop
plan: 04
subsystem: ui
tags: [typescript, react, next.js, server-components, client-components, inline-styles, a11y]

requires:
  - phase: 04-01
    provides: "CharacterProfile type + getCharacterProfile resolver, Phase 4 style tokens, db types"
  - phase: 04-03
    provides: "submitAnswerAction, submitRepeatAction, revealHintAction, startAttemptAction server actions"
  - phase: 02-04
    provides: "readStudentUnlock cookie gate, createSupabaseServiceClient"
provides:
  - "SSR mission route with unlock gate, ownership check, snapshot parse, character profile resolution, resume position (FLOW-01, D-12, PILOT-01)"
  - "MissionFlowShell client step-state machine: question -> repeat -> transition -> complete (D-12, FLOW-02/04/05)"
  - "StepBuddyQuestion: buddy speech card + answer input + hint area (FLOW-02, CHAR-01/02)"
  - "StepImprovedRepeat: read-only answer + improved sentence + required repeat (FLOW-04, FLOW-05, D-03)"
  - "HintRevealer: strict tier1 -> tier2 -> tier3 disclosure, record-only (FLOW-07, D-07/D-08)"
  - "TurnProgressBar: role=progressbar with aria attributes and visual fill"
affects: [04-05, phase-05, phase-06]

tech-stack:
  added: []
  patterns:
    - "SSR gate pattern replication: mission route mirrors home-page unlock + redirect for consistency"
    - "Client step-state machine: useState-driven FlowState with no URL changes between steps (Anti-Pattern avoided)"
    - "Snapshot-only rendering: all buddy/sentence text comes from parsed snapshot + static profile, never AI-generated"

key-files:
  created:
    - src/app/student/missions/[assignmentStudentId]/page.tsx
    - src/components/student/MissionFlowShell.tsx
    - src/components/student/StepBuddyQuestion.tsx
    - src/components/student/StepImprovedRepeat.tsx
    - src/components/student/HintRevealer.tsx
    - src/components/student/TurnProgressBar.tsx
  modified: []

key-decisions:
  - "Resume position computed SSR-side from existing attempt turns via nextUnfinishedTurnOrder, passed as 0-based startingTurnIndex"
  - "Transition and completion steps render character profile text inline; 'Back to homework' navigation deferred to plan 05"
  - "HintRevealer uses display:none/block instead of conditional rendering to maintain DOM structure for aria-hidden toggles"
  - "startAttemptAction called lazily on first answer submit (ensureAttempt pattern) so the attempt is only created when the student actually answers"

patterns-established:
  - "Step card swap pattern: one visible card at a time via FlowStep discriminator, no scroll thread"
  - "Server action transition pattern: useTransition wrapping action calls with isPending disabling buttons"
  - "Record-only side effects: hint reveals fire-and-forget to revealHintAction without awaiting or blocking flow"

requirements-completed: [FLOW-01, FLOW-02, FLOW-04, FLOW-05, FLOW-07, AI-06, CHAR-01, CHAR-02, PILOT-01]

duration: 8min
completed: 2026-06-27
status: complete
---

# Phase 04 Plan 04: Mission Flow UI Summary

**Mission-flow UI vertical slice with SSR-gated route, client step machine (question -> repeat -> transition), snapshot-only buddy speech, and progressive 3-tier hint disclosure**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-27T01:23:11Z
- **Completed:** 2026-06-27T01:31:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- SSR mission route replicates the home-page unlock gate, verifies ownership (assignmentStudentId + student_id), parses snapshot with missionSnapshotSchema, resolves Coco character profile, and computes resume position from existing attempt turns
- MissionFlowShell drives a useState step machine (question -> repeat -> transition -> complete) showing exactly one step card at a time with no URL changes between steps
- StepBuddyQuestion renders the buddy speech card with profile labels and snapshot prompts, includes the HintRevealer, and validates non-empty answer before calling submitAnswerAction
- StepImprovedRepeat shows the student's original answer read-only, the snapshot targetExample as the improved sentence, and requires a typed repeat before calling submitRepeatAction
- HintRevealer discloses tier1 (Pattern) -> tier2 (Word bank) -> tier3 (Full example) strictly in order with aria-expanded disclosure pattern, recording each reveal via revealHintAction (never gating completion)
- TurnProgressBar displays "Turn N of M" with a role=progressbar element and correct aria-valuenow/min/max attributes
- AI-06 boundary test passes: zero AI/LLM imports in any student-facing file

## Task Commits

Each task was committed atomically:

1. **Task 1: SSR mission route** - `db4c869c` (feat: unlock gate, ownership, snapshot parse, profile)
2. **Task 2: MissionFlowShell + step cards + progress bar** - `a6213476` (feat: step machine, buddy question, improved repeat, progress bar)
3. **Task 3: HintRevealer** - `5aafa512` (feat: progressive 3-tier hint disclosure)

## Files Created/Modified
- `src/app/student/missions/[assignmentStudentId]/page.tsx` - SSR server component: unlock gate, ownership check, snapshot parse, character profile resolution, resume position, MissionFlowShell render
- `src/components/student/MissionFlowShell.tsx` - Client step-state machine: FlowState (turnIndex, step, hintLevel, originalAnswer), ensureAttempt lazy start, submit handlers, transition/complete cards
- `src/components/student/StepBuddyQuestion.tsx` - Buddy speech card with questionLabel + prompt, hint area, answer input with validation, submit button
- `src/components/student/StepImprovedRepeat.tsx` - Read-only original answer, improved sentence card with targetExample, repeat instruction, repeat input with validation, submit button
- `src/components/student/HintRevealer.tsx` - 3-tier progressive disclosure: tier1/tier2/tier3 in strict order, aria-expanded, record-only via onReveal callback
- `src/components/student/TurnProgressBar.tsx` - Turn label + progress bar with role=progressbar, aria attributes, fill width = completed fraction

## Decisions Made
- Resume position computed SSR-side from existing attempt turns via `nextUnfinishedTurnOrder`, converted to 0-based index for the shell (if all done, clamps to last turn)
- Lazy attempt creation: `startAttemptAction` called on first answer submit via `ensureAttempt` pattern so no attempt row is created until the student actually provides an answer
- Transition and completion steps render character profile strings; the "Back to homework" navigation and `completeMissionAction` call are deferred to plan 05 as specified
- HintRevealer uses `display:none`/`display:block` with `aria-hidden` toggling rather than conditional rendering to keep the DOM structure consistent for accessibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `tests/schema/mission-assign-rpc-schema.test.ts` (regex flag requires es2018 target) -- unrelated to this plan, not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MissionFlowShell ready for plan 05 to wire: resume notice UI, deterministic completion call (completeMissionAction), and "Back to homework" navigation
- All step cards render snapshot-only text, ready for Phase 5 audio integration (recording UI would attach to the answer/repeat input areas)
- Phase 6 AI evaluation swap will not affect flow: step advancement keys on transcript + repeat_accepted only (D-06 isolation maintained)

## Self-Check: PASSED

All 6 created files verified present on disk. All 3 task commits verified in git history.

---
*Phase: 04-guided-student-attempt-loop*
*Completed: 2026-06-27*
