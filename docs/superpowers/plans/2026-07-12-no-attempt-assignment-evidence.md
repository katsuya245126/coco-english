# No-Attempt Assignment Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make never-started incomplete assignments clickable and dismissible through a truthful evidence-style teacher page without creating an attempt.

**Architecture:** Add assignment-student-keyed dismiss/undo RPCs and server adapters, then add a teacher-owned assignment-student summary loader and route. Existing rows with attempts continue to use the attempt evidence route; only null-attempt rows use the new page and its focused Mark-as-done/Undo control.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase/Postgres RPCs, Zod mission snapshot parsing, Vitest.

## Global Constraints

- Never create a placeholder attempt or change `assignment_students.status` during dismiss/undo.
- Ownership must be verified through `classes.teacher_id = p_teacher_id` before mutation or disclosure.
- New RPCs are `language plpgsql`, `security definer`, `set search_path = public`, revoked from `public, anon, authenticated`, and granted only to `service_role`.
- Audit events keep `previous_status = next_status` and use `teacher_dismissed` / `teacher_dismiss_undone`.
- No-attempt copy: `Not started`, `Not yet submitted`, `0`, `No hints used`, `Mark as done`, `Undo`.
- No-attempt pages must not show Request retry, transcript, audio, pronunciation, scoring, or fabricated evidence.
- Successful dismiss redirects to `/teacher/incomplete?class=${encodeURIComponent(className)}`; undo refreshes the current page.
- Follow red-green TDD for every behavioral task. Final verification: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`.

---

## File Structure

- `supabase/migrations/202607120004_dismiss_assignment_student_by_id.sql` — assignment-student-keyed dismiss/undo RPCs.
- `tests/schema/dismiss-assignment-student-by-id-rpc-schema.test.ts` — static security/status/audit contract.
- `src/server/teacher/assignment-student-evidence.ts` — owned summary loader with truthful zero-attempt metadata.
- `tests/server/assignment-student-evidence.test.ts` — loader ownership and mapping tests.
- `src/server/teacher/assignment-operations.ts` — assignment-student-keyed mutation adapters.
- `tests/server/teacher-review-actions.test.ts` — mutation ownership/RPC tests.
- `src/app/teacher/assignment-students/[assignmentStudentId]/actions.ts` — authenticated route actions.
- `src/components/teacher/AssignmentStudentDismissControls.tsx` — Mark as done / Undo only.
- `src/app/teacher/assignment-students/[assignmentStudentId]/page.tsx` — evidence-style summary page.
- `src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx` — null-attempt link.
- `tests/server/teacher-workspace-ui.test.ts` — navigation and UI source contracts.

---

## Task 1: Assignment-student-keyed dismiss RPCs

**Files:**
- Create: `supabase/migrations/202607120004_dismiss_assignment_student_by_id.sql`
- Create: `tests/schema/dismiss-assignment-student-by-id-rpc-schema.test.ts`

**Interfaces:**
- Produces `dismiss_assignment_student_by_id(p_teacher_id uuid, p_assignment_student_id uuid, p_reason text) returns text`.
- Produces `undo_dismiss_assignment_student_by_id(p_teacher_id uuid, p_assignment_student_id uuid) returns text`.

- [ ] **Step 1: Write the failing schema test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/202607120004_dismiss_assignment_student_by_id.sql"), "utf8").toLowerCase();

describe("assignment-student keyed dismiss RPCs", () => {
  it("owns and locks the assignment student without changing status", () => {
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("ast.id = p_assignment_student_id");
    expect(sql).toContain("for update of ast");
    expect(sql).not.toContain("set status =");
  });
  it("records dismiss and undo audit events", () => {
    expect(sql).toContain("teacher_dismissed");
    expect(sql).toContain("teacher_dismiss_undone");
    expect(sql).toContain("v_status, v_status, 'teacher'");
  });
  it("exposes both functions only to service_role", () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function/g)).toHaveLength(2);
    expect(sql.match(/to service_role/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/schema/dismiss-assignment-student-by-id-rpc-schema.test.ts`

Expected: ENOENT because the migration does not exist.

- [ ] **Step 3: Create the migration**

Create both functions using this body shape; the undo function uses the same owned/locked select, clears the three dismissal columns, and inserts `teacher_dismiss_undone`:

```sql
create or replace function public.dismiss_assignment_student_by_id(
  p_teacher_id uuid, p_assignment_student_id uuid, p_reason text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_status public.assignment_student_status; v_now timestamptz := now();
begin
  select ast.status into v_status
  from public.assignment_students ast
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where ast.id = p_assignment_student_id and c.teacher_id = p_teacher_id
  for update of ast;
  if not found then return 'not_found'; end if;
  update public.assignment_students set dismissed_at = v_now, dismissed_by = p_teacher_id,
    dismiss_reason = nullif(p_reason, ''), updated_at = v_now
  where id = p_assignment_student_id;
  insert into public.assignment_status_events
    (assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code)
  values (p_assignment_student_id, v_status, v_status, 'teacher', p_teacher_id, 'teacher_dismissed');
  return 'ok';
end; $$;
```

The undo update is exactly:

```sql
update public.assignment_students
set dismissed_at = null, dismissed_by = null, dismiss_reason = null, updated_at = v_now
where id = p_assignment_student_id;
```

End with exact revoke/grant statements for `(uuid, uuid, text)` and `(uuid, uuid)`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx vitest run tests/schema/dismiss-assignment-student-by-id-rpc-schema.test.ts`

Expected: 3 passing.

Commit: `feat(db): dismiss assignment students without attempts`

---

## Task 2: Owned summary loader and server mutations

**Files:**
- Create: `src/server/teacher/assignment-student-evidence.ts`
- Create: `tests/server/assignment-student-evidence.test.ts`
- Modify: `src/server/teacher/assignment-operations.ts`
- Modify: `tests/server/teacher-review-actions.test.ts`

**Interfaces:**
- Produces `getAssignmentStudentEvidenceForTeacher({ teacherId, assignmentStudentId }, client?)` returning the summary or `null`.
- Produces `dismissAssignmentStudentById({ teacherId, assignmentStudentId, reason? }, client?)`.
- Produces `undoDismissByAssignmentStudentId({ teacherId, assignmentStudentId }, client?)`.

- [ ] **Step 1: Write failing loader and mutation tests**

The loader test must assert this exact shape for a row with `latest_attempt_id: null`:

```ts
expect(result).toEqual({
  assignmentStudentId: "as-1", studentName: "test", missionTitle: "July 1st Homework",
  status: "assigned", statusLabel: "Not started", submittedLabel: "Not yet submitted",
  attemptCount: 0, highestHintLabel: "No hints used", classId: "class-1",
  className: "Test class", assignmentId: "assignment-1", dismissedAt: null,
});
```

Also assert the query filters `assignments.classes.teacher_id` by the requested teacher and returns `null` when `maybeSingle()` returns no row.

Add mutation tests asserting cross-teacher/precheck failure causes no RPC and owned rows call:

```ts
expect(client.rpc).toHaveBeenCalledWith("dismiss_assignment_student_by_id", {
  p_teacher_id: "teacher-1", p_assignment_student_id: "as-1", p_reason: "",
});
expect(client.rpc).toHaveBeenCalledWith("undo_dismiss_assignment_student_by_id", {
  p_teacher_id: "teacher-1", p_assignment_student_id: "as-1",
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/server/assignment-student-evidence.test.ts tests/server/teacher-review-actions.test.ts`

Expected: missing modules/exports.

- [ ] **Step 3: Implement the loader**

Select this owned row:

```ts
id, status, submitted_at, latest_attempt_id, dismissed_at,
students!inner(display_name),
assignments!inner(id, title, mission_snapshot, classes!inner(id, name, teacher_id))
```

Filter by row id and `assignments.classes.teacher_id`, then `maybeSingle()`. Parse `mission_snapshot` with `missionSnapshotSchema.safeParse`; use parsed `title` when present and fall back to `assignments.title`. For this route, return `null` if `latest_attempt_id` is non-null so attempted work stays on the existing evidence route. Map assigned to `Not started`, null submission to `Not yet submitted`, and the exact zero/no-hints labels.

- [ ] **Step 4: Implement owned mutation adapters**

Add a `loadOwnedAssignmentStudent` query filtered by id and class teacher. Call the exact RPCs above and map `ok`, `not_found`, and `db_error` consistently with the existing attempt-keyed adapters.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npx vitest run tests/server/assignment-student-evidence.test.ts tests/server/teacher-review-actions.test.ts && npm run typecheck`

Commit: `feat(server): load and dismiss no-attempt assignments`

---

## Task 3: No-attempt evidence route, controls, and navigation

**Files:**
- Create: `src/app/teacher/assignment-students/[assignmentStudentId]/actions.ts`
- Create: `src/components/teacher/AssignmentStudentDismissControls.tsx`
- Create: `src/app/teacher/assignment-students/[assignmentStudentId]/page.tsx`
- Modify: `src/app/teacher/classes/[id]/review/[assignmentId]/page.tsx`
- Modify: `tests/server/teacher-workspace-ui.test.ts`

**Interfaces:**
- Consumes Task 2 loader and mutations.

- [ ] **Step 1: Write the failing source-contract test**

Assert the new page contains all six labels/values (`Student`, `Mission`, `Status`, `Submitted`, `Attempts`, `Highest hint used`), renders `AssignmentStudentDismissControls` before the metadata grid, and contains none of `Request retry`, `transcript`, `AudioClipPlayer`, or pronunciation components. Assert the controls contain `Mark as done`, helper copy, `Undo`, the class-filtered redirect, and no `Request retry`. Assert the assignment review page contains `/teacher/assignment-students/${entry.id}` in its null-attempt branch.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`

Expected: missing route/component files or missing source strings.

- [ ] **Step 3: Add authenticated actions**

```ts
"use server";
import { requireTeacherProfile } from "@/server/teacher/auth";
import { dismissAssignmentStudentById, undoDismissByAssignmentStudentId } from "@/server/teacher/assignment-operations";

export async function dismissAssignmentStudentByIdAction(input: { assignmentStudentId: string; reason?: string }) {
  const profile = await requireTeacherProfile();
  return dismissAssignmentStudentById({ teacherId: profile.id, ...input });
}
export async function undoDismissByAssignmentStudentIdAction(assignmentStudentId: string) {
  const profile = await requireTeacherProfile();
  return undoDismissByAssignmentStudentId({ teacherId: profile.id, assignmentStudentId });
}
```

- [ ] **Step 4: Add the focused client control**

Props are `assignmentStudentId`, `className`, and `dismissed`. Use `useTransition`, `useRouter`, the two actions, and existing `HoverButton` styles. Dismiss pushes the encoded class Incomplete URL; undo refreshes. Render only Undo when dismissed; otherwise render helper copy and Mark as done. On failure render `Could not update this assignment. Please try again.` No retry control or dialog.

- [ ] **Step 5: Add the server page**

Require teacher profile, load the summary, and `notFound()` for null. Render breadcrumb to `/teacher/classes/${classId}/review/${assignmentId}`, then heading `Assignment details`, then the controls, then a six-cell metadata grid using the loader's labels and values. Keep the action section above the grid.

- [ ] **Step 6: Add the no-attempt navigation link**

Replace the single truthy render with:

```tsx
{entry.latestAttemptId ? (
  <Link href={`/teacher/evidence/${entry.latestAttemptId}`}>Review evidence</Link>
) : (
  <Link href={`/teacher/assignment-students/${entry.id}`}>View assignment</Link>
)}
```

Retain the current accessible labels and styles.

- [ ] **Step 7: Verify GREEN and commit**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts && npm run typecheck && npm run lint`

Commit: `feat(ui): open and dismiss no-attempt assignments`

---

## Task 4: Full verification, migration push, and state

**Files:**
- Modify: `.planning/STATE.md`
- Remove: `scripts/cleanup-test-data.mjs` after cleanup decisions are complete; do not commit it.

- [ ] **Step 1: Run full verification**

Run: `npx vitest run && npm run typecheck && npm run lint && npm run build`

Expected: zero failures/errors; the existing unrelated lint warning may remain.

- [ ] **Step 2: Push and verify migration**

Run: `supabase db push && supabase migration list`

Expected: local and remote both list `202607120004`.

- [ ] **Step 3: Update truthful GSD state and commit**

Set the YAML `stopped_at`, `last_updated`, `last_activity`, and `last_activity_desc`, plus the prose Current Position and bottom session handoff, to record the implemented no-attempt page, verification counts, and live migration. Do not mark Phase 10.1 complete because its separate human checks remain.

Commit: `docs: record no-attempt assignment evidence completion`

- [ ] **Step 4: Browser acceptance check**

From Incomplete, open a Not started student, confirm the new page shows truthful zero-attempt values and only Mark as done, dismiss it, confirm return to the same class filter and queue removal, reopen by URL to see Undo, undo it, and confirm a row with an attempt still opens the original evidence page.

---

## Self-Review Notes

- Spec coverage: route, truthful metadata, top actions, no retry/evidence, secure by-id mutation, navigation, audit, and verification each map to a task.
- Type consistency: `assignmentStudentId` is used end-to-end; attempt-keyed APIs remain separate.
- Scope: no placeholder attempts, no unrelated evidence refactor, and no completed-review behavior changes.
