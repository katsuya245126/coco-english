# Dynamic Conversation Evaluation and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make conversation-mode evaluation, unclear-speech recovery, generated replies, closings, and attempt evidence behave consistently and actionably for the supplied learner attempts.

**Architecture:** Add one pure evaluation-contract boundary in front of the existing decision layer, then let upload orchestration spend at most one repair call and own the single unclear-speech retry. Keep natural-language evaluation and generation model-owned, but enforce actual question grounding, closing grounding, bounded fallbacks, persistence evidence, and UI progression deterministically.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Node test runner, Supabase server client, OpenAI structured outputs.

## Global Constraints

- Conversation mode changes must not alter preset evaluation or progression.
- `targetPattern` remains soft lesson context in conversation mode.
- Corrections must preserve learner meaning and pass the existing correction grounding policy.
- The first genuinely unclear answer shows its transcript and exact `Hmm... Try again`, offers no Continue action, and requires one same-turn re-recording.
- A second ambiguity or an internal failure must not create another learner retry.
- Use one shared evaluator repair call at most per submitted original recording.
- Preserve mission snapshots, ownership checks, RLS, teacher review, per-turn audio, signed playback, and auditability.
- Add no database migration and rewrite no historical attempts.
- Do not run paid-provider UAT, mutate Supabase, push, deploy, or publish without separate approval.
- Preserve the unrelated `.superpowers/sdd/task-1-report.md` working-tree modification.

---

### Task 1: Pure Original-Evaluation Contract

**Files:**
- Create: `src/domain/ai/original-evaluation-contract.ts`
- Create: `src/domain/ai/original-evaluation-contract.test.ts`
- Modify: `src/server/ai/turn-evaluator.ts`
- Test: `tests/server/turn-evaluator.test.ts`

**Interfaces:**
- Consumes: `OriginalTurnEvaluation`, `AnswerShape`, `validateImprovedSentencePolicy`.
- Produces:
  - `OriginalEvaluationViolation`
  - `canonicalizeNoOpOriginalEvaluation(evaluation, transcript)`
  - `validateOriginalEvaluationContract(input)`
  - `EvaluationRepairInput.violations: OriginalEvaluationViolation[]`

- [ ] **Step 1: Write failing no-op and coherence tests**

```ts
it("canonicalizes an identical minor correction to no correction", () => {
  expect(
    canonicalizeNoOpOriginalEvaluation(
      {
        ...baseEvaluation,
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "minor",
        correctionReason: "grammar",
        improvedSentence: "I am going to the beach.",
      },
      "I am going to the beach.",
    ),
  ).toMatchObject({
    outcome: "correct",
    correctionNeeded: false,
    correctionSeverity: "none",
    correctionReason: "none",
    improvedSentence: null,
    reviewReason: null,
  });
});

it("rejects understood high-confidence ambiguous review", () => {
  expect(
    validateOriginalEvaluationContract({
      evaluation: {
        ...baseEvaluation,
        outcome: "teacher_review",
        meaningUnderstood: true,
        confidence: "high",
        reviewReason: "ambiguous",
      },
      evaluationMode: "conversation",
      answerShape: "open",
      missionQuestion: "What will you do at the beach?",
      targetPattern: "I'm going to ________",
      transcript: "I will swimming and my family eat 삼겹살.",
    }),
  ).toEqual({
    ok: false,
    violations: ["teacher_review_meaning_understood"],
  });
});
```

- [ ] **Step 2: Run the focused tests and observe failure**

Run:

```bash
npx vitest run src/domain/ai/original-evaluation-contract.test.ts tests/server/turn-evaluator.test.ts
```

Expected: FAIL because the new module and repair violation type do not exist.

- [ ] **Step 3: Implement canonicalization and semantic validation**

```ts
export type OriginalEvaluationViolation =
  | "correct_contract_mismatch"
  | "correction_contract_mismatch"
  | "teacher_review_contract_mismatch"
  | "teacher_review_meaning_understood"
  | CorrectionPolicyViolation;

export type OriginalEvaluationContractInput = {
  evaluation: OriginalTurnEvaluation;
  evaluationMode: "preset" | "conversation";
  answerShape: AnswerShape;
  missionQuestion: string | null;
  targetPattern: string;
  transcript: string;
};

export type OriginalEvaluationContractResult =
  | { ok: true; evaluation: OriginalTurnEvaluation }
  | { ok: false; violations: OriginalEvaluationViolation[] };

export function canonicalizeNoOpOriginalEvaluation(
  evaluation: OriginalTurnEvaluation,
  transcript: string,
): OriginalTurnEvaluation {
  if (
    !evaluation.improvedSentence ||
    normalize(evaluation.improvedSentence) !== normalize(transcript)
  ) {
    return evaluation;
  }
  return {
    ...evaluation,
    outcome: "correct",
    correctionNeeded: false,
    correctionSeverity: "none",
    correctionReason: "none",
    improvedSentence: null,
    reviewReason: null,
  };
}

export function validateOriginalEvaluationContract(
  input: OriginalEvaluationContractInput,
): OriginalEvaluationContractResult {
  const { evaluation } = input;
  const violations: OriginalEvaluationViolation[] = [];

  if (evaluation.outcome === "teacher_review") {
    if (evaluation.meaningUnderstood) {
      violations.push("teacher_review_meaning_understood");
    }
    if (
      evaluation.correctionNeeded ||
      evaluation.correctionSeverity !== "none" ||
      evaluation.correctionReason !== "none" ||
      evaluation.improvedSentence !== null ||
      !evaluation.reviewReason
    ) {
      violations.push("teacher_review_contract_mismatch");
    }
  } else if (evaluation.outcome === "correct") {
    if (
      !evaluation.meaningUnderstood ||
      evaluation.correctionNeeded ||
      evaluation.correctionSeverity !== "none" ||
      evaluation.correctionReason !== "none" ||
      evaluation.improvedSentence !== null ||
      evaluation.reviewReason !== null
    ) {
      violations.push("correct_contract_mismatch");
    }
  } else if (evaluation.outcome === "needs_correction") {
    if (
      !evaluation.meaningUnderstood ||
      !evaluation.correctionNeeded ||
      evaluation.correctionSeverity === "none" ||
      evaluation.correctionReason === "none" ||
      !evaluation.improvedSentence ||
      evaluation.reviewReason !== null
    ) {
      violations.push("correction_contract_mismatch");
    }
  }

  if (evaluation.improvedSentence) {
    const correction = validateImprovedSentencePolicy({
      evaluationMode: input.evaluationMode,
      answerShape: input.answerShape,
      missionQuestion: input.missionQuestion,
      targetPattern: input.targetPattern,
      transcript: input.transcript,
      correctionReason: evaluation.correctionReason,
      improvedSentence: evaluation.improvedSentence,
    });
    if (!correction.ok) violations.push(...correction.violations);
  }

  return violations.length === 0
    ? { ok: true, evaluation }
    : { ok: false, violations: [...new Set(violations)] };
}
```

Extend the evaluator repair input so the existing prompt prints all semantic
and correction-policy violation codes without changing provider schema.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run src/domain/ai/original-evaluation-contract.test.ts tests/server/turn-evaluator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/domain/ai/original-evaluation-contract.ts src/domain/ai/original-evaluation-contract.test.ts src/server/ai/turn-evaluator.ts tests/server/turn-evaluator.test.ts
git commit -m "feat: validate original evaluation contracts"
```

---

### Task 2: One Repair Budget and Bounded Ambiguity State

**Files:**
- Modify: `src/domain/ai/turn-evaluation.ts`
- Modify: `tests/domain/turn-evaluation.test.ts`
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`
- Test: `tests/server/audio-upload.test.ts`

**Interfaces:**
- Consumes: Task 1 canonicalizer and validator.
- Produces:
  - retry reason `"unclear_meaning"`
  - `ambiguityRetries: 1`
  - `ambiguityHistory: Array<{ transcript; audioClipId; evaluation }>`
  - unified `evaluateOriginalWithOneRepair(...)`

- [ ] **Step 1: Write failing decision and upload regressions**

```ts
it("uses one same-turn retry for the first coherent ambiguity", () => {
  expect(
    decideOriginalTurnOutcome(
      {
        ...baseOriginalEvaluation,
        outcome: "teacher_review",
        meaningUnderstood: false,
        reviewReason: "ambiguous",
      },
      "conversation",
      "What will you do at the beach?",
      0,
    ),
  ).toEqual({
    kind: "retry_original",
    reason: "unclear_meaning",
    requireRepeat: false,
  });
});

it("repairs the supplied contradictory evaluation once", async () => {
  const evaluate = vi
    .fn()
    .mockResolvedValueOnce(understoodAmbiguousEvaluation)
    .mockResolvedValueOnce(materialBeachCorrection);

  const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
    transcribeAudioFile: successfulTranscriber(
      "I will swimming and my family eat 삼겹살.",
    ),
    evaluateOriginalTurn: evaluate,
    generateCocoReply: generate,
    isContentSafe: moderate,
  });

  expect(evaluate).toHaveBeenCalledTimes(2);
  expect(evaluate.mock.calls[1]?.[0].policyRepair.violations).toContain(
    "teacher_review_meaning_understood",
  );
  expect(result.evaluation).toMatchObject({
    outcome: "needs_correction",
    requireRepeat: true,
  });
});
```

Add cases proving no-op minor persistence, one shared repair call, first
ambiguity skips generation, second ambiguity flags review, internal failure
does not retry, and the first ambiguity evidence survives the second upload.

- [ ] **Step 2: Run focused tests and observe failure**

Run:

```bash
npx vitest run tests/domain/turn-evaluation.test.ts src/server/student-access/audio-upload.test.ts tests/server/audio-upload.test.ts
```

Expected: FAIL on the missing retry reason, repair orchestration, and metadata.

- [ ] **Step 3: Implement the ambiguity decision**

Add `"unclear_meaning"` to `OriginalTurnDecision` and give
`decideOriginalTurnOutcome` a final `priorAmbiguityRetries = 0` parameter.
Only conversation-mode, coherent model `teacher_review` results with
`ambiguous` or `low_confidence` use the retry when the count is zero.
Provider/schema failures continue through the existing direct internal-review
path.

```ts
if (
  evaluationMode === "conversation" &&
  evaluation.outcome === "teacher_review" &&
  (evaluation.reviewReason === "ambiguous" ||
    evaluation.reviewReason === "low_confidence") &&
  priorAmbiguityRetries === 0
) {
  return {
    kind: "retry_original",
    reason: "unclear_meaning",
    requireRepeat: false,
  };
}
```

- [ ] **Step 4: Replace correction-only repair with one unified repair**

```ts
async function evaluateOriginalWithOneRepair(
  evaluate: typeof evaluateOriginalTurn,
  input: EvaluateOriginalTurnInput,
  initial: OriginalTurnEvaluationResult,
) {
  if (!initial.ok) return initial;

  const first = canonicalizeNoOpOriginalEvaluation(
    initial.evaluation,
    input.transcript,
  );
  const firstContract = validateOriginalEvaluationContract({
    evaluation: first,
    evaluationMode: input.evaluationMode,
    answerShape: input.answerShape ?? "open",
    missionQuestion: input.missionQuestion ?? null,
    targetPattern: input.targetPattern,
    transcript: input.transcript,
  });
  if (firstContract.ok) return { ok: true as const, evaluation: first };

  const repaired = await evaluate({
    ...input,
    policyRepair: { violations: firstContract.violations },
  });
  if (!repaired.ok) return internalReviewFrom(first);

  const normalized = canonicalizeNoOpOriginalEvaluation(
    repaired.evaluation,
    input.transcript,
  );
  const repairedContract = validateOriginalEvaluationContract({
    evaluation: normalized,
    evaluationMode: input.evaluationMode,
    answerShape: input.answerShape ?? "open",
    missionQuestion: input.missionQuestion ?? null,
    targetPattern: input.targetPattern,
    transcript: input.transcript,
  });
  if (repairedContract.ok) {
    return { ok: true as const, evaluation: normalized };
  }
  log("warn", "ai.original_evaluation_contract_rejected", {
    violations: repairedContract.violations,
  });
  return internalReviewFrom(normalized);
}

function internalReviewFrom(
  evaluation: OriginalTurnEvaluation,
): OriginalTurnEvaluationResult {
  return {
    ok: true,
    evaluation: {
      ...evaluation,
      outcome: "teacher_review",
      meaningUnderstood: false,
      correctionNeeded: false,
      correctionSeverity: "none",
      correctionReason: "none",
      improvedSentence: null,
      reviewReason: "ambiguous",
    },
  };
}
```

Log the final violations and copy them into the stored application evaluation
beside the internal-review decision; do not add them to the provider schema.

Persist first ambiguity metadata with the current `audioClip.id`. On the
second submission, read `ambiguityRetries` and carry `ambiguityHistory`
forward before the turn upsert. Return immediately after writing/scoring a
first ambiguity so `runConversationTurn` is not called.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/domain/turn-evaluation.test.ts src/server/student-access/audio-upload.test.ts tests/server/audio-upload.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/domain/ai/turn-evaluation.ts tests/domain/turn-evaluation.test.ts src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts tests/server/audio-upload.test.ts
git commit -m "feat: bound unclear speech recovery"
```

---

### Task 3: Required Retry UI, TTS, and Resume

**Files:**
- Modify: `src/domain/flow/completion.ts`
- Modify: `tests/server/mission-flow.test.ts`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `src/components/student/StepAiEvaluationFeedback.tsx`
- Modify: `src/app/student/missions/[assignmentStudentId]/tts/route.ts`
- Test: `tests/server/student-mission-flow.test.ts`

**Interfaces:**
- Consumes: stored `retry_original / unclear_meaning`.
- Produces: UI feedback kind `retryUnclearMeaning` and TTS variant
  `retry_unclear_meaning`.

- [ ] **Step 1: Write failing resume and UI contract tests**

```ts
it("restores unclear meaning as a required same-turn retry", () => {
  expect(
    getPendingTurnReview({
      ...makeTurn(2, { original_transcript: "swimming and eat good food." }),
      evaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        requireRepeat: false,
      },
    }),
  ).toMatchObject({
    step: "aiFeedback",
    outcome: "retryUnclearMeaning",
    transcript: "swimming and eat good food.",
  });
});
```

Add source/component assertions that the exact copy is present, no Continue
handler is passed for this kind, `onRetry` is present, and the conversation
auto-advance branch excludes it.

- [ ] **Step 2: Run focused tests and observe failure**

Run:

```bash
npx vitest run tests/server/mission-flow.test.ts tests/server/student-mission-flow.test.ts
```

Expected: FAIL because the new feedback kind and copy do not exist.

- [ ] **Step 3: Implement persisted feedback mapping and UI**

Add `retryUnclearMeaning` to `PendingTurnReview` and `OriginalFeedback`.
Map `retryReason === "unclear_meaning"` before the generic retry branch.

Add a dedicated feedback branch:

```tsx
if (outcome === "retryUnclearMeaning") {
  return (
    <div style={stepCardStyle} aria-live="polite" role="alert">
      <Transcript transcript={transcript} audioUrl={audioUrl} />
      <RecordingReview onRetry={onRetry} />
    </div>
  );
}
```

The Coco presentation owns the exact visible/spoken line:

```ts
if (
  flow.step === "aiFeedback" &&
  flow.originalFeedback?.kind === "retryUnclearMeaning"
) {
  return {
    text: "Hmm... Try again",
    line: {
      lineKind: "coco_feedback",
      feedbackVariant: "retry_unclear_meaning",
    },
  };
}
```

Map `retry_unclear_meaning` to the same exact TTS text. Pass no `onContinue`
for the new feedback kind and retain the original-question retry action.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/server/mission-flow.test.ts tests/server/student-mission-flow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/domain/flow/completion.ts tests/server/mission-flow.test.ts src/components/student/MissionFlowShell.tsx src/components/student/StepAiEvaluationFeedback.tsx src/app/student/missions/[assignmentStudentId]/tts/route.ts tests/server/student-mission-flow.test.ts
git commit -m "feat: show required unclear speech retry"
```

---

### Task 4: Follow-Up, Closing, Fallback, and Rejection Evidence

**Files:**
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `src/domain/ai/conversation-generation.test.ts`
- Modify: `src/server/ai/conversation-generator.ts`
- Modify: `src/server/ai/conversation-generator.test.ts`
- Modify: `src/domain/conversation/fallback-lines.ts`
- Modify: `src/domain/conversation/fallback-lines.test.ts`
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Produces:
  - live violation `"closing_ungrounded"`
  - `reply_policy_failed.rejectedCandidate`
  - uncertain fallback `Thanks for trying! What else do you want to tell me?`
- Retains historical `"focus_mismatch"` type readability without emitting it.

- [ ] **Step 1: Write failing policy tests**

```ts
it("does not reject an on-topic question for a paraphrased focus label", () => {
  expect(
    validateGeneratedCocoReplyParts(
      {
        reaction: "That sounds nice!",
        focus: "family meal",
        question: "What food will you eat with your family?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What will you do at the beach?",
        latestStudentResponse:
          "I will swimming and my family eat 삼겹살.",
      },
    ),
  ).toEqual({ ok: true });
});

it("rejects a normal closing that ignores the latest food answer", () => {
  expect(
    validateGeneratedCocoReplyParts(
      {
        reaction: "I am glad you told me about your plans at the beach.",
        focus: null,
        question: null,
      },
      {
        expectsQuestion: false,
        requireClosingGrounding: true,
        latestStudentResponse: "watermelon and shrimp and 삼겹살 BBQ.",
      },
    ),
  ).toEqual({ ok: false, reasons: ["closing_ungrounded"] });
});
```

Add adapter tests proving the corrected candidate is returned when grounded,
the final rejected parts are included on policy failure, review-pending
closings use the neutral fallback, and genuine topic drift is still rejected.

- [ ] **Step 2: Run focused tests and observe failure**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: FAIL on focus behavior, closing grounding, evidence, and fallback.

- [ ] **Step 3: Implement question-owned focus validation**

Remove the live `focus_mismatch` push from
`validateGeneratedCocoReplyParts`. Keep the union member and correction hint
only for historical stored events. Continue applying `topic_drift` to the
actual question, plus all existing format and reaction checks.

- [ ] **Step 4: Implement closing grounding**

Add `"closing_ungrounded"` and
`requireClosingGrounding?: boolean` to the pure validator. For a normal closing
with response content words, require at least one related word in the reaction.
Pass `requireClosingGrounding: responseHandling === "normal"` from the server
adapter. Add a specific correction hint; the existing single generation repair
remains the only reply-policy repair.

- [ ] **Step 5: Persist rejected candidate evidence and replace fallback**

Extend policy failure:

```ts
{
  ok: false;
  error: "reply_policy_failed";
  violations: GeneratedCocoReplyLineViolation[];
  rejectedCandidate: GeneratedCocoReplyParts;
  rejectedAttempt: "first" | "corrected";
}
```

Copy these fields into the existing `canned_fallback` moderation event. Do not
store prompt/history/access data. Change only the uncertain fallback constant
to:

```ts
uncertain: "Thanks for trying! What else do you want to tell me?"
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/domain/ai/conversation-generation.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts
git commit -m "fix: keep conversation recovery grounded"
```

---

### Task 5: Accurate Attempt Inspection

**Files:**
- Modify: `scripts/lib/attempt-report.mjs`
- Modify: `scripts/lib/attempt-report.test.mjs`
- Modify: `scripts/inspect-attempts.mjs`

**Interfaces:**
- `formatAttemptTurn(turn, context)` consumes:
  - `promptAnswered`
  - `snapshotTurn`
  - `conversationMode`
  - `generatedTurn`
- Prints separate prompt/next-line fields and rejected candidate parts.

- [ ] **Step 1: Write failing two-turn formatter test**

```js
test("separates the prompt answered from the next generated line", () => {
  const output = [
    ...formatAttemptTurn(turn1, {
      promptAnswered: "What are you going to do this summer?",
      snapshotTurn: { answerShape: "open" },
      conversationMode: true,
      generatedTurn: false,
    }),
    ...formatAttemptTurn(turn2, {
      promptAnswered: "What will you do at the beach?",
      snapshotTurn: null,
      conversationMode: true,
      generatedTurn: true,
    }),
  ].join("\n");

  assert.match(output, /prompt answered: What are you going to do this summer/);
  assert.match(output, /next Coco line: What will you do at the beach/);
  assert.match(output, /answer shape: open \(runtime default\)/);
  assert.doesNotMatch(output, /coco said:/i);
});
```

Add assertions for soft lesson context, missing legacy linkage, rejected
reaction/focus/question, and absence of object keys/access values.

- [ ] **Step 2: Run formatter tests and observe failure**

Run:

```bash
node --test scripts/lib/attempt-report.test.mjs
```

Expected: FAIL because current formatting labels `coco_line` as `coco said`.

- [ ] **Step 3: Implement context-aware formatting and chaining**

In the inspector loop, initialize `promptAnswered` from the frozen opener and
advance it only after printing the current row:

```js
let promptAnswered = snapshot.turns?.[0]?.prompt ?? null;
for (const turn of turns ?? []) {
  const snapshotTurn = snapshotTurnsByOrder.get(turn.turn_order) ?? null;
  for (const line of formatAttemptTurn(turn, {
    promptAnswered,
    snapshotTurn,
    conversationMode: snapshot.conversationMode === true,
    generatedTurn: snapshot.conversationMode === true && !snapshotTurn,
  })) {
    report(line);
  }
  promptAnswered = turn.coco_line ?? null;
}
```

Print `prompt answered`, `next Coco line`, dynamic soft context,
`open (runtime default)`, explicit unavailable linkage, and rejected
structured parts. Continue excluding object keys and credentials.

- [ ] **Step 4: Run formatter and syntax tests**

Run:

```bash
node --test scripts/lib/attempt-report.test.mjs
node --check scripts/lib/attempt-report.mjs
node --check scripts/inspect-attempts.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add scripts/lib/attempt-report.mjs scripts/lib/attempt-report.test.mjs scripts/inspect-attempts.mjs
git commit -m "fix: report conversation turn context accurately"
```

---

### Task 6: Full Verification and Task Record

**Files:**
- Modify: `TASK.md`
- Archive after all checks: `docs/tasks/archive/2026-07-27-dynamic-conversation-evaluation-recovery.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces final deterministic verification evidence and one next action.

- [ ] **Step 1: Run the focused regression set**

```bash
npx vitest run \
  src/domain/ai/original-evaluation-contract.test.ts \
  tests/domain/turn-evaluation.test.ts \
  tests/server/turn-evaluator.test.ts \
  src/server/student-access/audio-upload.test.ts \
  tests/server/audio-upload.test.ts \
  tests/server/mission-flow.test.ts \
  tests/server/student-mission-flow.test.ts \
  src/domain/ai/conversation-generation.test.ts \
  src/server/ai/conversation-generator.test.ts \
  src/domain/conversation/fallback-lines.test.ts
node --test scripts/lib/attempt-report.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 2: Run broad project verification**

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
node --check scripts/inspect-attempts.mjs
git diff --check
```

Expected: all commands pass; report any pre-existing lint warning separately.

- [ ] **Step 3: Audit every approved acceptance criterion**

Record in `TASK.md` the exact test or command proving:

- contradictory understood review is repaired once;
- identical corrections are canonicalized;
- exact `Hmm... Try again` feedback has transcript, retry, and no Continue;
- first ambiguity stays on-turn and second ambiguity advances to review;
- internal failure never enters ambiguity retry;
- new runtime never generates the old `Can you say it again?` fallback;
- focus paraphrase passes while topic drift fails;
- closing grounding or neutral fallback works;
- inspector prompt/next-line/runtime policy is accurate;
- preset, ownership, audio, and teacher-review contracts remain intact.

- [ ] **Step 4: Archive the completed task and commit verification**

Move `TASK.md` to
`docs/tasks/archive/2026-07-27-dynamic-conversation-evaluation-recovery.md`,
mark it `Complete`, and include the final test counts and command results.

```bash
git add -A TASK.md docs/tasks/archive/2026-07-27-dynamic-conversation-evaluation-recovery.md
git commit -m "docs: record conversation recovery verification"
```

If a paid localhost replay is still desired, leave it as the single next
action requiring separate environment-specific approval; do not run it as part
of deterministic implementation verification.
