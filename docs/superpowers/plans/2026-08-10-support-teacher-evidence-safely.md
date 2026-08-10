# Support Teacher Evidence Safely Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the shared mission snapshot interpreter for teacher no-attempt and completed-attempt evidence while preserving all owned student evidence when snapshot data is invalid.

**Architecture:** Replace the no-attempt strict parse with a complete-or-legacy projection. Replace attempt evidence's permissive question parser and raw conversation flag with one interpreted mission context; only a complete conversation context may add stored dynamic follow-up questions. Invalid context contributes no mission questions or conversation setting but does not stop transcript, evaluation, pronunciation, clip, or signed-audio processing.

**Tech Stack:** Next.js server modules, TypeScript, Supabase service client, the existing Zod-backed mission interpreter, Vitest.

## Global Constraints

- Teacher ownership checks remain server-side and unchanged.
- Private audio storage and signed playback behavior remain unchanged.
- Complete and exact legacy results may supply known teacher-facing mission content.
- Invalid results supply no mission questions and never enable an untrusted conversation setting.
- Invalid snapshot data must not remove available transcripts, evaluations, pronunciation data, or audio clips.
- Missing legacy data, including the target pattern, remains absent; do not invent fields.
- Preserve stored snapshots; add no rewrite, migration, dependency, public URL, or new parser.
- Preserve complete preset and conversation evidence behavior, including stored dynamic follow-up questions for complete conversation missions.
- Reuse the existing interpreter inside the two existing teacher evidence modules; add no cross-file projection layer.
- Tests observe feature behavior and existing query filters; add no test-only production interface.
- Unfiltered lint scans ignored `.ua/`, `.worktrees/`, and `supabase/.temp/`; record it separately, then exclude those paths for source lint.

## Baseline

- Branch: `codex/deepen-mission-snapshot-interpretation`.
- Issue `#25` is closed; Issue `#26` is open, `ready-for-agent`, and unblocked.
- Focused baseline: 18/18 tests pass across `assignment-student-evidence`, `audio-evidence`, and dynamic-question mapping.
- Implementation base will be the commit containing this plan. No Issue `#26` production file has changed.

---

### Task 1: Interpret Teacher Assigned Work Without an Attempt

**Files:**

- Modify: `src/server/teacher/assignment-student-evidence.ts`
- Modify: `tests/server/assignment-student-evidence.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation`.
- Preserves: `getAssignmentStudentEvidenceForTeacher(input, client): Promise<AssignmentStudentEvidence | null>`.
- Produces no new public interface; `targetPattern` remains `string | null` and legacy turns fit the existing `AssignmentStudentMissionTurn` shape.

- [ ] **Step 1: Add the exact legacy fixture**

After `snapshot` in `tests/server/assignment-student-evidence.test.ts`, add:

```ts
const legacySnapshot = {
  missionId: "22222222-2222-4222-8222-222222222222",
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

- [ ] **Step 2: Write the legacy and invalid assigned-work tests**

Add inside `describe("assignment student evidence", ...)`:

```ts
it("shows known legacy assigned work without inventing a target pattern", async () => {
  const { client } = evidenceClient({
    id: "as-1",
    status: "assigned",
    submitted_at: null,
    latest_attempt_id: null,
    dismissed_at: null,
    students: { display_name: "test" },
    assignments: {
      id: "assignment-1",
      title: "Assignment fallback title",
      mission_snapshot: legacySnapshot,
      classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" },
    },
  });

  const result = await getAssignmentStudentEvidenceForTeacher(
    { teacherId: "teacher-1", assignmentStudentId: "as-1" },
    client as never,
  );

  expect(result).toMatchObject({
    missionTitle: "Foundation Smoke Assignment",
    targetPattern: null,
    turns: [{
      turnOrder: 1,
      prompt: "What are you going to do this weekend?",
      targetExample: "I am going to play soccer.",
    }],
  });
});

it("keeps invalid assigned work free of invented mission content", async () => {
  const { client } = evidenceClient({
    id: "as-1",
    status: "assigned",
    submitted_at: null,
    latest_attempt_id: null,
    dismissed_at: null,
    students: { display_name: "test" },
    assignments: {
      id: "assignment-1",
      title: "Assignment fallback title",
      mission_snapshot: {
        conversationMode: true,
        turns: [{ turnOrder: 1, prompt: "Untrusted question" }],
      },
      classes: { id: "class-1", name: "Test class", teacher_id: "teacher-1" },
    },
  });

  const result = await getAssignmentStudentEvidenceForTeacher(
    { teacherId: "teacher-1", assignmentStudentId: "as-1" },
    client as never,
  );

  expect(result).toMatchObject({
    missionTitle: "Assignment fallback title",
    targetPattern: null,
    turns: [],
  });
});
```

- [ ] **Step 3: Run the assigned-work test and verify red**

Run:

```bash
npm test -- --run tests/server/assignment-student-evidence.test.ts
```

Expected: the legacy test fails because the old strict parse falls back to the assignment title and drops the legacy turn. Existing complete, ownership, and no-attempt checks stay green; the invalid safety case is already behaviorally green.

- [ ] **Step 4: Replace the strict parse with the shared interpreter**

Replace:

```ts
import { missionSnapshotSchema } from "@/domain/mission/schemas";
```

with:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

Replace:

```ts
const snapshot = missionSnapshotSchema.safeParse(assignment.mission_snapshot);
```

with:

```ts
const snapshotResult = interpretMissionSnapshot(assignment.mission_snapshot);
const snapshot =
  snapshotResult.kind === "invalid" ? null : snapshotResult.snapshot;
```

Change the snapshot-derived return fields to:

```ts
missionTitle: snapshot?.title ?? String(assignment.title),
```

```ts
targetPattern:
  snapshotResult.kind === "complete"
    ? snapshotResult.snapshot.targetPattern
    : null,
turns: snapshot
  ? snapshot.turns.map((turn) => ({
      turnOrder: turn.turnOrder,
      prompt: turn.prompt,
      targetExample: turn.targetExample,
    }))
  : [],
```

Do not change the teacher ownership query, no-attempt guard, status labels, dismissal data, or assignment/class/student metadata.

- [ ] **Step 5: Verify and commit Task 1**

Run:

```bash
npm test -- --run tests/server/assignment-student-evidence.test.ts
npm run typecheck
git add src/server/teacher/assignment-student-evidence.ts tests/server/assignment-student-evidence.test.ts
git diff --cached --check
git commit -m "feat: show legacy teacher assigned work"
```

Expected: six focused tests and typecheck pass; the commit contains only the no-attempt projection and its complete/legacy/invalid coverage.

---

### Task 2: Interpret Completed Attempt Evidence Without Dropping Student Data

**Files:**

- Modify: `src/server/teacher/audio-evidence.ts`
- Modify: `tests/server/audio-evidence.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation`.
- Preserves: `getAttemptEvidenceForTeacher(input): Promise<AttemptEvidence | null>`, `createSignedAudioUrlForTeacher(input)`, and `addDynamicTurnQuestions(questionsByOrder, turnRows)`.
- Adds only a private `AttemptMissionContext` projection inside `audio-evidence.ts`.

- [ ] **Step 1: Make the attempt-evidence snapshot fixture selectable**

After `Operation` in `tests/server/audio-evidence.test.ts`, add:

```ts
const legacySnapshot = {
  missionId: "22222222-2222-4222-8222-222222222222",
  title: "Daily routines",
  requiredTurns: 2,
  characterId: "default-buddy",
  turns: [
    {
      order: 1,
      prompt: "What time do you wake up?",
      targetExample: "I wake up at seven.",
    },
    {
      order: 2,
      prompt: "What do you eat for breakfast?",
      targetExample: "I eat breakfast.",
    },
  ],
};

const completeConversationSnapshot = {
  missionId: "33333333-3333-4333-8333-333333333333",
  title: "Weekend conversation",
  targetPattern: "I am going to...",
  level: "beginner",
  requiredTurns: 3,
  characterId: "default-buddy",
  conversationMode: true,
  turns: [{
    turnOrder: 1,
    prompt: "What are you doing this weekend?",
    targetExample: "I am going to play soccer.",
    hintLadder: {
      tier1: "Use I am going to.",
      tier2: "Choose a weekend activity.",
      tier3: "I am going to play soccer.",
    },
  }],
};
```

Add this field to `createMockSupabase` options:

```ts
missionSnapshot?: unknown;
```

Replace the existing inline `mission_snapshot` object with:

```ts
mission_snapshot:
  options.missionSnapshot === undefined
    ? legacySnapshot
    : options.missionSnapshot,
```

- [ ] **Step 2: Write the complete-conversation and invalid-evidence tests**

Add inside `describe("teacher audio evidence service", ...)` after the main evidence test:

```ts
it("uses complete conversation context for opening and stored follow-up questions", async () => {
  mockSupabase = createMockSupabase({
    missionSnapshot: completeConversationSnapshot,
    attemptTurns: [
      {
        id: "turn-1",
        turn_order: 1,
        original_transcript: "I am going to play soccer.",
        improved_sentence: null,
        repeat_transcript: null,
        target_attempted: true,
        repeat_accepted: null,
        evaluation: {
          outcome: "accepted_original",
          meaningUnderstood: true,
          targetPatternAttempted: true,
        },
        coco_line: "Who are you going with?",
        reply_hint_frame: null,
        hint_level_used: 0,
      },
      {
        id: "turn-2",
        turn_order: 2,
        original_transcript: "I am going with my friend.",
        improved_sentence: null,
        repeat_transcript: null,
        target_attempted: true,
        repeat_accepted: null,
        evaluation: {
          outcome: "accepted_original",
          meaningUnderstood: true,
          targetPatternAttempted: true,
        },
        coco_line: null,
        reply_hint_frame: null,
        hint_level_used: 0,
      },
    ],
  });
  const { getAttemptEvidenceForTeacher } = await import(
    "@/server/teacher/audio-evidence"
  );

  const evidence = await getAttemptEvidenceForTeacher({
    teacherId: "teacher-1",
    attemptId: "attempt-1",
  });

  expect(evidence).toMatchObject({
    conversationMode: true,
    turns: [
      { turnOrder: 1, question: "What are you doing this weekend?" },
      { turnOrder: 2, question: "Who are you going with?" },
    ],
  });
});

it("keeps evidence but removes mission context for an invalid snapshot", async () => {
  mockSupabase = createMockSupabase({
    missionSnapshot: {
      conversationMode: true,
      turns: [{ turnOrder: 1, prompt: "Untrusted question" }],
    },
    attemptTurns: [{
      id: "turn-1",
      turn_order: 1,
      original_transcript: "I wake up at seven.",
      improved_sentence: "I wake up at seven.",
      repeat_transcript: null,
      target_attempted: true,
      repeat_accepted: null,
      evaluation: {
        outcome: "accepted_original",
        meaningUnderstood: true,
        targetPatternAttempted: true,
      },
      coco_line: "Untrusted follow-up question",
      reply_hint_frame: null,
      hint_level_used: 1,
    }],
  });
  const { getAttemptEvidenceForTeacher } = await import(
    "@/server/teacher/audio-evidence"
  );

  const evidence = await getAttemptEvidenceForTeacher({
    teacherId: "teacher-1",
    attemptId: "attempt-1",
  });

  expect(evidence).toMatchObject({
    conversationMode: false,
    turns: [{
      question: null,
      originalTranscript: "I wake up at seven.",
      improvedSentence: "I wake up at seven.",
      meaningResult: "Understood",
      targetPatternResult: "Target pattern used",
      hintLevelUsed: 1,
      audioClips: [
        {
          id: "clip-1",
          clipKind: "original_answer",
          pronunciationScore: { starBand: 3 },
        },
        { id: "clip-2", clipKind: "repeat_attempt" },
      ],
    }],
  });
});
```

The complete test protects existing dynamic conversation behavior. The invalid test is the behavioral RED: the current raw readers trust `conversationMode: true`, accept the partial question, and add its stored follow-up.

- [ ] **Step 3: Run the attempt-evidence test and verify red**

Run:

```bash
npm test -- --run tests/server/audio-evidence.test.ts
```

Expected: the invalid test fails on `conversationMode` and/or `question`; existing legacy, ownership, evidence, pronunciation, and signing tests remain green.

- [ ] **Step 4: Replace both local snapshot readers with one interpreted context**

Add to `src/server/teacher/audio-evidence.ts`:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

Replace the complete `readTurnQuestionsByOrder` and `readConversationMode` functions, including their obsolete permissive-parser comments, with:

```ts
type AttemptMissionContext = {
  questionsByOrder: Map<number, string>;
  conversationMode: boolean;
};

function readAttemptMissionContext(
  row: AttemptOwnershipRow,
): AttemptMissionContext {
  const assignment = one(one(row.assignment_students)?.assignments);
  const snapshotResult = interpretMissionSnapshot(
    assignment?.mission_snapshot,
  );

  if (snapshotResult.kind === "invalid") {
    return { questionsByOrder: new Map(), conversationMode: false };
  }

  const questionsByOrder = new Map(
    snapshotResult.snapshot.turns.map((turn) => [
      turn.turnOrder,
      turn.prompt,
    ] as const),
  );
  return {
    questionsByOrder,
    conversationMode:
      snapshotResult.kind === "complete" &&
      snapshotResult.snapshot.conversationMode,
  };
}
```

In `getAttemptEvidenceForTeacher`, replace:

```ts
const questionsByOrder = addDynamicTurnQuestions(
  readTurnQuestionsByOrder(ownershipRow),
  turnRows,
);
```

with:

```ts
const missionContext = readAttemptMissionContext(ownershipRow);
const questionsByOrder = missionContext.conversationMode
  ? addDynamicTurnQuestions(missionContext.questionsByOrder, turnRows)
  : missionContext.questionsByOrder;
```

Replace:

```ts
conversationMode: readConversationMode(ownershipRow),
```

with:

```ts
conversationMode: missionContext.conversationMode,
```

Do not move or change the owned attempt query, attempt-turn query, transcript/evaluation mapping, clip/pronunciation queries, raw evidence fields, or signed-audio function.

- [ ] **Step 5: Verify and commit Task 2**

Run:

```bash
npm test -- --run tests/server/audio-evidence.test.ts src/server/teacher/audio-evidence.test.ts src/domain/mission/mission-snapshot.test.ts
npm run typecheck
git add src/server/teacher/audio-evidence.ts tests/server/audio-evidence.test.ts
git diff --cached --check
git commit -m "feat: protect teacher attempt evidence"
```

Expected: all focused tests and typecheck pass; the commit contains only the interpreted mission context and complete/legacy/invalid attempt-evidence coverage.

---

### Task 3: Verify and Review Issue 26

**Files:**

- Verify only; add no production behavior.

**Interfaces:**

- Confirms Tasks 1 and 2 satisfy Issue `#26` while preserving teacher authorization, student evidence, and private audio behavior.

- [ ] **Step 1: Run the complete focused boundary suite**

Run:

```bash
npm test -- --run tests/server/assignment-student-evidence.test.ts tests/server/audio-evidence.test.ts src/server/teacher/audio-evidence.test.ts src/domain/mission/mission-snapshot.test.ts
```

Expected: all focused tests pass without skips. Coverage includes complete, legacy, and invalid no-attempt/attempt views, ownership filters, evidence retention, dynamic questions, and signed playback.

- [ ] **Step 2: Run repository gates**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npx eslint . --ignore-pattern '.ua/**' --ignore-pattern '.worktrees/**' --ignore-pattern 'supabase/.temp/**'
npm run build
issue26_base=$(git log --format=%H --grep='docs: plan safe teacher evidence' -1)
git diff --check "$issue26_base"...HEAD
```

Expected: full suite, typecheck, source lint, production build, and diff check exit with status 0. Record unfiltered lint separately if it contains only confirmed ignored artifacts and the existing `scripts/check-student-feedback-states.mjs:435` warning.

- [ ] **Step 3: Review the full Issue 26 diff**

Review from the committed plan through `HEAD` and confirm:

- Valid legacy no-attempt evidence shows snapshot title, normalized questions, examples, and no invented target pattern.
- Complete and legacy attempt evidence uses known snapshot questions.
- Invalid snapshots contribute no questions and cannot enable conversation behavior.
- Invalid snapshots do not remove transcripts, evaluation labels, pronunciation data, or audio clips.
- Complete conversations still derive stored dynamic follow-up questions.
- Teacher ownership filters and no-attempt/latest-attempt boundaries remain server-side.
- Signed playback still verifies teacher ownership, uses private object keys, and expires after 300 seconds.
- No unrelated refactor, parser, migration, dependency, public URL, or snapshot mutation was added.

Expected: no Critical or Important finding remains before requesting authorization to close Issue `#26`.
