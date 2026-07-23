# Evaluation, Follow-up Quality, and Homework Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept minor dynamic-conversation recasts without repetition, improve Coco's bounded follow-up quality, and show an owned text-message Homework Review after the final visible/spoken goodbye.

**Architecture:** Extend the existing structured turn evaluation with an explicit severity and keep the original transcript separate from its optional naturalized sentence in the existing columns. Keep generation stateless and bounded, replace context-free follow-up fallbacks with three deterministic response-state fallbacks, and extend the owned completed-history service to build a dynamic review model from persisted turn rows. Render that model in a new dynamic-only component while leaving preset evaluation, mission completion, and recap presentation on their existing branches.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Zod 3, Supabase service-role reads with existing RLS/ownership assumptions, Vitest 3, Playwright 1.49, CSS Modules.

## Global Constraints

- Dynamic conversation mode only; preset evaluation, authored turns, repeat flow, **Mission complete!** screen, and preset recap presentation remain behaviorally unchanged.
- Preserve the Task 1 closing sequence: the completed attempt stays server-owned, Coco's goodbye remains visible and spoken on the mission page, and **Finish mission** appears only after that closing is available.
- The final-closing fallback remains byte-for-byte `That was fun! Thanks for talking with me. See you next time!`.
- Minor corrections never show live correction UI, never warm improved-sentence TTS, and never require a repeat.
- Material corrections keep the existing correction-and-repeat path.
- Keep `original_transcript` as the learner's actual words and `improved_sentence` as optional naturalized wording; introduce no database migration.
- Conversation history continues to prefer `improved_sentence` over `original_transcript` when the former is present.
- Follow-ups contain exactly one answerable question; a relevant either/or question is permitted; topic drift and run-on detection remain independent.
- Keep the existing one policy-correction generation attempt and existing moderation retry limit; add no provider call or unbounded retry.
- Every follow-up fallback is static, does not interpolate student text, and never falls back to the authored target-pattern hint.
- Homework Review reads only through the existing student-owned completed-history boundary and independently proves student ownership, terminal assignment state, latest terminal attempt, and non-cancellation.
- Preserve per-turn audio, pronunciation evidence, retention behavior, and signed-on-demand playback; introduce no public audio URL.
- Hide teacher-review status and reasons from learners and make no correctness claim for internally reviewed turns.
- No push, merge, deploy, publish, production mutation, or Supabase mutation is part of this plan.
- Before `npm run build`, confirm no development server is using this checkout's `.next` directory.

---

## File and Interface Map

### Evaluation and persistence

- Modify `src/domain/ai/turn-evaluation.ts`
  - Owns `correctionSeveritySchema`, provider-result consistency rules, and the conversation-versus-preset decision boundary.
  - Changes `accepted_original.improvedSentence` from `null` to `string | null`.
- Modify `src/server/ai/turn-evaluator.ts`
  - Teaches the provider the exact `none | minor | material` rules and required examples.
  - Keeps preset behavior by instructing preset output to report severity for storage while the preset decision branch continues to use its existing rules.
- Modify `src/server/student-access/audio-upload.ts`
  - Persists severity and accepted minor improvements.
  - Uses naturalized wording for later generation without exposing it live.
  - Warms improved-sentence TTS only on the material repeat path.
- Modify focused tests:
  - `tests/domain/turn-evaluation.test.ts`
  - `tests/server/turn-evaluator.test.ts`
  - `src/server/student-access/audio-upload.test.ts`
  - `tests/server/audio-upload.test.ts`
  - `src/server/student-access/conversation-history.test.ts`

### Follow-up quality

- Modify `src/domain/ai/conversation-generation.ts`
  - Removes the either/or gate from new policy decisions.
  - Requires sentence-ending punctuation, not a comma, before a new question clause.
  - Runs topic continuity for every follow-up.
- Modify `src/server/ai/conversation-generator.ts`
  - Removes vague-response coupling from deterministic acceptance.
  - Keeps one correction attempt and gives that attempt the precise policy reasons.
- Modify `src/domain/conversation/fallback-lines.ts`
  - Owns response-state classification and the three exact follow-up fallbacks.
  - Keeps the closing fallback in its separate unchanged branch.
- Modify focused tests:
  - `src/domain/ai/conversation-generation.test.ts`
  - `src/server/ai/conversation-generator.test.ts`
  - `src/domain/conversation/fallback-lines.test.ts`
  - `src/server/student-access/audio-upload.test.ts`

### Owned review data

- Modify `src/server/student-access/student-history.ts`
  - Extends `StudentMissionRecap` with `conversationMode`, `characterId`, `finalCocoLine`, original/repeat attempts, optional improvement, and learner-safe review state.
  - Reconstructs dynamic prompts from the snapshot opener plus each prior persisted `coco_line`.
  - Keeps existing signed-audio authorization unchanged.
- Modify `tests/server/student-history.test.ts`
  - Proves reconstruction, learner-safe state mapping, dual-attempt evidence, audio/pronunciation association, and ownership.

### Dynamic Homework Review UI

- Create `src/domain/student/homework-review.ts`
  - Pure word-level LCS diff returning naturalized sentence parts with changed-word flags.
- Create `src/domain/student/homework-review.test.ts`
  - Covers additions, replacements, punctuation, and safe whole-sentence fallback.
- Create `src/components/student/HomeworkReview.tsx`
  - Dynamic-only text-message review with Coco/student identities, red changed words, left-side retry marker, green success message, evidence controls, and final goodbye.
- Create `src/components/student/HomeworkReview.module.css`
  - Owns responsive wrapping, bubble alignment, status colors, and screen-reader-only text.
- Create `src/components/student/HomeworkReview.test.tsx`
  - Server-renders all learner-visible states without database or browser dependencies.
- Modify `src/app/student/history/[assignmentStudentId]/page.tsx`
  - Selects Homework Review only for dynamic recaps and keeps `StudentMissionRecap` for preset recaps.
  - Shows a bounded completed state if an owned review fails internally.
- Modify `src/components/student/MissionFlowShell.tsx`
  - Routes dynamic **Finish mission** to the owned history page.
  - Leaves preset `StepMissionComplete` behavior unchanged.
- Modify regression tests:
  - `tests/server/student-history-ui.test.ts`
  - `tests/server/student-mission-flow.test.ts`
  - `tests/e2e/student-history.spec.ts`

---

### Task 1: Add explicit conversation correction severity

**Files:**
- Modify: `src/domain/ai/turn-evaluation.ts`
- Modify: `src/server/ai/turn-evaluator.ts`
- Modify: `tests/domain/turn-evaluation.test.ts`
- Modify: `tests/server/turn-evaluator.test.ts`

**Interfaces:**
- Produces: `correctionSeveritySchema`
- Produces: `type CorrectionSeverity = "none" | "minor" | "material"`
- Changes: `decideOriginalTurnOutcome(evaluation, evaluationMode?: "preset" | "conversation"): OriginalTurnDecision`
- Changes: the `accepted_original` decision carries `improvedSentence: string | null`
- Consumed by Task 2: `OriginalTurnEvaluation.correctionSeverity` and the accepted-minor decision

- [ ] **Step 1: Add failing domain tests for none, minor, material, and invalid combinations**

Add `correctionSeverity: "none"` to the shared original-evaluation fixture and every existing direct fixture. Add these cases inside the original-turn decision suite:

```ts
it("accepts a minor article recast without a repeat", async () => {
  const { decideOriginalTurnOutcome } = await import(
    "@/domain/ai/turn-evaluation"
  );

  expect(
    decideOriginalTurnOutcome(
      {
        ...baseOriginalEvaluation,
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "minor",
        improvedSentence: "I'm going to the library.",
      },
      "conversation",
    ),
  ).toEqual({
    kind: "accepted_original",
    requireRepeat: false,
    improvedSentence: "I'm going to the library.",
    reinforcement: "positive",
  });
});

it.each([
  ["I want to read cartoons.", "missing infinitive structure"],
  ["I will exercise.", "wrong word category"],
])("requires a repeat for material correction: %s (%s)", async (improvedSentence) => {
  const { decideOriginalTurnOutcome } = await import(
    "@/domain/ai/turn-evaluation"
  );

  expect(
    decideOriginalTurnOutcome(
      {
        ...baseOriginalEvaluation,
        outcome: "needs_correction",
        correctionNeeded: true,
        correctionSeverity: "material",
        improvedSentence,
      },
      "conversation",
    ),
  ).toEqual({
    kind: "needs_correction",
    requireRepeat: true,
    improvedSentence,
  });
});

it.each([
  {
    correctionSeverity: "minor" as const,
    correctionNeeded: true,
    improvedSentence: null,
  },
  {
    correctionSeverity: "material" as const,
    correctionNeeded: true,
    improvedSentence: "Where do you play soccer?",
  },
  {
    correctionSeverity: "none" as const,
    correctionNeeded: true,
    improvedSentence: null,
  },
])("routes inconsistent conversation severity to teacher review", async (fields) => {
  const { decideOriginalTurnOutcome } = await import(
    "@/domain/ai/turn-evaluation"
  );

  expect(
    decideOriginalTurnOutcome(
      {
        ...baseOriginalEvaluation,
        outcome:
          fields.correctionSeverity === "none"
            ? "correct"
            : "needs_correction",
        ...fields,
      },
      "conversation",
    ),
  ).toEqual({
    kind: "teacher_review",
    reviewReason: "failed_schema",
    requireRepeat: false,
  });
});
```

Add one preset regression proving severity does not alter its existing decision:

```ts
it("keeps preset correction behavior independent of conversation severity", async () => {
  const { decideOriginalTurnOutcome } = await import(
    "@/domain/ai/turn-evaluation"
  );
  const evaluation = {
    ...baseOriginalEvaluation,
    outcome: "needs_correction" as const,
    correctionNeeded: true,
    correctionSeverity: "minor" as const,
    improvedSentence: "I play soccer.",
  };

  expect(decideOriginalTurnOutcome(evaluation, "preset")).toEqual({
    kind: "needs_correction",
    requireRepeat: true,
    improvedSentence: "I play soccer.",
  });
});
```

- [ ] **Step 2: Run the domain suite and verify the new contract fails**

Run:

```bash
npm test -- --run tests/domain/turn-evaluation.test.ts
```

Expected: FAIL because `correctionSeverity` and the evaluation-mode argument are not implemented and accepted originals still require `improvedSentence: null`.

- [ ] **Step 3: Implement the mode-aware decision contract**

In `src/domain/ai/turn-evaluation.ts`, add:

```ts
export const correctionSeveritySchema = z.enum([
  "none",
  "minor",
  "material",
]);
export type CorrectionSeverity = z.infer<typeof correctionSeveritySchema>;
```

Add `correctionSeverity: correctionSeveritySchema` to
`originalTurnEvaluationSchema`, change the accepted decision field to
`improvedSentence: string | null`, and replace `decideOriginalTurnOutcome`
with:

```ts
function failedOriginalContract(): OriginalTurnDecision {
  return {
    kind: "teacher_review",
    reviewReason: "failed_schema",
    requireRepeat: false,
  };
}

export function decideOriginalTurnOutcome(
  evaluation: OriginalTurnEvaluation,
  evaluationMode: "preset" | "conversation" = "preset",
): OriginalTurnDecision {
  if (
    evaluation.outcome === "teacher_review" ||
    evaluation.confidence === "low" ||
    evaluation.englishLanguage === "uncertain" ||
    evaluation.reviewReason
  ) {
    return {
      kind: "teacher_review",
      reviewReason: reviewReasonFromEvaluation(evaluation),
      requireRepeat: false,
    };
  }

  if (
    evaluation.outcome === "non_english" ||
    evaluation.englishLanguage === "non_english"
  ) {
    return {
      kind: "retry_original",
      reason: "non_english",
      requireRepeat: false,
    };
  }

  if (evaluationMode === "preset") {
    if (
      evaluation.outcome === "needs_correction" ||
      evaluation.correctionNeeded
    ) {
      return evaluation.improvedSentence
        ? {
            kind: "needs_correction",
            requireRepeat: true,
            improvedSentence: evaluation.improvedSentence,
          }
        : failedOriginalContract();
    }

    return {
      kind: "accepted_original",
      requireRepeat: false,
      improvedSentence: null,
      reinforcement: "positive",
    };
  }

  const severity = evaluation.correctionSeverity;
  const improvedSentence = evaluation.improvedSentence?.trim() || null;
  const expectsCorrection = severity !== "none";
  const validCombination =
    evaluation.correctionNeeded === expectsCorrection &&
    evaluation.outcome ===
      (expectsCorrection ? "needs_correction" : "correct") &&
    (expectsCorrection ? improvedSentence !== null : improvedSentence === null) &&
    !improvedSentence?.includes("?");

  if (!validCombination) return failedOriginalContract();

  if (severity === "material") {
    return {
      kind: "needs_correction",
      requireRepeat: true,
      improvedSentence: improvedSentence!,
    };
  }

  return {
    kind: "accepted_original",
    requireRepeat: false,
    improvedSentence: severity === "minor" ? improvedSentence : null,
    reinforcement: "positive",
  };
}
```

Update `guardParrotedConversationCorrection` so it inspects both
`needs_correction` and an `accepted_original` with a non-null improvement. If
the accepted minor improvement parrots Coco, return teacher review rather than
asking the learner to repeat:

```ts
const improvedSentence =
  decision.kind === "needs_correction" ||
  (decision.kind === "accepted_original" && decision.improvedSentence)
    ? decision.improvedSentence
    : null;
if (!improvedSentence) return decision;
```

Use `improvedSentence` for the comparisons and return the existing
`retry_original` result for `needs_correction`; return
`failedOriginalContract()` for `accepted_original`.

- [ ] **Step 4: Teach the adapter the exact severity boundary**

In `src/server/ai/turn-evaluator.ts`, add common structured-output instructions:

```ts
const correctionSeverityInstructions = [
  "Always set correctionSeverity. Set it to 'none' when no correction is needed, 'minor' for an accepted local function-word recast, and 'material' when repetition is required.",
  "Set correctionNeeded to false only for correctionSeverity 'none'. Set correctionNeeded to true for 'minor' and 'material'.",
  "For 'minor' and 'material', set outcome to 'needs_correction' and provide one non-empty declarative improvedSentence. For 'none', set outcome to 'correct' and improvedSentence to null.",
];
```

Add these conversation-only instructions:

```ts
const conversationSeverityInstructions = [
  "A correction is minor only when meaning is clear and relevant, content words and their word classes are intact, required clause and verb structure is intact, and only a local function-word detail changes.",
  "Example: transcript \"I'm going to library\" may be minor with improvedSentence \"I'm going to the library.\" and must not require repetition.",
  "A correction is material when required clause or verb structure is missing or incorrect, a word has the wrong class or semantic category, content must be invented or replaced, or a complete sentence is required but missing.",
  "Example: \"I want read cartoon\" is material with \"I want to read cartoons.\" because the infinitive structure is missing.",
  "Example: \"I will go to the exercise\" is material with \"I will exercise.\" because exercise is used as the wrong destination-noun category.",
  "Never classify by edit distance, character count, token count, or the short length of an inserted word.",
];
```

Spread the common instructions into every original prompt. Spread the severity
boundary only into conversation prompts. Add a preset instruction that says:

```ts
"For preset output compatibility, report correctionSeverity 'none' for a correct answer and 'material' for an answer that uses the existing needs_correction path; this field does not change preset acceptance rules."
```

Update every fake original provider payload in
`tests/server/turn-evaluator.test.ts` with `correctionSeverity`, then add prompt
assertions for all three required examples and the complete-sentence on/off
behavior.

- [ ] **Step 5: Run evaluator tests**

Run:

```bash
npm test -- --run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts
```

Expected: PASS, including preset regression, minor article omission, material
structure/category cases, and invalid-combination teacher review.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/domain/ai/turn-evaluation.ts src/server/ai/turn-evaluator.ts tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts
git commit -m "feat(ai): classify conversation correction severity"
```

---

### Task 2: Persist accepted minor recasts without live repeat behavior

**Files:**
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`
- Modify: `tests/server/audio-upload.test.ts`
- Modify: `src/server/student-access/conversation-history.test.ts`

**Interfaces:**
- Consumes: `OriginalTurnEvaluation.correctionSeverity`
- Consumes: `accepted_original.improvedSentence: string | null`
- Produces stored evaluation field: `correctionSeverity: CorrectionSeverity | null`
- Preserves: `currentStudentResponse = improved_sentence || original_transcript`

- [ ] **Step 1: Add failing persistence and no-live-TTS tests**

Update every original evaluator fixture in both audio-upload suites with a
consistent severity. Add this conversation-mode case to
`src/server/student-access/audio-upload.test.ts`:

```ts
it("persists an accepted minor recast, grounds Coco with it, and does not warm correction TTS", async () => {
  mockSupabase = createMockSupabase();
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const generate = fakeGenerateCocoReply(async (input) => {
    expect(input.conversationHistory.at(-1)?.studentResponse).toBe(
      "I'm going to the library.",
    );
    return {
      ok: true,
      reply: { line: "The library is nice! What books do you like?" },
    };
  });
  const warmTtsAudioCache = vi.fn(async () => ({ ok: true as const }));

  const result = await uploadAttemptAudioClip(audioInput(), {
    transcribeAudioFile: successfulTranscriber("I'm going to library"),
    evaluateOriginalTurn: successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      correctionSeverity: "minor",
      improvedSentence: "I'm going to the library.",
    }),
    generateCocoReply: generate,
    isContentSafe: vi.fn(async () => ({ safe: true, failedOpen: false })),
    warmTtsAudioCache,
  });

  expect(result).toMatchObject({
    ok: true,
    evaluation: {
      outcome: "accepted_original",
      correctionSeverity: "minor",
      improvedSentence: "I'm going to the library.",
      requireRepeat: false,
    },
  });
  expect(warmTtsAudioCache).not.toHaveBeenCalled();
  expect(mockSupabase.operations).toContainEqual(
    expect.objectContaining({
      table: "attempt_turns",
      action: "upsert",
      payload: expect.objectContaining({
        original_transcript: "I'm going to library",
        improved_sentence: "I'm going to the library.",
      }),
    }),
  );
});
```

Add a material regression asserting the improved sentence still warms TTS and
returns `requireRepeat: true`. Extend the conversation-history suite with:

```ts
it("grounds later Coco turns in a persisted accepted minor recast", () => {
  expect(
    buildConversationHistory({
      openerLine: "Where are you going?",
      currentTurnOrder: 2,
      currentStudentResponse: "I want a comic book.",
      priorTurns: [
        {
          turn_order: 1,
          original_transcript: "I'm going to library",
          improved_sentence: "I'm going to the library.",
          coco_line: "What do you want to read there?",
        },
      ],
    }),
  ).toMatchObject({
    ok: true,
    history: [
      { studentResponse: "I'm going to the library." },
      { studentResponse: "I want a comic book." },
    ],
  });
});
```

- [ ] **Step 2: Run focused persistence tests and verify failure**

Run:

```bash
npm test -- --run src/server/student-access/audio-upload.test.ts tests/server/audio-upload.test.ts src/server/student-access/conversation-history.test.ts
```

Expected: FAIL because accepted-original improvements are dropped and any
non-null improvement currently warms live correction TTS.

- [ ] **Step 3: Persist severity and accepted minor improvements**

In `src/server/student-access/audio-upload.ts`, extend the stored shape:

```ts
correctionSeverity: OriginalTurnEvaluation["correctionSeverity"] | null;
```

For provider/schema failure, store `correctionSeverity: null`. For successful
evaluation, call:

```ts
decideOriginalTurnOutcome(
  result.evaluation,
  resolvedGuardContext.evaluationMode,
)
```

Resolve the stored improvement with:

```ts
const improvedSentence =
  decision.kind === "needs_correction" ||
  decision.kind === "accepted_original"
    ? decision.improvedSentence
    : null;
```

Store:

```ts
correctionSeverity: result.evaluation.correctionSeverity,
```

Keep the existing current-response grounding expression unchanged so a minor
recast reaches `buildConversationHistory`.

- [ ] **Step 4: Restrict improved-sentence TTS to material correction**

Replace the warm-up condition with:

```ts
const improvedSentenceForWarmup = originalEvaluation?.improvedSentence;
const shouldWarmTts =
  input.clipKind === "original_answer" &&
  originalEvaluation?.outcome === "needs_correction" &&
  originalEvaluation.requireRepeat &&
  Boolean(improvedSentenceForWarmup);
```

This keeps material correction audio behavior and ensures accepted minor
naturalization is not presented during the live conversation.

- [ ] **Step 5: Run persistence and full evaluation regression tests**

Run:

```bash
npm test -- --run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts src/server/student-access/audio-upload.test.ts tests/server/audio-upload.test.ts src/server/student-access/conversation-history.test.ts
```

Expected: PASS. The actual transcript and naturalized sentence are written
separately, later Coco generation sees the naturalized sentence, and only
material correction warms TTS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts tests/server/audio-upload.test.ts src/server/student-access/conversation-history.test.ts
git commit -m "feat(ai): persist accepted minor conversation recasts"
```

---

### Task 3: Repair deterministic follow-up policy

**Files:**
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `src/domain/ai/conversation-generation.test.ts`
- Modify: `src/server/ai/conversation-generator.ts`
- Modify: `src/server/ai/conversation-generator.test.ts`

**Interfaces:**
- Changes: `validateGeneratedCocoReplyLine(line, options)` removes `allowEitherOrQuestion`
- Preserves: `GeneratedCocoReplyLineViolation` includes legacy `"either_or_question"` so historical stored events remain type-readable
- Preserves: one provider policy-correction attempt

- [ ] **Step 1: Replace old either/or tests with failing independent-policy tests**

Remove `allowEitherOrQuestion` from all validator calls. Replace the blanket
either/or rejection case with:

```ts
it("accepts one relevant either-or question and still rejects either-or drift", () => {
  expect(
    validateGeneratedCocoReplyLine(
      "Soccer sounds fun! Do you play inside or outside?",
      {
        expectsQuestion: true,
        activeQuestion: "Where do you play soccer?",
        latestStudentResponse: "I play soccer at school.",
      },
    ),
  ).toEqual({ ok: true });

  expect(
    validateGeneratedCocoReplyLine(
      "That sounds fun! Do you eat pizza or noodles?",
      {
        expectsQuestion: true,
        activeQuestion: "Where do you play soccer?",
        latestStudentResponse: "I play soccer at school.",
      },
    ),
  ).toEqual({ ok: false, reasons: ["topic_drift"] });
});

it("rejects a comma before a new question clause as a run-on", () => {
  expect(
    validateGeneratedCocoReplyLine(
      "Swimming with your friend is fun, what do you like about it?",
      {
        expectsQuestion: true,
        activeQuestion: "Who do you swim with?",
        latestStudentResponse: "I swim with my friend.",
      },
    ),
  ).toEqual({ ok: false, reasons: ["run_on_question"] });
});
```

In the server adapter suite, add a fake-client sequence where the first output
uses the comma run-on and the second output is punctuated. Assert exactly two
provider calls and the corrected line. Add another single-call case for a
relevant either/or line.

- [ ] **Step 2: Run generation tests and verify failure**

Run:

```bash
npm test -- --run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts
```

Expected: FAIL because the public options still require
`allowEitherOrQuestion`, relevant choices are rejected, and commas pass the
run-on boundary.

- [ ] **Step 3: Make policy checks independent**

In `src/domain/ai/conversation-generation.ts`:

1. Delete `usesEitherOrQuestion`.
2. Keep `"either_or_question"` in `GeneratedCocoReplyLineViolation` with a
   comment that it is retained only for historical stored moderation events.
3. Change the run-on boundary to:

```ts
return !/[.!?]$/u.test(prefix);
```

4. Change validator options to:

```ts
options: {
  expectsQuestion: boolean;
  activeQuestion?: string;
  latestStudentResponse?: string;
}
```

5. Delete the either/or reason branch and run topic continuity whenever
   `expectsQuestion` is true:

```ts
if (
  options.expectsQuestion &&
  !staysOnActiveTopic(
    normalized,
    options.activeQuestion,
    options.latestStudentResponse,
  )
) {
  reasons.push("topic_drift");
}
```

- [ ] **Step 4: Remove response-vagueness coupling from the server adapter**

In `src/server/ai/conversation-generator.ts`, delete
`VAGUE_OR_STUCK_RESPONSES`, `VAGUE_OR_STUCK_PREFIXES`,
`isVagueOrStuckResponse`, and `allowEitherOrQuestion`. Pass only:

```ts
{
  expectsQuestion,
  activeQuestion,
  latestStudentResponse: latestResponse,
}
```

to both policy checks. Remove the `"either_or_question"` correction-copy
branch. Keep the exact existing initial request plus one corrected request.

Replace the blanket prompt sentence with:

```ts
"Prefer an open question after a meaningful answer. A single either-or question is allowed when both choices are relevant and child-friendly."
```

- [ ] **Step 5: Run generation tests**

Run:

```bash
npm test -- --run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts
```

Expected: PASS. Relevant either/or uses one provider call, topic drift is still
rejected, the comma run-on is corrected with exactly one second call, multiple
questions remain rejected, and closing validation is unchanged.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/domain/ai/conversation-generation.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.ts src/server/ai/conversation-generator.test.ts
git commit -m "fix(ai): enforce independent follow-up line policy"
```

---

### Task 4: Select bounded follow-up fallbacks by response state

**Files:**
- Modify: `src/domain/conversation/fallback-lines.ts`
- Modify: `src/domain/conversation/fallback-lines.test.ts`
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Produces: `type FollowUpFallbackKind = "meaningful" | "vague_or_stuck" | "uncertain"`
- Produces: `classifyFollowUpFallbackKind(input): FollowUpFallbackKind`
- Produces: `selectFollowUpFallbackLine(kind): string`
- Preserves: `selectClosingFallbackLine(): string`

- [ ] **Step 1: Write exact fallback contract tests**

Replace the follow-up library tests with:

```ts
import {
  CANNED_CLOSING_FALLBACK_LINE,
  classifyFollowUpFallbackKind,
  selectClosingFallbackLine,
  selectFollowUpFallbackLine,
} from "@/domain/conversation/fallback-lines";

it.each([
  ["meaningful", "Thanks for telling me! What do you like about that?"],
  ["vague_or_stuck", "That's okay! Can you give me one example?"],
  [
    "uncertain",
    "Let's try that question another way. Can you tell me one small detail?",
  ],
] as const)("returns the exact %s follow-up fallback", (kind, expected) => {
  const line = selectFollowUpFallbackLine(kind);
  expect(line).toBe(expected);
  expect(line.match(/\?/gu)).toHaveLength(1);
  expect(line.endsWith("?")).toBe(true);
});

it("classifies only bounded server-known response state", () => {
  expect(
    classifyFollowUpFallbackKind({
      latestResponse: "I will eat sushi.",
      responseHandling: "normal",
      inputUsable: true,
    }),
  ).toBe("meaningful");
  expect(
    classifyFollowUpFallbackKind({
      latestResponse: "Anything.",
      responseHandling: "normal",
      inputUsable: true,
    }),
  ).toBe("vague_or_stuck");
  expect(
    classifyFollowUpFallbackKind({
      latestResponse: "private raw text",
      responseHandling: "review_pending",
      inputUsable: true,
    }),
  ).toBe("uncertain");
  expect(
    classifyFollowUpFallbackKind({
      latestResponse: "private raw text",
      responseHandling: "normal",
      inputUsable: false,
    }),
  ).toBe("uncertain");
});

it("removes both rejected UAT lines", () => {
  const lines = [
    selectFollowUpFallbackLine("meaningful"),
    selectFollowUpFallbackLine("vague_or_stuck"),
    selectFollowUpFallbackLine("uncertain"),
  ];
  expect(lines).not.toContain("I hear you! Let's keep going.");
  expect(lines).not.toContain("Nice! What happens next?");
});

it("keeps the closing fallback byte-for-byte unchanged", () => {
  expect(selectClosingFallbackLine()).toBe(
    "That was fun! Thanks for talking with me. See you next time!",
  );
  expect(selectClosingFallbackLine()).toBe(CANNED_CLOSING_FALLBACK_LINE);
});
```

- [ ] **Step 2: Run fallback tests and verify failure**

Run:

```bash
npm test -- --run src/domain/conversation/fallback-lines.test.ts
```

Expected: FAIL because the current API rotates three context-free lines by
turn number.

- [ ] **Step 3: Implement the pure selector**

Replace the follow-up portion of `fallback-lines.ts` with:

```ts
export type FollowUpFallbackKind =
  | "meaningful"
  | "vague_or_stuck"
  | "uncertain";

export const FOLLOW_UP_FALLBACK_LINES = {
  meaningful: "Thanks for telling me! What do you like about that?",
  vague_or_stuck: "That's okay! Can you give me one example?",
  uncertain:
    "Let's try that question another way. Can you tell me one small detail?",
} as const satisfies Record<FollowUpFallbackKind, string>;

const VAGUE_OR_STUCK_RESPONSES = new Set([
  "anything",
  "something",
  "stuff",
  "i don't know",
  "i dont know",
  "not sure",
  "maybe",
]);

function normalizeResponse(text: string) {
  return text
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ");
}

export function classifyFollowUpFallbackKind(input: {
  latestResponse: string;
  responseHandling: "normal" | "review_pending";
  inputUsable: boolean;
}): FollowUpFallbackKind {
  if (!input.inputUsable || input.responseHandling === "review_pending") {
    return "uncertain";
  }
  return VAGUE_OR_STUCK_RESPONSES.has(normalizeResponse(input.latestResponse))
    ? "vague_or_stuck"
    : "meaningful";
}

export function selectFollowUpFallbackLine(
  kind: FollowUpFallbackKind,
): string {
  return FOLLOW_UP_FALLBACK_LINES[kind];
}
```

Leave `CANNED_CLOSING_FALLBACK_LINE` and `selectClosingFallbackLine` exactly
as they are.

- [ ] **Step 4: Wire response-state selection into orchestration**

Change `fallbackLineForContext` to:

```ts
function fallbackLineForContext(
  context: ConversationTurnContext,
  inputUsable: boolean,
): string {
  if (conversationReplyMode(context) === "closing") {
    return selectClosingFallbackLine();
  }
  return selectFollowUpFallbackLine(
    classifyFollowUpFallbackKind({
      latestResponse: context.studentTranscript,
      responseHandling: context.responseHandling,
      inputUsable,
    }),
  );
}
```

Pass `false` only for unsafe or unavailable student-input moderation. Pass
`true` for provider/schema/policy failure and output-moderation failure because
the already-moderated input remains usable. Closing calls ignore the flag and
remain byte-for-byte static.

Add orchestration assertions for meaningful generation failure, vague
generation failure, review-pending generation failure, unsafe input, and final
closing failure. Continue asserting the existing moderation-event causes.

- [ ] **Step 5: Run fallback and orchestration tests**

Run:

```bash
npm test -- --run src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: PASS. Each follow-up failure produces one answerable question chosen
from bounded state, and closing failures still use the exact Task 1 string.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/domain/conversation/fallback-lines.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts
git commit -m "fix(ai): select answerable follow-up fallbacks by state"
```

---

### Task 5: Extend the owned completed-history review model

**Files:**
- Modify: `src/server/student-access/student-history.ts`
- Modify: `tests/server/student-history.test.ts`

**Interfaces:**
- Produces: `StudentRecapAttempt`
- Changes: `StudentRecapTurn` adds `original`, `improvedSentence`, `repeat`, and `reviewState`
- Changes: `StudentMissionRecap` adds `conversationMode`, `characterId`, and `finalCocoLine`
- Preserves legacy fields: `transcript`, `audio`, and `pronunciation` for the unchanged preset component

- [ ] **Step 1: Expand the mock rows and write failing mapping assertions**

Use 1-based turn orders and a dynamic snapshot:

```ts
mission_snapshot: {
  targetPattern: "I am going to...",
  characterId: "default-buddy",
  conversationMode: true,
  turns: [{ turnOrder: 1, prompt: "Where are you going?" }],
},
```

Use three persisted rows:

```ts
[
  {
    id: "turn-correct",
    turn_order: 1,
    original_transcript: "I am going to school.",
    improved_sentence: null,
    repeat_transcript: null,
    repeat_accepted: false,
    evaluation: {
      outcome: "accepted_original",
      correctionSeverity: "none",
    },
    coco_line: "What do you do at school?",
  },
  {
    id: "turn-minor",
    turn_order: 2,
    original_transcript: "I go to library.",
    improved_sentence: "I go to the library.",
    repeat_transcript: null,
    repeat_accepted: false,
    evaluation: {
      outcome: "accepted_original",
      correctionSeverity: "minor",
    },
    coco_line: "What books do you read there?",
  },
  {
    id: "turn-repeat",
    turn_order: 3,
    original_transcript: "I want read cartoon.",
    improved_sentence: "I want to read cartoons.",
    repeat_transcript: "I want to read cartoons.",
    repeat_accepted: true,
    evaluation: { outcome: "accepted_repeat" },
    coco_line:
      "That was fun! Thanks for talking with me. See you next time!",
  },
]
```

Assert:

```ts
expect(recap).toMatchObject({
  conversationMode: true,
  characterId: "default-buddy",
  finalCocoLine:
    "That was fun! Thanks for talking with me. See you next time!",
  turns: [
    {
      cocoPrompt: "Where are you going?",
      reviewState: "accepted",
      original: { transcript: "I am going to school." },
      repeat: null,
    },
    {
      cocoPrompt: "What do you do at school?",
      reviewState: "accepted_minor",
      original: { transcript: "I go to library." },
      improvedSentence: "I go to the library.",
      repeat: null,
    },
    {
      cocoPrompt: "What books do you read there?",
      reviewState: "repeat_accepted",
      original: { transcript: "I want read cartoon." },
      repeat: { transcript: "I want to read cartoons." },
    },
  ],
});
```

Give original and repeat attempts separate clip/score fixtures and assert each
attempt receives only its matching evidence. Add a neutral teacher-review row
and assert `reviewState: "neutral"` without any review reason in the returned
object.

- [ ] **Step 2: Run history service tests and verify failure**

Run:

```bash
npm test -- --run tests/server/student-history.test.ts
```

Expected: FAIL because the current service collapses each turn to one accepted
transcript, ignores severity and persisted Coco lines, and uses authored
snapshot prompts for every turn.

- [ ] **Step 3: Extend the public recap types**

Add:

```ts
export type StudentRecapAttempt = {
  transcript: string;
  audio: StudentRecapAudioClip | null;
  pronunciation: StudentRecapPronunciation | null;
};

export type StudentRecapReviewState =
  | "accepted"
  | "accepted_minor"
  | "repeat_accepted"
  | "neutral";
```

Extend `StudentRecapTurn` with:

```ts
original: StudentRecapAttempt;
improvedSentence: string | null;
repeat: StudentRecapAttempt | null;
reviewState: StudentRecapReviewState;
```

Keep its current `transcript`, `audio`, and `pronunciation` fields for preset
rendering. Extend `StudentMissionRecap` with:

```ts
conversationMode: boolean;
characterId: string;
finalCocoLine: string | null;
```

Extend `Snapshot` and `parseSnapshot` to retain `conversationMode` and
`characterId`, defaulting missing historical values to `false` and
`"default-buddy"`.

- [ ] **Step 4: Query and map complete persisted evidence**

Extend the attempt-turn select to:

```ts
"id, turn_order, original_transcript, improved_sentence, repeat_transcript, repeat_accepted, evaluation, coco_line"
```

Add pure local helpers:

```ts
function reviewStateFor(turn: {
  improved_sentence: string | null;
  repeat_transcript: string | null;
  repeat_accepted: boolean | null;
  evaluation: unknown;
}): StudentRecapReviewState {
  if (turn.repeat_accepted === true && turn.repeat_transcript?.trim()) {
    return "repeat_accepted";
  }
  const evaluation =
    turn.evaluation && typeof turn.evaluation === "object"
      ? (turn.evaluation as {
          outcome?: unknown;
          correctionSeverity?: unknown;
        })
      : null;
  if (
    evaluation?.outcome === "accepted_original" &&
    evaluation.correctionSeverity === "minor" &&
    turn.improved_sentence?.trim()
  ) {
    return "accepted_minor";
  }
  if (
    evaluation?.outcome === "accepted_original" ||
    (!turn.improved_sentence && !turn.repeat_transcript && !evaluation)
  ) {
    return "accepted";
  }
  return "neutral";
}
```

Create one helper that takes a turn id, clip kind, and transcript and returns a
`StudentRecapAttempt`, using the existing `playbackFor`, score lookup, and
`wordsToPractice`. Use it once for the original and once for the repeat.

For dynamic prompts, start with `snapshot.turns[0].prompt`, assign that prompt
to the first row, and after each row replace the next prompt with that row's
non-empty `coco_line`. Set `finalCocoLine` to the final row's non-empty
`coco_line`. For preset rows, keep the authored `turnOrder -> prompt` map and
set `finalCocoLine: null`.

- [ ] **Step 5: Preserve explicit ownership and failure semantics**

Change query error handling so an actual database error throws while a
successful empty owned lookup still returns `null`:

```ts
if (owned.error) {
  throw new Error(`Unable to load owned recap: ${owned.error.message}`);
}
if (!owned.data) return null;
```

Keep every existing ownership filter and the signed-audio latest-attempt check
unchanged. Add source assertions that `evaluation` is never passed through to
the public recap and teacher-review reason text is absent.

- [ ] **Step 6: Run history service tests**

Run:

```bash
npm test -- --run tests/server/student-history.test.ts
```

Expected: PASS for dynamic reconstruction, preset authored prompts, dual audio
and pronunciation association, neutral reviewed turns, and all ownership
source contracts.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/server/student-access/student-history.ts tests/server/student-history.test.ts
git commit -m "feat(student): build owned dynamic homework review data"
```

---

### Task 6: Build the dynamic text-message Homework Review

**Files:**
- Create: `src/domain/student/homework-review.ts`
- Create: `src/domain/student/homework-review.test.ts`
- Create: `src/components/student/HomeworkReview.tsx`
- Create: `src/components/student/HomeworkReview.module.css`
- Create: `src/components/student/HomeworkReview.test.tsx`

**Interfaces:**
- Produces: `type ReviewTextPart = { text: string; changed: boolean }`
- Produces: `buildImprovedSentenceParts(original, improved): ReviewTextPart[]`
- Produces: `HomeworkReview({ recap, studentDisplayName })`
- Consumes: Task 5's `StudentMissionRecap`

- [ ] **Step 1: Write failing pure diff tests**

Create `src/domain/student/homework-review.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildImprovedSentenceParts } from "./homework-review";

describe("Homework Review improved-sentence diff", () => {
  it("marks only an added article", () => {
    expect(
      buildImprovedSentenceParts(
        "I'm going to library",
        "I'm going to the library.",
      ),
    ).toEqual([
      { text: "I'm", changed: false },
      { text: " ", changed: false },
      { text: "going", changed: false },
      { text: " ", changed: false },
      { text: "to", changed: false },
      { text: " ", changed: false },
      { text: "the", changed: true },
      { text: " ", changed: false },
      { text: "library", changed: false },
      { text: ".", changed: false },
    ]);
  });

  it("marks replacement words and preserves spaces and punctuation", () => {
    const parts = buildImprovedSentenceParts(
      "I go exercise.",
      "I will exercise.",
    );
    expect(parts.filter((part) => part.changed).map((part) => part.text)).toEqual([
      "will",
    ]);
    expect(parts.map((part) => part.text).join("")).toBe("I will exercise.");
  });

  it("uses a safe whole-sentence correction when lexical diff is unavailable", () => {
    expect(buildImprovedSentenceParts("", "I am ready.")).toEqual([
      { text: "I am ready.", changed: true },
    ]);
  });
});
```

- [ ] **Step 2: Run the diff tests and verify failure**

Run:

```bash
npm test -- --run src/domain/student/homework-review.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement a small dependency-free word diff**

Create `src/domain/student/homework-review.ts` with tokenization that preserves
rendered text and an LCS over lexical tokens:

```ts
export type ReviewTextPart = {
  text: string;
  changed: boolean;
};

const TOKEN_PATTERN =
  /\p{L}+(?:['’]\p{L}+)*|\p{N}+|[^\p{L}\p{N}\s]+|\s+/gu;
const LEXICAL_PATTERN = /^[\p{L}\p{N}]/u;

function tokenize(text: string) {
  return text.match(TOKEN_PATTERN) ?? [];
}

function normalized(token: string) {
  return token.toLocaleLowerCase("en-US").replace(/[’‘]/gu, "'");
}

export function buildImprovedSentenceParts(
  original: string,
  improved: string,
): ReviewTextPart[] {
  const originalTokens = tokenize(original.trim());
  const improvedTokens = tokenize(improved.trim());
  const originalWords = originalTokens.filter((token) =>
    LEXICAL_PATTERN.test(token),
  );
  const improvedWordEntries = improvedTokens.flatMap((token, tokenIndex) =>
    LEXICAL_PATTERN.test(token) ? [{ token, tokenIndex }] : [],
  );

  if (!originalWords.length || !improvedWordEntries.length) {
    return improved.trim()
      ? [{ text: improved.trim(), changed: true }]
      : [];
  }

  const rows = originalWords.length + 1;
  const columns = improvedWordEntries.length + 1;
  const lcs = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  );

  for (let left = originalWords.length - 1; left >= 0; left -= 1) {
    for (let right = improvedWordEntries.length - 1; right >= 0; right -= 1) {
      lcs[left]![right] =
        normalized(originalWords[left]!) ===
        normalized(improvedWordEntries[right]!.token)
          ? 1 + lcs[left + 1]![right + 1]!
          : Math.max(lcs[left + 1]![right]!, lcs[left]![right + 1]!);
    }
  }

  const unchangedTokenIndexes = new Set<number>();
  let left = 0;
  let right = 0;
  while (left < originalWords.length && right < improvedWordEntries.length) {
    if (
      normalized(originalWords[left]!) ===
      normalized(improvedWordEntries[right]!.token)
    ) {
      unchangedTokenIndexes.add(improvedWordEntries[right]!.tokenIndex);
      left += 1;
      right += 1;
    } else if (lcs[left + 1]![right]! >= lcs[left]![right + 1]!) {
      left += 1;
    } else {
      right += 1;
    }
  }

  return improvedTokens.map((text, tokenIndex) => ({
    text,
    changed:
      LEXICAL_PATTERN.test(text) && !unchangedTokenIndexes.has(tokenIndex),
  }));
}
```

- [ ] **Step 4: Run diff tests**

Run:

```bash
npm test -- --run src/domain/student/homework-review.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing component-render tests**

Create `src/components/student/HomeworkReview.test.tsx` with a dynamic recap
fixture containing accepted, accepted-minor, repeat-accepted, and neutral
turns. Render with `renderToStaticMarkup` and assert:

```tsx
const html = renderToStaticMarkup(
  <HomeworkReview recap={recap} studentDisplayName="Kyle" />,
);

expect(html).toContain("Homework Review");
expect(html).not.toContain("Read-only recap");
expect(html).toContain("Coco");
expect(html).toContain("Kyle");
expect(html).toContain(">K<");
expect(html).toContain("I go to library.");
expect(html).toMatch(/class="[^"]*changedWord[^"]*"[^>]*>the</);
expect(html).toContain("This answer needed another try.");
expect(html).toContain("I want read cartoon.");
expect(html).toContain("I want to read cartoons.");
expect(html.match(/✓ Good job!/g)).toHaveLength(3);
expect(html).not.toContain("teacher_review");
expect(html).not.toContain("ambiguous");
expect(html).toContain(
  "That was fun! Thanks for talking with me. See you next time!",
);
```

Also source-read the CSS module and assert `overflow-wrap: anywhere`,
`max-width`, `.retryMark`, `.changedWord`, `.goodJob`, and `.srOnly`.

- [ ] **Step 6: Run the component test and verify failure**

Run:

```bash
npm test -- --run src/components/student/HomeworkReview.test.tsx
```

Expected: FAIL because the component and CSS module do not exist.

- [ ] **Step 7: Implement the text-message component**

Create `HomeworkReview.tsx` with:

```tsx
import Image from "next/image";
import Link from "next/link";
import type {
  StudentMissionRecap,
  StudentRecapAttempt,
} from "@/server/student-access/student-history";
import { buildImprovedSentenceParts } from "@/domain/student/homework-review";
import { StudentHistoryAudioPlayer } from "./StudentHistoryAudioPlayer";
import styles from "./HomeworkReview.module.css";

function AttemptEvidence({ attempt }: { attempt: StudentRecapAttempt }) {
  return (
    <>
      {attempt.audio?.playback === "available" ? (
        <StudentHistoryAudioPlayer audioClipId={attempt.audio.id} />
      ) : attempt.audio?.playback === "expired" ? (
        <p className={styles.muted}>Recording expired</p>
      ) : attempt.audio ? (
        <p className={styles.muted}>Recording unavailable</p>
      ) : null}
      {attempt.pronunciation ? (
        <div className={styles.pronunciation}>
          <strong>
            {"★".repeat(attempt.pronunciation.starBand)} Pronunciation
          </strong>
          <p>
            {attempt.pronunciation.words.length
              ? `Words to practice: ${attempt.pronunciation.words
                  .map((word) => word.word)
                  .join(" · ")}`
              : "Great job!"}
          </p>
        </div>
      ) : null}
    </>
  );
}

function CocoMessage({ children }: { children: string }) {
  return (
    <div className={styles.cocoMessage}>
      <div className={styles.identity}>
        <Image
          src="/images/coco-happy-alpha.png"
          alt=""
          width={36}
          height={36}
        />
        <strong>Coco</strong>
      </div>
      <div className={styles.cocoBubble}>{children}</div>
    </div>
  );
}

export function HomeworkReview({
  recap,
  studentDisplayName,
}: {
  recap: StudentMissionRecap;
  studentDisplayName: string;
}) {
  const initial =
    studentDisplayName.trim().slice(0, 1).toLocaleUpperCase("en-US") || "S";

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <h1>Homework Review</h1>
        <div className={styles.messages}>
          {recap.turns.map((turn) => {
            const showGoodJob =
              turn.reviewState === "accepted" ||
              turn.reviewState === "accepted_minor" ||
              turn.reviewState === "repeat_accepted";
            return (
              <div className={styles.exchange} key={turn.id}>
                <CocoMessage>{turn.cocoPrompt}</CocoMessage>
                <div className={styles.studentMessage}>
                  <div className={styles.studentIdentity}>
                    <strong>{studentDisplayName}</strong>
                    <span aria-hidden="true">{initial}</span>
                  </div>
                  <div className={styles.attemptRow}>
                    {turn.reviewState === "repeat_accepted" ? (
                      <span className={styles.retryMark} aria-hidden="true">
                        !
                      </span>
                    ) : null}
                    {turn.reviewState === "repeat_accepted" ? (
                      <span className={styles.srOnly}>
                        This answer needed another try.
                      </span>
                    ) : null}
                    <div className={styles.studentBubble}>
                      <p>{turn.original.transcript}</p>
                      <AttemptEvidence attempt={turn.original} />
                    </div>
                  </div>
                  {turn.reviewState === "accepted_minor" &&
                  turn.improvedSentence ? (
                    <p className={styles.improvedSentence}>
                      {buildImprovedSentenceParts(
                        turn.original.transcript,
                        turn.improvedSentence,
                      ).map((part, index) => (
                        <span
                          className={part.changed ? styles.changedWord : undefined}
                          key={`${turn.id}-part-${index}`}
                        >
                          {part.text}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {turn.repeat ? (
                    <div className={styles.studentBubble}>
                      <p>{turn.repeat.transcript}</p>
                      <AttemptEvidence attempt={turn.repeat} />
                    </div>
                  ) : null}
                  {showGoodJob ? (
                    <p className={styles.goodJob}>✓ Good job!</p>
                  ) : null}
                </div>
              </div>
            );
          })}
          {recap.finalCocoLine ? (
            <CocoMessage>{recap.finalCocoLine}</CocoMessage>
          ) : null}
        </div>
        <Link className={styles.backButton} href="/student/home">
          Back to homework
        </Link>
      </section>
    </main>
  );
}
```

Create the CSS module with a 430px reading column, normal page scrolling, left
Coco/right learner alignment, bubble `max-width: min(82%, 330px)`,
`overflow-wrap: anywhere`, a 24px red circled `.retryMark` immediately before
the original bubble, red `.changedWord`, green `.goodJob`, 44px minimum tap
target for `.backButton`, and a standard clipped `.srOnly` rule. Do not add an
internal scrolling message window.

- [ ] **Step 8: Run pure and component tests**

Run:

```bash
npm test -- --run src/domain/student/homework-review.test.ts src/components/student/HomeworkReview.test.tsx
```

Expected: PASS. Only changed words are red, the retry symbol has hidden text,
green success is absent for neutral review, long text has wrapping rules, and
the final goodbye is last.

- [ ] **Step 9: Commit Task 6**

```bash
git add src/domain/student/homework-review.ts src/domain/student/homework-review.test.ts src/components/student/HomeworkReview.tsx src/components/student/HomeworkReview.module.css src/components/student/HomeworkReview.test.tsx
git commit -m "feat(student): render dynamic Homework Review"
```

---

### Task 7: Route dynamic completion into Homework Review

**Files:**
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `src/app/student/history/[assignmentStudentId]/page.tsx`
- Modify: `tests/server/student-mission-flow.test.ts`
- Modify: `tests/server/student-history-ui.test.ts`
- Modify: `tests/e2e/student-history.spec.ts`

**Interfaces:**
- Consumes: `HomeworkReview`
- Consumes: `StudentMissionRecap.conversationMode`
- Preserves: preset `StepMissionComplete`

- [ ] **Step 1: Write failing flow and route-selection tests**

In `tests/server/student-mission-flow.test.ts`, replace the old
`finishConversationClosing` source assertion with:

```ts
expect(shellSource).toMatch(
  /function finishConversationClosing\(\) \{\s*router\.push\(`\/student\/history\/\$\{assignmentStudentId\}`\);\s*\}/,
);
expect(shellSource).toContain(
  'flow.step === "complete" && !conversationMode',
);
```

Keep the existing assertions proving `flow.cocoLine` is shown through
`CocoSpeechAudio` and `StepConversationClosing` renders only after the final
line. In `tests/server/student-history-ui.test.ts`, assert the history page
imports both review components and chooses:

```tsx
recap.conversationMode ? (
  <HomeworkReview recap={recap} studentDisplayName={unlock.displayName} />
) : (
  <StudentMissionRecap recap={recap} />
)
```

Assert the dynamic component contains only `Homework Review` as its heading and
`Back to homework`, while the preset component retains `Read-only recap`,
practice summary, and existing evidence copy.

- [ ] **Step 2: Run route/flow tests and verify failure**

Run:

```bash
npm test -- --run tests/server/student-mission-flow.test.ts tests/server/student-history-ui.test.ts
```

Expected: FAIL because dynamic **Finish mission** still changes local state to
the generic completion step and the history route always renders the preset
recap.

- [ ] **Step 3: Route only dynamic closing completion**

In `MissionFlowShell.tsx`, replace:

```ts
function finishConversationClosing() {
  setFlow((prev) => ({ ...prev, step: "complete" }));
}
```

with:

```ts
function finishConversationClosing() {
  router.push(`/student/history/${assignmentStudentId}`);
}
```

Guard the generic complete screen:

```tsx
{flow.step === "complete" && !conversationMode && (
  <StepMissionComplete
    assignmentStudentId={assignmentStudentId}
    completionHeading={characterProfile.completionHeading}
    completionBody={characterProfile.completionBody}
    onAmplitudeFrame={handleMascotAmplitudeFrame}
    onPlayingChange={handleMascotPlayingChange}
    showCocoLine={false}
  />
)}
```

Do not move completion server timing and do not change the closing speech line,
TTS descriptor, autoplay attempt, replay control, or button copy.

- [ ] **Step 4: Branch the owned history page and add bounded failure UI**

In `page.tsx`, load the recap in a `try/catch`. A successful `null` still calls
`notFound()` so unauthorized route parameters do not reveal completion state.
An internal thrown load failure renders:

```tsx
<main style={pageStyle}>
  <div style={{ ...panelStyle, maxWidth: 430 }}>
    <h1>Homework Review</h1>
    <p>Your homework is complete, but the review could not load.</p>
    <Link href="/student/home" style={primaryButtonStyle}>
      Back to homework
    </Link>
  </div>
</main>
```

On success, render:

```tsx
if (recap.conversationMode) {
  return (
    <HomeworkReview
      recap={recap}
      studentDisplayName={unlock.displayName}
    />
  );
}
```

Then return the existing preset page markup and `StudentMissionRecap`
unchanged.

- [ ] **Step 5: Update the optional live Playwright history assertion**

In `tests/e2e/student-history.spec.ts`, branch on the visible heading:

```ts
const dynamicHeading = page.getByRole("heading", {
  name: "Homework Review",
});
if (await dynamicHeading.isVisible()) {
  await expect(page.getByRole("link", { name: "Back to homework" })).toBeVisible();
  await expect(page.getByText("Coco", { exact: true }).first()).toBeVisible();
} else {
  await expect(page.getByText("Read-only recap", { exact: false })).toBeVisible();
  await expect(page.getByText("You said", { exact: true }).first()).toBeVisible();
}
await expect(
  page.getByRole("button", { name: /record|retry|resume|resubmit/i }),
).toHaveCount(0);
```

The environment-gated test remains skipped when
`STUDENT_HISTORY_ASSIGNMENT_STUDENT_ID` is absent; no database seed or
production access is added.

- [ ] **Step 6: Run flow, history, and component regression tests**

Run:

```bash
npm test -- --run tests/server/student-mission-flow.test.ts tests/server/student-history.test.ts tests/server/student-history-ui.test.ts src/components/student/HomeworkReview.test.tsx
```

Expected: PASS. The dynamic button navigates after the visible/spoken closing,
preset completion stays local, owned review branches correctly, and internal
load failure offers **Back to homework** without reopening the attempt.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/components/student/MissionFlowShell.tsx 'src/app/student/history/[assignmentStudentId]/page.tsx' tests/server/student-mission-flow.test.ts tests/server/student-history-ui.test.ts tests/e2e/student-history.spec.ts
git commit -m "feat(student): open Homework Review after dynamic closing"
```

---

### Task 8: Run the complete regression and quality gate

**Files:**
- Modify: `TASK.md`

**Interfaces:**
- Verifies all prior task outputs together
- Produces factual verification evidence in the active task brief

- [ ] **Step 1: Run the focused Task 2 matrix**

Run:

```bash
npm test -- --run tests/domain/turn-evaluation.test.ts tests/server/turn-evaluator.test.ts src/server/student-access/audio-upload.test.ts tests/server/audio-upload.test.ts src/server/student-access/conversation-history.test.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.test.ts tests/server/student-history.test.ts src/domain/student/homework-review.test.ts src/components/student/HomeworkReview.test.tsx tests/server/student-history-ui.test.ts tests/server/student-mission-flow.test.ts
```

Expected: all listed files PASS with no paid provider calls.

- [ ] **Step 2: Run the full unit/integration suite**

Run:

```bash
npm test -- --run
```

Expected: all tests PASS. If a failure is unrelated and pre-existing, capture
the exact test name and evidence in `TASK.md`; do not weaken or delete it.

- [ ] **Step 3: Run static verification**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both commands exit 0.

- [ ] **Step 4: Prove the production build can use `.next` safely**

Run:

```bash
pgrep -af "next (dev|start)" || true
lsof +D .next 2>/dev/null || true
```

Expected: no process points at this checkout's `.next`. If either command
identifies a process using this checkout, stop and ask the user whether to stop
that exact process; do not run the build concurrently.

When clear, run:

```bash
npm run build
```

Expected: Next.js production build exits 0.

- [ ] **Step 5: Run the optional environment-gated history browser check only when credentials already exist**

Run:

```bash
npx playwright test tests/e2e/student-history.spec.ts
```

Expected: PASS when
`STUDENT_HISTORY_ASSIGNMENT_STUDENT_ID` and an unlocked local test session are
already configured; otherwise the test reports SKIPPED. A skip is not visual
UAT evidence and must be recorded as such.

- [ ] **Step 6: Record factual evidence and the remaining human check**

Update `TASK.md` with exact command results, commit hashes from Tasks 1–7, and:

```markdown
## Current position

Runtime implementation is complete and automated verification is recorded.
No push, deploy, production mutation, or Supabase mutation was performed.

## Next step

Run a local dynamic-mission visual UAT with a real owned completed attempt,
label any screenshot as localhost evidence, and confirm mobile wrapping,
left-side retry marker placement, red changed-word emphasis, green Good job
placement, final-goodbye ordering, and both audio replay controls.
```

- [ ] **Step 7: Commit the verification record**

```bash
git add TASK.md
git commit -m "docs: record Task 2 verification"
```

---

## Plan Self-Review Record

- Spec coverage: Tasks 1–2 cover severity, complete-sentence policy, separate
  actual/naturalized storage, no live minor correction, material repeat, and
  preset regression. Tasks 3–4 cover relevant either/or acceptance,
  independent topic drift, comma run-on repair, bounded retry, exact
  response-state fallbacks, rejected-line removal, and unchanged closing.
  Tasks 5–7 cover owned reconstruction, actual/repeat evidence, learner-safe
  review states, chat UI, accessibility, audio/pronunciation, dynamic
  navigation, preset preservation, and bounded load failure. Task 8 covers the
  full quality gate and explicitly separates automated evidence from local
  visual UAT.
- Migration check: no schema or migration file is created or modified.
- Security check: all review data stays behind
  `getCompletedMissionRecap(studentId, assignmentStudentId)` and the existing
  signed-audio action; the plan adds no client-trusted attempt data.
- Retry check: generation remains initial request plus one policy-correction
  request, with the existing moderation retry behavior unchanged.
- Type consistency: `correctionSeverity`, `FollowUpFallbackKind`,
  `StudentRecapAttempt`, `StudentRecapReviewState`,
  `buildImprovedSentenceParts`, and `HomeworkReview` use the same names in
  producer and consumer tasks.
- Placeholder scan: the plan contains concrete file paths, signatures, test
  cases, commands, expected results, and commit boundaries; it contains no
  deferred implementation step.
