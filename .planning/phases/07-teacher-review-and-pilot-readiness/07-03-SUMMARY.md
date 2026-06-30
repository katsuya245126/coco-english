---
phase: 07-teacher-review-and-pilot-readiness
plan: "03"
subsystem: teacher-override-and-student-reopen
tags: [tdd, teacher-override, needs-retry, audit, student-flow, evidence-page, override-controls]
dependency_graph:
  requires:
    - tests/server/teacher-override.test.ts (from 07-01, RED)
    - tests/server/audio-evidence.test.ts (from 05-01)
    - src/domain/teacher/review-buckets.ts (from 07-02)
  provides:
    - src/server/teacher/audio-evidence.ts (extended: attemptCount, highestHintLevel, assignmentStudentId, assignmentId, classId)
    - src/app/teacher/evidence/[attemptId]/actions.ts (overrideAssignmentStatusAction)
    - src/server/teacher/auth.ts (re-export for test mocking)
    - src/components/teacher/OverrideControls.tsx (three-button override group + confirmation dialog)
    - src/app/teacher/evidence/[attemptId]/page.tsx (attempt stats + override controls + back-navigation)
    - src/server/student-access/assignment-list.ts (needs_retry → "start" display)
    - src/server/student-access/mission-flow.ts (accepts needs_retry, reopened_by_teacher)
    - tests/server/assignment-list.test.ts (new)
  affects:
    - Wave 3 (07-04): logger instrumentation of completeAttempt (deferred per plan)
tech_stack:
  added: []
  patterns:
    - Audited server-owned status transition via assertTransitionRequest (status.ts)
    - Discriminated-union server action result shape (ok/error)
    - "use client" OverrideControls with focus-trap, Escape-close, and router.refresh()
    - Dynamic claim guard via .eq("status", asRow.status) for both assigned + needs_retry
    - Re-export module at @/server/teacher/auth for consistent test mock paths
key_files:
  created:
    - src/server/teacher/auth.ts
    - src/components/teacher/OverrideControls.tsx
    - tests/server/assignment-list.test.ts
  modified:
    - src/server/teacher/audio-evidence.ts
    - src/app/teacher/evidence/[attemptId]/actions.ts
    - src/app/teacher/evidence/[attemptId]/page.tsx
    - src/server/student-access/assignment-list.ts
    - src/server/student-access/mission-flow.ts
    - tests/server/audio-evidence.test.ts
    - tests/server/student-mission-flow.test.ts
decisions:
  - "assignmentStudentId from evidence record is the ownership anchor for override (T-07-06); no separate ownership check needed because the teacher was RLS-authorized to load the evidence"
  - "Create src/server/teacher/auth.ts re-export so vi.mock('@/server/teacher/auth') in tests applies cleanly to the actions file import"
  - "Expose assignmentId and classId on AttemptEvidence so the evidence page can render ← Back to assignment review without additional queries"
  - "Use assignmentStudentStatus (assignment_students.status) for OverrideControls, not attemptStatus (attempts.status), because isButtonEnabled logic is based on the assignment-level status"
  - "Dynamic claim guard .eq('status', asRow.status) covers both assigned and needs_retry paths without duplicating the optimistic-lock block (T-07-08)"
  - "reasonCode = needs_retry ? 'reopened_by_teacher' : 'mission_started' so audit events distinguish teacher-initiated restarts from first starts"
  - "Logger instrumentation of completeAttempt intentionally deferred to Plan 04 per plan note — no logger import added to mission-flow.ts"
metrics:
  duration: 7min
  completed: 2026-07-01
  tasks_completed: 3
  tasks_total: 4
  files_created: 3
  files_modified: 7
status: complete
---

# Phase 07 Plan 03: Teacher Override + Student Reopen Summary

One-liner: Teacher-acts/student-reopens vertical slice — audited three-way override action, attempt stats on evidence page, OverrideControls with focus-trapped confirmation dialog, and needs_retry student gate fix.

## What Was Built

### Task 1: Extend evidence query + add override server action (commit de7daf07)

**src/server/teacher/audio-evidence.ts**
- `getAttemptEvidenceForTeacher` select block extended: `id`, `attempt_count`, `highest_hint_level` on `assignment_students`; `id` on `assignments`; `id` on `classes`
- `AttemptEvidence` type gains: `assignmentStudentId`, `assignmentId`, `classId`, `assignmentStudentStatus`, `attemptCount`, `highestHintLevel`
- `mapAttemptMetadata` extracts and surfaces all new fields

**src/server/teacher/auth.ts** (new)
- Re-export of `requireTeacherProfile` from `@/server/auth/teacher-profile`
- Allows `vi.mock("@/server/teacher/auth")` in RED tests to intercept the import used in actions.ts

**src/app/teacher/evidence/[attemptId]/actions.ts**
- Changed import: `requireTeacherProfile` now from `@/server/teacher/auth` (testable path)
- Added `overrideAssignmentStatusAction` with full discriminated-union result
- Steps: requireTeacherProfile → load row → assertTransitionRequest (throws on illegal) → UPDATE status (+ null latest_attempt_id for needs_retry) → INSERT audit event
- Optional `reasonNote` stored as `metadata.note` in audit event
- Illegal transitions return `{ ok: false, error: "invalid_transition" }` with no DB write (T-07-07)

**tests/server/teacher-override.test.ts**: 8/8 GREEN (was RED)
**tests/server/audio-evidence.test.ts**: 4/4 GREEN (updated mock + assertions for new fields)

### Task 2: Render attempt stats + OverrideControls on evidence page (commit dbb37143)

**src/components/teacher/OverrideControls.tsx** (new, "use client")
- Three-button override group: Mark complete (#111827), Send for retry (#1D4ED8), Keep in review (#92400E)
- Buttons enabled/disabled based on `isButtonEnabled(nextStatus, attemptStatus)` logic
- On click: opens inline `role="dialog"` confirmation with `aria-labelledby`, focus trap, Escape close
- Optional reason `<textarea>` (3 rows, placeholder per UI-SPEC)
- Cancel/Confirm buttons; Confirm shows "Updating..." during server action call
- On success: shows "Status updated." + `router.refresh()`
- On error: shows "Could not update status. Please try again."
- No Tailwind/shadcn/icon imports; inline React CSSProperties only

**src/app/teacher/evidence/[attemptId]/page.tsx**
- Back-navigation: "← Back to assignment review" link to `/teacher/classes/[classId]/review/[assignmentId]` (falls back to "Teacher dashboard" if IDs not available)
- Added "Attempts" and "Highest hint used" cells to existing summary grid (REV-02/04)
- Added `hintLevelLabel(level)` helper: 0→"No hints used", 1→"Pattern hint", 2→"Word bank", 3+→"Full example"
- Renders `<OverrideControls assignmentStudentId={...} attemptStatus={assignmentStudentStatus} />` after turn sections

### Task 3: Fix student-flow gates for needs_retry reopen (commit a42fb1bb)

**src/server/student-access/assignment-list.ts**
- Added explicit `else if (row.status === "needs_retry") { displayStatus = "start"; }` branch before the catch-all else
- Past-due guard at line 86 already covers past-due needs_retry → "closed" (unchanged)
- missed and teacher_review remain "closed"

**src/server/student-access/mission-flow.ts** (startOrResumeAttempt)
- Gate changed to: `if (asRow.status !== "assigned" && asRow.status !== "needs_retry")`
- Dynamic `reasonCode`: `"reopened_by_teacher"` for needs_retry, `"mission_started"` for assigned
- `assertTransitionRequest` uses `previousStatus: asRow.status` (not hardcoded "assigned")
- Claim guard: `.eq("status", asRow.status)` (covers both assigned and needs_retry — T-07-08)
- Audit event: `previous_status: asRow.status`, `reason_code: reasonCode`

**tests/server/assignment-list.test.ts** (new)
- 5 tests: needs_retry not-past-due → "start"; needs_retry no-due-at → "start"; past-due needs_retry → "closed"; missed → "closed"; teacher_review → "closed"

**tests/server/student-mission-flow.test.ts** (extended)
- Updated existing `.eq("status", "assigned")` assertion to match dynamic `.eq("status", asRow.status)`
- Added "needs_retry gate is accepted and uses reopened_by_teacher reason code" test

### Task 4: Checkpoint (blocking — awaiting human verification)

Stopped at blocking checkpoint per plan. Teacher must verify override controls and student reopen path manually.

## Verification

```
tests/server/teacher-override.test.ts: 8/8 GREEN
tests/server/audio-evidence.test.ts: 4/4 GREEN
tests/server/assignment-list.test.ts: 5/5 GREEN
tests/server/student-mission-flow.test.ts: 10/10 GREEN (including 2 new)
Full suite: 30 passed | 3 failed (3 remaining RED files from 07-01: logger, cron, purge)
tsc --noEmit: no errors in src/ files
```

## Deviations from Plan

**[Rule 2 - Missing critical field] Expose classId + assignmentId on AttemptEvidence**
- **Found during:** Task 2 (back-navigation link implementation — additional requirement)
- **Issue:** The additional requirement needed classId and assignmentId to build the back link URL, but these weren't in the original AttemptEvidence type
- **Fix:** Extended `AttemptOwnershipRow` and `getAttemptEvidenceForTeacher` to select `assignments.id` and `classes.id`; exposed as `assignmentId` and `classId` on `AttemptEvidence`
- **Files modified:** src/server/teacher/audio-evidence.ts
- **Commit:** dbb37143

**[Rule 2 - Missing critical field] Use assignmentStudentStatus for OverrideControls**
- **Found during:** Task 2 (TypeScript error)
- **Issue:** `evidence.attemptStatus` is `AttemptStatus` (includes "in_progress"/"abandoned") but `OverrideControls` needs `AssignmentStudentStatus`; teacher override logic is based on assignment-student status, not attempt status
- **Fix:** Expose `assignmentStudentStatus` from `mapAttemptMetadata` and pass to `OverrideControls`
- **Files modified:** src/server/teacher/audio-evidence.ts, src/app/teacher/evidence/[attemptId]/page.tsx

## Known Stubs

None — all data is fetched from the database. OverrideControls wires to the real server action.

## Threat Flags

No new threat surface beyond the plan's threat model:

| Flag | File | Description |
|------|------|-------------|
| T-07-06 (mitigated) | actions.ts | requireTeacherProfile() gates all calls; assignmentStudentId originates from RLS-filtered evidence load |
| T-07-07 (mitigated) | actions.ts | assertTransitionRequest rejects illegal transitions before any DB write |
| T-07-08 (mitigated) | mission-flow.ts | .eq("status", asRow.status) optimistic claim prevents double-start for both assigned and needs_retry |

## Self-Check: PASSED

- [x] src/server/teacher/auth.ts exists
- [x] src/server/teacher/audio-evidence.ts contains "attempt_count" and "highest_hint_level" and "assignmentStudentId"
- [x] src/app/teacher/evidence/[attemptId]/actions.ts exports overrideAssignmentStatusAction
- [x] src/components/teacher/OverrideControls.tsx contains "Mark complete", "Send for retry", "Keep in review", "Confirm", role="dialog"
- [x] src/app/teacher/evidence/[attemptId]/page.tsx contains "Attempts" and "Highest hint used" and "Back to assignment review"
- [x] src/server/student-access/assignment-list.ts contains "needs_retry" branch returning "start"
- [x] src/server/student-access/mission-flow.ts contains "needs_retry", "reopened_by_teacher", "asRow.status" claim guard
- [x] tests/server/assignment-list.test.ts exists and passes (5/5)
- [x] Commit de7daf07 exists (Task 1)
- [x] Commit dbb37143 exists (Task 2)
- [x] Commit a42fb1bb exists (Task 3)
- [x] No Tailwind/shadcn/icon imports in OverrideControls.tsx
