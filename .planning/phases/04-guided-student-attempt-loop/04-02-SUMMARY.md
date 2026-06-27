---
phase: 04-guided-student-attempt-loop
plan: 02
subsystem: student-home
tags: [typescript, react, supabase, service-role, ssr, mobile-first]

requires:
  - phase: 01-foundation
    provides: "foundation schema (assignment_students, assignments tables + status enum)"
  - phase: 02
    provides: "student unlock cookie + service-role client pattern"
  - phase: 03-manual-mission-assignment
    provides: "missionSnapshotSchema for turn-count derivation"
  - plan: 04-01
    provides: "Phase 4 style tokens (badgeStartStyle, badgeContinueStyle, badgeDoneStyle, badgeClosedStyle)"
provides:
  - "listStudentAssignments service with read-time display status (FLOW-01, D-13, D-14)"
  - "AssignmentListItem component with status badges and mission route navigation"
  - "StudentHomeShell extended with assignments prop and list rendering"
  - "SSR home page wired to load and pass assignments to shell"
affects: [04-03, 04-04, 04-05, phase-05]

tech-stack:
  added: []
  patterns:
    - "Read-time display status: closed/expired computed from due_at without mutating status rows (D-14)"
    - "Service-role scoped read: studentId sourced only from unlock cookie, never from request (T-04-03)"
    - "Snapshot-derived metadata: turn count parsed from mission_snapshot via missionSnapshotSchema.safeParse"

key-files:
  created:
    - src/server/student-access/assignment-list.ts
    - src/components/student/AssignmentListItem.tsx
  modified:
    - src/components/student/StudentHomeShell.tsx
    - src/app/student/home/page.tsx

key-decisions:
  - "Unparseable snapshots are silently skipped rather than crashing the page (defensive safeParse)"
  - "Non-standard statuses (missed, needs_retry, teacher_review) that are not past-due display as closed since the student cannot act on them"
  - "Assignment list items use native <a> tags for Start/Continue navigation (no client-side router needed for SSR page transitions)"

patterns-established:
  - "Assignment display status pattern: pure read-time computation from DB status + due_at, no mutation"
  - "SSR data loading pattern: page.tsx calls server service, passes typed props to client shell"

requirements-completed: [FLOW-01, PILOT-01]

duration: 3min
completed: 2026-06-27
status: complete
---

# Phase 04 Plan 02: Student Home Assignment List Summary

**Service-role assignment list with read-time display status (start/continue/done/closed), badge-bearing list item cards, and SSR home page wiring -- the first user-visible homework capability for students (FLOW-01, PILOT-01, D-13/D-14)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-27T00:39:19Z
- **Completed:** 2026-06-27T00:42:27Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Assignment-list read service queries assignment_students joined to assignments via service-role, computing display status at read time (start/continue/done/closed) without mutating any rows (D-14)
- Turn count derived from missionSnapshotSchema.safeParse with defensive skip on unparseable snapshots
- AssignmentListItem renders white cards with status badges using Phase 4 tokens; Start/Continue items link to /student/missions/[id]; Done/Closed are non-interactive divs
- Closed items show inline explanation copy per UI-SPEC verbatim
- StudentHomeShell extended with assignments prop; empty array preserves the existing "No homework yet" state (D-13)
- SSR home page calls listStudentAssignments(unlock.studentId) behind the unlock gate -- studentId sourced from cookie only (T-04-03/T-04-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Assignment-list read service** - `1015daa6`
2. **Task 2: Assignment list item card + shell rendering** - `ac300f40`
3. **Task 3: Wire SSR home page** - `d7dfe7b7`

## Files Created/Modified
- `src/server/student-access/assignment-list.ts` - listStudentAssignments service, StudentAssignmentListItem type, AssignmentDisplayStatus type
- `src/components/student/AssignmentListItem.tsx` - Client component with status badge, navigation link, closed explanation
- `src/components/student/StudentHomeShell.tsx` - Extended with assignments prop, list rendering, preserved empty state
- `src/app/student/home/page.tsx` - Extended with listStudentAssignments call and assignments prop pass-through

## Decisions Made
- Unparseable mission snapshots are silently skipped (safeParse) rather than crashing the student home page
- Non-standard statuses (missed, needs_retry, teacher_review) display as "closed" since the student cannot act on them
- Used native `<a>` tags for Start/Continue navigation rather than Next.js Link -- the mission route is SSR and full page navigation is appropriate

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in `tests/schema/mission-assign-rpc-schema.test.ts` (regex flag es2018) and `tests/server/mission-flow.test.ts` (RED scaffold import) -- unrelated to this plan, not touched.

## Verification Results
- `npx tsc --noEmit` clean (excluding pre-existing errors in unrelated files)
- `npx vitest run tests/server/student-access.test.ts` passes (4 passed, 1 skipped)
- No `"use client"` in home page.tsx -- service-role stays server-side (T-04-04)
- Zero mutation calls (update/insert/delete) in assignment-list.ts (D-14)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- listStudentAssignments ready for consumption by mission flow page (plan 03/04)
- AssignmentListItem ready -- Start/Continue links point to /student/missions/[assignmentStudentId] (plan 03 creates that route)
- StudentHomeShell assignments prop wired end-to-end

## Self-Check: PASSED

All 2 created files and 2 modified files verified present on disk. All 3 task commits verified in git history.

---
*Phase: 04-guided-student-attempt-loop*
*Completed: 2026-06-27*
