# Protect Spoken-Answer Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require the shared mission-snapshot interpreter to return `complete` before spoken-answer processing can consume budget, write audio evidence, or call providers.

**Architecture:** Keep the existing audio-upload entry point, ownership checks, result contract, and processing order. Replace its direct mission schema parse with `interpretMissionSnapshot`, accept only the `complete` branch, and add public-boundary tests that observe the absence of writes and paid/provider work for legacy and invalid data.

**Tech Stack:** TypeScript, Supabase, the existing mission snapshot interpreter, and Vitest.

## Global Constraints

- Issue #23 changes only spoken-answer snapshot admission and its focused tests.
- Only a `complete` interpreter result can continue spoken-answer processing.
- Legacy and invalid results return the existing `{ ok: false, error: "invalid_audio", retryable: false }` result.
- Legacy and invalid results stop before provider-budget admission, `file.arrayBuffer()`, attempt-turn writes, audio-clip writes, Storage uploads, transcription, evaluation, pronunciation scoring, moderation, or conversation generation.
- Preserve existing assignment-student ownership filters, attempt ownership filters, status checks, cancellation checks, audio validation, and request-budget order.
- Preserve complete preset behavior and complete conversation behavior, including authored and dynamic turns, hints, evaluation, generation, moderation, and recovery.
- Add no dependency, database migration, new result variant, test-only production interface, or unrelated refactor.
- Preserve the Issue #21 interpreter and the Issue #22 live-attempt gates.
- Unfiltered lint currently scans ignored generated artifacts under `.ua/`, `.worktrees/`, and `supabase/.temp/`. Run it and record that result, then run source lint with those confirmed ignored paths excluded.

## File Structure

- Modify `src/server/student-access/audio-upload.ts` to consume the shared interpreter and return only its complete snapshot.
- Modify `tests/server/audio-upload.test.ts` to prove the interpreter seam and observable no-work boundary for legacy and invalid data.
- Run `src/server/student-access/audio-upload.test.ts` unchanged to protect complete conversation behavior.
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

Record the commit as the Issue #23 review base in `TASK.md`. Expected: the current branch is `codex/deepen-mission-snapshot-interpretation`, and no tracked working-tree change overlaps the two implementation files.

---

### Task 1: Route Spoken-Answer Admission Through the Interpreter

**Files:**

- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `tests/server/audio-upload.test.ts`

**Interfaces:**

- Consumes: `interpretMissionSnapshot(value: unknown): MissionSnapshotInterpretation` from `src/domain/mission/mission-snapshot.ts`.
- Preserves: `uploadAttemptAudioClip(input, deps): Promise<UploadAttemptAudioClipResult>`.
- Produces no new public interface.

- [ ] **Step 1: Let the audio-upload mock represent arbitrary stored JSON**

In `tests/server/audio-upload.test.ts`, change the `createMockSupabase` option from:

```ts
  missionSnapshot?: typeof missionSnapshotFixture;
```

to:

```ts
  missionSnapshot?: unknown;
```

In the assignment-student result, replace:

```ts
                      mission_snapshot:
                        options.missionSnapshot ?? missionSnapshotFixture,
```

with:

```ts
                      mission_snapshot:
                        "missionSnapshot" in options
                          ? options.missionSnapshot
                          : missionSnapshotFixture,
```

This keeps the default complete fixture while allowing tests to supply `null`, legacy JSON, or malformed JSON exactly as stored.

- [ ] **Step 2: Add the exact legacy fixture**

After `missionSnapshotFixture`, add:

```ts
const legacyMissionSnapshotFixture = {
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

- [ ] **Step 3: Write the failing interpreter-seam test**

At the start of `describe("uploadAttemptAudioClip", ...)`, after `beforeEach`, add:

```ts
  it("reads stored mission data through the shared interpreter", () => {
    const source = readFileSync(
      join(process.cwd(), "src/server/student-access/audio-upload.ts"),
      "utf8",
    );

    expect(source).toContain(
      'import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";',
    );
    expect(source).not.toContain("missionSnapshotSchema");
  });
```

The behavior was already fail-closed through the strict schema, so this narrow source seam is the test that distinguishes the required shared interpreter from the old duplicate parser. The safety-effects test in the next step remains behavior-based.

- [ ] **Step 4: Write the no-work boundary test**

Immediately after the interpreter-seam test, add:

```ts
  it.each([
    ["legacy", legacyMissionSnapshotFixture],
    ["invalid", { requiredTurns: 1 }],
  ])(
    "rejects %s mission data before budget, storage, or provider work",
    async (_label, missionSnapshot) => {
      mockSupabase = createMockSupabase({ missionSnapshot });
      const consumeRequestBudget = vi.fn(async () => ({
        allowed: true as const,
      }));
      const transcribeAudioFile = vi.fn();
      const evaluateOriginalTurn = vi.fn();
      const evaluateRepeatTurn = vi.fn();
      const generateCocoReply = vi.fn();
      const isContentSafe = vi.fn();
      const scorePronunciation = vi.fn();
      const file = new Blob(["voice"], { type: "audio/webm" });
      const arrayBuffer = vi.spyOn(file, "arrayBuffer");
      const { uploadAttemptAudioClip } = await import(
        "@/server/student-access/audio-upload"
      );

      await expect(
        uploadAttemptAudioClip(audioInput({ file, body: "voice" }), {
          consumeRequestBudget,
          transcribeAudioFile,
          evaluateOriginalTurn,
          evaluateRepeatTurn,
          generateCocoReply,
          isContentSafe,
          scorePronunciation,
        }),
      ).resolves.toEqual({
        ok: false,
        error: "invalid_audio",
        retryable: false,
      });

      expect(consumeRequestBudget).not.toHaveBeenCalled();
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(
        mockSupabase.operations.filter(({ action }) => action !== "select"),
      ).toHaveLength(0);
      expect(mockSupabase.storage.from).not.toHaveBeenCalled();
      expect(transcribeAudioFile).not.toHaveBeenCalled();
      expect(evaluateOriginalTurn).not.toHaveBeenCalled();
      expect(evaluateRepeatTurn).not.toHaveBeenCalled();
      expect(generateCocoReply).not.toHaveBeenCalled();
      expect(isContentSafe).not.toHaveBeenCalled();
      expect(scorePronunciation).not.toHaveBeenCalled();
    },
  );
```

This asserts public results and observable effects. It does not assert private helper order.

- [ ] **Step 5: Run the focused preset-path test and verify red**

Run:

```bash
npm test -- --run tests/server/audio-upload.test.ts
```

Expected: the interpreter-seam test fails because `audio-upload.ts` still imports `missionSnapshotSchema`. The new legacy/invalid safety cases pass because the old strict parser already fails closed.

- [ ] **Step 6: Replace the duplicate schema parse with the shared interpreter**

In `src/server/student-access/audio-upload.ts`, replace:

```ts
import { missionSnapshotSchema } from "@/domain/mission/schemas";
```

with:

```ts
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
```

In `readMissionSnapshot`, replace:

```ts
  const parsed = missionSnapshotSchema.safeParse(missionSnapshot);
  return parsed.success ? parsed.data : null;
```

with:

```ts
  const result = interpretMissionSnapshot(missionSnapshot);
  return result.kind === "complete" ? result.snapshot : null;
```

Do not move the call relative to ownership, status, cancellation, turn, budget, storage, or provider checks. Do not change the existing invalid-audio result.

- [ ] **Step 7: Run focused preset and conversation tests and typecheck**

Run:

```bash
npm test -- --run tests/server/audio-upload.test.ts src/server/student-access/audio-upload.test.ts
npm run typecheck
```

Expected: both focused files pass with no skips, and typecheck exits with status 0. Existing complete preset and conversation tests remain the regression coverage for answer, hint, evaluation, moderation, and generation behavior.

- [ ] **Step 8: Commit the spoken-answer boundary**

Run:

```bash
git add src/server/student-access/audio-upload.ts tests/server/audio-upload.test.ts
git diff --cached --check
git commit -m "fix: protect spoken-answer processing"
```

Expected: the commit contains only the interpreter swap and focused boundary tests.

---

### Task 2: Verify and Review Issue #23

**Files:**

- Modify only if a review finding requires an Issue #23 correction: the two files listed above.
- Modify: `TASK.md` (local and ignored; do not stage it)

- [ ] **Step 1: Run final verification**

Run these commands in order:

```bash
npm test -- --run tests/server/audio-upload.test.ts src/server/student-access/audio-upload.test.ts src/domain/mission/mission-snapshot.test.ts
npm test -- --run
npm run typecheck
npm run lint
npx eslint . --ignore-pattern '.ua/**' --ignore-pattern '.worktrees/**' --ignore-pattern 'supabase/.temp/**'
npm run build
git diff --check <base-sha>...HEAD
```

Expected: focused tests pass with no skips. The full suite, typecheck, source lint, and build exit with status 0. Record the unfiltered lint result separately if it contains only the confirmed ignored generated artifacts.

- [ ] **Step 2: Review standards and Issue #23 independently**

Use the implementation base from Task 0 as `<base-sha>`. Review:

```bash
git diff <base-sha>...HEAD
git log <base-sha>..HEAD --oneline
```

Review standards against `AGENTS.md`, `PROJECT.md`, and the Karpathy Guidelines. Review behavior against GitHub Issue #23, ADR 0002, and `docs/superpowers/specs/2026-08-10-deepen-mission-snapshot-interpretation-design.md`.

Expected: no unresolved standards or specification findings. If a finding changes behavior, add one failing boundary test, make the minimum fix, rerun Task 2 Step 1, and commit the correction.

- [ ] **Step 3: Record the milestone**

Update `TASK.md` with the implementation commit, red-green evidence, final verification, review results, and one next action: close Issue #23 only after separate approval. Do not push, create a pull request, deploy, close an issue, or mutate production without separate approval.
