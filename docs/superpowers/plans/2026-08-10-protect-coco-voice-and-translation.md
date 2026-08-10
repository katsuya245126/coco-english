# Protect Coco Voice and Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require the shared mission-snapshot interpreter to return `complete` before any owned Coco voice line or translation source can reach budget, cache, or provider work.

**Architecture:** Gate the existing TTS route once, immediately after ownership and cancellation checks, so every voice-eligible line kind shares the same complete-snapshot boundary. Replace translation source lookup's direct schema parse with the same interpreter and preserve both routes' existing ownership, not-found, budget, cache, and provider behavior.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, the existing mission snapshot interpreter, and Vitest.

## Global Constraints

- Issue #24 changes only the student TTS snapshot boundary, translation-source snapshot boundary, and their focused tests.
- Mission prompts, feedback, transitions, completion lines, and dynamic lines require a `complete` interpreter result before voice work.
- Translation source lookup requires a `complete` interpreter result.
- Legacy and invalid results stop before TTS or translation cache lookup, cache writes, provider-budget admission, paid voice requests, or paid translation requests.
- Preserve existing student ownership filters, latest-attempt scoping, canceled-assignment checks, descriptor validation, and request-budget order.
- Preserve the existing `404 { ok: false, error: "not_found" }` route behavior and `{ ok: false, error: "not_found" }` translation-source result for rejected snapshots.
- Preserve valid complete-snapshot prompt, improved-sentence, feedback, transition, completion, dynamic-line, and translation behavior.
- Add no dependency, database migration, new result variant, test-only production interface, parsing compatibility rule, or unrelated refactor.
- Preserve the Issue #21 interpreter and the Issue #22–23 live-attempt and spoken-answer gates.
- Unfiltered lint currently scans ignored generated artifacts under `.ua/`, `.worktrees/`, and `supabase/.temp/`. Run it and record that result, then run source lint with those confirmed ignored paths excluded.

## File Structure

- Modify `src/app/student/missions/[assignmentStudentId]/tts/route.ts` to reject every voice line unless the interpreter returns `complete`.
- Modify `tests/server/student-helper-budget-routes.test.ts` to cover prompt, dynamic, feedback, transition, and completion requests across legacy and invalid snapshots before budget/cache work.
- Modify `src/server/student-access/translation-source.ts` to return sources only from a complete interpreter result.
- Modify `tests/server/translation-source.test.ts` to cover the shared interpreter seam and fail-closed dynamic lookup.
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

Record the commit as the Issue #24 review base in `TASK.md`. Expected: the current branch is `codex/deepen-mission-snapshot-interpretation`, and no tracked working-tree change overlaps the four implementation files.

---

### Task 1: Protect Every Coco Voice Line

**Files:**

- Modify: `src/app/student/missions/[assignmentStudentId]/tts/route.ts`
- Modify: `tests/server/student-helper-budget-routes.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation` from `src/domain/mission/mission-snapshot.ts`.
- Preserves: `POST(request, context)` and every existing HTTP status/body mapping.
- Produces no new public interface.

- [ ] **Step 1: Add source-reading imports and the exact legacy fixture**

At the top of `tests/server/student-helper-budget-routes.test.ts`, add:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
```

After `missionSnapshot`, add:

```ts
const legacyMissionSnapshot = {
  missionId: "33333333-3333-4333-8333-333333333333",
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

- [ ] **Step 2: Let the owned-assignment stub represent arbitrary stored JSON**

Replace `stubOwnedAssignment()` with:

```ts
function stubOwnedAssignment(options: {
  snapshot?: unknown;
  latestAttemptId?: string | null;
} = {}) {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === "assignment_students") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: ASSIGNMENT_STUDENT_ID,
                  student_id: "student-1",
                  latest_attempt_id:
                    "latestAttemptId" in options
                      ? options.latestAttemptId
                      : null,
                  assignments: {
                    mission_snapshot:
                      "snapshot" in options
                        ? options.snapshot
                        : missionSnapshot,
                    canceled_at: null,
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    };
  });
}
```

Keep `stubForeignAssignment` unchanged.

- [ ] **Step 3: Define the complete boundary case matrix**

After `translationRequest`, add:

```ts
const unsupportedVoiceCases = [
  ["legacy", legacyMissionSnapshot],
  ["invalid", { requiredTurns: 1 }],
].flatMap(([snapshotKind, snapshot]) =>
  [
    ["prompt", { lineKind: "mission_prompt", turnOrder: 1 }],
    ["dynamic", { lineKind: "coco_dynamic_line", turnOrder: 2 }],
    [
      "feedback",
      { lineKind: "coco_feedback", feedbackVariant: "accepted_original" },
    ],
    ["transition", { lineKind: "coco_transition" }],
    ["completion", { lineKind: "completion_celebration" }],
  ].map(([lineKind, body]) => [snapshotKind, lineKind, snapshot, body]),
);
```

- [ ] **Step 4: Write the failing interpreter-seam and no-work tests**

At the start of `describe("student helper budget routes", ...)`, after `beforeEach`, add:

```ts
  it("reads TTS mission data through the shared interpreter", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
      ),
      "utf8",
    );

    expect(source).toContain(
      'import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";',
    );
    expect(source).not.toContain("missionSnapshotSchema");
  });

  it.each(unsupportedVoiceCases)(
    "rejects %s snapshot data for %s voice before budget or cache work",
    async (_snapshotKind, _lineKind, snapshot, body) => {
      stubOwnedAssignment({ snapshot, latestAttemptId: "attempt-latest" });

      const response = await postTts(ttsRequest(body));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "not_found",
      });
      expect(mockSupabaseFrom).not.toHaveBeenCalledWith("attempt_turns");
      expect(mockConsume).not.toHaveBeenCalled();
      expect(mockGetOrCreateTtsAudio).not.toHaveBeenCalled();
    },
  );
```

The route's generic feedback, transition, and completion cases are expected to fail before implementation because they currently resolve profile text even when the snapshot parse fails. Prompt and dynamic cases already fail closed; they remain in the matrix as explicit boundary coverage.

- [ ] **Step 5: Run the focused route test and verify red**

Run:

```bash
npm test -- --run tests/server/student-helper-budget-routes.test.ts
```

Expected: the interpreter-seam test and the legacy/invalid generic voice cases fail. Existing valid, invalid-input, foreign-assignment, and rate-limit tests remain green.

- [ ] **Step 6: Gate every voice line through the shared interpreter**

In `src/app/student/missions/[assignmentStudentId]/tts/route.ts`, replace:

```ts
import { missionSnapshotSchema } from "@/domain/mission/schemas";
```

with:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

Replace:

```ts
  const snapshotResult = missionSnapshotSchema.safeParse(rawSnapshot?.mission_snapshot);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;

  const characterId = parsed.data.characterId ?? snapshot?.characterId ?? "default-buddy";
```

with:

```ts
  const snapshotResult = interpretMissionSnapshot(rawSnapshot?.mission_snapshot);
  if (snapshotResult.kind !== "complete") {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }
  const snapshot = snapshotResult.snapshot;

  const characterId = parsed.data.characterId ?? snapshot.characterId;
```

Then replace:

```ts
  if (parsed.data.turnOrder && snapshot) {
```

with:

```ts
  if (parsed.data.turnOrder) {
```

Do not move ownership or cancellation checks. Do not change line resolution, latest-attempt scoping, budget admission, cache calls, or result mapping.

- [ ] **Step 7: Run the focused route tests and typecheck**

Run:

```bash
npm test -- --run tests/server/student-helper-budget-routes.test.ts tests/domain/tts.test.ts
npm run typecheck
```

Expected: both focused files pass with no skips, and typecheck exits with status 0.

- [ ] **Step 8: Commit the TTS boundary**

Run:

```bash
git add 'src/app/student/missions/[assignmentStudentId]/tts/route.ts' tests/server/student-helper-budget-routes.test.ts
git diff --cached --check
git commit -m "fix: protect Coco voice requests"
```

Expected: the commit contains only the complete-snapshot voice gate and focused route tests.

---

### Task 2: Protect Translation Source Lookup

**Files:**

- Modify: `src/server/student-access/translation-source.ts`
- Modify: `tests/server/translation-source.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation`.
- Preserves: `resolveOwnedTranslationSource(input): Promise<ResolveOwnedTranslationSourceResult>`.
- Produces no new public interface.

- [ ] **Step 1: Add source-reading imports and the exact legacy fixture**

At the top of `tests/server/translation-source.test.ts`, add:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
```

After `snapshot`, add:

```ts
const legacySnapshot = {
  missionId: "11111111-1111-4111-8111-111111111111",
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

- [ ] **Step 2: Write the failing interpreter-seam test**

After `beforeEach`, add:

```ts
  it("reads translation mission data through the shared interpreter", () => {
    const source = readFileSync(
      join(process.cwd(), "src/server/student-access/translation-source.ts"),
      "utf8",
    );

    expect(source).toContain(
      'import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";',
    );
    expect(source).not.toContain("missionSnapshotSchema");
  });
```

- [ ] **Step 3: Add the fail-closed translation boundary cases**

Immediately after the interpreter-seam test, add:

```ts
  it.each([
    ["legacy", legacySnapshot],
    ["invalid", { requiredTurns: 1 }],
  ])(
    "rejects %s mission data before dynamic-line lookup",
    async (_label, missionSnapshot) => {
      options.snapshot = missionSnapshot;
      const { resolveOwnedTranslationSource } = await import(
        "@/server/student-access/translation-source"
      );

      await expect(
        resolveOwnedTranslationSource({
          studentId: "student-1",
          assignmentStudentId: "as-1",
          line: { lineKind: "coco_dynamic_line", turnOrder: 2 },
        }),
      ).resolves.toEqual({ ok: false, error: "not_found" });
      expect(operations.map(({ table }) => table)).toEqual([
        "assignment_students",
      ]);
    },
  );
```

The behavior cases pass under the old strict schema; the source-seam test supplies the required RED by distinguishing the shared interpreter from the duplicate parser.

- [ ] **Step 4: Run the focused translation test and verify red**

Run:

```bash
npm test -- --run tests/server/translation-source.test.ts
```

Expected: the interpreter-seam test fails because the service still imports `missionSnapshotSchema`. Existing and new behavior cases remain green.

- [ ] **Step 5: Replace the duplicate schema parse with the shared interpreter**

In `src/server/student-access/translation-source.ts`, replace:

```ts
import {
  missionSnapshotSchema,
  type MissionLevel,
} from "@/domain/mission/schemas";
```

with:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
import type { MissionLevel } from "@/domain/mission/schemas";
```

Replace:

```ts
  const parsedSnapshot = missionSnapshotSchema.safeParse(
    owned.assignments?.mission_snapshot,
  );
  if (!parsedSnapshot.success) return { ok: false, error: "not_found" };

  const snapshot = parsedSnapshot.data;
```

with:

```ts
  const snapshotResult = interpretMissionSnapshot(
    owned.assignments?.mission_snapshot,
  );
  if (snapshotResult.kind !== "complete") {
    return { ok: false, error: "not_found" };
  }

  const snapshot = snapshotResult.snapshot;
```

Do not change ownership filters, cancellation handling, latest-attempt scoping, database-error mapping, source text, or student level.

- [ ] **Step 6: Run focused translation and route tests and typecheck**

Run:

```bash
npm test -- --run tests/server/translation-source.test.ts tests/server/student-helper-budget-routes.test.ts
npm run typecheck
```

Expected: both focused files pass with no skips, and typecheck exits with status 0. The existing route tests continue proving that a rejected translation source stops before budget and cache work.

- [ ] **Step 7: Commit the translation boundary**

Run:

```bash
git add src/server/student-access/translation-source.ts tests/server/translation-source.test.ts
git diff --cached --check
git commit -m "fix: protect translation source lookup"
```

Expected: the commit contains only the interpreter swap and focused translation-source tests.

---

### Task 3: Verify and Review Issue #24

**Files:**

- Modify only if a review finding requires an Issue #24 correction: the four files listed above.
- Modify: `TASK.md` (local and ignored; do not stage it)

- [ ] **Step 1: Run final verification**

Run these commands in order:

```bash
npm test -- --run tests/server/student-helper-budget-routes.test.ts tests/server/translation-source.test.ts tests/domain/tts.test.ts src/domain/mission/mission-snapshot.test.ts
npm test -- --run
npm run typecheck
npm run lint
npx eslint . --ignore-pattern '.ua/**' --ignore-pattern '.worktrees/**' --ignore-pattern 'supabase/.temp/**'
npm run build
git diff --check <base-sha>...HEAD
```

Expected: focused tests pass with no skips. The full suite, typecheck, source lint, and build exit with status 0. Record the unfiltered lint result separately if it contains only the confirmed ignored generated artifacts.

- [ ] **Step 2: Review standards and Issue #24 independently**

Use the implementation base from Task 0 as `<base-sha>`. Review:

```bash
git diff <base-sha>...HEAD
git log <base-sha>..HEAD --oneline
```

Review standards against `AGENTS.md`, `PROJECT.md`, and the Karpathy Guidelines. Review behavior against GitHub issue #24, ADR 0002, and `docs/superpowers/specs/2026-08-10-deepen-mission-snapshot-interpretation-design.md`.

Expected: no unresolved standards or specification findings. If a finding changes behavior, add one failing boundary test, make the minimum fix, rerun Task 3 Step 1, and commit the correction.

- [ ] **Step 3: Record the milestone**

Update `TASK.md` with both implementation commits, red-green evidence, final verification, review results, and one next action: close Issue #24 only after separate approval. Do not push, create a pull request, deploy, close an issue, or mutate production without separate approval.
