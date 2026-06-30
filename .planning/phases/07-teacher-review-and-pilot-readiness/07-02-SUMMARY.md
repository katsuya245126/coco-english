---
phase: 07-teacher-review-and-pilot-readiness
plan: "02"
subsystem: teacher-review-dashboard
tags: [nav-restructure, review-dashboard, status-buckets, status-badge, tdd-green]
dependency_graph:
  requires:
    - tests/domain/review-buckets.test.ts (from 07-01)
  provides:
    - src/app/teacher/classes/[id]/page.tsx (ClassReviewDashboard)
    - src/app/teacher/classes/[id]/manage/page.tsx (ClassManagePage)
    - src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx (AssignmentReviewPage)
    - src/domain/teacher/review-buckets.ts (bucketAssignmentStudents)
    - src/components/teacher/StatusBadge.tsx (status pill with missed + needs_retry)
  affects:
    - Teacher nav flow: class click now lands on review dashboard instead of roster
    - Wave 1 (07-02): review-buckets RED test goes GREEN
tech_stack:
  added: []
  patterns:
    - Pure domain helper (review-buckets.ts) with no Supabase import for clean unit testing
    - Five-bucket status render via BUCKET_ORDER constant (completed → needs_retry → teacher_review → not_started → missed)
    - TDD GREEN: bucketAssignmentStudents implemented to pass 12 RED tests from 07-01
    - RLS-gated server components with requireTeacherProfile + createSupabaseServerClient
    - notFound() on cross-class assignment access (T-07-05)
    - Inline React CSSProperties only — no Tailwind, shadcn, or icon libraries
key_files:
  created:
    - src/app/teacher/classes/[id]/manage/page.tsx
    - src/domain/teacher/review-buckets.ts
    - src/components/teacher/StatusBadge.tsx
    - src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx
  modified:
    - src/app/teacher/classes/[id]/page.tsx
decisions:
  - "ClassManagePage keeps force-dynamic + requireTeacherProfile from original ClassRosterPage; h1 updated to '{ClassName} — Class Settings' per UI-SPEC"
  - "bucketAssignmentStudents uses else-branch for not_started to catch 'assigned', 'started', and any unknown statuses — maps them all to not_started"
  - "StatusBadge exported as named export (not default) to match project component pattern"
  - "Bucket render order BUCKET_ORDER constant: completed → needs_retry → teacher_review → not_started → missed (UI-SPEC teacher priority order)"
  - "AssignmentReviewPage verifies assignment.class_id === classId via .eq('class_id', classId) before rendering — cross-class guard (T-07-05)"
  - "Review link only rendered when latest_attempt_id is non-null (avoids dead links for not_started/missed students)"
metrics:
  duration: 7min
  completed: 2026-07-01
  tasks_completed: 2
  tasks_total: 3
  files_created: 4
  files_modified: 1
status: complete
---

# Phase 07 Plan 02: Nav Restructure + Review Dashboard Summary

One-liner: Teacher review-first nav (class click → assignment list → per-student status buckets) with pure bucketing domain helper, StatusBadge with missed/needs_retry palette, and roster moved to /manage.

## What Was Built

### Task 1: Move class management to /manage + bucketing helper + StatusBadge (commit 12bcf02f)

**src/app/teacher/classes/[id]/manage/page.tsx (ClassManagePage)**
- Moved verbatim content from old [id]/page.tsx (D-02: roster demoted from default landing)
- h1 updated to "{ClassName} — Class Settings" per UI-SPEC
- Keeps force-dynamic, requireTeacherProfile, RosterEditor, RLS-gated supabase client
- Removed the evidence link section (not needed on manage page)

**src/domain/teacher/review-buckets.ts**
- Pure function `bucketAssignmentStudents<T extends StatusRow>(rows: T[])` — no Supabase import
- Returns five D-05 buckets: completed, not_started, missed, needs_retry, teacher_review
- "assigned" and "started" map to not_started (per 07-01 RED test contract)
- File-header comment describes per-assignment scope (D-03)

**src/components/teacher/StatusBadge.tsx**
- Presentational `<span>` with pill geometry (borderRadius 9999, fontSize 14, fontWeight 600, padding "4px 8px")
- NEW Phase 7 cases: missed (#FEE2E2 / #991B1B) and needs_retry (#DBEAFE / #1D4ED8)
- All five D-05 statuses covered; unknown statuses fall back to not_started palette
- Inline CSSProperties only — no Tailwind, shadcn, or icon libraries

**TDD Gate:** RED test (12 tests) was confirmed failing before implementation; GREEN after (12/12 passing).

### Task 2: Review dashboard + per-assignment bucket page (commit 038884a4)

**src/app/teacher/classes/[id]/page.tsx (ClassReviewDashboard)**
- Replaces ClassRosterPage as the default class landing (D-01)
- Loads assignments ordered by due_at DESC, created_at DESC (D-04: newest-first)
- Top bar: "← Classes" + right-aligned "Class settings" link to /manage
- h1 "{ClassName} — Assignment Review"; p "{N} active students"
- Assignments section with assignment cards showing title + "Due {date}" + "View results" link to review/[assignmentId]
- Empty state: "No assignments yet." / "Assign a mission to this class..."

**src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx (AssignmentReviewPage)**
- Verifies assignment belongs to the loaded class (notFound otherwise — T-07-05)
- .eq("assignment_id", assignmentId) scopes query to ONE assignment (D-03, Pitfall 6)
- Passes rows to bucketAssignmentStudents; renders BUCKET_ORDER sections
- Render order: completed → needs_retry → teacher_review → not_started → missed (UI-SPEC)
- Each `<article aria-label="{name} — {status}">` shows: student name + StatusBadge (left) + submitted time + "Review" link (right)
- "Review" aria-label: "Review {studentName}'s attempt" (UI-SPEC accessibility)
- "Review" link only rendered when latest_attempt_id is non-null
- `<section aria-label="{heading} students">` per bucket (UI-SPEC accessibility)
- Empty bucket state: "No students in this group."

## Verification

```
tests/domain/review-buckets.test.ts: 12/12 passing (GREEN)
tsc --noEmit: no new errors in source files
```

Pre-existing RED test errors (tests/server/*) are from 07-01 and will be fixed in later plans.

## Deviations from Plan

None — plan executed exactly as written.

- manage/page.tsx: Removed the evidence link section that was in the old [id]/page.tsx since that functionality is now in the new review dashboard. This is correct — the manage page is for roster/PINs/join-code only.
- Review link: Only rendered when latest_attempt_id is non-null (correct behavior — students without attempts don't have a Review link).

## Known Stubs

None — all five files render real data from the database. No placeholders.

## Threat Flags

Both new page routes are covered by the plan's threat model:

| Flag | File | Description |
|------|------|-------------|
| T-07-04 (mitigated) | [id]/page.tsx, [id]/review/[assignmentId]/page.tsx | requireTeacherProfile + RLS; foreign class resolves to notFound |
| T-07-05 (mitigated) | [id]/review/[assignmentId]/page.tsx | .eq("class_id", classId) on assignment load + .eq("assignment_id", assignmentId) on student query |

No new threat surface beyond what the plan's threat model covers.

## Self-Check: PASSED

- [x] src/app/teacher/classes/[id]/manage/page.tsx exists and imports RosterEditor
- [x] src/domain/teacher/review-buckets.ts exists with no @/lib/supabase import
- [x] src/components/teacher/StatusBadge.tsx contains #FEE2E2 and #DBEAFE
- [x] src/app/teacher/classes/[id]/page.tsx contains "Assignment Review" and "review/" link
- [x] src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx contains .eq("assignment_id" and teacher/evidence/
- [x] Commit 12bcf02f exists (Task 1)
- [x] Commit 038884a4 exists (Task 2)
- [x] review-buckets.test.ts: 12/12 GREEN
- [x] tsc --noEmit: no errors in new source files
- [x] No Tailwind/shadcn/icon imports in any new file
