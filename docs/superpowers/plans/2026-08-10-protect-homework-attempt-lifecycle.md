# Protect Homework Attempt Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a complete interpreted mission snapshot before the live homework page loads or start, resume, and completion operations can change state.

**Architecture:** Reuse `interpretMissionSnapshot` at both live boundaries. Add one private mission-flow helper that loads an assignment snapshot by the ID from the already owned assignment-student row and returns only a complete snapshot. Keep the existing completion RPC as the atomic, ownership-proving mutation boundary.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Zod through the existing interpreter, and Vitest.

## Global Constraints

- Issue #22 changes only the live homework page and the start, resume, and completion lifecycle.
- Invalid and legacy mission snapshots return the existing `not_found` service result or redirect to `/student/home`.
- Interpret the snapshot before attempt reads, attempt inserts, assignment-student updates, audit inserts, completion RPC calls, evaluator warm-up, or page rendering.
- Preserve preset and conversation behavior for complete snapshots.
- Remove the `requiredTurns ?? 3` resume fallback. Use only the complete interpreted snapshot value.
- Keep `complete_student_attempt` unchanged. It remains the atomic, service-role-only completion mutation and independently proves ownership.
- Keep every existing student ownership filter, cancellation check, status transition, audit event, and idempotency guard.
- Add no database migration, dependency, new result variant, test-only interface, or unrelated refactor.
- Preserve the completed Issue #21 interpreter and its tests.
- Unfiltered lint currently scans ignored generated artifacts under `.ua/`, `.worktrees/`, and `supabase/.temp/`. Run it and record that result, then run source lint with those confirmed ignored paths excluded.

## File Structure

- Modify `src/server/student-access/mission-flow.ts` to require a complete snapshot before start, resume, or completion.
- Modify `src/server/student-access/mission-flow.test.ts` to check public service results and prove that invalid data causes no mutation.
- Modify `tests/server/mark-missed-assignments.test.ts` so its existing resume fixture supplies a complete mission snapshot.
- Modify `src/app/student/missions/[assignmentStudentId]/page.tsx` to load only the interpreter's complete result.
- Modify `tests/server/student-mission-page.test.ts` to check the live page boundary.
- Update local `TASK.md` at approval and verification milestones. Do not stage this ignored file.

---

### Task 0: Confirm Plan Approval and Capture the Review Base

**Files:**

- Modify: `TASK.md` (local and ignored; do not stage it)

- [ ] **Step 1: Confirm approval of this tracked plan revision**

Record the owner's explicit approval and the approved plan commit in `TASK.md`. Stop if approval is absent or names an older revision.

- [ ] **Step 2: Capture the implementation base**

Run:

```bash
git rev-parse HEAD
git --no-optional-locks status --short --branch
```

Record the commit as the Issue #22 review base in `TASK.md`. Expected: the current branch is `codex/deepen-mission-snapshot-interpretation`, and no tracked working-tree change overlaps the five implementation files.

---

### Task 1: Protect Start, Resume, and Completion

**Files:**

- Modify: `src/server/student-access/mission-flow.ts`
- Modify: `src/server/student-access/mission-flow.test.ts`
- Modify: `tests/server/mark-missed-assignments.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown)` from `src/domain/mission/mission-snapshot.ts`.
- Preserves: `startOrResumeAttempt(input): Promise<StartOrResumeResult>`.
- Preserves: `completeAttempt(input): Promise<CompleteAttemptResult>`.
- Produces no new public interface.

- [ ] **Step 1: Extend the mission-flow mock and write failing boundary tests**

In `src/server/student-access/mission-flow.test.ts`, add these fixtures after `Operation`:

```ts
const missionId = "11111111-1111-4111-8111-111111111111";

const completeTurn = {
  prompt: "What do you like doing after school?",
  targetExample: "I like playing soccer.",
  hintLadder: {
    tier1: "I like ___ing.",
    tier2: "play, soccer, like",
    tier3: "I like playing soccer.",
  },
};

function makeCompleteSnapshot(conversationMode = false) {
  return {
    missionId,
    title: "After-school likes",
    targetPattern: "I like ___ing.",
    level: "elementary",
    requiredTurns: 5,
    characterId: "default-buddy",
    conversationMode,
    turns: Array.from(
      { length: conversationMode ? 1 : 5 },
      (_, index) => ({ ...completeTurn, turnOrder: index + 1 }),
    ),
  };
}

const legacySnapshot = {
  missionId,
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [
    {
      order: 1,
      prompt: "What are you going to do this weekend?",
      targetExample: "I am going to play soccer.",
    },
  ],
};
```

Extend the `createMockSupabase` option type with these fields:

```ts
  assignmentStatus?: "assigned" | "started";
  latestAttemptId?: string | null;
  missionSnapshot?: unknown;
  attemptTurns?: Array<{
    turn_order: number;
    original_transcript: string;
    repeat_transcript: string;
    repeat_accepted: boolean;
    evaluation: null;
  }>;
  rpcData?: string;
```

In the assignment-student result, replace the fixed status, attempt ID, and relation with:

```ts
                    status: options.assignmentStatus ?? "started",
                    latest_attempt_id:
                      "latestAttemptId" in options
                        ? options.latestAttemptId
                        : "attempt-1",
                    attempt_count: 1,
                    highest_hint_level: 0,
                    assignments: { canceled_at: null },
```

Add this `maybeSingle` branch before the default result:

```ts
        if (table === "assignments") {
          return {
            data: {
              mission_snapshot:
                "missionSnapshot" in options
                  ? options.missionSnapshot
                  : makeCompleteSnapshot(),
            },
            error: null,
          };
        }
```

Change the query's `then` response so an awaited attempt-turn select returns the configured turns:

```ts
        const result =
          operation.action === "select" && table === "attempt_turns"
            ? { data: options.attemptTurns ?? [], error: null }
            : { error: options.updateError ?? null };
        return Promise.resolve(result).then(
          onFulfilled ?? undefined,
          onRejected ?? undefined,
        );
```

Add the RPC spy to the mock return value:

```ts
    rpc: vi.fn(async () => ({ data: options.rpcData ?? "ok", error: null })),
```

Then add these tests at the end of `src/server/student-access/mission-flow.test.ts`:

```ts
describe("mission snapshot lifecycle boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
  });

  it("rejects an invalid snapshot before a fresh attempt mutation", async () => {
    mockSupabase = createMockSupabase({
      assignmentStatus: "assigned",
      latestAttemptId: null,
      missionSnapshot: { requiredTurns: 5 },
    });
    const { startOrResumeAttempt } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      startOrResumeAttempt({
        studentId: "student-1",
        assignmentStudentId: "as-1",
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
    expect(
      mockSupabase.operations.filter((operation) => operation.action !== "select"),
    ).toHaveLength(0);
  });

  it.each([
    ["legacy", legacySnapshot],
    ["invalid without requiredTurns", { title: "Broken snapshot" }],
  ])(
    "rejects %s data before resume reads or mutations",
    async (_label, missionSnapshot) => {
      mockSupabase = createMockSupabase({ missionSnapshot });
      const { startOrResumeAttempt } = await import(
        "@/server/student-access/mission-flow"
      );

      await expect(
        startOrResumeAttempt({
          studentId: "student-1",
          assignmentStudentId: "as-1",
        }),
      ).resolves.toEqual({ ok: false, error: "not_found" });
      expect(
        mockSupabase.operations.some(
          (operation) => operation.table === "attempts",
        ),
      ).toBe(false);
    },
  );

  it.each([false, true])(
    "uses complete snapshot requiredTurns when conversationMode is %s",
    async (conversationMode) => {
      mockSupabase = createMockSupabase({
        missionSnapshot: makeCompleteSnapshot(conversationMode),
        attemptTurns: Array.from({ length: 4 }, (_, index) => ({
          turn_order: index + 1,
          original_transcript: "I like playing soccer.",
          repeat_transcript: "I like playing soccer after school.",
          repeat_accepted: true,
          evaluation: null,
        })),
      });
      const { startOrResumeAttempt } = await import(
        "@/server/student-access/mission-flow"
      );

      await expect(
        startOrResumeAttempt({
          studentId: "student-1",
          assignmentStudentId: "as-1",
        }),
      ).resolves.toEqual({
        ok: true,
        attemptId: "attempt-1",
        isResume: true,
        resumeTurnOrder: 5,
      });
    },
  );

  it.each([legacySnapshot, { requiredTurns: 5 }])(
    "rejects unsupported completion before the RPC",
    async (missionSnapshot) => {
      mockSupabase = createMockSupabase({ missionSnapshot });
      const { completeAttempt } = await import(
        "@/server/student-access/mission-flow"
      );

      await expect(
        completeAttempt({
          studentId: "student-1",
          assignmentStudentId: "as-1",
          attemptId: "attempt-1",
        }),
      ).resolves.toEqual({ ok: false, error: "not_found" });
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    },
  );

  it("keeps complete-snapshot completion in the atomic RPC", async () => {
    const { completeAttempt } = await import(
      "@/server/student-access/mission-flow"
    );

    await expect(
      completeAttempt({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "attempt-1",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("complete_student_attempt", {
      p_student_id: "student-1",
      p_assignment_student_id: "as-1",
      p_attempt_id: "attempt-1",
    });
  });
});
```

- [ ] **Step 2: Run the focused service tests and verify red**

Run:

```bash
npm test -- --run src/server/student-access/mission-flow.test.ts tests/server/mark-missed-assignments.test.ts
```

Expected: the new boundary tests fail because start, resume, and completion do not use the interpreter. Existing record and review tests remain green.

- [ ] **Step 3: Add the private complete-snapshot loader**

In `src/server/student-access/mission-flow.ts`, import the interpreter:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

Add this helper after `loadOwnedAttempt`:

```ts
async function loadCompleteMissionSnapshot(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  assignmentId: string,
) {
  const { data, error } = await supabase
    .from("assignments")
    .select("mission_snapshot")
    .eq("id", assignmentId)
    .maybeSingle();

  if (error || !data) return null;
  const result = interpretMissionSnapshot(data.mission_snapshot);
  return result.kind === "complete" ? result.snapshot : null;
}
```

- [ ] **Step 4: Gate start and resume before attempt access**

In `startOrResumeAttempt`, immediately after the owned assignment-student check, add:

```ts
    const snapshot = await loadCompleteMissionSnapshot(
      supabase,
      asRow.assignment_id,
    );
    if (!snapshot) return { ok: false, error: "not_found" };
```

Delete the later assignment query, partial cast, and fallback:

```ts
        const { data: assignment } = await supabase
          .from("assignments")
          .select("mission_snapshot")
          .eq("id", asRow.assignment_id)
          .single();

        const snapshot = assignment?.mission_snapshot as { requiredTurns?: number } | null;
        const requiredTurns = snapshot?.requiredTurns ?? 3;
```

Change the resume calculation to use:

```ts
        const resumeTurnOrder = nextUnfinishedTurnOrder(
          snapshot.requiredTurns,
```

- [ ] **Step 5: Gate completion before the atomic RPC**

In `completeAttempt`, after creating the service client and before `.rpc(...)`, add:

```ts
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow) return { ok: false, error: "not_found" };

    const snapshot = await loadCompleteMissionSnapshot(
      supabase,
      asRow.assignment_id,
    );
    if (!snapshot) return { ok: false, error: "not_found" };
```

Do not change the RPC arguments, result mapping, logs, migration, or result types.

- [ ] **Step 6: Update the existing late-open resume fixture**

In `tests/server/mark-missed-assignments.test.ts`, add this fixture after the `Turn` type:

```ts
const completeMissionSnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "After-school likes",
  targetPattern: "I like ___ing.",
  level: "elementary",
  requiredTurns: 3,
  characterId: "default-buddy",
  turns: Array.from({ length: 3 }, (_, index) => ({
    turnOrder: index + 1,
    prompt: "What do you like doing after school?",
    targetExample: "I like playing soccer.",
    hintLadder: {
      tier1: "I like ___ing.",
      tier2: "play, soccer, like",
      tier3: "I like playing soccer.",
    },
  })),
};
```

Replace the assignment query result with:

```ts
      if (this.table === "assignments") {
        return {
          data: { mission_snapshot: completeMissionSnapshot },
          error: null,
        };
      }
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
npm test -- --run src/server/student-access/mission-flow.test.ts tests/server/mark-missed-assignments.test.ts
npm run typecheck
```

Expected: all focused tests pass with no skips, and typecheck exits with status 0.

- [ ] **Step 8: Commit the service boundary**

Run:

```bash
git add src/server/student-access/mission-flow.ts src/server/student-access/mission-flow.test.ts tests/server/mark-missed-assignments.test.ts
git diff --cached --check
git commit -m "fix: protect homework attempt lifecycle"
```

Expected: the commit contains only the service gate and its focused tests.

---

### Task 2: Protect the Live Homework Page

**Files:**

- Modify: `src/app/student/missions/[assignmentStudentId]/page.tsx`
- Modify: `tests/server/student-mission-page.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown)`.
- Preserves: `MissionPage` redirects unsupported assignments to `/student/home`.
- Preserves: all `MissionFlowShell` properties for complete preset and conversation snapshots.

- [ ] **Step 1: Write the failing page-boundary source check**

Add this test to `tests/server/student-mission-page.test.ts`:

```ts
  it("requires a complete interpreted snapshot before live work", () => {
    expect(pageSource).toContain("interpretMissionSnapshot");
    expect(pageSource).toContain('snapshotResult.kind !== "complete"');
    expect(pageSource).toContain("snapshotResult.snapshot");
    expect(pageSource).not.toContain("missionSnapshotSchema");
    expect(pageSource.indexOf('snapshotResult.kind !== "complete"')).toBeLessThan(
      pageSource.indexOf("after(() => warmEvaluators"),
    );
    expect(pageSource.indexOf('snapshotResult.kind !== "complete"')).toBeLessThan(
      pageSource.indexOf("<MissionFlowShell"),
    );
  });
```

- [ ] **Step 2: Run the focused page test and verify red**

Run:

```bash
npm test -- --run tests/server/student-mission-page.test.ts
```

Expected: FAIL because the page still imports and parses with `missionSnapshotSchema`.

- [ ] **Step 3: Replace the page's direct schema parse**

In `src/app/student/missions/[assignmentStudentId]/page.tsx`, replace the schema import with:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

Replace the `try`/`catch` snapshot parse with:

```ts
  const snapshotResult = interpretMissionSnapshot(assignment.mission_snapshot);
  if (snapshotResult.kind !== "complete") {
    redirect("/student/home");
  }
  const snapshot = snapshotResult.snapshot;
```

Replace the two direct-schema comment lines with:

```ts
// interprets it through the shared mission snapshot contract (Pitfall 5: any
// result other than complete -> redirect home).
```

Do not change any later resume, rendering, signed-audio, character, or evaluator-warm-up behavior.

- [ ] **Step 4: Run focused page and service tests**

Run:

```bash
npm test -- --run tests/server/student-mission-page.test.ts src/server/student-access/mission-flow.test.ts tests/server/mark-missed-assignments.test.ts
npm run typecheck
```

Expected: all focused tests pass with no skips, and typecheck exits with status 0.

- [ ] **Step 5: Commit the page boundary**

Run:

```bash
git add 'src/app/student/missions/[assignmentStudentId]/page.tsx' tests/server/student-mission-page.test.ts
git diff --cached --check
git commit -m "fix: require complete live mission snapshots"
```

Expected: the commit contains only the page interpreter boundary and its focused check.

---

### Task 3: Verify and Review Issue #22

**Files:**

- Modify only if a review finding requires an Issue #22 correction: the five files listed above.
- Modify: `TASK.md` (local and ignored; do not stage it)

- [ ] **Step 1: Run final verification**

Run these commands in order:

```bash
npm test -- --run tests/server/student-mission-page.test.ts src/server/student-access/mission-flow.test.ts tests/server/mark-missed-assignments.test.ts src/domain/mission/mission-snapshot.test.ts
npm test -- --run
npm run typecheck
npm run lint
npx eslint . --ignore-pattern '.ua/**' --ignore-pattern '.worktrees/**' --ignore-pattern 'supabase/.temp/**'
npm run build
git diff --check <base-sha>...HEAD
```

Expected: focused tests pass with no skips. The full suite, typecheck, source lint, and build exit with status 0. Record the unfiltered lint result separately if it contains only the confirmed ignored generated artifacts.

- [ ] **Step 2: Review standards and Issue #22 independently**

Use the implementation base from Task 0 as `<base-sha>`. Review:

```bash
git diff <base-sha>...HEAD
git log <base-sha>..HEAD --oneline
```

Review standards against `AGENTS.md`, `PROJECT.md`, and the Karpathy Guidelines. Review behavior against GitHub issue #22, ADR 0002, and the approved design specification.

Expected: no unresolved standards or specification findings. If a finding changes behavior, add one failing boundary test, make the minimum fix, rerun Task 3 Step 1, and commit the correction.

- [ ] **Step 3: Record the milestone**

Update `TASK.md` with commits, red-green evidence, final verification, review results, and one next action: close Issue #22 only after separate approval. Do not push, create a pull request, deploy, close an issue, or mutate production without separate approval.
