---
phase: 04-guided-student-attempt-loop
plan: 01
subsystem: domain
tags: [typescript, character-profile, evaluation, style-tokens, vitest, playwright]

requires:
  - phase: 01-foundation
    provides: "foundation schema (attempts, attempt_turns, assignment_students tables + enums)"
  - phase: 03-manual-mission-assignment
    provides: "missionSnapshotSchema, DEFAULT_CHARACTER_ID constant, student styles module"
provides:
  - "CharacterProfile type + getCharacterProfile resolver with Coco default buddy (CHAR-04)"
  - "PlaceholderEvaluation type + buildPlaceholderEvaluation builder (D-02 swap point)"
  - "AttemptRow, AttemptTurnRow, AssignmentStudentRow db types"
  - "Phase 4 style tokens (stepCard, buddyCard, improvedSentenceCard, hintCard, progressTrack, statusBadge variants)"
  - "AI-06 structural boundary test (GREEN)"
  - "Mission flow + e2e RED test scaffolds (Wave 0)"
affects: [04-02, 04-03, 04-04, 04-05, phase-05, phase-06]

tech-stack:
  added: []
  patterns:
    - "Pure domain module pattern: character/profile.ts and flow/evaluation.ts have zero server/DB/AI imports"
    - "Version-discriminated swap point: evaluation.version field enables Phase 6 to detect and replace placeholder evaluations"
    - "Static copy contract: buddy lines live in character profile, matching UI-SPEC copy verbatim"

key-files:
  created:
    - src/domain/character/profile.ts
    - src/domain/flow/evaluation.ts
    - tests/domain/character-profile.test.ts
    - tests/domain/placeholder-evaluation.test.ts
    - tests/domain/ai-boundary.test.ts
    - tests/server/mission-flow.test.ts
    - tests/e2e/student-mission.spec.ts
  modified:
    - src/lib/db/types.ts
    - src/components/student/styles.ts

key-decisions:
  - "Character profile uses DEFAULT_CHARACTER_ID import from mission/schemas (no duplicate literal)"
  - "Placeholder evaluation version discriminator is 'placeholder-v1' as const for Phase 6 swap detection"
  - "Badge style tokens use spread from statusBadgeBaseStyle for DRY per-status variants"

patterns-established:
  - "Domain isolation pattern: character and flow modules import only from domain layer, never server/supabase/AI"
  - "Wave 0 RED scaffold pattern: test files import not-yet-existing modules to fail by design, go GREEN in later plans"

requirements-completed: [CHAR-01, CHAR-02, CHAR-03, CHAR-04, FLOW-02, AI-06]

duration: 4min
completed: 2026-06-27
status: complete
---

# Phase 04 Plan 01: Foundation Units Summary

**Coco character profile module with static buddy copy, placeholder-v1 evaluation swap point, Phase 4 style tokens + db types, and Wave 0 test scaffolds (AI-06 GREEN, flow/e2e RED)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-27T00:28:50Z
- **Completed:** 2026-06-27T00:33:30Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Character profile module resolves Coco for "default-buddy" with safe fallback for unknown ids; all static buddy copy matches the UI-SPEC Mission Flow Copy contract verbatim
- Placeholder evaluation builder emits the `placeholder-v1` versioned shape for `attempt_turns.evaluation` jsonb, enabling clean Phase 6 swap
- Phase 4 style tokens (step cards, buddy card, improved sentence card, hint card, progress bar, resume notice, 4 status badge variants) and db row types (AttemptRow, AttemptTurnRow, AssignmentStudentRow) added for downstream plans
- AI-06 structural test passes: no AI/LLM imports reachable from student flow paths
- Wave 0 RED scaffolds wired: mission-flow.test.ts (goes GREEN plan 03) and student-mission.spec.ts (goes GREEN plan 05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Character profile module (TDD)** - `ec01df12` (test: RED) + `57663de0` (feat: GREEN)
2. **Task 2: Placeholder evaluation + db types + style tokens (TDD)** - `43f62a22` (test: RED) + `98c49c4e` (feat: GREEN)
3. **Task 3: Wave 0 RED scaffolds** - `2c1b9f62` (feat: AI-06 GREEN + flow/e2e RED scaffolds)

## Files Created/Modified
- `src/domain/character/profile.ts` - CharacterProfile type, DEFAULT_BUDDY (Coco), getCharacterProfile resolver
- `src/domain/flow/evaluation.ts` - PlaceholderEvaluation type, buildPlaceholderEvaluation builder, PLACEHOLDER_EVALUATION_VERSION const
- `src/lib/db/types.ts` - Extended with AttemptRow, AttemptTurnRow, AssignmentStudentRow types
- `src/components/student/styles.ts` - Extended with stepCard, buddyCard, improvedSentenceCard, hintCard, progressTrack/Fill, resumeNotice, statusBadge variants
- `tests/domain/character-profile.test.ts` - 14 unit tests: resolution, fallback, static copy, CHAR-03 guard
- `tests/domain/placeholder-evaluation.test.ts` - 4 unit tests: version, shape, timestamp
- `tests/domain/ai-boundary.test.ts` - 2 tests: AI-06 structural scan + directory existence
- `tests/server/mission-flow.test.ts` - RED scaffold for FLOW-01/05/06/07
- `tests/e2e/student-mission.spec.ts` - RED scaffold for FLOW-04/PILOT-01

## Decisions Made
- Character profile reuses `DEFAULT_CHARACTER_ID` from `@/domain/mission/schemas` -- no duplicate string literal
- Placeholder evaluation uses `"placeholder-v1" as const` for TypeScript narrowing and Phase 6 version detection
- Badge style tokens use object spread from `statusBadgeBaseStyle` for maintainable per-status variants
- Added `placeholder-evaluation.test.ts` (not in plan) as TDD RED artifact for Task 2 behavior verification

## Deviations from Plan

None - plan executed exactly as written.

The addition of `tests/domain/placeholder-evaluation.test.ts` was required by the TDD flow for Task 2 (the plan specified `tdd="true"` for Task 2, which requires a RED test before GREEN implementation).

## Issues Encountered
- Pre-existing TypeScript error in `tests/schema/mission-assign-rpc-schema.test.ts` (regex flag requires es2018 target) -- unrelated to this plan, not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Character profile module ready for consumption by MissionFlowShell (plan 04)
- Placeholder evaluation ready for consumption by submit-answer server action (plan 03)
- Style tokens ready for all Phase 4 UI components (plans 02/04)
- Db row types ready for server action typing (plan 03)
- Wave 0 test scaffolds wired to go GREEN as services and UI are built

## Self-Check: PASSED

All 7 created files verified present on disk. All 5 task commits verified in git history.

---
*Phase: 04-guided-student-attempt-loop*
*Completed: 2026-06-27*
