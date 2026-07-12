# No-Attempt Assignment Evidence Design

## Goal

Let teachers open and dismiss incomplete assignments even when the student never started and therefore has no attempt record. The UI must remain truthful: it must not fabricate an attempt, submission, transcript, audio, hint use, or completion.

## Root Cause

The Incomplete queue links each row to the assignment review page. That page only renders its evidence link when `assignment_students.latest_attempt_id` exists. The current evidence route and dismiss RPC are both keyed by an attempt ID, so a never-started assignment has no route or mutation target.

## Chosen Approach

Add a teacher-owned assignment-student evidence route:

`/teacher/assignment-students/[assignmentStudentId]`

Rows with an attempt continue to use `/teacher/evidence/[attemptId]`. Rows without an attempt use the new route. This keeps attempt IDs and assignment-student IDs distinct and avoids creating placeholder attempts.

## Page Behavior

The new page reuses the visual structure of the attempt evidence page. Teacher actions appear above the metadata.

For a never-started assignment it displays truthful assignment-level values:

- Student: the assigned student's display name.
- Mission: the assignment's mission snapshot title.
- Status: `Not started` for an assigned row; other supported incomplete statuses use their human-readable status.
- Submitted: `Not yet submitted`.
- Attempts: `0`.
- Highest hint used: `No hints used`.

It does not render transcript, audio, pronunciation, scoring, or retry controls because no attempt exists.

The available action is **Mark as done** with the existing helper text: **Removes this from your incomplete list. You can undo this.** After dismissal, the page shows **Undo** instead. A successful dismissal returns to `/teacher/incomplete?class=${encodeURIComponent(className)}`. Undo refreshes the page.

## Data and Security

Load the assignment-student record through a server-owned teacher query that joins assignment, class, student, and mission snapshot data. Ownership is enforced by `classes.teacher_id = teacherId`. A missing or cross-teacher record resolves as not found.

Add assignment-student-keyed dismiss and undo operations. Their RPCs accept `p_assignment_student_id` rather than an attempt ID, lock the assignment-student row, verify teacher ownership, and return `ok` or `not_found`.

Dismissal sets `dismissed_at`, `dismissed_by`, and `dismiss_reason` without changing `status`. Undo clears those fields. Both write `assignment_status_events` with unchanged previous/next status and the existing `teacher_dismissed` or `teacher_dismiss_undone` reason codes. Execute permission remains restricted to `service_role`.

The existing attempt-keyed RPCs and evidence page remain unchanged for rows that have attempts.

## Navigation

Incomplete queue items remain assignment-review links. On the assignment review page:

- If `latestAttemptId` exists, render **Review evidence** linking to the attempt page.
- If it is null, render **View assignment** linking to the new assignment-student evidence page.

The requested student remains highlighted through the current `?student=` query parameter.

## Error Handling

- Invalid, missing, or cross-teacher assignment-student IDs return not found.
- Failed mutations show the existing generic teacher-action error.
- No mutation may create an attempt or alter the assignment's workflow status.

## Testing

- Migration schema tests cover ownership, row locking, status honesty, audit events, and service-role-only permissions.
- Server tests cover owned and cross-teacher assignment-student dismiss/undo calls.
- Data-loader tests cover truthful zero-attempt metadata and ownership filtering.
- UI source or component tests cover the no-attempt link, metadata labels, action placement, Mark as done, Undo, and absence of Request retry.
- Focused tests follow red-green TDD, followed by the full suite, typecheck, lint, and production build.

## Out of Scope

- Placeholder attempt creation.
- Evidence, audio, transcript, pronunciation, scoring, or hint details when no attempt exists.
- Request retry for a never-started assignment.
- Changes to completed-submission review behavior.
