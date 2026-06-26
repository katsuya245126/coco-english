---
phase: 03-manual-mission-assignment
plan: 02
subsystem: teacher-missions
tags: [nextjs, react, zod, supabase, postgres, rpc, security-definer, server-actions]
requires:
  - phase: 03-manual-mission-assignment
    provides: manual mission form schema, RLS-bound mission service, and reusable missionSnapshotSchema (03-01)
  - phase: 02-teacher-classroom-access
    provides: teacher auth guard, RLS-bound Supabase client, class service, and class-management UI patterns
provides:
  - atomic assign_mission_to_class SECURITY DEFINER RPC with ownership checks and per-active-student expansion
  - server-side mission snapshot assembly and validation before assignment
  - assignMissionAction server action, mission list page, and assign dialog UI
affects: [phase-04-student-homework, phase-05-audio, phase-06-ai-generation, teacher-ui]
tech-stack:
  added: []
  patterns:
    - server builds and validates denormalized snapshot; client never assembles snapshot JSON
    - single atomic Postgres RPC for multi-row assignment + per-student expansion + status events
    - SECURITY DEFINER RPC enforces caller ownership of both class and mission before any insert
key-files:
  created:
    - supabase/migrations/202606250005_mission_assign_rpc.sql
    - src/server/mission/assign-service.ts
    - src/components/teacher/AssignDialog.tsx
    - src/components/teacher/MissionList.tsx
    - src/app/teacher/missions/page.tsx
    - tests/schema/mission-assign-rpc-schema.test.ts
  modified:
    - src/app/teacher/missions/actions.ts
    - src/app/teacher/page.tsx
    - src/domain/mission/schemas.ts
    - src/lib/db/types.ts
    - tests/server/mission-assign.test.ts
key-decisions:
  - "Assignment is performed by a single SECURITY DEFINER RPC (202606250005) so insert of the assignment, per-student rows, and status events is atomic in one transaction (T-03-07)."
  - "The mission snapshot is assembled and validated server-side via missionSnapshotSchema before the RPC call; the browser never constructs or submits snapshot JSON (T-03-04)."
patterns-established:
  - "Assign service follows class-service client/error patterns and calls supabase.rpc('assign_mission_to_class') with the RLS-bound user client."
  - "Assign dialog follows ShareClassDialog; mission list follows ClassList; missions page follows the teacher page shell with no sidebar."
requirements-completed: [ASGN-01, ASGN-02, ASGN-03, MISS-04]
duration: 4 min
completed: 2026-06-26
status: complete
---

# Phase 03 Plan 02: Mission Assignment Flow Summary

**Atomic assign-to-class slice: SECURITY DEFINER RPC builds one denormalized mission snapshot and expands it to one homework row per active student, with server-owned status events and a teacher mission list + assign dialog**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-26T03:21:33Z
- **Completed:** 2026-06-26T03:24:39Z (implementation); reconciled and closed out 2026-06-26
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added RED tests covering the assignment RPC structure (ownership checks, active-student filtering, status events, execute grant), server-built mission snapshots, and assignable-class listing.
- Implemented `assign_mission_to_class` as a `SECURITY DEFINER` RPC with `search_path = public` that verifies the teacher owns both class and mission, inserts a new `assignments` row, copies `classes.data_mode`, stores optional `due_at`, bulk-inserts one `assignment_students` row per active (non-archived) student with `ON CONFLICT DO NOTHING`, and writes an `assignment_status_events` row (`next_status = 'assigned'`) per inserted student.
- Added the assign service (server-side snapshot assembly + validation + RPC call), `assignMissionAction`, the `/teacher/missions` list page, and the `AssignDialog` with class selector, active-student counts, optional due date, and success copy.
- Verified migration `202606250005` is applied to the remote Supabase project (appears in both Local and Remote of `supabase migration list`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing assignment snapshot and RPC tests** - `587709d` (test)
2. **Task 2: Implement atomic assignment RPC, service, action, and dialog** - `4925883` (feat)
3. **Task 3: [BLOCKING] Verify and push assignment schema migration** - migration file landed in `4925883`; remote push confirmed via `supabase migration list` (no separate commit)

**Plan metadata:** this SUMMARY commit (docs: complete plan) — written during reconciliation after the original execution session ended before bookkeeping.

_Note: TDD tasks produced test → feat commits (587709d → 4925883)._

## Files Created/Modified

- `supabase/migrations/202606250005_mission_assign_rpc.sql` - Atomic `assign_mission_to_class` SECURITY DEFINER RPC and execute grant to authenticated.
- `src/server/mission/assign-service.ts` - `assignMissionToClass`, `buildMissionSnapshot`, `listAssignableClassesForTeacher`; server-side snapshot assembly/validation and RPC call.
- `src/app/teacher/missions/actions.ts` - Added `assignMissionAction` with `requireTeacherProfile()`, Zod validation, generic failure copy, and `revalidatePath('/teacher/missions')`.
- `src/app/teacher/missions/page.tsx` - Mission list page with assign entry point.
- `src/components/teacher/MissionList.tsx` - Teacher mission list (follows `ClassList`).
- `src/components/teacher/AssignDialog.tsx` - Class selector with active-student counts, no-eligible-classes state, optional date input, Escape-close, `aria-live` success.
- `src/app/teacher/page.tsx` - Teacher dashboard wiring to the missions list/assign entry point.
- `src/domain/mission/schemas.ts` - Snapshot/assignment-related schema additions used by the server-built snapshot.
- `src/lib/db/types.ts` - Assignment-related DB row/type additions.
- `tests/schema/mission-assign-rpc-schema.test.ts` - File-content SQL assertions for the migration structure and grant.
- `tests/server/mission-assign.test.ts` - Snapshot-shape unit tests and env-aware live integration for RPC behavior.

## Decisions Made

- Performed the entire assignment (assignment row + per-student rows + status events) inside one Postgres RPC transaction rather than multiple server round-trips, for atomicity (T-03-07).
- Built and validated the denormalized snapshot on the server via `missionSnapshotSchema`; the browser only passes mission id, class id, and optional due date (T-03-04).
- RPC enforces caller ownership of both class and mission before any insert, asserted by tests (T-03-05).

## Deviations from Plan

The implemented file set differs slightly from the plan's `files_modified` list (no scope creep, all toward correctness):

- `src/server/mission/mission-service.ts` was listed in the plan but **not modified** — the mission read/list behavior it would have needed was already complete from Plan 01, so no change was required.
- `src/app/teacher/page.tsx` and `src/domain/mission/schemas.ts` were modified but not enumerated in the plan's `files_modified` — needed to wire the missions list entry point and to support the server-built snapshot shape, respectively.
- `tests/e2e/teacher-missions.spec.ts` (listed under Task 1) was not changed in these commits; the schema + server RED tests carry the assignment coverage. The existing E2E happy path remains create-mission → assign-mission.

**Total deviations:** 0 auto-fixed (file-set reconciliation only; no behavioral deviations recorded).
**Impact on plan:** No scope change.

## Issues Encountered

The original execution session ended after committing Task 1 and Task 2 and after pushing the migration to remote Supabase, **but before writing this SUMMARY.md or updating STATE.md / ROADMAP.md**. On resume, the safe-resume gate detected production commits with a missing SUMMARY. Reconciliation confirmed:

- All 10 plan tests pass: `npm test -- --run tests/schema/mission-assign-rpc-schema.test.ts tests/server/mission-assign.test.ts tests/domain/mission-schemas.test.ts` → 10 passed.
- `npm run typecheck` → passes clean.
- `supabase migration list` → `202606250005` present in both Local and Remote (Task 3's push already applied).

No re-implementation was needed; this plan was closed out by writing the SUMMARY and updating tracking.

## User Setup Required

None - the assignment RPC migration is already applied to the linked Supabase project (`202606250005` confirmed remote). No additional environment or dashboard configuration required.

## Next Phase Readiness

Teachers can now assign a saved mission to an eligible class, producing one immutable snapshot assignment and one homework row per active student with server-owned `assigned` status events. This is the stable homework substrate Plan 03 (and Phase 4 student homework) builds on. Wave 3 (plan 03-03) can proceed.

---
*Phase: 03-manual-mission-assignment*
*Completed: 2026-06-26*
