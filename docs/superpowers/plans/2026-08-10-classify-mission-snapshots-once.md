# Classify Mission Snapshots Once Implementation Plan

> **For agentic workers:** Do not start Task 1 until Task 0 records owner approval of this exact tracked plan revision. After approval, use test-driven development to implement the plan task by task. Each step uses checkbox syntax and ends with a runnable check.

**Goal:** Add one mission-domain interpreter that classifies saved data as a complete mission snapshot, the exact legacy mission snapshot, or invalid data.

**Architecture:** Add one public function beside the existing mission schemas. The function first reuses `missionSnapshotSchema` for complete snapshots. If that parse fails, it accepts only the exact legacy mission snapshot schema and converts each `order` field to `turnOrder`; otherwise it returns `invalid`.

**Tech Stack:** TypeScript, Zod, Vitest, and the existing mission-domain schemas.

## Global Constraints

- Issue #21 adds the interpreter only. Do not migrate student or teacher callers in this issue.
- Preserve strict assignment-time mission snapshot creation. Do not modify `missionSnapshotSchema` or `src/server/mission/assign-service.ts`.
- Preserve preset and conversation mission behavior, historical defaults, stored mission snapshots, ownership checks, RLS, and per-turn audio storage.
- The legacy mission snapshot contains only `missionId`, `title`, `characterId`, `requiredTurns`, and `turns` with `order`, `prompt`, and `targetExample`.
- A legacy turn must contain a positive integer order, a nonempty prompt, and a nonempty example answer.
- The legacy turn count must equal `requiredTurns`, as it did in the removed sample writer.
- Reject unknown partial data, malformed data, and legacy-shaped objects with additional fields.
- Add no database migration, dependency, test-only interface, caller migration, or unrelated refactor.
- Run the focused interpreter test first. Then run the full test suite, typecheck, lint, and the production build.

## File Structure

- Create `src/domain/mission/mission-snapshot.ts`. It owns the public interpretation result and exact legacy schema.
- Create `src/domain/mission/mission-snapshot.test.ts`. It observes only the public `interpretMissionSnapshot` result.
- Update local `TASK.md` at approval and verification milestones. Do not stage this ignored file.

## Public Interface

```ts
export type LegacyMissionSnapshot = {
  missionId: string;
  title: string;
  characterId: string;
  requiredTurns: number;
  turns: Array<{
    turnOrder: number;
    prompt: string;
    targetExample: string;
  }>;
};

export type MissionSnapshotInterpretation =
  | { kind: "complete"; snapshot: MissionSnapshot }
  | { kind: "legacy"; snapshot: LegacyMissionSnapshot }
  | { kind: "invalid" };

export function interpretMissionSnapshot(
  value: unknown,
): MissionSnapshotInterpretation;
```

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
git status --short --branch
```

Record the commit as the review base in `TASK.md`. Expected: the current branch is `codex/deepen-mission-snapshot-interpretation`, and no unrelated tracked change overlaps the two source files in this plan.

---

### Task 1: Add the Shared Mission Snapshot Interpreter

**Files:**

- Create: `src/domain/mission/mission-snapshot.ts`
- Create: `src/domain/mission/mission-snapshot.test.ts`

**Interfaces:**

- Consumes: `missionSnapshotSchema` and `MissionSnapshot` from `src/domain/mission/schemas.ts`.
- Produces: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation`.
- Leaves every application and server caller unchanged for issues #22 through #26.

- [ ] **Step 1: Write the failing public-seam tests**

Create `src/domain/mission/mission-snapshot.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";

const missionId = "11111111-1111-4111-8111-111111111111";
const turn = {
  turnOrder: 1,
  prompt: "What do you like doing after school?",
  targetExample: "I like playing soccer.",
  answerShape: "open",
  hintLadder: {
    tier1: "I like ___ing.",
    tier2: "play, soccer, like",
    tier3: "I like playing soccer.",
  },
};

const completeSnapshot = {
  missionId,
  title: "After-school likes",
  targetPattern: "I like ___ing.",
  level: "elementary",
  requiredTurns: 1,
  characterId: "default-buddy",
  conversationMode: false,
  requireCompleteSentenceAnswers: true,
  turns: [turn],
};

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

describe("interpretMissionSnapshot", () => {
  it("returns a complete preset mission snapshot", () => {
    expect(interpretMissionSnapshot(completeSnapshot)).toEqual({
      kind: "complete",
      snapshot: completeSnapshot,
    });
  });

  it("returns a complete conversation mission snapshot", () => {
    const snapshot = {
      ...completeSnapshot,
      requiredTurns: 3,
      conversationMode: true,
    };

    expect(interpretMissionSnapshot(snapshot)).toEqual({
      kind: "complete",
      snapshot,
    });
  });

  it("applies the historical defaults to an older complete snapshot", () => {
    const result = interpretMissionSnapshot({
      missionId,
      title: "Older complete mission",
      targetPattern: "I like ___.",
      level: "elementary",
      requiredTurns: 1,
      turns: [
        {
          prompt: turn.prompt,
          targetExample: turn.targetExample,
          hintLadder: turn.hintLadder,
          turnOrder: 1,
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "complete",
      snapshot: {
        characterId: "default-buddy",
        conversationMode: false,
        requireCompleteSentenceAnswers: true,
        turns: [{ answerShape: "open" }],
      },
    });
  });

  it("returns the exact legacy mission snapshot with normalized turn order", () => {
    expect(interpretMissionSnapshot(legacySnapshot)).toEqual({
      kind: "legacy",
      snapshot: {
        missionId,
        title: "Foundation Smoke Assignment",
        characterId: "default-buddy",
        requiredTurns: 1,
        turns: [
          {
            turnOrder: 1,
            prompt: "What are you going to do this weekend?",
            targetExample: "I am going to play soccer.",
          },
        ],
      },
    });
  });

  it.each([
    { ...legacySnapshot, turns: [{ prompt: "Question", targetExample: "Answer" }] },
    { ...legacySnapshot, turns: [{ order: 1, targetExample: "Answer" }] },
    { ...legacySnapshot, turns: [{ order: 1, prompt: "Question" }] },
    { ...legacySnapshot, requiredTurns: 2 },
  ])("returns invalid for a broken legacy mission snapshot", (snapshot) => {
    expect(interpretMissionSnapshot(snapshot)).toEqual({ kind: "invalid" });
  });

  it.each([
    null,
    [],
    "snapshot",
    { missionId, title: "Unknown partial", requiredTurns: 1, turns: [] },
    { ...legacySnapshot, targetPattern: "I am going to ___." },
  ])("returns invalid for malformed or unknown partial data", (snapshot) => {
    expect(interpretMissionSnapshot(snapshot)).toEqual({ kind: "invalid" });
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
npm test -- --run src/domain/mission/mission-snapshot.test.ts
```

Expected: FAIL because `@/domain/mission/mission-snapshot` does not exist.

- [ ] **Step 3: Add the minimum interpreter**

Create `src/domain/mission/mission-snapshot.ts` with this content:

```ts
import { z } from "zod";
import {
  missionSnapshotSchema,
  type MissionSnapshot,
} from "@/domain/mission/schemas";

const legacyMissionSnapshotSchema = z
  .object({
    missionId: z.string().uuid(),
    title: z.string().trim().min(1),
    characterId: z.string().trim().min(1),
    requiredTurns: z.number().int().min(1),
    turns: z
      .array(
        z
          .object({
            order: z.number().int().min(1),
            prompt: z.string().trim().min(1),
            targetExample: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine((snapshot) => snapshot.requiredTurns === snapshot.turns.length);

export type LegacyMissionSnapshot = {
  missionId: string;
  title: string;
  characterId: string;
  requiredTurns: number;
  turns: Array<{
    turnOrder: number;
    prompt: string;
    targetExample: string;
  }>;
};

export type MissionSnapshotInterpretation =
  | { kind: "complete"; snapshot: MissionSnapshot }
  | { kind: "legacy"; snapshot: LegacyMissionSnapshot }
  | { kind: "invalid" };

export function interpretMissionSnapshot(
  value: unknown,
): MissionSnapshotInterpretation {
  const complete = missionSnapshotSchema.safeParse(value);
  if (complete.success) {
    return { kind: "complete", snapshot: complete.data };
  }

  const legacy = legacyMissionSnapshotSchema.safeParse(value);
  if (!legacy.success) return { kind: "invalid" };

  return {
    kind: "legacy",
    snapshot: {
      ...legacy.data,
      turns: legacy.data.turns.map(({ order, ...turn }) => ({
        ...turn,
        turnOrder: order,
      })),
    },
  };
}
```

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```bash
npm test -- --run src/domain/mission/mission-snapshot.test.ts
npm run typecheck
```

Expected: the focused test passes with no skipped tests, and typecheck exits with status 0.

- [ ] **Step 5: Review the focused diff**

Run:

```bash
git diff --check
git diff -- src/domain/mission/mission-snapshot.ts src/domain/mission/mission-snapshot.test.ts
```

Confirm that the diff creates only the interpreter and its public-seam tests. Confirm that no caller, assignment builder, schema, migration, or dependency changed.

- [ ] **Step 6: Commit the interpreter**

Run:

```bash
git add src/domain/mission/mission-snapshot.ts src/domain/mission/mission-snapshot.test.ts
git commit -m "feat: classify mission snapshots once"
```

Expected: one implementation commit contains only these two files.

---

### Task 2: Verify and Review Issue #21

**Files:**

- Modify only if a review finding requires an Issue #21 correction: `src/domain/mission/mission-snapshot.ts`, `src/domain/mission/mission-snapshot.test.ts`
- Modify: `TASK.md` (local and ignored; do not stage it)

- [ ] **Step 1: Run final verification**

Run these commands in this order:

```bash
npm test -- --run src/domain/mission/mission-snapshot.test.ts
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check <base-sha>...HEAD
```

Expected: all commands exit with status 0. The focused test has no skips. Record the exact commands and results in `TASK.md`.

- [ ] **Step 2: Review both standards and Issue #21**

Use the implementation base from Task 0 as `<base-sha>`. Run:

```bash
git diff <base-sha>...HEAD
git log <base-sha>..HEAD --oneline
```

Use the repository code-review workflow. Review standards against `AGENTS.md`, `PROJECT.md`, and the Karpathy Guidelines. Review behavior against GitHub issue #21, ADR 0002, and the approved design specification.

Expected: no unresolved standards or specification findings. If a finding requires a code change, add one failing public-seam test when behavior changes, make the minimum fix, rerun Task 2 Step 1, and commit the correction.

- [ ] **Step 3: Record the issue milestone**

Update `TASK.md` with the implementation commits, final verification evidence, review result, and one next action: start caller migration issue #22 only after a separate request. Do not close issue #21, push, create a pull request, deploy, or mutate production without separate approval.
