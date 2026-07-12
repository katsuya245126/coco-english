# Dismiss Incomplete Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give teachers a "Mark as done" action that dismisses an incomplete (missed / not-started / started) assignment so it leaves the Incomplete queue, replacing the misfiring "Mark reviewed" path; then run a one-time cleanup of accumulated test data.

**Architecture:** A new `dismissed_at` marker on `assignment_students` (an honest terminal receipt, orthogonal to `status`), set by a `security definer` RPC `dismiss_assignment_student` (with an undo RPC). The Incomplete query excludes dismissed rows. The evidence page shows **Mark as done** for incomplete attempts (redirecting to the class-scoped Incomplete view) and keeps **Mark reviewed** for completed submissions. A throwaway script then dismisses "Test class" incompletes and deletes the 8 synthetic E2E classes.

**Tech Stack:** Next.js (App Router, server actions, RSC), Supabase (Postgres + PostgREST + SQL RPCs), TypeScript, Vitest. Migrations are plain SQL files under `supabase/migrations/`, applied with `supabase db push` (run by the user).

## Global Constraints

- **Migration naming:** timestamped `YYYYMMDDNNNN_<slug>.sql`; the next free id is `202607120003`. Copy the header/comment style of `supabase/migrations/202607120002_review_any_attempt.sql`.
- **RPC security posture (every new RPC):** `language plpgsql`, `security definer`, `set search_path = public`; end with `revoke all on function … from public, anon, authenticated;` and `grant execute on function … to service_role;`.
- **Ownership:** an RPC must verify `classes.teacher_id = p_teacher_id` and `assignment_students.latest_attempt_id = at.id` with `for update` locking before any write; return `'not_found'` otherwise.
- **Status honesty:** dismissing must NOT change `assignment_students.status` and must NOT fabricate a `completed` state. Dismiss is recorded via `dismissed_at` + an audit event only.
- **Audit events:** insert into `public.assignment_status_events` with `actor_type = 'teacher'`, `actor_id = p_teacher_id`, `previous_status = next_status = <current status>` (status unchanged), `reason_code = 'teacher_dismissed'` (undo: `'teacher_dismiss_undone'`; cleanup: `'test_data_cleanup'`).
- **enum values available:** `status_actor_type` = {system, teacher, student_session, job, ai_evaluator}; `assignment_student_status` = {assigned, started, completed, missed, needs_retry, teacher_review}.
- **Button copy:** primary label **"Mark as done"**, helper text **"Removes this from your incomplete list. You can undo this."** Undo affordance label **"Undo"**.
- **Redirect after dismiss:** `/teacher/incomplete?class=${encodeURIComponent(className)}` (the existing Incomplete queue's class-name filter).
- **Test commands:** single file → `npx vitest run <path>`; full suite → `npx vitest run` (baseline **488 passed / 4 skipped**). Also `npm run typecheck`, `npm run lint`, `npm run build` must stay clean.
- **Do NOT touch** "John's Speaking Class" or "John's Speaking Class 2" in any cleanup.

---

## File Structure

- `supabase/migrations/202607120003_dismiss_assignment_student.sql` — **new**: adds `dismissed_at` / `dismissed_by` / `dismiss_reason` columns + `dismiss_assignment_student` and `undo_dismiss_assignment_student` RPCs.
- `tests/schema/dismiss-assignment-student-rpc-schema.test.ts` — **new**: static assertions on the migration SQL.
- `src/domain/teacher/assignment-operations.ts` — **modify**: add `dismissedAt` to the incomplete row type; skip dismissed rows in `groupIncompleteAssignments`.
- `tests/domain/assignment-operations.test.ts` — **modify**: cover dismissed-row exclusion.
- `src/server/teacher/assignment-operations.ts` — **modify**: add `dismissAssignmentStudent` + `undoDismiss`; add `.is("dismissed_at", null)` to the Incomplete query.
- `tests/server/teacher-review-actions.test.ts` — **modify**: cover dismiss ownership + RPC call.
- `src/server/teacher/audio-evidence.ts` — **modify**: add `className` to the evidence metadata select + payload.
- `src/app/teacher/evidence/[attemptId]/actions.ts` — **modify**: add `dismissAssignmentStudentAction` + `undoDismissAction`.
- `src/components/teacher/SubmissionReviewControls.tsx` — **modify**: accept `attemptStatus`, `className`, `dismissed` props; render Mark-as-done / Undo vs Mark-reviewed accordingly.
- `src/app/teacher/evidence/[attemptId]/page.tsx` — **modify**: pass the new props into `SubmissionReviewControls`.
- `tests/server/teacher-workspace-ui.test.ts` — **modify**: source assertion that the controls render the right action per status.
- `scripts/cleanup-test-data.mjs` (scratchpad copy; NOT committed as product code) — **new**: preview-then-write cleanup.

---

## Task 1: Migration — dismiss columns + RPCs

**Files:**
- Create: `supabase/migrations/202607120003_dismiss_assignment_student.sql`
- Test: `tests/schema/dismiss-assignment-student-rpc-schema.test.ts`

**Interfaces:**
- Produces (SQL RPCs, called by Task 3):
  - `public.dismiss_assignment_student(p_teacher_id uuid, p_attempt_id uuid, p_reason text) returns text` → `'ok'` | `'not_found'`
  - `public.undo_dismiss_assignment_student(p_teacher_id uuid, p_attempt_id uuid) returns text` → `'ok'` | `'not_found'`
- Produces (columns, read by Task 2/Task 3 queries): `assignment_students.dismissed_at timestamptz`, `dismissed_by uuid`, `dismiss_reason text`.

- [ ] **Step 1: Write the failing schema test**

Create `tests/schema/dismiss-assignment-student-rpc-schema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  __dirname,
  "../../supabase/migrations/202607120003_dismiss_assignment_student.sql",
);

describe("dismiss_assignment_student migration", () => {
  const sql = readFileSync(migrationPath, "utf8").toLowerCase();

  it("adds the dismissal columns to assignment_students", () => {
    expect(sql).toContain("alter table public.assignment_students");
    expect(sql).toContain("dismissed_at timestamptz");
    expect(sql).toContain("dismissed_by uuid");
    expect(sql).toContain("dismiss_reason text");
  });

  it("locks and ownership-checks before writing, and never changes status", () => {
    expect(sql).toContain("for update");
    expect(sql).toContain("c.teacher_id = p_teacher_id");
    expect(sql).toContain("ast.latest_attempt_id = at.id");
    // status column must not be assigned by the dismiss RPCs
    expect(sql).not.toContain("set status =");
  });

  it("records dismiss + undo audit events with the right reason codes", () => {
    expect(sql).toContain("insert into public.assignment_status_events");
    expect(sql).toContain("teacher_dismissed");
    expect(sql).toContain("teacher_dismiss_undone");
    expect(sql).toContain("'teacher'");
  });

  it("exposes both RPCs to the service role only", () => {
    expect(sql).toContain("create or replace function public.dismiss_assignment_student");
    expect(sql).toContain("create or replace function public.undo_dismiss_assignment_student");
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("revoke all on function public.dismiss_assignment_student");
    expect(sql).toContain("revoke all on function public.undo_dismiss_assignment_student");
    expect(sql.match(/to service_role/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/schema/dismiss-assignment-student-rpc-schema.test.ts`
Expected: FAIL — cannot read migration file (ENOENT) / file does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202607120003_dismiss_assignment_student.sql`:

```sql
-- Let a teacher DISMISS an incomplete assignment (assigned / started / missed)
-- so it leaves the Incomplete queue, without fabricating a completion.
--
-- "Mark as done" from the evidence page records a dismissal receipt on the
-- assignment_students row (dismissed_at) plus an audited teacher action. The
-- row's status is deliberately left unchanged: a never-started assignment must
-- not appear as 'completed' in history or reports. The Incomplete query filters
-- on dismissed_at IS NULL, so a dismissed row simply drops out of the queue.
--
-- undo_dismiss_assignment_student clears the receipt so a mis-click on a real
-- student is one click to recover.
--
-- Ownership + latest-attempt + locking semantics mirror mark_submission_reviewed
-- (202607120002).

alter table public.assignment_students
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by uuid,
  add column if not exists dismiss_reason text;

create or replace function public.dismiss_assignment_student(
  p_teacher_id uuid, p_attempt_id uuid, p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_status public.assignment_student_status;
  v_now timestamptz := now();
begin
  select ast.id, ast.status
  into v_assignment_student_id, v_status
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
  for update of at, ast;

  if not found then return 'not_found'; end if;

  update public.assignment_students
  set dismissed_at = v_now,
      dismissed_by = p_teacher_id,
      dismiss_reason = nullif(p_reason, ''),
      updated_at = v_now
  where id = v_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
  ) values (v_assignment_student_id, v_status, v_status, 'teacher', p_teacher_id, 'teacher_dismissed');

  return 'ok';
end;
$$;

create or replace function public.undo_dismiss_assignment_student(
  p_teacher_id uuid, p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_student_id uuid;
  v_status public.assignment_student_status;
  v_now timestamptz := now();
begin
  select ast.id, ast.status
  into v_assignment_student_id, v_status
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and ast.latest_attempt_id = at.id
    and c.teacher_id = p_teacher_id
  for update of at, ast;

  if not found then return 'not_found'; end if;

  update public.assignment_students
  set dismissed_at = null,
      dismissed_by = null,
      dismiss_reason = null,
      updated_at = v_now
  where id = v_assignment_student_id;

  insert into public.assignment_status_events (
    assignment_student_id, previous_status, next_status, actor_type, actor_id, reason_code
  ) values (v_assignment_student_id, v_status, v_status, 'teacher', p_teacher_id, 'teacher_dismiss_undone');

  return 'ok';
end;
$$;

revoke all on function public.dismiss_assignment_student(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.dismiss_assignment_student(uuid, uuid, text) to service_role;

revoke all on function public.undo_dismiss_assignment_student(uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_dismiss_assignment_student(uuid, uuid) to service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/schema/dismiss-assignment-student-rpc-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607120003_dismiss_assignment_student.sql tests/schema/dismiss-assignment-student-rpc-schema.test.ts
git commit -m "feat(db): dismiss_assignment_student RPC + dismissed_at columns"
```

---

## Task 2: Domain — exclude dismissed rows from the Incomplete grouping

**Files:**
- Modify: `src/domain/teacher/assignment-operations.ts`
- Test: `tests/domain/assignment-operations.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `IncompleteAssignmentRow` gains an optional `dismissedAt?: string | null`; `groupIncompleteAssignments` skips any row with a non-null `dismissedAt`. (Task 3's server query already filters these out; this keeps the pure function self-consistent so unit tests don't depend on the query.)

- [ ] **Step 1: Write the failing test**

Add to `tests/domain/assignment-operations.test.ts` inside the existing `describe("groupIncompleteAssignments", …)` block (after the "excludes retry and review workflow rows" test):

```ts
  it("excludes dismissed rows", () => {
    const result = groupIncompleteAssignments([
      { ...row("live", "a1", "missed", "2026-07-11T00:00:00.000Z") },
      { ...row("dismissed", "a1", "missed", "2026-07-11T00:00:00.000Z"), dismissedAt: "2026-07-12T00:00:00.000Z" },
    ], now);
    const ids = result.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["live"]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/assignment-operations.test.ts`
Expected: FAIL — `dismissed` row still present (type error on `dismissedAt`, or both ids returned).

- [ ] **Step 3: Implement**

In `src/domain/teacher/assignment-operations.ts`, add `dismissedAt` to the row type:

```ts
export type IncompleteAssignmentRow = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  status: IncompleteStatus;
  dueAt: string | null;
  dismissedAt?: string | null;
};
```

And skip dismissed rows at the top of the `for` loop in `groupIncompleteAssignments`, alongside the existing status filter:

```ts
  for (const row of rows) {
    if (row.dismissedAt != null) continue;
    if (["completed", "needs_retry", "teacher_review"].includes(row.status)) continue;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/domain/assignment-operations.test.ts`
Expected: PASS (all tests in file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/domain/teacher/assignment-operations.ts tests/domain/assignment-operations.test.ts
git commit -m "feat(domain): exclude dismissed rows from incomplete grouping"
```

---

## Task 3: Server — dismiss / undo mutations + Incomplete query filter

**Files:**
- Modify: `src/server/teacher/assignment-operations.ts`
- Test: `tests/server/teacher-review-actions.test.ts`

**Interfaces:**
- Consumes: RPCs `dismiss_assignment_student` / `undo_dismiss_assignment_student` (Task 1); existing `loadOwnedAttempt(input, client)`.
- Produces (called by Task 5 actions):
  - `dismissAssignmentStudent(input: { teacherId: string; attemptId: string; reason?: string }, client?): Promise<{ ok: true } | { ok: false; error: "not_found" | "db_error" }>`
  - `undoDismiss(input: { teacherId: string; attemptId: string }, client?): Promise<{ ok: true } | { ok: false; error: "not_found" | "db_error" }>`
- Also: `listIncompleteForTeacher` query gains `.is("dismissed_at", null)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/server/teacher-review-actions.test.ts`. First extend the import line:

```ts
import { dismissAssignmentStudent, markSubmissionReviewed, markSubmissionViewed, reopenSubmissionReview, requestSubmissionRetry, undoDismiss } from "@/server/teacher/assignment-operations";
```

Then add these tests inside `describe("teacher review mutations", …)`:

```ts
  it("dismiss performs zero writes and returns not_found for a cross-teacher attempt", async () => {
    const { client, operations } = mutationClient(false);
    expect(await dismissAssignmentStudent({ teacherId: "teacher-2", attemptId: "attempt-1", reason: "test" }, client)).toEqual({ ok: false, error: "not_found" });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(operations.some((op) => ["upsert", "update"].includes(op[0]))).toBe(false);
  });

  it("dismiss calls the dismiss RPC with the reason for an owned attempt", async () => {
    const { client } = mutationClient();
    expect(await dismissAssignmentStudent({ teacherId: "teacher-1", attemptId: "attempt-1", reason: "absent" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("dismiss_assignment_student", expect.objectContaining({ p_teacher_id: "teacher-1", p_attempt_id: "attempt-1", p_reason: "absent" }));
  });

  it("undo dismiss calls the undo RPC for an owned attempt", async () => {
    const { client } = mutationClient();
    expect(await undoDismiss({ teacherId: "teacher-1", attemptId: "attempt-1" }, client)).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("undo_dismiss_assignment_student", expect.objectContaining({ p_teacher_id: "teacher-1", p_attempt_id: "attempt-1" }));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/server/teacher-review-actions.test.ts`
Expected: FAIL — `dismissAssignmentStudent` / `undoDismiss` are not exported.

- [ ] **Step 3: Implement**

In `src/server/teacher/assignment-operations.ts`, add the `.is("dismissed_at", null)` filter to the Incomplete query (the `listIncompleteForTeacher` `.select(...).in("status", [...])` chain):

```ts
  const result = await client.from("assignment_students").select(`id, status, students!inner(display_name), assignments!inner(id, title, due_at, classes!inner(id, name, teacher_id))`).eq("assignments.classes.teacher_id", input.teacherId).in("status", ["assigned", "started", "missed"]).is("dismissed_at", null);
```

Then add the two mutations near `markSubmissionReviewed` (they follow the same ownership-precheck-then-RPC shape):

```ts
export async function dismissAssignmentStudent(input: { teacherId: string; attemptId: string; reason?: string }, client: Client = createSupabaseServiceClient()) {
  if (!await loadOwnedAttempt(input, client)) return { ok: false as const, error: "not_found" as const };
  const result = await client.rpc("dismiss_assignment_student", { p_teacher_id: input.teacherId, p_attempt_id: input.attemptId, p_reason: input.reason ?? "" });
  return result.error || result.data !== "ok" ? { ok: false as const, error: result.data === "not_found" ? "not_found" as const : "db_error" as const } : { ok: true as const };
}

export async function undoDismiss(input: { teacherId: string; attemptId: string }, client: Client = createSupabaseServiceClient()) {
  if (!await loadOwnedAttempt(input, client)) return { ok: false as const, error: "not_found" as const };
  const result = await client.rpc("undo_dismiss_assignment_student", { p_teacher_id: input.teacherId, p_attempt_id: input.attemptId });
  return result.error || result.data !== "ok" ? { ok: false as const, error: result.data === "not_found" ? "not_found" as const : "db_error" as const } : { ok: true as const };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/server/teacher-review-actions.test.ts`
Expected: PASS (all tests including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/server/teacher/assignment-operations.ts tests/server/teacher-review-actions.test.ts
git commit -m "feat(server): dismiss/undo mutations + exclude dismissed from incomplete query"
```

---

## Task 4: Evidence metadata — expose className

**Files:**
- Modify: `src/server/teacher/audio-evidence.ts`
- Test: `tests/server/teacher-workspace-ui.test.ts` (source assertion — no new runtime test harness needed here; covered by Task 6's control-rendering test which reads `className`)

**Interfaces:**
- Consumes: existing `mapAttemptMetadata` / evidence row joins (already select `classes(... name ...)` via the assignment join? verify below).
- Produces: evidence payload gains `className: string`, consumed by Task 6's page → controls.

- [ ] **Step 1: Confirm the class name is available in the select**

Run: `grep -n "classes\|name\|assignmentClass" src/server/teacher/audio-evidence.ts | head -30`
Expected: locate the `assignment_students → assignments → classes` join and whether `name` is selected. If `name` is NOT in the select string, add it.

- [ ] **Step 2: Add `className` to the metadata type and mapper**

In `src/server/teacher/audio-evidence.ts`:
- Add to the metadata/evidence type (the block containing `classId: string;`): `className: string;`
- In `mapAttemptMetadata`, add: `className: assignmentClass?.name ?? "",`
- Ensure the select that feeds `assignmentClass` includes `name` (e.g. `classes!inner(id, name, teacher_id)` or the equivalent already present). If the ownership select and the metadata select differ, update the one `mapAttemptMetadata` reads from.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (no missing-property errors on `className`).

- [ ] **Step 4: Commit**

```bash
git add src/server/teacher/audio-evidence.ts
git commit -m "feat(server): expose className on attempt evidence metadata"
```

---

## Task 5: Server actions — dismiss / undo on the evidence route

**Files:**
- Modify: `src/app/teacher/evidence/[attemptId]/actions.ts`

**Interfaces:**
- Consumes: `dismissAssignmentStudent`, `undoDismiss` (Task 3); `requireTeacherProfile` (already imported).
- Produces (called by Task 6 controls):
  - `dismissAssignmentStudentAction(input: { attemptId: string; reason?: string }): Promise<{ ok: true } | { ok: false; error: string }>`
  - `undoDismissAction(attemptId: string): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Add the actions**

In `src/app/teacher/evidence/[attemptId]/actions.ts`, extend the import from the server module:

```ts
import { dismissAssignmentStudent, markSubmissionReviewed, requestSubmissionRetry, undoDismiss } from "@/server/teacher/assignment-operations";
```

Append at the end of the file:

```ts
export async function dismissAssignmentStudentAction(input: { attemptId: string; reason?: string }) {
  const profile = await requireTeacherProfile();
  return dismissAssignmentStudent({ teacherId: profile.id, attemptId: input.attemptId, reason: input.reason });
}

export async function undoDismissAction(attemptId: string) {
  const profile = await requireTeacherProfile();
  return undoDismiss({ teacherId: profile.id, attemptId });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/teacher/evidence/[attemptId]/actions.ts
git commit -m "feat(actions): dismiss/undo assignment actions on evidence route"
```

---

## Task 6: UI — Mark-as-done / Undo on the evidence page

**Files:**
- Modify: `src/components/teacher/SubmissionReviewControls.tsx`
- Modify: `src/app/teacher/evidence/[attemptId]/page.tsx`
- Test: `tests/server/teacher-workspace-ui.test.ts`

**Interfaces:**
- Consumes: `dismissAssignmentStudentAction`, `undoDismissAction`, `markSubmissionReviewedAction`, `requestSubmissionRetryAction` (Tasks 5 + existing); evidence fields `attemptStatus`, `assignmentStudentStatus`, `className`, and a `dismissed` boolean derived from `evidence` (see below).
- Produces: nothing consumed downstream.

**Behavior contract:**
- An attempt is **incomplete** when `assignmentStudentStatus ∈ {assigned, started, missed}`. In that case the primary control is **Mark as done** (calls `dismissAssignmentStudentAction`, then redirects to `/teacher/incomplete?class=${encodeURIComponent(className)}`). "Request retry" stays as the secondary control.
- When `dismissed` is true, show an **Undo** button (calls `undoDismissAction`) instead of Mark as done.
- Otherwise (completed / teacher_review) the controls are unchanged: **Mark reviewed** + **Request retry**.

- [ ] **Step 1: Write the failing source-contract test**

Add to `tests/server/teacher-workspace-ui.test.ts` (this file already asserts on component source text — follow its existing `readFileSync` pattern; if it doesn't yet read `SubmissionReviewControls.tsx`, add a block):

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SubmissionReviewControls source", () => {
  const src = readFileSync(
    resolve(__dirname, "../../src/components/teacher/SubmissionReviewControls.tsx"),
    "utf8",
  );
  it("offers Mark as done for incomplete attempts and Mark reviewed otherwise", () => {
    expect(src).toContain("Mark as done");
    expect(src).toContain("Removes this from your incomplete list. You can undo this.");
    expect(src).toContain("Mark reviewed");
    expect(src).toContain("dismissAssignmentStudentAction");
    expect(src).toContain("undoDismissAction");
    expect(src).toContain("/teacher/incomplete?class=");
  });
});
```

(If `teacher-workspace-ui.test.ts` already imports `readFileSync`/`resolve`, don't duplicate the imports — just add the `describe` block.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`
Expected: FAIL — strings not present in the current controls source.

- [ ] **Step 3: Rewrite `SubmissionReviewControls.tsx`**

Replace the component (keep the existing style constants and the retry `<dialog>`). New props + branching:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  dismissAssignmentStudentAction,
  markSubmissionReviewedAction,
  requestSubmissionRetryAction,
  undoDismissAction,
} from "@/app/teacher/evidence/[attemptId]/actions";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";

const INCOMPLETE_STATUSES = ["assigned", "started", "missed"];

export function SubmissionReviewControls({
  attemptId,
  assignmentStudentStatus,
  className,
  dismissed,
}: {
  attemptId: string;
  assignmentStudentStatus: string;
  className: string;
  dismissed: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const isIncomplete = INCOMPLETE_STATUSES.includes(assignmentStudentStatus);
  const incompleteHref = `/teacher/incomplete?class=${encodeURIComponent(className)}`;

  const markReviewed = () => startTransition(async () => {
    setError(false);
    const result = await markSubmissionReviewedAction(attemptId);
    if (result.ok) router.push(`/teacher?reviewed=${attemptId}`);
    else setError(true);
  });
  const markDone = () => startTransition(async () => {
    setError(false);
    const result = await dismissAssignmentStudentAction({ attemptId });
    if (result.ok) router.push(incompleteHref);
    else setError(true);
  });
  const undoDone = () => startTransition(async () => {
    setError(false);
    const result = await undoDismissAction(attemptId);
    if (result.ok) router.refresh();
    else setError(true);
  });
  const requestRetry = () => startTransition(async () => {
    setError(false);
    const result = await requestSubmissionRetryAction({ attemptId, reasonNote: note.trim() || undefined });
    if (result.ok) router.push("/teacher");
    else setError(true);
  });

  return <section aria-label="Submission review actions" style={sectionStyle}>
    <h2 style={headingStyle}>Teacher action</h2>
    {dismissed ? (
      <>
        <p style={helperStyle}>This assignment is marked done and hidden from your incomplete list.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <HoverButton type="button" disabled={pending} onClick={undoDone} style={secondaryButtonStyle} hoverStyle={secondaryHover}>Undo</HoverButton>
        </div>
      </>
    ) : isIncomplete ? (
      <>
        <p style={helperStyle}>Removes this from your incomplete list. You can undo this.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <HoverButton type="button" disabled={pending} onClick={markDone} style={primaryButtonStyle} hoverStyle={primaryHover}>Mark as done</HoverButton>
          <HoverButton type="button" disabled={pending} onClick={() => dialog.current?.showModal()} style={secondaryButtonStyle} hoverStyle={secondaryHover}>Request retry</HoverButton>
        </div>
      </>
    ) : (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <HoverButton type="button" disabled={pending} onClick={markReviewed} style={primaryButtonStyle} hoverStyle={primaryHover}>Mark reviewed</HoverButton>
        <HoverButton type="button" disabled={pending} onClick={() => dialog.current?.showModal()} style={secondaryButtonStyle} hoverStyle={secondaryHover}>Request retry</HoverButton>
      </div>
    )}
    {error && <p role="alert" style={errorStyle}>Could not update this submission. Please try again.</p>}
    <dialog ref={dialog} aria-labelledby="retry-heading" style={dialogStyle}>
      <h2 id="retry-heading" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>Request retry?</h2>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4B5563", lineHeight: 1.5 }}>The student can start a new attempt. This evidence stays available.</p>
      <label htmlFor="retry-note" style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 600, color: "#4B5563" }}>Note (optional)</label>
      <textarea id="retry-note" value={note} onChange={(event) => setNote(event.target.value)} style={textareaStyle} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <HoverButton type="button" onClick={() => dialog.current?.close()} style={secondaryButtonStyle} hoverStyle={secondaryHover}>Cancel</HoverButton>
        <HoverButton type="button" disabled={pending} onClick={requestRetry} style={primaryButtonStyle} hoverStyle={primaryHover}>Request retry</HoverButton>
      </div>
    </dialog>
  </section>;
}
```

Add one style constant next to the others (reuse the existing block at the bottom of the file):

```tsx
const helperStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  color: "#4B5563",
  lineHeight: 1.5,
};
```

Keep the existing `sectionStyle`, `headingStyle`, `primaryButtonStyle`, `secondaryButtonStyle`, `errorStyle`, `dialogStyle`, `textareaStyle` constants unchanged.

- [ ] **Step 4: Thread props from the page**

In `src/app/teacher/evidence/[attemptId]/page.tsx`, change the controls render (currently `<SubmissionReviewControls attemptId={attemptId} />`) to:

```tsx
        <SubmissionReviewControls
          attemptId={attemptId}
          assignmentStudentStatus={evidence.assignmentStudentStatus}
          className={evidence.className}
          dismissed={evidence.dismissedAt != null}
        />
```

This requires `evidence.dismissedAt` to exist. If `getAttemptEvidenceForTeacher`'s payload does not already include `dismissedAt`, add it in `src/server/teacher/audio-evidence.ts` the same way `className` was added in Task 4: select `dismissed_at` on the `assignment_students` row and map `dismissedAt: assignmentStudent?.dismissed_at ?? null` into the metadata. (Verify with `grep -n "dismissed_at\|assignmentStudentStatus" src/server/teacher/audio-evidence.ts`; add whichever fields are missing.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/server/teacher-workspace-ui.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/teacher/SubmissionReviewControls.tsx src/app/teacher/evidence/[attemptId]/page.tsx src/server/teacher/audio-evidence.ts
git commit -m "feat(ui): Mark as done / Undo on evidence page for incomplete attempts"
```

---

## Task 7: Full verification + push migration

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: **491 passed / 4 skipped** (baseline 488 + 3 new: schema file's 4 tests count as one file; net new individual tests ≈ 4 schema + 1 domain + 3 server + 1 ui-source = 9, so expect ~497 passed — the exact number is whatever the baseline+new sum to; the requirement is **zero failures** and the previously-passing 488 all still pass).

- [ ] **Step 2: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all exit 0, clean `.next` build.

- [ ] **Step 3: Push the migration to live Supabase**

Run: `supabase db push`
Then confirm: `supabase migration list`
Expected: `202607120003_dismiss_assignment_student` shows as applied on remote.

(If `supabase db push` requires interactive login/link the agent can't complete, STOP and hand this step to the user — same as migration `202607120002` was user-run.)

- [ ] **Step 4: Human browser check**

Log in as teacher → open an incomplete (missed / not-started) attempt from the Incomplete queue → click **Mark as done** → confirm you land on `/teacher/incomplete?class=…`, the item is gone from that class's list, and the sidebar Incomplete count dropped. Open the same student's evidence again → confirm **Undo** restores it. Confirm a completed submission still shows **Mark reviewed**.

- [ ] **Step 5: Commit any doc/state updates** (if applicable — otherwise skip).

---

## Task 8: One-time test-data cleanup (run once; not shipped)

**Files:**
- Create (scratchpad, NOT committed to product): `scripts/cleanup-test-data.mjs`

**Prerequisite:** Task 1 migration is applied live (Task 7 Step 3), so `dismiss_assignment_student` exists on remote.

- [ ] **Step 1: Write the preview-then-write script**

Create the script (PostgREST via `fetch`, mirroring the inspection script already validated this session). It must (a) DELETE the 8 synthetic classes by id, and (b) call `dismiss_assignment_student` for each incomplete attempt in "Test class" (id `06739d49-0578-4148-a89e-743b7ff1af45`). It runs in two modes: default = **preview only** (prints exactly what it will do); `--apply` = perform writes.

```js
import { readFileSync } from "node:fs";
const envText = readFileSync("./.env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

const DELETE_CLASS_IDS = [
  "a70310f3-cec0-4cc0-a132-c3fe4fe05d50",
  "65feacad-e5df-4419-b79d-c28772d9b868",
  "d6f3b99b-69af-40e4-9317-3be4513441b8",
  "9b8435a3-e4b9-4693-bf07-71b765b641ba",
  "54efe4ae-469f-48a9-a4df-b4aa18dff2cb",
  "e4b9bdb5-8afb-4925-91cb-af4a42699de4",
  "27bd68cc-b2e5-4980-aff7-045d4565a3ca",
  "e57bd074-d022-4e57-a300-fae148deab7a",
];
const TEST_CLASS_ID = "06739d49-0578-4148-a89e-743b7ff1af45";

async function rest(method, path, body) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
async function rpc(fn, args) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${fn} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// PREVIEW
console.log(`\nMODE: ${APPLY ? "APPLY (writing)" : "PREVIEW (read-only)"}\n`);
console.log(`Will DELETE ${DELETE_CLASS_IDS.length} synthetic classes (cascade):`);
for (const id of DELETE_CLASS_IDS) {
  const c = await rest("GET", `classes?select=name&id=eq.${id}`);
  console.log(`   - ${id}  "${c[0]?.name ?? "(missing)"}"`);
}

// Test class incompletes: need teacher_id + each latest_attempt_id
const testClass = await rest("GET", `classes?select=teacher_id,name&id=eq.${TEST_CLASS_ID}`);
const teacherId = testClass[0]?.teacher_id;
const incompletes = await rest("GET",
  `assignment_students?select=id,status,latest_attempt_id,dismissed_at,assignments!inner(class_id)&assignments.class_id=eq.${TEST_CLASS_ID}&status=in.(assigned,started,missed)&dismissed_at=is.null`);
console.log(`\nWill DISMISS ${incompletes.length} incomplete rows in "${testClass[0]?.name}" (teacher ${teacherId}):`);
for (const r of incompletes) console.log(`   - as=${r.id} status=${r.status} attempt=${r.latest_attempt_id ?? "(none)"}`);

if (!APPLY) {
  console.log(`\n(PREVIEW ONLY — re-run with --apply to perform these writes)\n`);
  process.exit(0);
}

// APPLY
for (const id of DELETE_CLASS_IDS) {
  await rest("DELETE", `classes?id=eq.${id}`);
  console.log(`deleted class ${id}`);
}
let dismissed = 0, skipped = 0;
for (const r of incompletes) {
  if (!r.latest_attempt_id) { skipped++; continue; } // no attempt row → nothing for the RPC to lock; leave it
  const res = await rpc("dismiss_assignment_student", { p_teacher_id: teacherId, p_attempt_id: r.latest_attempt_id, p_reason: "test_data_cleanup" });
  if (res === "ok") dismissed++; else { skipped++; console.log(`  skip as=${r.id}: ${res}`); }
}
console.log(`\nDONE — dismissed ${dismissed}, skipped ${skipped}.\n`);
```

**Note on `latest_attempt_id`:** the dismiss RPC keys off an attempt id. Rows in status `assigned` with no attempt yet have `latest_attempt_id = null` — the script skips those (the RPC has nothing to lock). If preview shows many null-attempt rows that must also be cleared, extend Task 1's RPC design to accept an `assignment_student_id` variant — but per the inspection, "Test class" had 3 `started` + 1 `missed` (which have attempts) and 15 `assigned` (likely no attempts). Decide at run time from the preview: if the 15 assigned rows show `attempt=(none)` and you still want them gone, the fastest honest path is a direct `PATCH assignment_students?id=eq.<id>` setting `dismissed_at`/`dismissed_by`/`dismiss_reason` (no attempt to lock) — add that branch to the `--apply` loop for null-attempt rows.

- [ ] **Step 2: Run the preview**

Run: `node scripts/cleanup-test-data.mjs`
Expected: prints the 8 classes and the "Test class" incomplete rows. **Human reviews this output.** Confirm no real class ("John's Speaking Class" / "…2") appears.

- [ ] **Step 3: Apply (after human confirms the preview)**

Run: `node scripts/cleanup-test-data.mjs --apply`
Expected: "deleted class …" ×8 and "dismissed N".

- [ ] **Step 4: Re-inspect**

Re-run the read-only inspection from this session (classes list). Expected: 3 classes remain ("Test class", "John's Speaking Class", "John's Speaking Class 2"); "Test class" shows `incomplete=0` (or only null-attempt leftovers if you chose not to clear them); the two real classes unchanged.

- [ ] **Step 5: Remove the scratch script**

Run: `rm scripts/cleanup-test-data.mjs`
(The script is a one-shot; do not commit it.)

---

## Self-Review Notes

- **Spec coverage:** Part B — dismissed_at model (Task 1), queue exclusion (Tasks 2–3), evidence-only UI with class-scoped redirect + className threading (Tasks 4–6), migration push + verification (Task 7). Part A — cleanup script deleting 8 E2E classes + dismissing "Test class" incompletes, real classes untouched, preview-then-apply (Task 8). All spec sections mapped.
- **Ordering:** Part B (Tasks 1–7) ships before Part A (Task 8), matching the spec's "Part B ships first, then the cleanup reuses the dismiss RPC."
- **Type consistency:** `dismissAssignmentStudent` / `undoDismiss` (server) → `dismissAssignmentStudentAction` / `undoDismissAction` (actions) → same names used in the control component and its source test. RPC names `dismiss_assignment_student` / `undo_dismiss_assignment_student` identical across migration, server, and schema test. `className` / `dismissedAt` / `assignmentStudentStatus` consistent across audio-evidence payload → page → controls.
- **Open verification-at-implementation-time:** Task 4/6 note where `className`, `dismissedAt`, `assignmentStudentStatus` must be added to the evidence payload if not already present (grep-guarded, not assumed). Task 8 Step 1 flags the null-`latest_attempt_id` case for the `assigned` rows and gives the direct-PATCH branch to handle it.
