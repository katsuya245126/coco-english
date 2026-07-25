# Turn-Evaluation Strictness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Coco demanding a re-record when its own "correction" is identical to what the student said, and stop destroying the original evaluation when a repeat is written.

**Architecture:** Two independent changes. Task 1 adds a pure deterministic guard in the domain layer (`turn-evaluation.ts`) alongside the two existing guards, wired into the same chain in `applyOriginalTurnEvaluation`. Task 2 changes the repeat write in `audio-upload.ts` to nest the original evaluation under a new `originalEvaluation` key instead of overwriting it, and teaches the inspect script to print it. Neither task requires a database migration.

**Tech Stack:** TypeScript, Zod, Vitest, Supabase (JS client), Next.js.

## Global Constraints

- **No database migration.** `attempt_turns.evaluation` is already a JSON column; both changes are shape changes inside that value. Migration `202607250001` is currently local-only and must not be compounded.
- **Backward compatible reads.** Repeat-evaluation fields stay at the top level of the `evaluation` JSON. Rows written before this change lack `originalEvaluation`; every reader must tolerate its absence.
- **Do not start a dev server.** The user runs their own on port 3000. Tear down any agent-started server before yielding.
- Test command is `npx vitest run <path>` (package script is `vitest`).
- Guard applies to **both** `preset` and `conversation` modes — the defect is not mode-specific.
- Deferred, out of scope: Korean proper nouns, Coco's early session close, opinion-shaped preset targets, the `targetPatternAttempted` flag, and turn 3's plural-`s` rubric question.

---

### Task 1: No-op correction guard

A correction whose `improvedSentence` normalizes equal to the student's transcript is vacuous. It must never force a repeat. Downgrade it to `accepted_original` with no improved sentence — the student's sentence was correct, so there is nothing for a teacher to review.

**Files:**
- Modify: `src/domain/ai/turn-evaluation.ts` (add guard near the existing guards, ~line 270-370)
- Modify: `src/server/student-access/audio-upload.ts:243-250` (add to guard chain)
- Test: `tests/domain/turn-evaluation.test.ts` (append new `describe` block)

**Interfaces:**
- Consumes: `OriginalTurnDecision`, `OriginalTurnGuardContext` (has optional `transcript?: string`), and the module-private `normalizeForParrotComparison(text: string): string` — all already in `turn-evaluation.ts`.
- Produces: `guardNoOpCorrection(decision: OriginalTurnDecision, context: OriginalTurnGuardContext): OriginalTurnDecision` — exported.

- [ ] **Step 1: Write the failing tests**

Append to `tests/domain/turn-evaluation.test.ts`:

```ts
describe("no-op correction guard (attempt 103fa68e turn 2 regression)", () => {
  const context = {
    evaluationMode: "conversation",
    missionQuestion: "What books do you want to read there?",
  } as const;

  it("accepts the original when the correction is identical to the transcript", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardNoOpCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "I want to read many cartoons.",
      },
      { ...context, transcript: "I want to read many cartoons." },
    );

    expect(outcome).toEqual({
      kind: "accepted_original",
      requireRepeat: false,
      improvedSentence: null,
      reinforcement: "positive",
    });
  });

  it("treats case and punctuation differences as a no-op", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardNoOpCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "I want to read many cartoons.",
      },
      { ...context, transcript: "i want to read many cartoons" },
    );

    expect(outcome.kind).toBe("accepted_original");
  });

  it("leaves a genuine correction untouched", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I like adventure cartoons.",
    } as const;

    const outcome = guardNoOpCorrection(decision, {
      ...context,
      transcript: "I like adventure cartoon.",
    });

    expect(outcome).toEqual(decision);
  });

  it("applies in preset mode too", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const outcome = guardNoOpCorrection(
      {
        kind: "needs_correction",
        requireRepeat: true,
        improvedSentence: "I think chocolate ice cream is the best.",
      },
      {
        evaluationMode: "preset",
        missionQuestion: null,
        transcript: "I think chocolate ice cream is the best.",
      },
    );

    expect(outcome.kind).toBe("accepted_original");
  });

  it("leaves non-correction decisions untouched when no transcript is supplied", async () => {
    const { guardNoOpCorrection } = await import(
      "@/domain/ai/turn-evaluation"
    );

    const decision = {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: "I want to read many cartoons.",
    } as const;

    expect(guardNoOpCorrection(decision, context)).toEqual(decision);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/domain/turn-evaluation.test.ts -t "no-op correction guard"`
Expected: FAIL — `guardNoOpCorrection is not a function`.

- [ ] **Step 3: Implement the guard**

In `src/domain/ai/turn-evaluation.ts`, add after `guardParrotedConversationCorrection` (which ends ~line 368). It must appear after `normalizeForParrotComparison` is defined (~line 272):

```ts
/**
 * Deterministic backstop for a vacuous correction. UAT 2026-07-25 (attempt
 * 103fa68e turn 2): the evaluator returned an improvedSentence byte-identical
 * to the student's transcript and still demanded a repeat, so the child
 * re-recorded the same words and was then accepted. A correction that changes
 * nothing cannot be material, so accept the original instead of taxing the
 * student with a repeat.
 *
 * Downgrades to accepted_original rather than teacher_review on purpose: the
 * student's sentence was already correct, so there is nothing for a teacher to
 * adjudicate and flagging would fill the review queue with non-problems.
 */
export function guardNoOpCorrection(
  decision: OriginalTurnDecision,
  context: OriginalTurnGuardContext,
): OriginalTurnDecision {
  if (decision.kind !== "needs_correction") return decision;

  const transcript = context.transcript?.trim();
  if (!transcript) return decision;

  const improved = normalizeForParrotComparison(decision.improvedSentence);
  const said = normalizeForParrotComparison(transcript);
  if (!improved || !said || improved !== said) return decision;

  return {
    kind: "accepted_original",
    requireRepeat: false,
    improvedSentence: null,
    reinforcement: "positive",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/domain/turn-evaluation.test.ts -t "no-op correction guard"`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the guard into the chain**

In `src/server/student-access/audio-upload.ts`, add `guardNoOpCorrection` to the existing import from `@/domain/ai/turn-evaluation`, then wrap the chain at lines ~243-250 so it runs outermost:

```ts
  const decision = guardNoOpCorrection(
    guardNonsensicalMinimalEffortCorrection(
      guardParrotedConversationCorrection(
        decideOriginalTurnOutcome(
          result.evaluation,
          resolvedGuardContext.evaluationMode,
          resolvedGuardContext.missionQuestion,
        ),
        resolvedGuardContext,
      ),
      resolvedGuardContext,
    ),
    resolvedGuardContext,
  );
```

Outermost is correct: the inner guards may convert a `needs_correction` into `retry_original` or `teacher_review`, and those decisions must not then be reinterpreted as no-ops. `guardNoOpCorrection` returns non-`needs_correction` decisions unchanged, so it is a no-op on their output.

- [ ] **Step 6: Run the full suites for both changed modules**

Run: `npx vitest run tests/domain/turn-evaluation.test.ts src/server/student-access/audio-upload.test.ts`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/domain/ai/turn-evaluation.ts src/server/student-access/audio-upload.ts tests/domain/turn-evaluation.test.ts
git commit -m "fix: never demand a repeat for a correction identical to the student's sentence"
```

---

### Task 2: Preserve the original evaluation across a repeat write

The repeat write currently replaces `evaluation` wholesale, destroying the `correctionSeverity` that caused the repeat. Nest the original under `originalEvaluation` instead.

**Files:**
- Modify: `src/server/student-access/audio-upload.ts:1212-1219` (repeat write)
- Modify: `scripts/inspect-attempts.mjs:260-282` (`formatEvaluation`)
- Test: `src/server/student-access/audio-upload.test.ts` (append new `describe` block)

**Interfaces:**
- Consumes: `StoredOriginalTurnEvaluation` (declared ~line 170), `StoredRepeatTurnEvaluation` (~line 194), and the in-scope `originalEvaluation` variable already assigned at line ~1143.
- Produces: the persisted `evaluation` JSON for a repeat turn gains an optional `originalEvaluation: StoredOriginalTurnEvaluation` key. Repeat fields remain at the top level.

- [ ] **Step 1: Extend the stored repeat type**

In `src/server/student-access/audio-upload.ts`, add the optional field to `StoredRepeatTurnEvaluation` (~line 194):

```ts
type StoredRepeatTurnEvaluation = {
  version: typeof AI_EVALUATION_VERSION;
  outcome: RepeatTurnDecision["kind"];
  confidence: RepeatTurnEvaluation["confidence"];
  reviewReason: RepeatTurnEvaluation["reviewReason"];
  englishLanguage: RepeatTurnEvaluation["englishLanguage"];
  repeatCloseEnough: RepeatTurnEvaluation["repeatCloseEnough"];
  repeatAccepted: boolean | null;
  requireRepeat: boolean;
  originalEvaluation?: StoredOriginalTurnEvaluation;
};
```

- [ ] **Step 2: Write the failing test**

Append to `src/server/student-access/audio-upload.test.ts`. This uses the file's
existing harness: `createMockSupabase({ turnEvaluation })` seeds
`turn.evaluation` (mock line ~256), and `mockSupabase.operations` records every
write with its payload (mock lines ~163-172).

`audioInput()` hardcodes `clipKind: "original_answer"` (line ~43), so this test
overrides it inline to drive the repeat path.

```ts
describe("repeat write preserves the original evaluation (2026-07-25)", () => {
  const storedOriginalEvaluation = {
    version: "ai-eval-v1",
    outcome: "needs_correction",
    confidence: "high",
    reviewReason: null,
    meaningUnderstood: true,
    targetPatternAttempted: true,
    englishLanguage: "english",
    correctionNeeded: true,
    correctionSeverity: "material",
    improvedSentence: "I like adventure cartoons.",
    requireRepeat: true,
  };

  beforeEach(() => {
    vi.resetModules();
    mockLog.mockClear();
    process.env.STUDENT_AUDIO_BUCKET = "student-audio";
  });

  it("nests the prior original evaluation under originalEvaluation", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: storedOriginalEvaluation,
    });
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    const result = await uploadAttemptAudioClip(
      { ...audioInput({ turnOrder: 1 }), clipKind: "repeat_attempt" as const },
      {
        transcribeAudioFile: successfulTranscriber("I like adventure cartoons."),
        evaluateRepeatTurn: vi.fn(async () => ({
          ok: true as const,
          evaluation: {
            version: "ai-eval-v1",
            outcome: "repeat_accepted",
            repeatCloseEnough: true,
            englishLanguage: "english",
            confidence: "high",
            reviewReason: null,
          },
        })),
      },
    );

    expect(result.ok).toBe(true);

    const turnUpdate = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "update" &&
        (operation.payload as { repeat_transcript?: unknown })
          .repeat_transcript !== undefined,
    );
    if (!turnUpdate) throw new Error("expected a repeat turn update");

    const written = (turnUpdate.payload as { evaluation: Record<string, unknown> })
      .evaluation;

    // Repeat fields stay at the top level so existing readers keep working.
    expect(written).toMatchObject({
      outcome: "accepted_repeat",
      repeatCloseEnough: true,
    });
    // The evaluation that caused the repeat survives.
    expect(written.originalEvaluation).toMatchObject({
      correctionSeverity: "material",
      improvedSentence: "I like adventure cartoons.",
    });
  });

  it("omits originalEvaluation when no prior evaluation exists", async () => {
    mockSupabase = createMockSupabase();
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );

    await uploadAttemptAudioClip(
      { ...audioInput({ turnOrder: 1 }), clipKind: "repeat_attempt" as const },
      {
        transcribeAudioFile: successfulTranscriber("I like adventure cartoons."),
        evaluateRepeatTurn: vi.fn(async () => ({
          ok: true as const,
          evaluation: {
            version: "ai-eval-v1",
            outcome: "repeat_accepted",
            repeatCloseEnough: true,
            englishLanguage: "english",
            confidence: "high",
            reviewReason: null,
          },
        })),
      },
    );

    const turnUpdate = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "update" &&
        (operation.payload as { repeat_transcript?: unknown })
          .repeat_transcript !== undefined,
    );
    if (!turnUpdate) throw new Error("expected a repeat turn update");

    const written = (turnUpdate.payload as { evaluation: Record<string, unknown> })
      .evaluation;
    expect(written).not.toHaveProperty("originalEvaluation");
  });
});
```

Note: the second test seeds no `turnEvaluation`, so `turn.improved_sentence` is
`null`. The repeat path requires a non-null `repeatTarget` (line ~815). If this
test hits the `invalid_audio` early return, extend `createMockSupabase`'s
`options` with an `improvedSentence` seed for the `attempt_turns` `single()`
response rather than weakening the assertion.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/server/student-access/audio-upload.test.ts -t "preserves the original evaluation"`
Expected: FAIL — the captured payload has no `originalEvaluation` key.

- [ ] **Step 4: Add the type guard**

The original and the repeat arrive as **separate uploads**, so the in-memory
`originalEvaluation` variable (assigned at line ~1143) is normally `undefined`
during the repeat request. The durable source is the row itself.

No query change is needed: the `turnInit` upsert at line ~806 already selects
`"id, original_transcript, improved_sentence, evaluation"`, so `turn.evaluation`
holds the original evaluation written by the earlier request.

Add this type guard near `priorMinimalEffortBlocks` (~line 387):

```ts
/**
 * `attempt_turns.evaluation` holds either an original or a repeat evaluation.
 * `repeatCloseEnough` appears only on repeat evaluations and
 * `correctionSeverity` only on originals, so the pair distinguishes them
 * without a version bump. Guards against re-nesting an already-nested repeat
 * evaluation if a turn is written twice.
 */
function isStoredOriginalEvaluation(
  value: unknown,
): value is StoredOriginalTurnEvaluation {
  return (
    typeof value === "object" &&
    value !== null &&
    "correctionSeverity" in value &&
    !("repeatCloseEnough" in value)
  );
}
```

- [ ] **Step 5: Change the repeat write**

In `src/server/student-access/audio-upload.ts` at the repeat write (~line 1212).
Prefer the in-memory value when present, else fall back to the stored row, and
omit the key entirely when neither exists:

```ts
            const priorOriginalEvaluation =
              originalEvaluation ??
              (isStoredOriginalEvaluation(turn.evaluation)
                ? turn.evaluation
                : undefined);

            const write = await timeStage("turnWrite", () =>
              supabase
                .from("attempt_turns")
                .update({
                  repeat_transcript: transcript,
                  repeat_accepted: decision.repeatAccepted,
                  evaluation: toJson({
                    ...decision,
                    ...(priorOriginalEvaluation
                      ? { originalEvaluation: priorOriginalEvaluation }
                      : {}),
                  }),
                })
                .eq("id", turn.id),
            );
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/server/student-access/audio-upload.test.ts -t "preserves the original evaluation"`
Expected: PASS.

- [ ] **Step 7: Print the nested original in the inspect script**

In `scripts/inspect-attempts.mjs`, at the end of `formatEvaluation` (before `return lines.join("\n")`, ~line 281):

```js
  if (evaluation.originalEvaluation) {
    lines.push("    --- original evaluation (before repeat) ---");
    for (const line of formatEvaluation(evaluation.originalEvaluation).split("\n")) {
      lines.push(`    ${line.trimStart()}`);
    }
  }
```

- [ ] **Step 8: Run the full upload suite**

Run: `npx vitest run src/server/student-access/audio-upload.test.ts`
Expected: PASS, no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts scripts/inspect-attempts.mjs
git commit -m "fix: keep the original evaluation when writing a repeat"
```

---

### Task 3: End-to-end verification

**Files:** none modified — this task produces evidence.

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run`
Expected: PASS. Investigate any failure before proceeding; do not proceed on red.

- [ ] **Step 2: Live chat run**

Ask the user to run a dynamic-chat mission on their own dev server (port 3000) and answer one turn correctly enough that Coco previously would have demanded a repeat. **Do not start a server.**

- [ ] **Step 3: Re-run the inspect script**

Run: `node scripts/inspect-attempts.mjs`
Expected: for any turn ending in a repeat, the output now includes an `--- original evaluation (before repeat) ---` block showing `correctionSeverity`.

- [ ] **Step 4: Report findings**

Report honestly whether a no-op correction was observed and blocked, and whether the nested original evaluation appeared. If the live run produced no repeat turn, say so — absence of a reproduction is not confirmation of the fix.

---

## Follow-up (not in this plan)

Once Task 2 has collected real data, revisit turn 3's plural-`s` case (`adventure cartoon` → `adventure cartoons` forcing a re-record) with the now-visible `correctionSeverity`, and decide whether the `material` vs `minor` rubric boundary needs loosening. That decision was deliberately deferred pending evidence.
