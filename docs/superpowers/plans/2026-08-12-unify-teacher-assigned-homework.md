# Unified Teacher Assigned Homework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete GitHub ticket #32 by routing teacher retry, dismiss, and undo-dismiss requests through one owned `changeAssignedHomework(...)` interface keyed by an assigned-homework ID.

**Architecture:** Deepen the existing `assignment-operations.ts` module identified in `docs/improve-codebase-architecture.md`. The module validates identifiers and intent, proves ownership, loads the assigned-homework state, privately resolves the latest attempt when required, selects an existing atomic RPC, and maps every outcome to `TeacherMutationResult`. Teacher actions authenticate and delegate; UI controls keep their existing navigation and copy.

**Tech Stack:** Next.js App Router server actions and React client components, TypeScript, Zod, Supabase Postgres RPCs, Vitest, and the repository's local-Supabase integration-test pattern.

## Global Constraints

- Governing references: GitHub issues #30 and #32, `docs/improve-codebase-architecture.md`, `PROJECT.md`, `TASK.md`, and `CONTEXT.md`.
- Preserve existing valid teacher behavior and UI copy; add no teacher capability and make no UI redesign.
- Preserve mission snapshots, attempts, turns, transcripts, audio, assignment-status events, RLS, and signed-on-demand audio playback.
- Every service-role mutation must independently prove teacher ownership; the module's preflight read does not replace the RPC's owner check.
- Missing and cross-teacher assigned homework both return `not_found` and perform no write.
- Invalid identifiers and disallowed lifecycle requests return `not_allowed`; database errors and unexpected database results return `failed`.
- Keep Supabase clients, `assignment_students` naming, latest-attempt selection, and database-specific errors out of the public mutation interface.
- Reuse the existing atomic retry, dismiss, and undo-dismiss RPCs. Add no migration, dependency, repository layer, adapter, compatibility wrapper, or generic mutation framework.
- Existing read-only queue, activity, progress, and class-review-policy operations remain unchanged.
- Apply no remote migration, deployment, push, issue mutation, or production action without separate explicit approval.
- The dedicated local-Supabase integration test must run with zero skips before completion.
- Preserve the existing unstaged `CONTEXT.md` edit and both untracked plan files; stage only files named by each implementation task.

---

## File Structure

- Create `tests/server/teacher-assigned-homework.test.ts` — fast public-interface result and action coverage.
- Create `tests/server/teacher-assigned-homework.integration.test.ts` — real ownership, latest-attempt, retry, dismiss, undo, and evidence-preservation coverage.
- Create `tests/server/teacher-assigned-homework-actions.test.ts` — thin server-action validation and delegation coverage.
- Modify `src/server/teacher/assignment-operations.ts` — add `changeAssignedHomework(...)`, then remove the five overlapping assigned-homework mutation exports.
- Modify `src/app/teacher/assignment-actions.ts` — add the single authenticated and validated assigned-homework server action.
- Modify `src/app/teacher/evidence/[attemptId]/actions.ts` — remove caller-side ownership/latest-attempt orchestration and the old retry/dismiss/undo wrappers.
- Delete `src/app/teacher/assignment-students/[assignmentStudentId]/actions.ts` — its two wrappers become obsolete.
- Modify `src/app/teacher/evidence/[attemptId]/page.tsx` — pass the already-loaded assigned-homework ID to controls.
- Modify `src/components/teacher/SubmissionReviewControls.tsx` — use the assigned-homework action for retry, dismiss, and undo.
- Modify `src/components/teacher/AssignmentStudentDismissControls.tsx` — use the same assigned-homework action for no-attempt homework.
- Modify `tests/server/teacher-review-actions.test.ts` — remove old mutation tests now owned by the focused public-interface suite.
- Delete `tests/server/teacher-override.test.ts` — the legacy override action is removed, not preserved as a wrapper.
- Modify `tests/server/pronunciation-reprocess-action.test.ts` — reduce its assignment-operations mock to the production imports that remain.
- Modify `tests/server/teacher-workspace-ui.test.ts` — assert both controls call the unified action while preserving copy and navigation.
- Modify `TASK.md` at approval and verification milestones only; it is local task state and must not be staged.

## Public Interfaces

Add this action vocabulary and interface beside `TeacherMutationResult`:

```ts
export type AssignedHomeworkChange =
  | { action: "request_retry"; reasonNote?: string }
  | { action: "dismiss"; reason?: string }
  | { action: "undo_dismiss" };

export async function changeAssignedHomework(
  input: {
    teacherId: string;
    assignedHomeworkId: string;
  } & AssignedHomeworkChange,
): Promise<TeacherMutationResult>;
```

The server-action seam is:

```ts
export async function changeAssignedHomeworkAction(
  input: { assignedHomeworkId: string } & AssignedHomeworkChange,
): Promise<TeacherMutationResult>;
```

The module privately translates `assignedHomeworkId` to the existing `assignment_students.id`. The existing `changeAttemptReview(...)` interface remains unchanged.

---

### Task 0: Record approval and implementation base

**Files:**

- Modify: `TASK.md` (ignored local state; do not stage)

**Interfaces:**

- Consumes: explicit user approval of this exact plan revision.
- Produces: the immutable base SHA used for ticket-only review.

- [ ] **Step 1: Stop for plan approval**

Do not modify application code until the user approves this plan.

- [ ] **Step 2: Record approval and base**

Run:

```bash
git rev-parse HEAD
git status --short --branch
```

Record the approval date, plan path, and SHA in `TASK.md`. Expected base is the accepted ticket #31 head, including commit `eae2a86b`, with only the existing `CONTEXT.md` and plan-file worktree state.

---

### Task 1: Add the deep assigned-homework interface

**Files:**

- Create: `tests/server/teacher-assigned-homework.test.ts`
- Create: `tests/server/teacher-assigned-homework.integration.test.ts`
- Modify: `src/server/teacher/assignment-operations.ts`

**Interfaces:**

- Consumes: `TeacherMutationResult`, `assertTransitionRequest`, and the existing service-role-only RPCs `request_submission_retry`, `dismiss_assignment_student`, `dismiss_assignment_student_by_id`, `undo_dismiss_assignment_student`, and `undo_dismiss_assignment_student_by_id`.
- Produces: `AssignedHomeworkChange` and `changeAssignedHomework(...)`.

- [ ] **Step 1: Write the focused public-interface tests**

Create `tests/server/teacher-assigned-homework.test.ts`. Mock `createSupabaseServiceClient` with one owned-row result and one RPC result; do not expose a client parameter on the public function. Use valid UUID constants and cover these exact outcomes:

```ts
const teacherId = "00000000-0000-4000-8000-000000000001";
const assignedHomeworkId = "00000000-0000-4000-8000-000000000002";
const attemptId = "00000000-0000-4000-8000-000000000003";

it("resolves the latest attempt internally for retry", async () => {
  ownedRow = {
    id: assignedHomeworkId,
    status: "completed",
    latest_attempt_id: attemptId,
    dismissed_at: null,
  };
  rpc.mockResolvedValueOnce({ data: "ok", error: null });

  await expect(changeAssignedHomework({
    teacherId,
    assignedHomeworkId,
    action: "request_retry",
    reasonNote: "Try once more",
  })).resolves.toEqual({ ok: true });

  expect(rpc).toHaveBeenCalledWith("request_submission_retry", {
    p_teacher_id: teacherId,
    p_attempt_id: attemptId,
    p_reason_note: "Try once more",
  });
});

it.each([
  ["dismiss", "dismiss_assignment_student", { p_reason: "Absent" }],
  ["undo_dismiss", "undo_dismiss_assignment_student", {}],
] as const)("uses the attempt-keyed RPC for %s when an attempt exists", async (action, rpcName, extra) => {
  ownedRow = {
    id: assignedHomeworkId,
    status: "started",
    latest_attempt_id: attemptId,
    dismissed_at: action === "undo_dismiss" ? "2026-08-12T00:00:00Z" : null,
  };
  rpc.mockResolvedValueOnce({ data: "ok", error: null });

  const request = action === "dismiss"
    ? { teacherId, assignedHomeworkId, action, reason: "Absent" }
    : { teacherId, assignedHomeworkId, action };
  await expect(changeAssignedHomework(request)).resolves.toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith(rpcName, {
    p_teacher_id: teacherId,
    p_attempt_id: attemptId,
    ...extra,
  });
});

it.each([
  ["dismiss", "dismiss_assignment_student_by_id", { p_reason: "" }],
  ["undo_dismiss", "undo_dismiss_assignment_student_by_id", {}],
] as const)("uses the assigned-homework-keyed RPC for %s when no attempt exists", async (action, rpcName, extra) => {
  ownedRow = {
    id: assignedHomeworkId,
    status: "assigned",
    latest_attempt_id: null,
    dismissed_at: action === "undo_dismiss" ? "2026-08-12T00:00:00Z" : null,
  };
  rpc.mockResolvedValueOnce({ data: "ok", error: null });

  await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action })).resolves.toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith(rpcName, {
    p_teacher_id: teacherId,
    p_assignment_student_id: assignedHomeworkId,
    ...extra,
  });
});
```

Add these exact result-boundary cases:

```ts
it("returns not_found without an RPC when no owned homework exists", async () => {
  ownedRow = null;
  await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action: "dismiss" }))
    .resolves.toEqual({ ok: false, error: "not_found" });
  expect(rpc).not.toHaveBeenCalled();
});

it.each([
  { teacherId: "bad", assignedHomeworkId, action: "dismiss" as const },
  { teacherId, assignedHomeworkId: "bad", action: "dismiss" as const },
  { teacherId, assignedHomeworkId, action: "bad" as never },
])("rejects invalid input before a query", async (input) => {
  await expect(changeAssignedHomework(input)).resolves.toEqual({ ok: false, error: "not_allowed" });
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it.each([
  [{ status: "completed", latest_attempt_id: null, dismissed_at: null }, "request_retry"],
  [{ status: "assigned", latest_attempt_id: attemptId, dismissed_at: null }, "request_retry"],
  [{ status: "started", latest_attempt_id: attemptId, dismissed_at: "2026-08-12T00:00:00Z" }, "dismiss"],
  [{ status: "started", latest_attempt_id: attemptId, dismissed_at: null }, "undo_dismiss"],
  [{ status: "completed", latest_attempt_id: attemptId, dismissed_at: null }, "dismiss"],
] as const)("rejects disallowed lifecycle state without an RPC", async (row, action) => {
  ownedRow = { id: assignedHomeworkId, ...row };
  await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action } as never))
    .resolves.toEqual({ ok: false, error: "not_allowed" });
  expect(rpc).not.toHaveBeenCalled();
});

it.each([
  [{ data: "not_found", error: null }, { ok: false, error: "not_found" }],
  [{ data: "invalid_status", error: null }, { ok: false, error: "not_allowed" }],
  [{ data: "unexpected", error: null }, { ok: false, error: "failed" }],
  [{ data: null, error: { message: "boom" } }, { ok: false, error: "failed" }],
] as const)("maps the database result", async (rpcResult, expected) => {
  ownedRow = { id: assignedHomeworkId, status: "completed", latest_attempt_id: attemptId, dismissed_at: null };
  rpc.mockResolvedValueOnce(rpcResult);
  await expect(changeAssignedHomework({ teacherId, assignedHomeworkId, action: "request_retry" }))
    .resolves.toEqual(expected);
});
```

- [ ] **Step 2: Write the local-database test before implementation**

Create `tests/server/teacher-assigned-homework.integration.test.ts` with this local-only gate and inert realtime transport, then use the concrete fixture and assertions below:

```ts
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const canRunLocally =
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(url) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

const noRealtime = {
  realtime: {
    transport: class {
      constructor() {}
      close() {}
    } as unknown as never,
  },
};
```

The fixture must create one owner, one other teacher, one owner class, student, mission, and assignment, followed by these three assigned-homework rows:

```ts
// Submitted work eligible for retry, with durable evidence.
const retryHomework = await admin.from("assignment_students").insert({
  assignment_id: assignmentId,
  student_id: studentId,
  status: "completed",
}).select("id").single();
const retryAttempt = await admin.from("attempts").insert({
  assignment_student_id: retryHomework.data!.id,
  status: "completed",
  completed_at: new Date().toISOString(),
}).select("id").single();
const retryTurn = await admin.from("attempt_turns").insert({
  attempt_id: retryAttempt.data!.id,
  turn_order: 1,
  original_transcript: "I like cats.",
  improved_sentence: "I like cats.",
}).select("id").single();
await admin.from("assignment_students").update({
  latest_attempt_id: retryAttempt.data!.id,
} as never).eq("id", retryHomework.data!.id);

// Incomplete work with an attempt.
const attemptedHomework = await admin.from("assignment_students").insert({
  assignment_id: assignmentId,
  student_id: secondStudentId,
  status: "started",
}).select("id").single();
const inProgressAttempt = await admin.from("attempts").insert({
  assignment_student_id: attemptedHomework.data!.id,
  status: "in_progress",
}).select("id").single();
await admin.from("assignment_students").update({
  latest_attempt_id: inProgressAttempt.data!.id,
} as never).eq("id", attemptedHomework.data!.id);

// Incomplete work with no attempt.
const noAttemptHomework = await admin.from("assignment_students").insert({
  assignment_id: assignmentId,
  student_id: thirdStudentId,
  status: "assigned",
}).select("id").single();
```

Use separate students because `(assignment_id, student_id)` is unique. Assert these observable outcomes through `changeAssignedHomework(...)`:

```ts
expect(await changeAssignedHomework({
  teacherId: otherTeacherId,
  assignedHomeworkId: retryHomeworkId,
  action: "request_retry",
})).toEqual({ ok: false, error: "not_found" });

expect(await changeAssignedHomework({
  teacherId: ownerTeacherId,
  assignedHomeworkId: retryHomeworkId,
  action: "request_retry",
  reasonNote: "Please try again",
})).toEqual({ ok: true });

const retryState = await admin.from("assignment_students")
  .select("status, latest_attempt_id")
  .eq("id", retryHomeworkId)
  .single();
expect(retryState.data).toEqual({ status: "needs_retry", latest_attempt_id: null });
expect((await admin.from("attempts").select("id, status").eq("id", retryAttemptId).single()).data)
  .toEqual({ id: retryAttemptId, status: "needs_retry" });
expect((await admin.from("attempt_turns").select("id, original_transcript").eq("id", retryTurnId).single()).data)
  .toEqual({ id: retryTurnId, original_transcript: "I like cats." });

for (const assignedHomeworkId of [attemptedHomeworkId, noAttemptHomeworkId]) {
  expect(await changeAssignedHomework({
    teacherId: ownerTeacherId,
    assignedHomeworkId,
    action: "dismiss",
  })).toEqual({ ok: true });
  const dismissed = await admin.from("assignment_students")
    .select("status, dismissed_at")
    .eq("id", assignedHomeworkId)
    .single();
  expect(dismissed.data?.dismissed_at).not.toBeNull();
  expect(dismissed.data?.status).toBe(assignedHomeworkId === attemptedHomeworkId ? "started" : "assigned");

  expect(await changeAssignedHomework({
    teacherId: ownerTeacherId,
    assignedHomeworkId,
    action: "undo_dismiss",
  })).toEqual({ ok: true });
  expect((await admin.from("assignment_students")
    .select("dismissed_at")
    .eq("id", assignedHomeworkId)
    .single()).data?.dismissed_at).toBeNull();
}
```

Surround the cross-teacher call with these exact state checks, and delete both teacher profiles and auth users in `finally`:

```ts
const eventsBefore = await admin.from("assignment_status_events")
  .select("id", { count: "exact", head: true })
  .eq("assignment_student_id", retryHomeworkId);
const stateBefore = await admin.from("assignment_students")
  .select("status, latest_attempt_id")
  .eq("id", retryHomeworkId)
  .single();

expect(await changeAssignedHomework({
  teacherId: otherTeacherId,
  assignedHomeworkId: retryHomeworkId,
  action: "request_retry",
})).toEqual({ ok: false, error: "not_found" });

const eventsAfter = await admin.from("assignment_status_events")
  .select("id", { count: "exact", head: true })
  .eq("assignment_student_id", retryHomeworkId);
const stateAfter = await admin.from("assignment_students")
  .select("status, latest_attempt_id")
  .eq("id", retryHomeworkId)
  .single();
expect(eventsAfter.count).toBe(eventsBefore.count);
expect(stateAfter.data).toEqual(stateBefore.data);
```

- [ ] **Step 3: Run both tests and verify red**

Run:

```bash
npm test -- --run tests/server/teacher-assigned-homework.test.ts
eval "$(supabase status -o env)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 1 ;; esac
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SECRET_KEY"
npm test -- --run tests/server/teacher-assigned-homework.integration.test.ts
```

Expected: both fail because `changeAssignedHomework` does not exist. A skipped integration test is not valid red evidence.

- [ ] **Step 4: Implement the minimum module behavior**

In `src/server/teacher/assignment-operations.ts`, keep `loadOwnedAssignmentStudent` private and add the public types above. Implement `changeAssignedHomework(...)` with this exact control flow:

```ts
const incompleteStatuses = new Set(["assigned", "started", "missed"]);

export async function changeAssignedHomework(
  input: {
    teacherId: string;
    assignedHomeworkId: string;
  } & AssignedHomeworkChange,
): Promise<TeacherMutationResult> {
  if (
    !uuidSchema.safeParse(input.teacherId).success ||
    !uuidSchema.safeParse(input.assignedHomeworkId).success ||
    !["request_retry", "dismiss", "undo_dismiss"].includes(input.action)
  ) {
    return { ok: false, error: "not_allowed" };
  }

  const client = createSupabaseServiceClient();
  let row: RawRow | null;
  try {
    row = await loadOwnedAssignmentStudent({
      teacherId: input.teacherId,
      assignmentStudentId: input.assignedHomeworkId,
    }, client);
  } catch {
    return { ok: false, error: "failed" };
  }
  if (!row) return { ok: false, error: "not_found" };

  const status = row.status as AssignmentStudentStatus;
  const latestAttemptId = typeof row.latest_attempt_id === "string"
    ? row.latest_attempt_id
    : null;
  let result;

  if (input.action === "request_retry") {
    if (!latestAttemptId) return { ok: false, error: "not_allowed" };
    try {
      assertTransitionRequest({
        previousStatus: status,
        nextStatus: "needs_retry",
        actorType: "teacher",
        actorId: input.teacherId,
        reasonCode: "teacher_requested_retry",
        occurredAt: new Date().toISOString(),
      });
    } catch {
      return { ok: false, error: "not_allowed" };
    }
    result = await client.rpc("request_submission_retry", {
      p_teacher_id: input.teacherId,
      p_attempt_id: latestAttemptId,
      p_reason_note: input.reasonNote ?? "",
    });
  } else {
    const isIncomplete = incompleteStatuses.has(status);
    const isDismissed = row.dismissed_at !== null;
    if (!isIncomplete || (input.action === "dismiss" ? isDismissed : !isDismissed)) {
      return { ok: false, error: "not_allowed" };
    }

    if (input.action === "dismiss") {
      result = latestAttemptId
        ? await client.rpc("dismiss_assignment_student", {
            p_teacher_id: input.teacherId,
            p_attempt_id: latestAttemptId,
            p_reason: input.reason ?? "",
          })
        : await client.rpc("dismiss_assignment_student_by_id", {
            p_teacher_id: input.teacherId,
            p_assignment_student_id: input.assignedHomeworkId,
            p_reason: input.reason ?? "",
          });
    } else {
      result = latestAttemptId
        ? await client.rpc("undo_dismiss_assignment_student", {
            p_teacher_id: input.teacherId,
            p_attempt_id: latestAttemptId,
          })
        : await client.rpc("undo_dismiss_assignment_student_by_id", {
            p_teacher_id: input.teacherId,
            p_assignment_student_id: input.assignedHomeworkId,
          });
    }
  }

  if (result.error) return { ok: false, error: "failed" };
  if (result.data === "ok") return { ok: true };
  if (result.data === "not_found") return { ok: false, error: "not_found" };
  if (result.data === "invalid_status") return { ok: false, error: "not_allowed" };
  return { ok: false, error: "failed" };
}
```

Do not change any existing read function or `changeAttemptReview(...)`. Keep the old assigned-homework exports only until Task 2 migrates every caller.

- [ ] **Step 5: Run green checks and commit**

Run both Task 1 tests again with local credentials still exported. Expected: both pass, and the integration test reports zero skips.

```bash
git add src/server/teacher/assignment-operations.ts tests/server/teacher-assigned-homework.test.ts tests/server/teacher-assigned-homework.integration.test.ts
git commit -m "refactor: deepen assigned homework operations"
```

---

### Task 2: Migrate callers and remove the shallow interface

**Files:**

- Create: `tests/server/teacher-assigned-homework-actions.test.ts`
- Modify: `src/app/teacher/assignment-actions.ts`
- Modify: `src/app/teacher/evidence/[attemptId]/actions.ts`
- Delete: `src/app/teacher/assignment-students/[assignmentStudentId]/actions.ts`
- Modify: `src/app/teacher/evidence/[attemptId]/page.tsx`
- Modify: `src/components/teacher/SubmissionReviewControls.tsx`
- Modify: `src/components/teacher/AssignmentStudentDismissControls.tsx`
- Modify: `src/server/teacher/assignment-operations.ts`
- Modify: `tests/server/teacher-review-actions.test.ts`
- Delete: `tests/server/teacher-override.test.ts`
- Modify: `tests/server/pronunciation-reprocess-action.test.ts`
- Modify: `tests/server/teacher-workspace-ui.test.ts`

**Interfaces:**

- Consumes: `changeAssignedHomework(...)` and `AssignedHomeworkChange` from Task 1.
- Produces: `changeAssignedHomeworkAction(...)`, two thin UI callers, and no old assigned-homework mutation export or caller-side Supabase orchestration.

- [ ] **Step 1: Write the server-action contract first**

Create `tests/server/teacher-assigned-homework-actions.test.ts`. Mock `requireTeacherProfile` and `changeAssignedHomework`, then assert:

```ts
it("passes authenticated teacher intent to the deep module", async () => {
  changeAssignedHomework.mockResolvedValue({ ok: true });
  await expect(changeAssignedHomeworkAction({
    assignedHomeworkId: "00000000-0000-4000-8000-000000000002",
    action: "dismiss",
    reason: "Absent",
  })).resolves.toEqual({ ok: true });

  expect(changeAssignedHomework).toHaveBeenCalledWith({
    teacherId: "00000000-0000-4000-8000-000000000001",
    assignedHomeworkId: "00000000-0000-4000-8000-000000000002",
    action: "dismiss",
    reason: "Absent",
  });
});

it.each([
  { assignedHomeworkId: "bad", action: "dismiss" },
  { assignedHomeworkId: "00000000-0000-4000-8000-000000000002", action: "bad" },
])("rejects malformed client input before authentication or mutation", async (input) => {
  await expect(changeAssignedHomeworkAction(input as never))
    .resolves.toEqual({ ok: false, error: "not_allowed" });
  expect(requireTeacherProfile).not.toHaveBeenCalled();
  expect(changeAssignedHomework).not.toHaveBeenCalled();
});
```

Update `tests/server/teacher-workspace-ui.test.ts` so both control suites expect `changeAssignedHomeworkAction`; preserve all existing copy, error handling, and navigation assertions. Update the pronunciation action mock to expose only `changeAttemptReview` from this module.

- [ ] **Step 2: Run caller tests and verify red**

```bash
npm test -- --run tests/server/teacher-assigned-homework-actions.test.ts tests/server/teacher-workspace-ui.test.ts tests/server/pronunciation-reprocess-action.test.ts
```

Expected: fail because the new server action and control calls do not exist yet.

- [ ] **Step 3: Add the one server action**

In `src/app/teacher/assignment-actions.ts`, import Zod, `AssignedHomeworkChange`, `TeacherMutationResult`, and `changeAssignedHomework`. Add a private discriminated-union schema for the three actions and implement:

```ts
const assignedHomeworkChangeSchema = z.discriminatedUnion("action", [
  z.object({ assignedHomeworkId: z.string().uuid(), action: z.literal("request_retry"), reasonNote: z.string().optional() }),
  z.object({ assignedHomeworkId: z.string().uuid(), action: z.literal("dismiss"), reason: z.string().optional() }),
  z.object({ assignedHomeworkId: z.string().uuid(), action: z.literal("undo_dismiss") }),
]);

export async function changeAssignedHomeworkAction(
  input: { assignedHomeworkId: string } & AssignedHomeworkChange,
): Promise<TeacherMutationResult> {
  const parsed = assignedHomeworkChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_allowed" };
  return changeAssignedHomework({ teacherId: await teacherId(), ...parsed.data });
}
```

Keep the existing reopen-review and class-review-policy actions unchanged.

- [ ] **Step 4: Migrate both UI paths**

In `SubmissionReviewControls`, add an `assignedHomeworkId: string` prop. Keep `attemptId` only for mark-reviewed. Replace retry, dismiss, and undo calls with:

```ts
changeAssignedHomeworkAction({ assignedHomeworkId, action: "dismiss" })
changeAssignedHomeworkAction({ assignedHomeworkId, action: "undo_dismiss" })
changeAssignedHomeworkAction({
  assignedHomeworkId,
  action: "request_retry",
  reasonNote: note.trim() || undefined,
})
```

In the evidence page, pass:

```tsx
assignedHomeworkId={evidence.assignmentStudentId}
```

In `AssignmentStudentDismissControls`, import the same action and replace its two calls with:

```ts
changeAssignedHomeworkAction({ assignedHomeworkId: assignmentStudentId, action: "dismiss" })
changeAssignedHomeworkAction({ assignedHomeworkId: assignmentStudentId, action: "undo_dismiss" })
```

Do not rename the database-backed route parameter or evidence-field names in this ticket; the product-language boundary is the public mutation interface.

- [ ] **Step 5: Delete the legacy orchestration and wrappers**

From `src/app/teacher/evidence/[attemptId]/actions.ts`, delete `OverrideAssignmentStatusInput`, `OverrideAssignmentStatusResult`, `overrideAssignmentStatusAction`, `requestSubmissionRetryAction`, `dismissAssignmentStudentAction`, and `undoDismissAction`. Remove the Supabase-client import. Keep pronunciation, signed-audio, and mark-reviewed actions unchanged.

Delete `src/app/teacher/assignment-students/[assignmentStudentId]/actions.ts` and `tests/server/teacher-override.test.ts`.

From `src/server/teacher/assignment-operations.ts`, delete these five exports after the callers are migrated:

```ts
dismissAssignmentStudent
undoDismiss
dismissAssignmentStudentById
undoDismissByAssignmentStudentId
requestSubmissionRetry
```

Keep the existing RPCs and generated database types because `changeAssignedHomework(...)` uses them. Do not add compatibility wrappers.

In `tests/server/teacher-review-actions.test.ts`, remove the old assigned-homework mutation tests and their imports; retain assignment-read and class-review-policy coverage.

- [ ] **Step 6: Prove the shallow interface is gone**

Run:

```bash
rg -n '\b(dismissAssignmentStudent|undoDismiss|dismissAssignmentStudentById|undoDismissByAssignmentStudentId|requestSubmissionRetry|overrideAssignmentStatusAction)\b' src tests
rg -n 'createSupabaseServiceClient|latest_attempt_id|assignments\.classes\.teacher_id' src/app/teacher
```

Expected: the first command has no matches. The second has no assigned-homework mutation orchestration; unrelated teacher operations may still match and must be inspected rather than changed.

- [ ] **Step 7: Run focused caller checks and commit**

```bash
npm test -- --run tests/server/teacher-assigned-homework-actions.test.ts tests/server/teacher-assigned-homework.test.ts tests/server/teacher-review-actions.test.ts tests/server/teacher-workspace-ui.test.ts tests/server/pronunciation-reprocess-action.test.ts tests/server/teacher-attempt-review.test.ts
npm run typecheck
```

Expected: all focused tests and typecheck pass.

```bash
git add src/app/teacher/assignment-actions.ts src/app/teacher/evidence/'[attemptId]'/actions.ts src/app/teacher/evidence/'[attemptId]'/page.tsx src/app/teacher/assignment-students/'[assignmentStudentId]'/actions.ts src/components/teacher/SubmissionReviewControls.tsx src/components/teacher/AssignmentStudentDismissControls.tsx src/server/teacher/assignment-operations.ts tests/server/teacher-assigned-homework-actions.test.ts tests/server/teacher-review-actions.test.ts tests/server/teacher-override.test.ts tests/server/pronunciation-reprocess-action.test.ts tests/server/teacher-workspace-ui.test.ts
git commit -m "refactor: route assigned homework through one interface"
```

---

### Task 3: Verify ticket #32 and review only its diff

**Files:**

- Modify: `TASK.md` (ignored local verification record; do not stage)

**Interfaces:**

- Consumes: Tasks 1–2 and the base SHA recorded in Task 0.
- Produces: reproducible completion evidence and a review-ready local ticket.

- [ ] **Step 1: Run the full focused lifecycle suite**

With local Supabase credentials still exported, run:

```bash
npm test -- --run tests/server/teacher-assigned-homework.test.ts tests/server/teacher-assigned-homework.integration.test.ts tests/server/teacher-assigned-homework-actions.test.ts tests/server/teacher-attempt-review.test.ts tests/server/teacher-attempt-review.integration.test.ts tests/server/teacher-review-actions.test.ts tests/server/teacher-assignment-operations.test.ts tests/server/teacher-workspace-ui.test.ts tests/server/pronunciation-reprocess-action.test.ts tests/schema/dismiss-assignment-student-rpc-schema.test.ts tests/schema/dismiss-assignment-student-by-id-rpc-schema.test.ts tests/schema/harden-assignment-student-dismiss-rpc-schema.test.ts
```

Expected: every test file passes, both integration files report zero skipped tests, and there is no legacy override test.

- [ ] **Step 2: Run proportional repository checks**

```bash
supabase db lint --local --schema public --level error --fail-on error
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0. Record any pre-existing warning separately; do not claim it was fixed.

- [ ] **Step 3: Review from the recorded ticket base**

```bash
git diff --stat "$TICKET_32_BASE"..HEAD
git diff "$TICKET_32_BASE"..HEAD -- src/server/teacher/assignment-operations.ts src/app/teacher src/components/teacher tests/server
```

Confirm that every changed line traces to #32; `changeAssignedHomework(...)` has no client parameter; invalid IDs perform no query; cross-teacher targets perform no write; existing RPCs recheck ownership atomically; retry preserves the old attempt and turn; dismissal changes only queue metadata; no shallow export or legacy override remains; and read-only operations are unchanged.

- [ ] **Step 4: Record evidence and stop before external actions**

Update `TASK.md` with exact commands and results. Mark ticket #32 locally ready for review. Do not push, create a pull request, close #32 or #30, deploy, or mutate production without separate explicit approval.

## Self-Review

- Spec coverage: Tasks 1–3 cover every #32 acceptance criterion and retain the two-interface design from #30.
- Placeholder scan: no TBD, TODO, generic error-handling instruction, or unnamed test remains.
- Type consistency: `AssignedHomeworkChange`, `assignedHomeworkId`, `changeAssignedHomework`, `changeAssignedHomeworkAction`, and `TeacherMutationResult` match across module, action, controls, and tests.
- Simplicity check: one new function and one server action reuse five installed RPCs; no migration, adapter, repository layer, or compatibility wrapper is added.
