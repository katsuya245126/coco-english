# Class Page Restructure — Design

**Date:** 2026-07-13
**Status:** Approved by John (chat), pending spec review

## Goal

Five teacher-workspace fixes requested after using the class page:

1. Remove the "Review setting" policy control entirely.
2. Fix the flash of unstyled content (FOUC) on refresh of teacher pages.
3. Split the class page's anchor-link sections (Needs review / Assignments / Students) into separate pages under a shared class layout.
4. Class Settings page's back link should return to the class, not the teacher home.
5. Assignment cards show per-student progress (counts + progress bar).

## 1. Remove review policy

The `flagged_only` mode silently hides unflagged submissions from the Needs
review queue. The teacher reviews every submission; the mode can only cause
confusion. Remove it end to end in the app code. **No DB migration** — the
`classes.review_policy` column stays but is no longer read or written.

Changes:

- Delete `src/components/teacher/ClassReviewPolicyControl.tsx`.
- Delete `updateClassReviewPolicyAction` from `src/app/teacher/assignment-actions.ts`.
- Delete `updateClassReviewPolicy` from `src/server/teacher/assignment-operations.ts`.
- `src/domain/teacher/assignment-operations.ts`: drop `reviewPolicy` from
  `ReviewEligibilityInput` and the policy branch in `isSubmissionPendingReview`.
  New rule: a submission is pending review iff it is the latest attempt, not
  yet reviewed, and both statuses are `completed`/`teacher_review`.
  `needsReviewReason` remains as display data (reason chip) but no longer
  gates queue membership.
- `loadOwnedAttempts` no longer selects `review_policy`; `mapRow` drops it.
- Class header subtitle becomes "N active students · Class code X" (policy
  text removed).
- Update tests that exercise the policy branch (`tests/domain/assignment-operations.test.ts`,
  `tests/server/teacher-assignment-operations.test.ts`,
  `tests/schema/assignment-operations-schema.test.ts`,
  `tests/e2e/teacher-assignment-operations.spec.ts`); remove
  policy-control assertions from UI-source tests.

## 2. FOUC fix

`TeacherWorkspaceStyles.tsx` is a `"use client"` styled-jsx component; its
CSS is injected only after hydration, so refreshes show raw HTML first.

- Move the CSS verbatim into `src/app/teacher/teacher-workspace.css`.
- Import it from `src/app/teacher/layout.tsx` (App Router global CSS import),
  so styles ship in the initial HTML `<head>`.
- Delete `TeacherWorkspaceStyles.tsx` and its usage.
- No visual changes.

## 3. Separate class pages (Approach A: nested layout)

Routes:

| Route | Content |
|---|---|
| `/teacher/classes/[id]` | Needs review queue (default landing from sidebar) |
| `/teacher/classes/[id]/assignments` | Assignment cards with progress |
| `/teacher/classes/[id]/students` | Student cards |
| `/teacher/classes/[id]/manage` | Class settings (existing, unchanged route) |

Structure:

- New `src/app/teacher/classes/[id]/(workspace)/layout.tsx` — server layout
  that loads the class row (name, join code) and roster count once, renders
  the class header (eyebrow text: "Class") and the tab bar, then
  `{children}`. The `(workspace)` route group keeps the same URLs but stops
  the layout from wrapping the `manage/` and `review/[assignmentId]` routes,
  which keep their standalone pages. The three tab pages live inside the
  group.
- Tab bar becomes `ClassWorkspaceTabs` (client component) using
  `usePathname()` to highlight the active tab. Tabs: Needs review (with
  count badge), Assignments, Students, Class settings.
  - The needs-review count comes from the layout (server) and is passed as
    a prop. Wrap `listNeedsReviewForTeacher` in `React.cache()` so the
    layout (count) and the Needs review page (rows) share one fetch per
    request instead of querying twice.
- `page.tsx` (Needs review): loads review rows via
  `listNeedsReviewForTeacher`, filtered to this class **by `classId`** —
  add `classId` to `TeacherReviewRow` (from the joined class) and filter on
  it instead of the current fragile `className` string match.
- `assignments/page.tsx`: loads assignments + per-assignment status counts
  (section 5).
- `students/page.tsx`: loads roster, renders existing student cards.
- Delete `ClassReviewWorkspace.tsx`; its pieces move into the layout and the
  three pages (extract small shared components as needed).
- All three pages keep `export const dynamic = "force-dynamic"`.

## 4. Class Settings back link

In `src/app/teacher/classes/[id]/manage/page.tsx`, replace
`← Classes` (→ `/teacher`) with `← Back to class`
(→ `/teacher/classes/[id]`).

## 5. Assignment progress on cards

New server function in `src/server/teacher/assignment-operations.ts`:

```
listAssignmentProgressForClass({ teacherId, classId })
  → Map<assignmentId, { completed, teacherReview, started, needsRetry,
                        assigned, missed, total }>
```

One query: `assignment_students` joined through `assignments` (class scoped,
teacher-owned, not canceled), selecting `assignment_id, status`; counts
aggregated in TypeScript. Dismissed rows count under their truthful status.

Card layout (existing card, extended):

- Line 1: title (as now)
- Line 2: due date (as now)
- New: **"C of T completed"** + slim progress bar (`completed / total`,
  0-width at 0; bar omitted when the assignment has no students).
- New: muted breakdown line listing only nonzero non-completed buckets, in
  this order: `N awaiting review · N needs retry · N in progress ·
  N not started · N missed` (labels map: teacher_review → awaiting review,
  needs_retry → needs retry, started → in progress, assigned → not started,
  missed → missed).

CSS: add progress-bar and breakdown styles to `teacher-workspace.css`.

## Testing

- Update policy-related domain/server/schema/e2e tests (section 1).
- New unit test for the progress aggregation (bucket mapping, empty
  assignment, dismissed rows counted truthfully).
- Update `tests/server/teacher-workspace-ui.test.ts` and any UI-source tests
  that reference the deleted components/tab markup.
- Full gates: vitest, `tsc --noEmit`, eslint.
- Manual browser verification of all four pages + back link + FOUC check
  (hard refresh shows styled content immediately).

## Out of scope

- Dropping the `review_policy` DB column (later cleanup migration if ever).
- Any redesign of the review page, evidence pages, or sidebar.
- Mobile-specific layout work beyond existing responsive CSS.
