---
phase: 03-manual-mission-assignment
plan: 03
subsystem: teacher-missions
tags: [nextjs, react, zod, supabase, accessibility, ui-polish]
requires:
  - phase: 03-manual-mission-assignment
    provides: manual mission authoring (03-01) and atomic assignment RPC flow (03-02)
  - phase: 02-teacher-classroom-access
    provides: teacher auth guard, RLS-bound Supabase client, class-management UI patterns
provides:
  - integrated Phase 3 verification with snapshot stability, active-assignment-count, and E2E workflow coverage
  - accessibility polish (focus-visible rings, aria-describedby, auto-dismiss success)
  - complete teacher mission surface with navigation, empty state, assign dialog, and edit-after-assign notice
affects: [phase-04-student-homework, phase-05-audio, phase-06-ai-generation, phase-07-review]
tech-stack:
  added: []
  patterns:
    - global focus-visible ring via root layout style tag (2px solid #2563EB, 2px offset)
    - auto-dismiss timed success messages via useEffect cleanup
    - aria-describedby wiring for field errors and help text
key-files:
  created: []
  modified:
    - src/app/layout.tsx
    - src/components/teacher/MissionList.tsx
    - src/components/teacher/MissionForm.tsx
    - src/components/teacher/AssignDialog.tsx
    - tests/e2e/teacher-missions.spec.ts
    - tests/server/mission-assign.test.ts
key-decisions:
  - "Focus-visible rings added via a global <style> in root layout rather than per-component inline styles, since :focus-visible is a pseudo-class not expressible in React CSSProperties."
  - "Success auto-dismiss uses 5-second setTimeout with useEffect cleanup, consistent with UI-SPEC requirement."
patterns-established:
  - "Global CSS pseudo-class rules go in src/app/layout.tsx <style> block, keeping the no-CSS-files convention."
  - "Field-level aria-describedby links error messages and help text to their inputs for screen reader accessibility."
requirements-completed: [MISS-01, MISS-04, ASGN-01, ASGN-02, ASGN-03]
duration: 7 min
completed: 2026-06-26
status: complete
---

# Phase 03 Plan 03: Integrated Workflow and UI Polish Summary

**Snapshot stability tests, accessibility polish (focus-visible rings, aria-describedby, auto-dismiss), and full Phase 3 verification gate passing 14 tests + typecheck + build**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-26T07:03:28Z
- **Completed:** 2026-06-26T07:10:28Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added snapshot stability test proving stored assignment snapshots remain unchanged after live mission edits (D-05, D-06, D-14).
- Added active-assignment-count test confirming getMissionForTeacher returns the count needed for the D-15 edit-after-assign notice.
- Expanded E2E coverage to 5 tests: navigation links, empty state copy, mission authoring workflow, assign dialog elements, and edit notice mechanism.
- Applied accessibility polish: global focus-visible rings, aria-describedby for field errors and help text, and auto-dismiss success messages.
- Full verification gate passes: 14 unit/integration tests, typecheck clean, production build clean, 5 E2E tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add integrated workflow and snapshot-stability assertions** - `3e39f28` (test)
2. **Task 2: Complete navigation, edit notice, and UI polish** - `75dd576` (feat)
3. **Task 3: Run final Phase 3 verification** - verification-only task (no code commit)

## Verification Results

### Unit/Integration Tests (14 passed, 0 failed, 0 skipped)

```
npm test -- --run tests/domain/mission-schemas.test.ts tests/server/mission-service.test.ts tests/schema/mission-assign-rpc-schema.test.ts tests/server/mission-assign.test.ts

 Test Files  4 passed (4)
      Tests  14 passed (14)
```

- `tests/domain/mission-schemas.test.ts` — 4 tests (MISS-01, MISS-04, D-01, D-02, D-03, D-07, D-16)
- `tests/server/mission-service.test.ts` — 2 tests (MISS-01, D-01, D-02)
- `tests/schema/mission-assign-rpc-schema.test.ts` — 3 tests (ASGN-01, ASGN-03, D-04, D-08, D-09, D-12, D-13)
- `tests/server/mission-assign.test.ts` — 5 tests (ASGN-02, D-05, D-06, D-07, D-08, D-14, D-15)

### Typecheck

```
npm run typecheck — passed clean (tsc --noEmit, 0 errors)
```

### Build

```
npm run build — passed clean (Next.js 15.5.19 production build)
```

### E2E Tests (5 passed, 0 failed)

```
npx playwright test tests/e2e/teacher-missions.spec.ts — 5 passed
```

All 5 E2E tests use the env-aware pattern: when Supabase env is absent, they verify the protected route redirects to /auth/login and exit cleanly. When env is present with teacher credentials, the live browser path is exercised.

### Env-Gated Live Tests

The following tests require Supabase credentials to exercise their full live paths:

- `tests/server/teacher-ownership.test.ts` — 1 skipped (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY)
- `tests/e2e/teacher-missions.spec.ts` — 5 tests have env-gated live branches (need E2E_TEACHER_EMAIL + E2E_TEACHER_PASSWORD)

To run with live env: `NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... E2E_TEACHER_EMAIL=... E2E_TEACHER_PASSWORD=... npm test && npx playwright test`

## Requirement and Decision Coverage

### Phase 3 Requirements

| ID | Requirement | Covered By | Verification |
|----|-------------|------------|--------------|
| MISS-01 | Manual mission with target pattern, topic, level, required turns, questions, target examples, and hints | mission-schemas.test.ts, mission-service.test.ts, teacher-missions.spec.ts | 6 tests |
| MISS-04 | Mission stores characterId with default buddy | mission-schemas.test.ts, mission-assign.test.ts | snapshot includes characterId = "default-buddy" |
| ASGN-01 | Teacher can assign a mission to a class | mission-assign-rpc-schema.test.ts, mission-assign.test.ts, AssignDialog | RPC + service + dialog tested |
| ASGN-02 | Assigned mission is snapshotted | mission-assign.test.ts | snapshot stability test (D-05/D-06/D-14) |
| ASGN-03 | System creates per-student assignment records | mission-assign-rpc-schema.test.ts | RPC inserts assignment_students with ON CONFLICT DO NOTHING |

### Context Decisions D-01 through D-16

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 Ordered turn templates with prompt, target example, 3-tier hint ladder | DONE | schemas.ts, TurnEditor.tsx, mission-schemas.test.ts |
| D-02 required_turns equals authored turn count | DONE | missionFormSchema.refine(), mission-service.test.ts |
| D-03 Constrained level enum/select | DONE | missionLevelSchema.enum, MissionForm select |
| D-04 Due date is optional assign-time field | DONE | AssignDialog date input, assignMissionSchema, RPC p_due_at |
| D-05 Full snapshot written once at assign-click | DONE | buildMissionSnapshot, snapshot stability test |
| D-06 Downstream reads snapshot not live mission | DONE | snapshot stability test confirms stored snapshot unchanged after edit |
| D-07 Reusable Zod snapshot schema | DONE | missionSnapshotSchema in schemas.ts, shared by assign-service |
| D-08 Assign all active students; exclude archived | DONE | RPC `archived_at IS NULL`, mission-assign-rpc-schema.test.ts |
| D-09 Idempotent per student within one assignment | DONE | RPC `ON CONFLICT (assignment_id, student_id) DO NOTHING` |
| D-10 Reassign creates a new assignment | DONE | No active-assignment uniqueness constraint |
| D-11 Multiple concurrent class assignments allowed | DONE | No one-active-assignment-per-class constraint |
| D-12 Copy class data_mode to assignment | DONE | RPC `c.data_mode`, mission-assign-rpc-schema.test.ts |
| D-13 Writes server-owned and RLS-bound | DONE | requireTeacherProfile in actions, RLS client in services, RPC ownership checks |
| D-14 Mission editable after assignment | DONE | No edit lock, snapshot stability test confirms safety |
| D-15 Non-blocking edit-after-assign notice | DONE | MissionForm noticeStyle, activeAssignmentCount prop, mission-assign.test.ts |
| D-16 Store default buddy character id | DONE | DEFAULT_CHARACTER_ID, snapshot includes characterId |

## Files Created/Modified

- `src/app/layout.tsx` — Added global focus-visible ring styles (2px solid #2563EB, 2px offset).
- `src/components/teacher/MissionList.tsx` — Added success message auto-dismiss after 5 seconds.
- `src/components/teacher/MissionForm.tsx` — Added aria-describedby for field-level validation errors.
- `src/components/teacher/AssignDialog.tsx` — Added aria-describedby for due date help text and student count.
- `tests/e2e/teacher-missions.spec.ts` — Expanded from 1 to 5 tests covering navigation, empty state, authoring, assign dialog, and edit notice.
- `tests/server/mission-assign.test.ts` — Added snapshot stability and active-assignment-count tests.

## Decisions Made

- Global focus-visible ring added via `<style>` in root layout since `:focus-visible` cannot be expressed in React inline `CSSProperties`. This is consistent with the project convention of no external CSS files.
- Success auto-dismiss uses 5-second timeout with proper cleanup, matching the UI-SPEC requirement for assignment success messages.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Migration 202606250005 was already pushed to remote Supabase in Plan 02.

## Next Phase Readiness

Phase 3 (Manual Mission Assignment) is complete. Teachers can:
1. Create manual missions with ordered turn templates, target patterns, topics, levels, and 3-tier hint ladders.
2. Assign missions to classes, producing one immutable snapshot assignment and one homework row per active student.
3. Edit missions after assignment with a non-blocking notice; existing homework snapshots remain unchanged.
4. Navigate between Classes and Missions from the protected teacher surface.

Phase 4 (Student Homework) can proceed to build the student-facing homework view reading from `assignment_students` and `assignments.mission_snapshot`.

---
*Phase: 03-manual-mission-assignment*
*Completed: 2026-06-26*
