---
phase: 03-manual-mission-assignment
plan: 01
subsystem: teacher-missions
tags: [nextjs, react, zod, supabase, server-actions]
requires:
  - phase: 02-teacher-classroom-access
    provides: teacher auth guard, RLS-bound Supabase client, and class-management UI patterns
provides:
  - manual mission form schema with ordered turns and default buddy character id
  - RLS-bound mission create, update, fetch, and list service
  - teacher create/edit mission pages with dynamic turn editor UI
affects: [phase-03-assignment, phase-06-ai-generation, teacher-ui]
tech-stack:
  added: []
  patterns:
    - controlled React form for nested turn authoring
    - server action to RLS-bound service mutation
    - reusable Zod mission snapshot schema
key-files:
  created:
    - src/domain/mission/schemas.ts
    - src/server/mission/mission-service.ts
    - src/app/teacher/missions/actions.ts
    - src/app/teacher/missions/new/page.tsx
    - src/app/teacher/missions/[id]/page.tsx
    - src/components/teacher/MissionForm.tsx
    - src/components/teacher/TurnEditor.tsx
  modified:
    - src/lib/db/types.ts
    - tests/domain/mission-schemas.test.ts
    - tests/server/mission-service.test.ts
    - tests/e2e/teacher-missions.spec.ts
key-decisions:
  - "Mission requiredTurns is derived from the authored turn array in the UI and revalidated server-side before writes."
  - "Mission create/edit pages reuse the existing teacher SSR shell and keep due date, AI generation, and character picker out of scope."
patterns-established:
  - "Mission schemas use camelCase app fields and map to snake_case Supabase columns only in the service layer."
  - "Mission builder submits nested turns as JSON FormData consumed by server actions."
requirements-completed: [MISS-01, MISS-04]
duration: 5 min
completed: 2026-06-26
status: complete
---

# Phase 03 Plan 01: Manual Mission Authoring Summary

**Manual mission builder with reusable Zod schemas, RLS-bound mission persistence, and ordered turn-template editing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-26T03:14:45Z
- **Completed:** 2026-06-26T03:19:36Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added RED tests for mission schema validation, service persistence, and env-aware mission builder E2E coverage.
- Implemented `missionFormSchema` and `missionSnapshotSchema` with constrained levels, required-turn matching, ordered turns, 3-tier hints, and `default-buddy`.
- Added the RLS-bound mission service, server actions, create/edit pages, `MissionForm`, and `TurnEditor`.

## Task Commits

1. **Task 1: Add failing mission-authoring tests** - `6f78636` (test)
2. **Task 2: Implement mission schema, service, actions, and builder UI** - `fbf0dba` (feat)

## Verification

- `npm test -- --run tests/domain/mission-schemas.test.ts tests/server/mission-service.test.ts` — passed, 6 tests.
- `npm run typecheck` — passed.

## Files Created/Modified

- `src/domain/mission/schemas.ts` - Mission form, turn, hint ladder, level enum, and reusable snapshot schemas.
- `src/server/mission/mission-service.ts` - RLS-bound mission create, update, fetch, list, and assignment-count behavior.
- `src/app/teacher/missions/actions.ts` - Create and update mission server actions.
- `src/app/teacher/missions/new/page.tsx` - Authenticated mission create page.
- `src/app/teacher/missions/[id]/page.tsx` - Authenticated mission edit page with assignment notice plumbing.
- `src/components/teacher/MissionForm.tsx` - Controlled teacher mission builder.
- `src/components/teacher/TurnEditor.tsx` - Ordered turn editor for prompt, target example, and hint ladder fields.
- `src/lib/db/types.ts` - Expanded mission, turn, and assignment row fields.
- `tests/domain/mission-schemas.test.ts` - Mission schema coverage.
- `tests/server/mission-service.test.ts` - Mission service coverage.
- `tests/e2e/teacher-missions.spec.ts` - Env-aware browser workflow coverage.

## Decisions Made

- Used controlled state for nested turn editing to match the Phase 2 form style and avoid adding new form abstractions.
- Kept `requiredTurns` synchronized to the turn array length in the UI, while server validation remains the source of truth.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Mission definitions can now be created and edited with stable ordered turn content. Plan 02 can build assignment snapshots from these mission and turn rows.

---
*Phase: 03-manual-mission-assignment*
*Completed: 2026-06-26*
