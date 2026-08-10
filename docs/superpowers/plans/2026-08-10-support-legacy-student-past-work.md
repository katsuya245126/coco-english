# Support Legacy Student Past Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make completed homework with the exact supported legacy mission snapshot visible and useful in the student Past list and recap without allowing legacy homework into the live Current list.

**Architecture:** Replace the assignment list's strict schema reader and the recap's permissive local parser with `interpretMissionSnapshot`. Current admits only `complete`; Past and completed recaps admit `complete` and `legacy`. Represent the legacy snapshot's absent target pattern as `null` and route that recap through the existing `HomeworkReview`, which already renders original and repeated tries separately.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase service client, the Zod-backed mission interpreter, Vitest.

## Global Constraints

- Stored snapshots remain immutable; add no rewrite or migration.
- Accept only the exact known legacy format. Unknown partial data remains invalid.
- Current homework accepts `complete` only; unfinished legacy homework stays hidden.
- Past and completed recaps accept `complete` and `legacy`; invalid recaps remain not found.
- Legacy recaps show known questions and original/repeat evidence without inventing a target pattern.
- Complete preset and conversation list/recap behavior remains unchanged.
- Preserve student ownership, cancellation, completed-status, latest-attempt, transcript-safety, audio, and signed-playback boundaries.
- Reuse existing interpreter and review components. Add no dependency, parser, deployment, push, or production mutation.
- Tests observe feature behavior; add no test-only production interface.
- Unfiltered lint scans ignored `.ua/`, `.worktrees/`, and `supabase/.temp/`; record it separately, then exclude those paths for source lint.

## Baseline

- Branch: `codex/deepen-mission-snapshot-interpretation`.
- Issue `#24` is closed; Issue `#25` is open, `ready-for-agent`, and unblocked.
- The focused baseline passes 23/23 assignment-list, student-history, `HomeworkReview`, and `StudentMissionRecap` tests.
- The implementation base is the commit containing this plan; no Issue `#25` production file has changed.

---

### Task 1: Interpret Current and Past Assignment Lists by Use

**Files:**

- Modify: `src/server/student-access/assignment-list.ts`
- Modify: `tests/server/assignment-list.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation`.
- Preserves: `listStudentAssignmentPage(studentId, input): Promise<StudentAssignmentPage>`.
- Changes: `StudentAssignmentListItem.targetPattern` from `string` to `string | null`; current items still contain a string, supported legacy Past items contain `null`.

- [ ] **Step 1: Generalize the test row and add the exact legacy fixture**

After `snapshot` in `tests/server/assignment-list.test.ts`, add:

```ts
const legacySnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [{
    order: 1,
    prompt: "What are you going to do this weekend?",
    targetExample: "I am going to play soccer.",
  }],
};
```

Replace `row` with a helper that accepts stored snapshot data:

```ts
function row(
  id: string,
  status: string,
  dueAt: string | null = null,
  completedAt: string | null = null,
  missionSnapshot: unknown = snapshot,
): {
  id: string;
  status: string;
  submitted_at: string | null;
  latest_attempt_id: string | null;
  assignments: {
    title: string;
    mission_snapshot: unknown;
    due_at: string | null;
    canceled_at: string | null;
  };
  latest_attempt: { completed_at: string | null } | null;
} {
  return {
    id,
    status,
    submitted_at: completedAt,
    latest_attempt_id: completedAt ? `attempt-${id}` : null,
    assignments: { title: id, mission_snapshot: missionSnapshot, due_at: dueAt, canceled_at: null },
    latest_attempt: completedAt ? { completed_at: completedAt } : null,
  };
}
```

- [ ] **Step 2: Write the failing Current/Past boundary test**

Add inside the existing describe:

```ts
it("hides unfinished legacy work from Current and shows completed legacy work in Past", async () => {
  rows = [
    row("legacy-open", "assigned", null, null, legacySnapshot),
    row("legacy-done", "completed", null, "2026-07-11T10:00:00Z", legacySnapshot),
  ];
  const { listStudentAssignmentPage } = await import("@/server/student-access/assignment-list");

  const current = await listStudentAssignmentPage("student-1", { tab: "current", page: 1 });
  const past = await listStudentAssignmentPage("student-1", { tab: "past", page: 1 });

  expect(current.items).toEqual([]);
  expect(past.items).toEqual([
    expect.objectContaining({
      assignmentStudentId: "legacy-done",
      turnCount: 1,
      targetPattern: null,
      displayStatus: "done",
    }),
  ]);
});
```

- [ ] **Step 3: Run the test and verify red**

Run:

```bash
npm test -- --run tests/server/assignment-list.test.ts
```

Expected: the new Past assertion fails because the old strict schema skips both legacy rows; the six existing tests pass.

- [ ] **Step 4: Implement use-specific interpretation**

Replace the schema import with:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

Change the list item field to:

```ts
targetPattern: string | null;
```

Replace the strict parse and tab filters with:

```ts
const snapshotResult = interpretMissionSnapshot(row.assignments.mission_snapshot);
if (snapshotResult.kind === "invalid") continue;
const completedAt = row.latest_attempt?.completed_at ?? row.submitted_at;
const isStudentCompleted = STUDENT_COMPLETED_STATUSES.has(row.status);
if (input.tab === "past" && !isStudentCompleted) continue;
if (input.tab === "current" && (isStudentCompleted || snapshotResult.kind !== "complete")) continue;
const snapshot = snapshotResult.snapshot;
```

Populate the snapshot fields with:

```ts
turnCount: snapshot.requiredTurns,
completedTurnCount: row.latest_attempt?.attempt_turns?.[0]?.count ?? 0,
targetPattern: snapshotResult.kind === "complete" ? snapshotResult.snapshot.targetPattern : null,
```

Do not change cancellation, status mapping, sorting, pagination, or ownership filtering.

- [ ] **Step 5: Verify and commit Task 1**

Run:

```bash
npm test -- --run tests/server/assignment-list.test.ts
npm run typecheck
git add src/server/student-access/assignment-list.ts tests/server/assignment-list.test.ts
git diff --cached --check
git commit -m "feat: show legacy homework in Past"
```

Expected: seven tests and typecheck pass; the commit contains only the list boundary and test.

---

### Task 2: Interpret and Render Legacy Student Recaps

**Files:**

- Modify: `src/server/student-access/student-history.ts`
- Modify: `tests/server/student-history.test.ts`
- Modify: `src/app/student/history/[assignmentStudentId]/page.tsx`
- Create: `tests/server/student-history-page.test.tsx`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation`.
- Preserves: `getCompletedMissionRecap(studentId, assignmentStudentId): Promise<StudentMissionRecap | null>` and both complete recap page branches.
- Changes: `StudentMissionRecap.targetPattern` becomes `string | null`; `null` identifies supported legacy because complete snapshots always have a non-empty target pattern.
- Reuses: `HomeworkReview`, which already renders `turn.original` and `turn.repeat` separately and does not display `targetPattern`.

- [ ] **Step 1: Normalize current recap fixtures to complete snapshots**

After the service import in `tests/server/student-history.test.ts`, add:

```ts
const hintLadder = {
  tier1: "Use the target pattern.",
  tier2: "Choose helpful words.",
  tier3: "Say the complete example.",
};

const presetSnapshot = {
  missionId: "00000000-0000-4000-8000-000000000001",
  title: "Weekend plans",
  targetPattern: "I am going to...",
  level: "beginner",
  requiredTurns: 3,
  characterId: "default-buddy",
  conversationMode: false,
  turns: [
    { turnOrder: 1, prompt: "What will you do?", targetExample: "I will play soccer.", hintLadder },
    { turnOrder: 2, prompt: "Who will go?", targetExample: "My friend will go.", hintLadder },
    { turnOrder: 3, prompt: "What else?", targetExample: "I will eat lunch.", hintLadder },
  ],
};

const conversationSnapshot = {
  missionId: "00000000-0000-4000-8000-000000000002",
  title: "Weekend conversation",
  targetPattern: "I am going to...",
  level: "beginner",
  requiredTurns: 3,
  characterId: "default-buddy",
  conversationMode: true,
  turns: [{
    turnOrder: 1,
    prompt: "Where are you going?",
    targetExample: "I am going to school.",
    hintLadder,
  }],
};

const legacySnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [{
    order: 1,
    prompt: "What are you going to do this weekend?",
    targetExample: "I am going to play soccer.",
  }],
};
```

Replace the inline snapshot in `createMockSupabase` with `presetSnapshot`. Change its three attempt-turn orders from `0, 1, 2` to `1, 2, 3`.

Replace:

```ts
function createDynamicMockSupabase(attemptTurnsOverride?: DynamicAttemptTurnRow[]) {
```

with:

```ts
function createDynamicMockSupabase(
  attemptTurnsOverride?: DynamicAttemptTurnRow[],
  missionSnapshot: unknown = conversationSnapshot,
) {
```

Within that helper's `assignment_students` row, replace the complete inline `mission_snapshot` object with:

```ts
mission_snapshot: missionSnapshot,
```

Run the fixture-only normalization:

```bash
npm test -- --run tests/server/student-history.test.ts
```

Expected: all 13 existing tests still pass, proving complete preset and conversation behavior before the parser replacement.

- [ ] **Step 2: Write legacy and invalid recap boundary tests**

Add after the pronunciation describe block:

```ts
describe("student legacy mission recap", () => {
  it("shows known legacy questions and both speaking tries without a target pattern", async () => {
    mockSupabase = createDynamicMockSupabase(
      [{
        id: "turn-repeat",
        turn_order: 1,
        original_transcript: "I play soccer.",
        improved_sentence: "I am going to play soccer.",
        repeat_transcript: "I am going to play soccer.",
        repeat_accepted: true,
        evaluation: { outcome: "accepted_repeat" },
        coco_line: "Stored line is not a legacy prompt.",
      }],
      legacySnapshot,
    );

    const recap = await getCompletedMissionRecap("student-1", "assignment-student-1");

    expect(recap).toMatchObject({
      targetPattern: null,
      conversationMode: false,
      characterId: "default-buddy",
      finalCocoLine: null,
      completedAt: "2026-07-14T00:00:00.000Z",
      turns: [{
        cocoPrompt: "What are you going to do this weekend?",
        reviewState: "repeat_accepted",
        original: { transcript: "I play soccer." },
        repeat: { transcript: "I am going to play soccer." },
      }],
    });
  });

  it("keeps unknown partial snapshot data as not found", async () => {
    mockSupabase = createDynamicMockSupabase(undefined, {
      targetPattern: "I am going to...",
      turns: [{ turnOrder: 1, prompt: "What will you do?" }],
    });

    await expect(
      getCompletedMissionRecap("student-1", "assignment-student-1"),
    ).resolves.toBeNull();
  });
});
```

Expected RED reasons: the legacy format lacks the local parser's required target pattern, while the old permissive parser incorrectly accepts the unknown partial object.

- [ ] **Step 3: Write the recap page selection test**

Create `tests/server/student-history-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readStudentUnlock: vi.fn(),
  getCompletedMissionRecap: vi.fn(),
}));

vi.mock("@/app/join/actions", () => ({ readStudentUnlock: mocks.readStudentUnlock }));
vi.mock("@/server/student-access/student-history", () => ({
  getCompletedMissionRecap: mocks.getCompletedMissionRecap,
}));

import StudentHistoryPage from "@/app/student/history/[assignmentStudentId]/page";

const baseRecap = {
  assignmentStudentId: "assignment-student-1",
  title: "Weekend plans",
  targetPattern: "I am going to..." as string | null,
  completedAt: "2026-07-14T00:00:00.000Z",
  conversationMode: false,
  characterId: "default-buddy",
  finalCocoLine: null,
  turns: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readStudentUnlock.mockResolvedValue({ studentId: "student-1", displayName: "Minji" });
});

describe("StudentHistoryPage recap selection", () => {
  it("keeps the complete preset recap and its target pattern", async () => {
    mocks.getCompletedMissionRecap.mockResolvedValue(baseRecap);

    const page = await StudentHistoryPage({
      params: Promise.resolve({ assignmentStudentId: "assignment-student-1" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Practice: “I am going to...”");
    expect(html).not.toContain("Look back at your conversation with Coco.");
  });

  it.each([
    ["complete conversation", { targetPattern: "I am going to...", conversationMode: true }],
    ["legacy", { targetPattern: null, conversationMode: false }],
  ])("renders the real %s review without a target-pattern banner", async (_label, recapState) => {
    mocks.getCompletedMissionRecap.mockResolvedValue({ ...baseRecap, ...recapState });

    const page = await StudentHistoryPage({
      params: Promise.resolve({ assignmentStudentId: "assignment-student-1" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Look back at your conversation with Coco.");
    expect(html).not.toContain("Practice:");
  });
});
```

- [ ] **Step 4: Run recap tests and verify red**

Run:

```bash
npm test -- --run tests/server/student-history.test.ts tests/server/student-history-page.test.tsx
```

Expected: legacy recap, invalid partial recap, and legacy page selection fail; complete preset/conversation cases remain green.

- [ ] **Step 5: Replace the permissive recap parser with the shared interpreter**

Add to `src/server/student-access/student-history.ts`:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

Change the recap type field to:

```ts
targetPattern: string | null;
```

Delete the private `Snapshot` type and the complete `parseSnapshot` function. Replace the snapshot read and guard with:

```ts
const snapshotResult = interpretMissionSnapshot(assignment?.mission_snapshot);
if (
  !row.latest_attempt_id ||
  !assignment ||
  assignment.canceled_at ||
  snapshotResult.kind === "invalid"
) {
  return null;
}
const snapshot = snapshotResult.snapshot;
const conversationMode =
  snapshotResult.kind === "complete" && snapshotResult.snapshot.conversationMode;
const targetPattern =
  snapshotResult.kind === "complete"
    ? snapshotResult.snapshot.targetPattern
    : null;
```

Replace both `snapshot.conversationMode` checks in prompt processing with `conversationMode`. Return the snapshot-derived fields as:

```ts
targetPattern,
completedAt:
  (attempt.data as { completed_at: string | null }).completed_at ??
  row.submitted_at,
conversationMode,
characterId: snapshot.characterId,
finalCocoLine: conversationMode ? finalCocoLine : null,
```

Do not change assignment ownership, completion filtering, latest-attempt lookup, turn/audio/pronunciation queries, transcript safety, or signed-audio authorization.

- [ ] **Step 6: Route legacy recaps through existing original/repeat UI**

In `src/app/student/history/[assignmentStudentId]/page.tsx`, replace:

```ts
if (recap.conversationMode) {
```

with:

```ts
if (recap.conversationMode || recap.targetPattern === null) {
```

This leaves complete preset and conversation branches unchanged. Legacy uses `HomeworkReview`, which omits target-pattern UI and already renders original and repeat attempts separately.

- [ ] **Step 7: Verify and commit Task 2**

Run:

```bash
npm test -- --run tests/server/student-history.test.ts tests/server/student-history-page.test.tsx src/components/student/HomeworkReview.test.tsx src/components/student/StudentMissionRecap.test.tsx src/domain/mission/mission-snapshot.test.ts
npm run typecheck
git add src/server/student-access/student-history.ts tests/server/student-history.test.ts 'src/app/student/history/[assignmentStudentId]/page.tsx' tests/server/student-history-page.test.tsx
git diff --cached --check
git commit -m "feat: open legacy student recaps"
```

Expected: focused tests and typecheck pass with no skips; the commit contains only interpreter-backed recap behavior, fixture normalization, boundary tests, and one-line page selection.

---

### Task 3: Verify and Review Issue 25

**Files:**

- Verify only; add no production behavior.

**Interfaces:**

- Confirms Tasks 1 and 2 satisfy Issue `#25` together without changing live homework or complete recaps.

- [ ] **Step 1: Run the complete focused boundary suite**

Run:

```bash
npm test -- --run tests/server/assignment-list.test.ts tests/server/student-history.test.ts tests/server/student-history-page.test.tsx src/components/student/HomeworkReview.test.tsx src/components/student/StudentMissionRecap.test.tsx src/domain/mission/mission-snapshot.test.ts
```

Expected: all focused tests pass without skips. Coverage includes Current/Past filtering, exact legacy recap, invalid recap, original/repeat evidence, complete preset, complete conversation, and the interpreter contract.

- [ ] **Step 2: Run repository gates**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npx eslint . --ignore-pattern '.ua/**' --ignore-pattern '.worktrees/**' --ignore-pattern 'supabase/.temp/**'
npm run build
issue25_base=$(git log --format=%H --grep='docs: plan legacy student past work' -1)
git diff --check "$issue25_base"...HEAD
```

Expected: full suite, typecheck, source lint, production build, and diff check exit with status 0. Record unfiltered lint separately if it contains only confirmed ignored artifacts and the existing `scripts/check-student-feedback-states.mjs:435` warning.

- [ ] **Step 3: Review the full Issue 25 diff**

Review from the committed plan through `HEAD` and confirm:

- Current admits complete only.
- Past admits completed complete and legacy data, never invalid data.
- Completed legacy work opens the latest owned completed attempt.
- Legacy prompts use normalized `turnOrder`; original and repeat attempts remain distinct; target pattern stays absent.
- Complete preset and conversation behavior remains unchanged.
- Ownership, cancellation, completion status, transcript safety, audio evidence, and signed playback remain unchanged.
- No unrelated refactor, parser, migration, dependency, or redesign was added.

Expected: no Critical or Important finding remains before requesting authorization to close Issue `#25`.
