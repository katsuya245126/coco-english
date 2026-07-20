# Evaluator Correction-Leakage Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop conversation-mode "Try this" corrections from leaking the prompt's literal example and appending Coco's mission question (phone-UAT item 2, 2026-07-20).

**Architecture:** Two independent layers per the approved spec (`docs/superpowers/specs/2026-07-20-evaluator-correction-leakage-design.md`): (1) a deterministic domain guard extension in `guardParrotedConversationCorrection` that downgrades any conversation-mode correction containing the full normalized mission question to the existing `retry_original`/`parroted_correction` decision, and (2) a prompt rewrite removing the imitable literal example from the incomplete-fragment rule and forbidding appended questions / copied examples.

**Tech Stack:** TypeScript, Zod domain module, Vitest with fake OpenAI Responses clients (never call the paid evaluator).

## Global Constraints

- Conversation mode only; preset decisions must pass through the guard untouched.
- No new decision kinds; reuse `{ kind: "retry_original", reason: "parroted_correction", requireRepeat: false }`.
- Fake clients and unit/source-string tests only; no network calls in tests.
- Keep the instruction lines "Example: for missionQuestion 'How often do you play soccer?'…" and "Example: correct 'I no play soccer.'…" unchanged — existing tests assert their content.
- Do not touch `.claude/worktrees/dynamic-dialogue-pagination` or `.superpowers/private-tools/`.
- Work directly on `main` (project convention; no remote configured). No push.

---

### Task 1: Domain guard — catch appended-question corrections

**Files:**
- Modify: `src/domain/ai/turn-evaluation.ts:193-215` (`guardParrotedConversationCorrection`)
- Test: `tests/domain/turn-evaluation.test.ts` (append inside the `describe("parroted conversation-correction guard (UAT 2026-07-16 regression)")` block, before its closing `});` at the end of the file)

**Interfaces:**
- Consumes: existing `guardParrotedConversationCorrection(decision, context)` and `normalizeForParrotComparison` in the same file.
- Produces: same exported signature, one additional trigger — normalized improved sentence containing the normalized full mission question as a whole-word phrase.

- [ ] **Step 1: Write two failing tests**

Add inside the existing parroted-guard `describe` block:

```ts
  it("downgrades a declarative correction with the mission question appended (UAT 2026-07-20 regression)", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardParrotedConversationCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence:
          "I don't play soccer. What games do you like to play?",
      },
      {
        evaluationMode: "conversation",
        missionQuestion: "What games do you like to play?",
      },
    );

    expect(outcome).toEqual({
      kind: "retry_original",
      reason: "parroted_correction",
      requireRepeat: false,
    });
  });

  it("keeps a correction that asks a different question back", async () => {
    const { guardParrotedConversationCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I like Valorant. What about you?",
    } as const;

    expect(
      guardParrotedConversationCorrection(decision, {
        evaluationMode: "conversation",
        missionQuestion: "What games do you like to play?",
      }),
    ).toEqual(decision);
  });
```

- [ ] **Step 2: Run the domain tests to verify the new regression test fails**

Run: `npx vitest run tests/domain/turn-evaluation.test.ts`
Expected: the appended-question test FAILS (guard returns the `needs_correction` decision unchanged); the different-question-back test passes (guard already ignores it — it stays as a pinned negative case); all pre-existing tests pass.

- [ ] **Step 3: Extend the guard**

In `src/domain/ai/turn-evaluation.ts`, replace the `parroted` computation:

```ts
  const parroted =
    improved === question ||
    (decision.improvedSentence.trim().endsWith("?") &&
      question.includes(improved));
```

with:

```ts
  const parroted =
    ` ${improved} `.includes(` ${question} `) ||
    (decision.improvedSentence.trim().endsWith("?") &&
      question.includes(improved));
```

(The whole-word containment check subsumes the old equality check and catches the appended-question shape.) Extend the doc comment above the function with one sentence noting the 2026-07-20 UAT shape: a declarative answer with the full mission question appended is also flagged.

- [ ] **Step 4: Run the domain tests to verify all pass**

Run: `npx vitest run tests/domain/turn-evaluation.test.ts`
Expected: PASS (all tests, including the five pre-existing parrot-guard tests).

- [ ] **Step 5: Run the orchestration regression**

Run: `npx vitest run src/server/student-access/audio-upload.test.ts`
Expected: PASS (guard wiring unchanged; behavior superset only).

- [ ] **Step 6: Commit**

```bash
git add src/domain/ai/turn-evaluation.ts tests/domain/turn-evaluation.test.ts
git commit -m "fix(ai): reject conversation corrections containing the mission question"
```

---

### Task 2: Prompt rewrite — remove imitable literal, forbid appended questions

**Files:**
- Modify: `src/server/ai/turn-evaluator.ts:102-111` (`conversationInstructions`)
- Test: `tests/server/turn-evaluator.test.ts` (append a new `it` inside the `describe` block containing "instructs conversation correction to preserve meaning", i.e. after that test around line 358)

**Interfaces:**
- Consumes: `buildOriginalPrompt` via `evaluateOriginalTurn` with a fake client (pattern copied from the neighboring tests in the same file).
- Produces: updated `conversationInstructions` strings; no signature changes.

- [ ] **Step 1: Write the failing source-string test**

Add after the "instructs conversation correction to preserve meaning…" test, inside the same `describe`, reusing that test's `createFakeClient` / `correctOriginalProviderResult` helpers already in scope:

```ts
  it("describes fragment expansion without an imitable literal answer and forbids appended questions", async () => {
    const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: correctOriginalProviderResult,
    });

    await evaluateOriginalTurn(
      {
        evaluationMode: "conversation",
        missionQuestion: "What games do you like to play?",
        transcript: "I don't",
        targetPattern: "What games do you _____?",
        targetExample: null,
        level: "elementary",
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(userMessage?.content ?? "{}") as {
      instructions?: string[];
    };

    const fragmentRule = prompt.instructions?.find((line) =>
      line.includes("incomplete fragment"),
    );
    expect(fragmentRule).toBeDefined();
    expect(fragmentRule).not.toContain("I don't play soccer");
    expect(fragmentRule).toContain("student's own words");

    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("single declarative student answer"),
        expect.stringContaining(
          "never copy an example sentence from these instructions",
        ),
      ]),
    );
  });
```

- [ ] **Step 2: Run the server tests to verify it fails**

Run: `npx vitest run tests/server/turn-evaluator.test.ts`
Expected: the new test FAILS (fragment rule still contains "I don't play soccer"; the two new rule strings are absent); all pre-existing tests pass.

- [ ] **Step 3: Rewrite the conversation instructions**

In `src/server/ai/turn-evaluator.ts`, replace the last two entries of `conversationInstructions`:

```ts
  "Example: correct 'I no play soccer.' to 'I don't play soccer.'; do not correct it to 'How often do you play soccer?'.",
  "If the transcript is an incomplete fragment such as 'I don't', expand it into one short full sentence that answers missionQuestion (for example 'I don't play soccer.') and use that as improvedSentence.",
```

with:

```ts
  "Example: correct 'I no play soccer.' to 'I don't play soccer.'; do not correct it to 'How often do you play soccer?'.",
  "If the transcript is an incomplete fragment such as 'I don't', expand it into one short declarative sentence in the student's own words that answers missionQuestion, and use that as improvedSentence.",
  "improvedSentence must be one single declarative student answer: never append missionQuestion or any other question to it, and never copy an example sentence from these instructions into it.",
```

(The `Example: correct 'I no play soccer.'…` line is unchanged and shown only to anchor the edit location.)

- [ ] **Step 4: Run the server tests to verify all pass**

Run: `npx vitest run tests/server/turn-evaluator.test.ts`
Expected: PASS, including the pre-existing tests asserting "I don't play soccer" still appears in the kept accept/correct example lines and `stringContaining("incomplete fragment")`.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/turn-evaluator.ts tests/server/turn-evaluator.test.ts
git commit -m "fix(ai): remove imitable fragment example and forbid appended questions in conversation prompt"
```

---

### Task 3: Full verification and task-record close-out

**Files:**
- Modify: `TASK.md` (check off done checks, update progress)

**Interfaces:**
- Consumes: Tasks 1–2 committed.
- Produces: verified working tree on `main`; factual `TASK.md`.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS (no unrelated failures).

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Update TASK.md and commit**

Mark the done checks and progress boxes complete in `TASK.md`, recording the exact commands run and their results.

```bash
git add TASK.md docs/superpowers/plans/2026-07-20-evaluator-correction-leakage.md
git commit -m "docs: record correction-leakage verification"
```
