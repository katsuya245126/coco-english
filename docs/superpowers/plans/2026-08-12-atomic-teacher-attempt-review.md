# Atomic Teacher Attempt Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete GitHub ticket #31 by giving teachers one owned, atomic interface for marking a homework attempt viewed, marking it reviewed, or reopening its review.

**Architecture:** Deepen the existing teacher assignment-operations module with one `changeAttemptReview(...)` interface. The module creates its Supabase client, selects the appropriate service-role-only RPC, maps storage outcomes into one shared result vocabulary, and exposes no query or transaction protocol to callers. Add two small RPCs for the operations that are not atomic today; keep the existing atomic mark-reviewed RPC.

**Tech Stack:** Next.js App Router server components and server actions, TypeScript, Supabase Postgres migrations and RPCs, generated Supabase database types, Vitest, and the repository's local-Supabase integration-test pattern.

## Global Constraints

- Governing references: GitHub issues #30 and #31, `docs/improve-codebase-architecture.md`, `PROJECT.md`, `TASK.md`, and `CONTEXT.md`.
- Preserve existing teacher-visible behavior. Add no teacher action and make no UI redesign.
- Preserve mission snapshots, homework attempts, turns, transcripts, audio, assignment status events, RLS, and signed-on-demand audio playback.
- Every service-role mutation independently proves `classes.teacher_id = p_teacher_id`; caller authentication is not authorization.
- Missing and cross-teacher attempts both return `not_found` and perform no write.
- Keep Supabase clients and database-specific errors out of the public mutation interface.
- Add no dependency, repository layer, generic mutation framework, second adapter, or unrelated refactor.
- Keep assigned-homework retry, dismiss, and undo behavior for ticket #32. Touch its legacy override only enough to call the new review interface.
- Apply migrations only to the local Supabase stack. Never use `--linked`, a remote database URL, or production credentials.
- The dedicated local-Supabase integration test must run without a skip before completion.
- Preserve the pre-existing `CONTEXT.md` edit and stage only files named by each task.

## File Structure

- Create `supabase/migrations/202608120001_atomic_teacher_attempt_review.sql` — owner-scoped mark-viewed and reopen-review RPCs.
- Create `tests/schema/atomic-teacher-attempt-review-schema.test.ts` — migration and privilege contract.
- Create `tests/server/teacher-attempt-review.integration.test.ts` — real local-Supabase ownership and receipt behavior through the module interface.
- Create `tests/server/teacher-attempt-review.test.ts` — fast result-mapping tests at the module interface.
- Modify `src/lib/db/types.ts` — declarations for the two new RPCs.
- Modify `src/server/teacher/assignment-operations.ts` — shared result type and `changeAttemptReview(...)`; remove the three old review mutation exports.
- Modify `src/app/teacher/evidence/[attemptId]/page.tsx` — record a view through the new interface.
- Modify `src/app/teacher/evidence/[attemptId]/actions.ts` — mark reviewed and the temporary legacy override call through the new interface.
- Modify `src/app/teacher/assignment-actions.ts` — reopen review through the new interface.
- Modify `tests/server/teacher-review-actions.test.ts` — remove tests owned by the new focused module suite while retaining assigned-homework and class-policy coverage.
- Modify `tests/server/teacher-override.test.ts` — expect the new review interface.
- Modify `tests/server/pronunciation-reprocess-action.test.ts` — keep its assignment-operations mock aligned with production imports.
- Modify `TASK.md` only at approval and verification milestones; it is local task state and must not be staged.

## Public Interfaces

The deep module must expose exactly this shared result and attempt-review interface:

```ts
export type TeacherMutationResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_allowed" | "failed" };

export type AttemptReviewAction =
  | "mark_viewed"
  | "mark_reviewed"
  | "reopen_review";

export async function changeAttemptReview(input: {
  teacherId: string;
  attemptId: string;
  action: AttemptReviewAction;
}): Promise<TeacherMutationResult>;
```

The database contracts are:

```sql
public.mark_submission_viewed(
  p_teacher_id uuid,
  p_attempt_id uuid
) returns text -- ok | not_found

public.reopen_submission_review(
  p_teacher_id uuid,
  p_attempt_id uuid
) returns text -- ok | not_found
```

The existing `public.mark_submission_reviewed(uuid, uuid)` remains the atomic implementation for `mark_reviewed`.

---

### Task 0: Record approval and the review base

**Files:**

- Modify: `TASK.md` (local and intentionally ignored; do not stage)

**Interfaces:**

- Consumes: explicit owner approval of this exact plan revision.
- Produces: an immutable base SHA for later diff review.

- [ ] **Step 1: Record explicit approval**

Add the approved plan path and approval statement to `TASK.md`. Stop if the user has not approved this exact plan.

- [ ] **Step 2: Capture the implementation base**

Run:

```bash
git rev-parse HEAD
git status --short --branch
```

Record the SHA in `TASK.md`. Expected status before implementation: branch `codex/teacher-assignment-attempt-lifecycle`, the already-approved `CONTEXT.md` glossary edit, this plan file, and no unexplained application changes.

---

### Task 1: Add atomic owned receipt operations

**Files:**

- Create: `supabase/migrations/202608120001_atomic_teacher_attempt_review.sql`
- Create: `tests/schema/atomic-teacher-attempt-review-schema.test.ts`
- Modify: `src/lib/db/types.ts`

**Interfaces:**

- Consumes: existing attempts, assigned homework, assignments, classes, teacher profiles, review receipts, and `mark_submission_reviewed`.
- Produces: `mark_submission_viewed` and `reopen_submission_review`, both owner-scoped and service-role-only.

- [ ] **Step 1: Write the failing schema contract**

Create `tests/schema/atomic-teacher-attempt-review-schema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/202608120001_atomic_teacher_attempt_review.sql",
  "utf8",
).toLowerCase().replace(/\s+/g, " ");

describe("atomic teacher attempt review migration", () => {
  it("adds owner-scoped atomic receipt operations", () => {
    expect(sql).toContain("create function public.mark_submission_viewed");
    expect(sql).toContain("create function public.reopen_submission_review");
    expect(sql.match(/c\.teacher_id = p_teacher_id/g)).toHaveLength(2);
    expect(sql.match(/for update of at/g)).toHaveLength(2);
    expect(sql).toContain("on conflict (teacher_id, attempt_id) do nothing");
    expect(sql).toContain("set reviewed_at = null");
  });

  it("keeps both functions service-role-only", () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public/g)).toHaveLength(2);
    expect(sql.match(/revoke all on function public\./g)).toHaveLength(2);
    expect(sql.match(/grant execute on function public\./g)).toHaveLength(2);
    expect(sql.match(/to service_role/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the schema test and verify red**

Run:

```bash
npm test -- --run tests/schema/atomic-teacher-attempt-review-schema.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/202608120001_atomic_teacher_attempt_review.sql` with this implementation:

```sql
create function public.mark_submission_viewed(
  p_teacher_id uuid,
  p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_id uuid;
  v_now timestamptz := now();
begin
  select at.id
  into v_attempt_id
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and c.teacher_id = p_teacher_id
  for update of at;

  if not found then return 'not_found'; end if;

  insert into public.submission_review_receipts (
    teacher_id, attempt_id, first_viewed_at
  ) values (p_teacher_id, v_attempt_id, v_now)
  on conflict (teacher_id, attempt_id) do nothing;

  return 'ok';
end;
$$;

create function public.reopen_submission_review(
  p_teacher_id uuid,
  p_attempt_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_id uuid;
begin
  select at.id
  into v_attempt_id
  from public.attempts at
  join public.assignment_students ast on ast.id = at.assignment_student_id
  join public.assignments a on a.id = ast.assignment_id
  join public.classes c on c.id = a.class_id
  where at.id = p_attempt_id
    and c.teacher_id = p_teacher_id
  for update of at;

  if not found then return 'not_found'; end if;

  update public.submission_review_receipts
  set reviewed_at = null
  where teacher_id = p_teacher_id
    and attempt_id = v_attempt_id;

  return 'ok';
end;
$$;

revoke all on function public.mark_submission_viewed(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_submission_viewed(uuid, uuid)
  to service_role;

revoke all on function public.reopen_submission_review(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reopen_submission_review(uuid, uuid)
  to service_role;
```

Do not grant either function to `authenticated`. Do not change receipt RLS or table privileges in this ticket.

- [ ] **Step 4: Extend generated database types**

Add these declarations beside `mark_submission_reviewed` in `src/lib/db/types.ts`:

```ts
mark_submission_viewed: {
  Args: { p_teacher_id: string; p_attempt_id: string };
  Returns: "ok" | "not_found";
};
reopen_submission_review: {
  Args: { p_teacher_id: string; p_attempt_id: string };
  Returns: "ok" | "not_found";
};
```

- [ ] **Step 5: Apply and lint only the local database**

Run:

```bash
supabase start
supabase migration up --local
supabase db lint --local --schema public --level error --fail-on error
```

Expected: migration applies and database lint exits 0. Stop if the local stack is unavailable; do not substitute a remote environment.

- [ ] **Step 6: Run the green database checks and commit the seam**

Run the schema test, then commit only Task 1 files:

```bash
npm test -- --run tests/schema/atomic-teacher-attempt-review-schema.test.ts
git add supabase/migrations/202608120001_atomic_teacher_attempt_review.sql tests/schema/atomic-teacher-attempt-review-schema.test.ts src/lib/db/types.ts
git commit -m "feat: add atomic teacher attempt review RPCs"
```

Expected: schema test passes. Task 2 adds the module-level integration test after the database seam is green.

---

### Task 2: Deepen the attempt-review module interface

**Files:**

- Create: `tests/server/teacher-attempt-review.test.ts`
- Create: `tests/server/teacher-attempt-review.integration.test.ts`
- Modify: `src/server/teacher/assignment-operations.ts`

**Interfaces:**

- Consumes: the two Task 1 RPCs and existing `mark_submission_reviewed`.
- Produces: `TeacherMutationResult`, `AttemptReviewAction`, and `changeAttemptReview(...)` exactly as declared above.

- [ ] **Step 1: Write fast failing module tests**

Create `tests/server/teacher-attempt-review.test.ts`. Mock `createSupabaseServiceClient` with one `rpc` spy. Cover these observable mappings:

```ts
it.each([
  ["mark_viewed", "mark_submission_viewed"],
  ["mark_reviewed", "mark_submission_reviewed"],
  ["reopen_review", "reopen_submission_review"],
] as const)("handles %s through the owned database operation", async (action, rpcName) => {
  rpc.mockResolvedValueOnce({ data: "ok", error: null });
  await expect(changeAttemptReview({
    teacherId: "teacher-1",
    attemptId: "attempt-1",
    action,
  })).resolves.toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith(rpcName, {
    p_teacher_id: "teacher-1",
    p_attempt_id: "attempt-1",
  });
});
```

Add cases asserting `not_found` maps to `{ ok: false, error: "not_found" }`, `invalid_status` maps to `not_allowed`, an RPC error maps to `failed`, an unexpected string maps to `failed`, and an invalid runtime action cast performs no RPC and returns `not_allowed`.

Also create `tests/server/teacher-attempt-review.integration.test.ts` using the local-only URL gate and inert realtime transport from `tests/server/pronunciation-reprocessing.integration.test.ts`.

The fixture must create two authenticated teachers, one class owned by the first teacher, one student, one mission, one assignment, one completed assigned-homework row, and one completed latest homework attempt. Use `randomBytes(12).toString("hex")` in emails, join code, and names. Clean up both teacher profiles and auth users in `finally`; cascading foreign keys remove the remaining fixture.

Exercise `changeAttemptReview(...)` for owned and cross-teacher `mark_viewed`, save the first receipt timestamp, call it again, and assert the timestamp is unchanged. Call owned `mark_reviewed` and assert `reviewed_at` is non-null. Call cross-teacher `reopen_review` and assert `not_found` with the timestamp unchanged, then call owned `reopen_review` and assert `reviewed_at` is null. Assert the other teacher never receives a receipt.

Create anon and signed-in authenticated clients with the local anon key and assert both new RPCs return permission errors:

```ts
for (const client of [anon, authenticatedOwner]) {
  expect((await client.rpc("mark_submission_viewed", {
    p_teacher_id: fixture.ownerId,
    p_attempt_id: fixture.attemptId,
  })).error).not.toBeNull();
  expect((await client.rpc("reopen_submission_review", {
    p_teacher_id: fixture.ownerId,
    p_attempt_id: fixture.attemptId,
  })).error).not.toBeNull();
}
```

Use a 30-second timeout and `context.skip()` only when the URL is not localhost or local keys are absent. The dedicated command below must provide local credentials so the skip branch does not execute.

- [ ] **Step 2: Verify the module tests are red**

Run the fast test, then start local Supabase and run the integration test with local credentials:

```bash
npm test -- --run tests/server/teacher-attempt-review.test.ts
supabase start
eval "$(supabase status -o env)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 1 ;; esac
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SECRET_KEY"
npm test -- --run tests/server/teacher-attempt-review.integration.test.ts
```

Expected: both commands FAIL because `changeAttemptReview` does not exist. A skipped integration test is not valid red evidence.

- [ ] **Step 3: Implement the smallest deep interface**

In `src/server/teacher/assignment-operations.ts`, add the public types and function:

```ts
export type TeacherMutationResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_allowed" | "failed" };

export type AttemptReviewAction =
  | "mark_viewed"
  | "mark_reviewed"
  | "reopen_review";

const attemptReviewRpc = {
  mark_viewed: "mark_submission_viewed",
  mark_reviewed: "mark_submission_reviewed",
  reopen_review: "reopen_submission_review",
} as const;

export async function changeAttemptReview(input: {
  teacherId: string;
  attemptId: string;
  action: AttemptReviewAction;
}): Promise<TeacherMutationResult> {
  const rpcName = attemptReviewRpc[input.action];
  if (!rpcName) return { ok: false, error: "not_allowed" };

  const result = await createSupabaseServiceClient().rpc(rpcName, {
    p_teacher_id: input.teacherId,
    p_attempt_id: input.attemptId,
  });

  if (result.error) return { ok: false, error: "failed" };
  if (result.data === "ok") return { ok: true };
  if (result.data === "not_found") return { ok: false, error: "not_found" };
  if (result.data === "invalid_status") return { ok: false, error: "not_allowed" };
  return { ok: false, error: "failed" };
}
```

Keep the three old review exports temporarily until Task 3 migrates every caller in the same ticket. Do not change read operations or assigned-homework mutations.

- [ ] **Step 4: Run the module and real database tests**

Run:

```bash
npm test -- --run tests/server/teacher-attempt-review.test.ts
eval "$(supabase status -o env)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 1 ;; esac
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SECRET_KEY"
npm test -- --run tests/server/teacher-attempt-review.integration.test.ts
```

Expected: both files pass, and the integration test reports zero skipped tests.

- [ ] **Step 5: Commit the deep interface**

```bash
git add src/server/teacher/assignment-operations.ts tests/server/teacher-attempt-review.test.ts tests/server/teacher-attempt-review.integration.test.ts
git commit -m "refactor: deepen teacher attempt review operations"
```

---

### Task 3: Migrate callers and contract the old interface

**Files:**

- Modify: `src/app/teacher/evidence/[attemptId]/page.tsx`
- Modify: `src/app/teacher/evidence/[attemptId]/actions.ts`
- Modify: `src/app/teacher/assignment-actions.ts`
- Modify: `src/server/teacher/assignment-operations.ts`
- Modify: `tests/server/teacher-review-actions.test.ts`
- Modify: `tests/server/teacher-override.test.ts`
- Modify: `tests/server/pronunciation-reprocess-action.test.ts`

**Interfaces:**

- Consumes: `changeAttemptReview(...)` from Task 2.
- Produces: thin attempt-review callers and no remaining `markSubmissionViewed`, `markSubmissionReviewed`, or `reopenSubmissionReview` exports.

- [ ] **Step 1: Update caller tests first**

In `tests/server/teacher-override.test.ts`, replace the mocked `markSubmissionReviewed` function with `changeAttemptReview` and expect:

```ts
expect(service.changeAttemptReview).toHaveBeenCalledWith({
  teacherId: "teacher-1",
  attemptId: "attempt-1",
  action: "mark_reviewed",
});
```

Keep the existing ownership-query assertion in this legacy assigned-homework override test; ticket #32 removes that caller-side query.

In `tests/server/pronunciation-reprocess-action.test.ts`, expose `changeAttemptReview: vi.fn()` from the assignment-operations mock so the production action module can import it.

In `tests/server/teacher-review-actions.test.ts`, remove the cases that directly test `markSubmissionViewed`, `markSubmissionReviewed`, and `reopenSubmissionReview`; their stronger replacements are the Task 2 unit and integration suites. Retain assigned-homework mutation tests and class-review-policy tests unchanged.

- [ ] **Step 2: Verify caller tests are red**

Run:

```bash
npm test -- --run tests/server/teacher-override.test.ts tests/server/pronunciation-reprocess-action.test.ts tests/server/teacher-review-actions.test.ts
```

Expected: FAIL because production callers still import and invoke the old review functions.

- [ ] **Step 3: Migrate the evidence page and server actions**

In the attempt evidence page, replace the view call with:

```ts
await changeAttemptReview({
  teacherId: profile.id,
  attemptId,
  action: "mark_viewed",
});
```

In the evidence server actions, use:

```ts
return changeAttemptReview({
  teacherId: profile.id,
  attemptId,
  action: "mark_reviewed",
});
```

The temporary legacy `overrideAssignmentStatusAction` must use the same call after it resolves the latest attempt. Do not otherwise refactor that assigned-homework orchestration; ticket #32 owns its removal.

In `src/app/teacher/assignment-actions.ts`, replace reopen review with:

```ts
const result = await changeAttemptReview({
  teacherId: await teacherId(),
  attemptId,
  action: "reopen_review",
});
```

Preserve the existing successful `/teacher` revalidation.

- [ ] **Step 4: Remove the old review mutation exports**

Delete only these functions from `src/server/teacher/assignment-operations.ts`:

```ts
markSubmissionViewed
markSubmissionReviewed
reopenSubmissionReview
```

Do not delete `loadOwnedAttempt`; ticket #32's assigned-homework functions still use it. Do not add compatibility wrappers.

- [ ] **Step 5: Prove the old interface has no callers**

Run:

```bash
rg -n 'markSubmissionViewed|markSubmissionReviewed|reopenSubmissionReview' src tests
```

Expected: no matches. `markSubmissionReviewedAction` and `reopenSubmissionReviewAction` may retain their web-facing names, so use this stricter export/import scan if those names cause substring matches:

```bash
rg -n '\b(markSubmissionViewed|markSubmissionReviewed|reopenSubmissionReview)\b' src/server src/app tests
```

Expected: no old module-symbol imports or calls; action names with the `Action` suffix are allowed.

- [ ] **Step 6: Run focused caller and module checks**

```bash
npm test -- --run tests/server/teacher-attempt-review.test.ts tests/server/teacher-review-actions.test.ts tests/server/teacher-override.test.ts tests/server/pronunciation-reprocess-action.test.ts tests/server/teacher-assignment-operations.test.ts
npm run typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 7: Commit caller migration**

```bash
git add src/app/teacher/evidence/'[attemptId]'/page.tsx src/app/teacher/evidence/'[attemptId]'/actions.ts src/app/teacher/assignment-actions.ts src/server/teacher/assignment-operations.ts tests/server/teacher-review-actions.test.ts tests/server/teacher-override.test.ts tests/server/pronunciation-reprocess-action.test.ts
git commit -m "refactor: route attempt review through one interface"
```

---

### Task 4: Verify ticket #31 and review the diff

**Files:**

- Modify: `TASK.md` (local verification record; do not stage)

**Interfaces:**

- Consumes: Tasks 1–3 and the recorded base SHA.
- Produces: reproducible evidence that ticket #31 is complete without implementing ticket #32.

- [ ] **Step 1: Run the complete focused suite**

```bash
npm test -- --run tests/schema/atomic-teacher-attempt-review-schema.test.ts tests/server/teacher-attempt-review.test.ts tests/server/teacher-attempt-review.integration.test.ts tests/server/teacher-review-actions.test.ts tests/server/teacher-override.test.ts tests/server/pronunciation-reprocess-action.test.ts tests/server/teacher-assignment-operations.test.ts
```

Expected: every file passes. With local Supabase credentials still exported, the integration file reports zero skipped tests.

- [ ] **Step 2: Run database and repository checks**

```bash
supabase db lint --local --schema public --level error --fail-on error
npm run typecheck
npm run lint
npm run build
```

Expected: all four commands exit 0.

- [ ] **Step 3: Review only this ticket's diff**

Using the base SHA recorded in Task 0, run:

```bash
review_base=$(git merge-base main HEAD)
git diff --check "$review_base"..HEAD
git diff --stat "$review_base"..HEAD
git diff "$review_base"..HEAD -- src/server/teacher/assignment-operations.ts src/app/teacher supabase/migrations tests src/lib/db/types.ts
```

Confirm every changed line traces to #31, the new mutation interface has no Supabase-client parameter, both new RPCs prove ownership independently, no old review mutation export remains, and assigned-homework behavior for #32 was not redesigned.

- [ ] **Step 4: Record verification and stop before external actions**

Update `TASK.md` with exact commands and results. Mark ticket #31 locally ready for review, with #32 still blocked until #31 is reviewed and closed. Do not push, create a pull request, close issues, apply remote migrations, deploy, or mutate production without separate explicit approval.

## Self-Review

- Spec coverage: every #31 acceptance criterion maps to Tasks 1–4. Ticket #32 behavior is explicitly deferred.
- Placeholder scan: no unresolved marker or unspecified implementation step remains.
- Type consistency: `changeAttemptReview`, `AttemptReviewAction`, `TeacherMutationResult`, `mark_submission_viewed`, and `reopen_submission_review` use the same names and outcomes throughout.
- Simplicity check: two small RPCs, one function, no new adapter, no generic mutation framework, and no read-side refactor.
