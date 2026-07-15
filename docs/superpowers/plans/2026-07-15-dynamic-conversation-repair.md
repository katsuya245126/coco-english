# Dynamic Conversation Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make conversation-mode homework accept relevant correct English, require a meaning-preserving spoken correction only when English is wrong, and continue directly through contextual Coco prompts without preset-mission transition screens.

**Architecture:** Add an explicit `evaluationMode` boundary so the evaluator never infers free-talk policy from whether a target example happens to exist. Keep server-owned evaluation, persistence, moderation, and completion unchanged; change only the mode-specific policy and client progression. A small pure continuation helper drives accepted-original and accepted-repeat advancement, while pending `coco_line` is restored through the existing SSR resume path.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, OpenAI Responses structured outputs with injected fake clients, Supabase, Vitest.

## Global Constraints

- Conversation mode accepts relevant, grammatically valid English even when it omits the configured target pattern or disagrees with Coco's premise.
- Conversation corrections preserve the student's intended meaning and never turn Coco's question, target pattern, or authored example into the required repeat unless it truly expresses the answer.
- Incorrect conversation English still requires a spoken corrected version.
- Accepted conversation originals and repeats skip `aiFeedback` success, `repeatFeedback` success, `transition`, and `Next turn`; they advance directly to the persisted pending `coco_line`.
- Preset evaluator, repeat, pronunciation-retry, transition, moderation, completion, and teacher-review behavior stay unchanged.
- Missing pending `coco_line` fails closed; no authored or invented fallback prompt is allowed.
- Automated tests use fake evaluator/generator clients and make no paid provider calls.
- Preserve all unrelated dirty teacher-workspace files and untracked local files.

---

## File Map

- Modify `src/server/ai/turn-evaluator.ts`: explicit preset/conversation evaluation policy and prompt rules.
- Modify `src/server/ai/evaluator-warmup.ts`: keep the schema warm-up valid under the explicit mode contract.
- Modify `tests/server/turn-evaluator.test.ts`: prompt regressions for premise disagreement and meaning-preserving correction.
- Modify `src/server/student-access/audio-upload.ts`: pass conversation policy for every conversation turn, including the authored opener.
- Modify `src/server/student-access/audio-upload.test.ts`: end-to-end service assertions for opener grounding, correction, and preset preservation.
- Modify `src/domain/ai/conversation-generation.ts`: conversation-continuity grounding instructions.
- Modify `src/server/ai/conversation-generator.ts`: matching system instructions.
- Modify `src/server/ai/conversation-generator.test.ts`: acknowledgment/topic-continuity prompt contract.
- Modify `src/domain/mission/student-question-state.ts`: pure accepted-turn continuation resolver.
- Modify `src/domain/mission/student-question-state.test.ts`: next/final/missing-line continuation cases.
- Modify `src/components/student/MissionFlowShell.tsx`: direct dynamic advancement and pending-line hold during correction.
- Modify `src/domain/flow/completion.ts`: carry a pending `coco_line` into restored correction/repeat feedback.
- Modify `src/app/student/missions/[assignmentStudentId]/page.tsx`: include `coco_line` in the resume-review mapping.
- Modify `tests/server/student-mission-flow.test.ts`: static regression for mode-specific client branches.
- Modify `tests/server/mission-flow.test.ts`: resume-review fixtures and pending-line restoration assertions.

### Task 1: Explicit Conversation Evaluation Policy

**Files:**
- Modify: `src/server/ai/turn-evaluator.ts`
- Modify: `src/server/ai/evaluator-warmup.ts`
- Test: `tests/server/turn-evaluator.test.ts`

**Interfaces:**
- Consumes: existing `EvaluateOriginalTurnInput`, `evaluateOriginalTurn`, and injected `TurnEvaluationResponsesClient`.
- Produces: `evaluationMode: "preset" | "conversation"` on `EvaluateOriginalTurnInput`; conversation prompts that use `missionQuestion` for relevance and `transcript` meaning for correction.

- [ ] **Step 1: Write failing evaluator prompt tests**

Add these cases inside the existing `evaluateOriginalTurn` describe block:

```ts
it("accepts a premise-disagreeing free-talk answer without requiring the target pattern", async () => {
  const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
  const client = createFakeClient({
    output_parsed: correctOriginalProviderResult,
  });

  const result = await evaluateOriginalTurn(
    {
      evaluationMode: "conversation",
      missionQuestion: "How often do you play soccer?",
      transcript: "I don't play soccer.",
      targetPattern: "How often do you _____?",
      targetExample: null,
      level: "elementary",
    },
    { apiKey: "test-key", client },
  );

  expect(result).toEqual({
    ok: true,
    evaluation: correctOriginalProviderResult,
  });

  const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const userMessage = request?.input.find((message) => message.role === "user");
  const prompt = JSON.parse(userMessage?.content ?? "{}") as {
    evaluationMode?: string;
    targetExample?: string | null;
    instructions?: string[];
  };

  expect(prompt).toMatchObject({
    evaluationMode: "conversation",
    targetExample: null,
  });
  expect(prompt.instructions).toEqual(
    expect.arrayContaining([
      expect.stringContaining("relevant and grammatically valid English"),
      expect.stringContaining("does not use the targetPattern"),
      expect.stringContaining("disagrees with the question's premise"),
      expect.stringContaining("I don't play soccer"),
    ]),
  );
  expect(prompt.instructions?.join(" ")).not.toContain(
    "target pattern appears anywhere",
  );
});

it("instructs conversation correction to preserve meaning instead of parroting Coco's question", async () => {
  const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
  const client = createFakeClient({
    output_parsed: {
      ...correctOriginalProviderResult,
      outcome: "needs_correction",
      targetPatternAttempted: false,
      correctionNeeded: true,
      improvedSentence: "I don't play soccer.",
    },
  });

  const result = await evaluateOriginalTurn(
    {
      evaluationMode: "conversation",
      missionQuestion: "How often do you play soccer?",
      transcript: "I no play soccer.",
      targetPattern: "How often do you _____?",
      targetExample: null,
      level: "elementary",
    },
    { apiKey: "test-key", client },
  );

  expect(result).toMatchObject({
    ok: true,
    evaluation: {
      outcome: "needs_correction",
      improvedSentence: "I don't play soccer.",
    },
  });

  const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const userMessage = request?.input.find((message) => message.role === "user");
  const prompt = JSON.parse(userMessage?.content ?? "{}") as {
    instructions?: string[];
  };
  expect(prompt.instructions).toEqual(
    expect.arrayContaining([
      expect.stringContaining("preserve the student's intended meaning"),
      expect.stringContaining("Never use the missionQuestion as improvedSentence"),
      expect.stringContaining("I no play soccer"),
      expect.stringContaining("I don't play soccer"),
    ]),
  );
});
```

Add `evaluationMode: "preset"` to every existing preset fixture. Add `evaluationMode: "conversation"` to the existing dynamic fixtures.

- [ ] **Step 2: Run the evaluator tests and verify RED**

Run:

```bash
npx vitest run tests/server/turn-evaluator.test.ts
```

Expected: FAIL because `EvaluateOriginalTurnInput` does not accept `evaluationMode`, and the current dynamic instructions still require the target pattern.

- [ ] **Step 3: Implement the explicit mode branch**

In `src/server/ai/turn-evaluator.ts`, add the field:

```ts
export type EvaluateOriginalTurnInput = {
  evaluationMode: "preset" | "conversation";
  missionQuestion?: string;
  targetPattern: string;
  targetExample: string | null;
  level: MissionLevel;
  turnOrder?: number;
  transcript: string;
};
```

Replace `buildOriginalPrompt` with a mode-specific instruction assembly. Keep the existing preset instructions verbatim, but place the generic target-pattern acceptance instruction only inside the preset branch. Use this conversation branch:

```ts
const conversationInstructions = [
  "This is free dynamic conversation. Judge whether the transcript is a relevant response to missionQuestion and is understandable, grammatically valid English.",
  "Accept relevant and grammatically valid English even when it does not use the targetPattern, uses different vocabulary, or disagrees with the question's premise.",
  "Example: for missionQuestion 'How often do you play soccer?', 'I don't play soccer.' is correct even though it does not answer with a frequency phrase.",
  "Use targetPattern only as soft lesson context. Never require the child to repeat Coco's question or copy the targetPattern as an answer.",
  "When the student's meaning is relevant but the English is incorrect, use needs_correction and write one natural improvedSentence that preserves the student's intended meaning.",
  "Never use the missionQuestion as improvedSentence. Never substitute an authored example or a question-shaped targetPattern unless it genuinely states the student's intended answer.",
  "Example: correct 'I no play soccer.' to 'I don't play soccer.'; do not correct it to 'How often do you play soccer?'.",
];
```

Include `evaluationMode: input.evaluationMode` in the JSON prompt. Update `validOriginalInput` so conversation mode requires a nonblank `missionQuestion` and `targetExample === null`, while preset mode requires a nonblank `targetExample`:

```ts
const hasValidModeGrounding =
  input.evaluationMode === "conversation"
    ? input.targetExample === null &&
      (input.missionQuestion?.trim().length ?? 0) > 0
    : input.targetExample !== null && input.targetExample.trim().length > 0;
```

In `src/server/ai/evaluator-warmup.ts`, keep the existing preset-shaped warm-up and add:

```ts
evaluationMode: "preset",
```

The evaluator output schema is shared, so one preset warm-up still warms both policies; do not add a second paid warm-up request.

- [ ] **Step 4: Run evaluator tests and verify GREEN**

Run:

```bash
npx vitest run tests/server/turn-evaluator.test.ts
```

Expected: all evaluator tests PASS; no network call occurs because every provider path uses an injected fake client.

- [ ] **Step 5: Commit the evaluator policy**

```bash
git add src/server/ai/turn-evaluator.ts src/server/ai/evaluator-warmup.ts tests/server/turn-evaluator.test.ts
git commit -m "fix(11): make chat evaluation conversation-first"
```

### Task 2: Route Conversation Mode Through Audio Upload

**Files:**
- Modify: `src/server/student-access/audio-upload.ts`
- Test: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Consumes: `EvaluateOriginalTurnInput.evaluationMode` from Task 1 and the existing mission snapshot `conversationMode` flag.
- Produces: every chat original, including snapshot turn 1, reaches evaluation with `evaluationMode: "conversation"` and `targetExample: null`; preset calls remain `evaluationMode: "preset"` with their authored example.

- [ ] **Step 1: Add failing upload-service regressions**

Add a conversation fixture with this opener and a fake evaluator spy:

```ts
const soccerConversationSnapshot = {
  ...conversationMissionSnapshotFixture,
  targetPattern: "How often do you _____?",
  turns: [
    {
      ...conversationMissionSnapshotFixture.turns[0],
      turnOrder: 1,
      prompt: "How often do you play soccer?",
      targetExample: "How often do you play soccer?",
    },
  ],
};
```

Add one test that uploads `"I don't play soccer."` for turn 1, returns a fake correct evaluation and `"Oh, what do you like to do instead?"`, then asserts:

```ts
expect(fakeEvaluateOriginal).toHaveBeenCalledWith(
  expect.objectContaining({
    evaluationMode: "conversation",
    missionQuestion: "How often do you play soccer?",
    targetPattern: "How often do you _____?",
    targetExample: null,
    transcript: "I don't play soccer.",
  }),
);
expect(result).toMatchObject({
  ok: true,
  evaluation: { outcome: "accepted_original" },
  cocoLine: "Oh, what do you like to do instead?",
});
```

Add a second test for `"I no play soccer."` whose fake evaluator returns `needs_correction` with `improvedSentence: "I don't play soccer."`; assert the stored evaluation requires repeat and the generated `cocoLine` is still returned as the pending next prompt.

In the existing preset upload regression, add:

```ts
expect(fakeEvaluateOriginal).toHaveBeenCalledWith(
  expect.objectContaining({
    evaluationMode: "preset",
    targetExample: conversationMissionSnapshotFixture.turns[0].targetExample,
  }),
);
```

- [ ] **Step 2: Run upload tests and verify RED**

Run:

```bash
npx vitest run src/server/student-access/audio-upload.test.ts
```

Expected: FAIL because the opener currently passes its authored `targetExample`, and upload does not pass `evaluationMode`.

- [ ] **Step 3: Set mode-specific evaluation grounding**

In `src/server/student-access/audio-upload.ts`, replace the target-example derivation with:

```ts
const missionQuestion = snapshotTurn?.prompt ?? previousCocoLine;
const targetExample =
  snapshot.conversationMode === true
    ? null
    : snapshotTurn?.targetExample ?? null;
```

Pass the explicit mode in the evaluator call:

```ts
return evaluate({
  evaluationMode:
    snapshot.conversationMode === true ? "conversation" : "preset",
  missionQuestion: missionQuestion ?? undefined,
  targetPattern: snapshot.targetPattern,
  targetExample,
  level: snapshot.level,
  turnOrder: input.turnOrder,
  transcript,
});
```

Do not change repeat evaluation. Do not add a conversation fast path: because chat `targetExample` is always `null`, the existing exact-target fast path remains automatically disabled for all chat originals.

- [ ] **Step 4: Run upload and evaluator tests**

Run:

```bash
npx vitest run src/server/student-access/audio-upload.test.ts tests/server/turn-evaluator.test.ts
```

Expected: both files PASS, including the preset regression.

- [ ] **Step 5: Commit upload routing**

```bash
git add src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts
git commit -m "fix(11): route chat openers through free-talk policy"
```

### Task 3: Keep Generated Follow-ups on the Student's Topic

**Files:**
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `src/server/ai/conversation-generator.ts`
- Test: `src/server/ai/conversation-generator.test.ts`

**Interfaces:**
- Consumes: existing `GenerateCocoReplyInput` fields without changing their schema.
- Produces: system and JSON instructions that require acknowledgment, related follow-up, and soft-only target-pattern steering.

- [ ] **Step 1: Write the failing continuity contract test**

Add this test to `src/server/ai/conversation-generator.test.ts`:

```ts
it("prioritizes the student's meaning and topic over target-pattern repetition", async () => {
  const { generateCocoReply } = await import("@/server/ai/conversation-generator");
  const client = createFakeClient(async () => ({
    output_parsed: { line: "Oh, what do you like to do instead?" },
  }));

  await generateCocoReply(
    {
      ...baseInput,
      targetPattern: "How often do you _____?",
      previousCocoLine: "How often do you play soccer?",
      studentTranscript: "I don't play soccer.",
    },
    { apiKey: "test-key", client },
  );

  const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const system = call?.input.find((message) => message.role === "system")?.content ?? "";
  const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
  const prompt = JSON.parse(user) as { instructions?: string[] };
  const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

  expect(combined).toContain("acknowledge or react to the student's meaning");
  expect(combined).toContain("Keep the current subject");
  expect(combined).toContain("soft lesson context");
  expect(combined).toContain("merely swaps in a new noun or activity");
  expect(combined).not.toContain(
    "Stay anchored to the target grammar pattern every turn",
  );
});
```

- [ ] **Step 2: Run the generator test and verify RED**

Run:

```bash
npx vitest run src/server/ai/conversation-generator.test.ts
```

Expected: FAIL because the current system and user prompts require target-pattern anchoring and do not require topic continuity.

- [ ] **Step 3: Replace hard grammar anchoring with continuity rules**

Use these shared semantics in both the system message and `buildConversationPrompt` instructions:

```ts
const continuityInstructions = [
  "Acknowledge or react to the student's meaning before asking a follow-up.",
  "Keep the current subject unless the student changes it or windDown requires a natural close.",
  "Treat targetPattern as soft lesson context that Coco may model naturally, never as a mandatory next-line template.",
  "Reject a follow-up that merely swaps in a new noun or activity to repeat targetPattern; the follow-up must connect to the student's actual answer.",
];
```

Preserve the existing `windDown`, `hardCap`, safety, privacy, structured-output, and stateless re-grounding rules. Do not add provider conversation state or chat history.

- [ ] **Step 4: Run generator tests and verify GREEN**

Run:

```bash
npx vitest run src/server/ai/conversation-generator.test.ts
```

Expected: all tests PASS, including the existing `previous_response_id` prohibition.

- [ ] **Step 5: Commit continuity policy**

```bash
git add src/domain/ai/conversation-generation.ts src/server/ai/conversation-generator.ts src/server/ai/conversation-generator.test.ts
git commit -m "fix(11): keep Coco follow-ups on the student's topic"
```

### Task 4: Pure Accepted-Turn Continuation Decisions

**Files:**
- Modify: `src/domain/mission/student-question-state.ts`
- Test: `src/domain/mission/student-question-state.test.ts`

**Interfaces:**
- Consumes: current zero-based `turnIndex`, server-owned `requiredTurns`, and pending `cocoLine`.
- Produces: `resolveAcceptedConversationTurn(input): AcceptedConversationTurnResolution` with `next`, `complete`, or `unavailable` outcomes.

- [ ] **Step 1: Write the failing pure-state tests**

Import `resolveAcceptedConversationTurn`, then add:

```ts
it("advances an accepted chat turn directly to the pending Coco line", () => {
  expect(
    resolveAcceptedConversationTurn({
      turnIndex: 0,
      requiredTurns: 4,
      pendingCocoLine: " Oh, what do you like to do instead? ",
    }),
  ).toEqual({
    kind: "next",
    turnIndex: 1,
    dynamicPrompt: "Oh, what do you like to do instead?",
  });
});

it("completes the final accepted chat turn without requiring another Coco line", () => {
  expect(
    resolveAcceptedConversationTurn({
      turnIndex: 3,
      requiredTurns: 4,
      pendingCocoLine: null,
    }),
  ).toEqual({ kind: "complete" });
});

it("fails closed when a non-final accepted chat turn has no pending Coco line", () => {
  expect(
    resolveAcceptedConversationTurn({
      turnIndex: 1,
      requiredTurns: 4,
      pendingCocoLine: "   ",
    }),
  ).toEqual({ kind: "unavailable" });
});
```

- [ ] **Step 2: Run the state tests and verify RED**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts
```

Expected: FAIL because `resolveAcceptedConversationTurn` does not exist.

- [ ] **Step 3: Implement the smallest pure resolver**

Add:

```ts
export type AcceptedConversationTurnResolution =
  | {
      kind: "next";
      turnIndex: number;
      dynamicPrompt: string;
    }
  | { kind: "complete" }
  | { kind: "unavailable" };

export function resolveAcceptedConversationTurn({
  turnIndex,
  requiredTurns,
  pendingCocoLine,
}: {
  turnIndex: number;
  requiredTurns: number;
  pendingCocoLine: string | null;
}): AcceptedConversationTurnResolution {
  if (turnIndex + 1 >= requiredTurns) {
    return { kind: "complete" };
  }

  const dynamicPrompt = pendingCocoLine?.trim();
  if (!dynamicPrompt) {
    return { kind: "unavailable" };
  }

  return {
    kind: "next",
    turnIndex: turnIndex + 1,
    dynamicPrompt,
  };
}
```

Keep `advanceConversationQuestion` until Task 5 removes its remaining dynamic client use; existing tests may continue to exercise it.

- [ ] **Step 4: Run state tests and verify GREEN**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts
```

Expected: all state tests PASS.

- [ ] **Step 5: Commit the state resolver**

```bash
git add src/domain/mission/student-question-state.ts src/domain/mission/student-question-state.test.ts
git commit -m "feat(11): resolve direct chat continuation state"
```

### Task 5: Advance Accepted Originals and Repeats Directly

**Files:**
- Modify: `src/components/student/MissionFlowShell.tsx`
- Test: `tests/server/student-mission-flow.test.ts`

**Interfaces:**
- Consumes: `resolveAcceptedConversationTurn` from Task 4 and existing `completeMissionAction`.
- Produces: direct conversation `question -> cocoThinking -> question` and `repeat -> question` success paths; preset paths keep their current feedback/transition behavior.

- [ ] **Step 1: Add failing source-contract assertions**

Replace the current dynamic-routing source test with assertions for the explicit helper and mode branch:

```ts
it("advances accepted chat originals and repeats without preset success or transition steps", () => {
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  expect(shellSource).toContain("resolveAcceptedConversationTurn");
  expect(shellSource).toContain("continueAcceptedConversationTurn");
  expect(shellSource).toMatch(
    /conversationMode[\s\S]*originalFeedback\.kind === "acceptedOriginal"[\s\S]*continueAcceptedConversationTurn/,
  );
  expect(shellSource).toMatch(
    /conversationMode[\s\S]*repeatFeedback\.kind === "repeatAccepted"[\s\S]*continueAcceptedConversationTurn/,
  );
  expect(shellSource).toContain('resolution.kind === "unavailable"');
  expect(shellSource).toContain("Coco’s next question isn’t available yet");
});
```

Keep the existing preset assertions for `StepTurnTransition`, `finishAcceptedOriginal`, and `finishRepeatFeedback`.

- [ ] **Step 2: Run the source-contract test and verify RED**

Run:

```bash
npx vitest run tests/server/student-mission-flow.test.ts
```

Expected: FAIL because accepted chat outcomes still enter feedback and transition steps.

- [ ] **Step 3: Add a direct accepted-chat helper**

Import `resolveAcceptedConversationTurn`. Add a helper inside `MissionFlowShell`:

```ts
async function continueAcceptedConversationTurn(
  aid: string,
  pendingCocoLine: string | null,
) {
  const resolution = resolveAcceptedConversationTurn({
    turnIndex: flow.turnIndex,
    requiredTurns,
    pendingCocoLine,
  });

  if (resolution.kind === "unavailable") {
    setActionError(
      "Coco’s next question isn’t available yet. Please return to your missions and try again.",
    );
    setFlow((prev) => ({
      ...prev,
      turnIndex: prev.turnIndex + 1,
      step: "question",
      cocoLine: null,
      dynamicPrompt: null,
    }));
    return;
  }

  if (resolution.kind === "complete") {
    const result = await completeMissionAction({
      assignmentStudentId,
      attemptId: aid,
    });
    if (!result.ok) {
      setActionError(
        "Something went wrong. Try again, or ask your teacher for help.",
      );
      throw new Error("mission_complete_failed");
    }
    setFlow((prev) => ({ ...prev, step: "complete" }));
    return;
  }

  revokeAudioUrls();
  setFlow({
    turnIndex: resolution.turnIndex,
    step: "question",
    hintLevel: 0,
    originalTranscript: null,
    repeatTranscript: null,
    improvedSentence: null,
    originalFeedback: null,
    repeatFeedback: null,
    hasRetriedThisTurn: false,
    cocoLine: null,
    dynamicPrompt: resolution.dynamicPrompt,
  });
}
```

After original upload creates `originalFeedback`, branch before the normal `setFlow`:

```ts
if (
  conversationMode &&
  originalFeedback.kind === "acceptedOriginal"
) {
  await continueAcceptedConversationTurn(aid, upload.cocoLine ?? null);
  return;
}
```

For `needsCorrection`, keep `step: "aiFeedback"` and persist `cocoLine` in state, but remove the `getMascotDialogue` branch that displays the pending dynamic line during correction. Coco should display the correction encouragement while the contextual follow-up remains pending.

After repeat upload creates `repeatFeedback`, branch before normal repeat-feedback state:

```ts
if (
  conversationMode &&
  repeatFeedback.kind === "repeatAccepted"
) {
  await continueAcceptedConversationTurn(aid, flow.cocoLine);
  return;
}
```

Leave `retryRepeat`, `repeatReview`, 1-star forced retry, and every preset handler unchanged. Keep `StepTurnTransition` rendered because preset missions still use it.

- [ ] **Step 4: Run focused flow tests**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts
```

Expected: all three files PASS. Existing TTS labels, sprite wiring, and preset transition source contracts remain intact.

- [ ] **Step 5: Commit direct chat progression**

```bash
git add src/components/student/MissionFlowShell.tsx tests/server/student-mission-flow.test.ts
git commit -m "fix(11): skip preset transitions in dynamic chat"
```

### Task 6: Restore the Pending Coco Line After Refresh

**Files:**
- Modify: `src/domain/flow/completion.ts`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `src/app/student/missions/[assignmentStudentId]/page.tsx`
- Test: `tests/server/mission-flow.test.ts`
- Test: `tests/server/student-mission-page.test.ts`

**Interfaces:**
- Consumes: persisted `attempt_turns.coco_line` already loaded by the student mission page.
- Produces: `PendingTurnReview.cocoLine: string | null`, restored into `FlowState.cocoLine` for correction and repeat review states.

- [ ] **Step 1: Add failing resume tests**

In `tests/server/mission-flow.test.ts`, create a correction turn with:

```ts
const review = getPendingTurnReview({
  turn_order: 1,
  original_transcript: "I no play soccer.",
  improved_sentence: "I don't play soccer.",
  repeat_transcript: null,
  repeat_accepted: null,
  coco_line: "Oh, what do you like to do instead?",
  evaluation: {
    version: "ai-eval-v1",
    outcome: "needs_correction",
    requireRepeat: true,
  },
});

expect(review).toMatchObject({
  step: "aiFeedback",
  outcome: "needsCorrection",
  cocoLine: "Oh, what do you like to do instead?",
});
```

Add `cocoLine: null` to the existing accepted-original and accepted-repeat exact-object expectations, then add a matching page source assertion:

```ts
expect(pageSource).toContain("coco_line: t.coco_line");
expect(shellSource).toContain("cocoLine: initialReview.cocoLine");
```

- [ ] **Step 2: Run resume tests and verify RED**

Run:

```bash
npx vitest run tests/server/mission-flow.test.ts tests/server/student-mission-page.test.ts
```

Expected: FAIL because `CompletionTurn` and `PendingTurnReview` do not carry `coco_line`.

- [ ] **Step 3: Thread the pending line through SSR state**

Add to `CompletionTurn`:

```ts
coco_line?: string | null;
```

Add to both `PendingTurnReview` variants:

```ts
cocoLine: string | null;
```

Set `cocoLine: turn.coco_line?.trim() || null` in both return branches of `getPendingTurnReview`.

In the page's `nextUnfinishedTurnOrder` mapping, include:

```ts
coco_line: t.coco_line,
```

In `initialFlowState`, set this in both restored feedback branches:

```ts
cocoLine: initialReview.cocoLine,
```

Do not generate a replacement line during resume. Do not use a later turn's line.

- [ ] **Step 4: Run resume and flow tests**

Run:

```bash
npx vitest run tests/server/mission-flow.test.ts tests/server/student-mission-page.test.ts tests/server/student-mission-flow.test.ts src/domain/mission/student-question-state.test.ts
```

Expected: all files PASS; correction review restores the exact current turn's pending Coco line.

- [ ] **Step 5: Commit resume restoration**

```bash
git add src/domain/flow/completion.ts src/components/student/MissionFlowShell.tsx src/app/student/missions/'[assignmentStudentId]'/page.tsx tests/server/mission-flow.test.ts tests/server/student-mission-page.test.ts
git commit -m "fix(11): restore pending chat reply during correction"
```

### Task 7: Full Repair Verification and Manual Soccer UAT

**Files:**
- Verify only; no production file is changed in this task.

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: evidence that conversation repair works without preset, TTS, moderation, or completion regressions.

- [ ] **Step 1: Run focused automated tests**

```bash
npx vitest run tests/server/turn-evaluator.test.ts src/server/student-access/audio-upload.test.ts src/server/ai/conversation-generator.test.ts src/domain/mission/student-question-state.test.ts tests/server/mission-flow.test.ts tests/server/student-mission-page.test.ts tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts
```

Expected: all listed test files PASS; no test invokes a live OpenAI or Azure provider.

- [ ] **Step 2: Run repository quality gates**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: TypeScript exits 0, ESLint exits 0, and the full Vitest suite exits 0.

- [ ] **Step 3: Run deterministic student feedback-state coverage**

With the app already running at `http://localhost:3000` and disposable access values exported only in the shell, run:

```bash
FEEDBACK_STATE_CLASS_CODE="$FEEDBACK_STATE_CLASS_CODE" \
FEEDBACK_STATE_STUDENT_NAME="$FEEDBACK_STATE_STUDENT_NAME" \
FEEDBACK_STATE_PIN="$FEEDBACK_STATE_PIN" \
npm run test:student-feedback-states
```

Expected: the deterministic feedback-state suite exits 0 and does not write reusable access values to the repository.

- [ ] **Step 4: Manually repeat the reported scenario**

Create or use a conversation mission whose opener is `How often do you play soccer?`, then verify:

1. Say `I don't play soccer.`
2. Confirm no correction asks the student to repeat Coco's question.
3. Confirm Coco's next recordable prompt directly acknowledges the answer and stays on soccer/alternative activities.
4. Confirm no `Nice answer`, `Good job! Ready for the next one?`, or `Next turn` screen appears.
5. Restart with `I no play soccer.`
6. Confirm the correction is `I don't play soccer.` and a spoken repeat is required.
7. Refresh on the correction/repeat screen; confirm the same pending contextual Coco line is used after the accepted repeat.
8. Run one preset mission; confirm its answer evaluation, correction, pronunciation retry, and transition screens are unchanged.

Expected: all eight checks pass.

- [ ] **Step 5: Record implementation completion in GSD state**

After all verification passes, update `.planning/STATE.md` YAML and prose together with the actual completion date, last verified command set, and manual UAT result. Do not mark Phase 11 complete unless every remaining Phase 11 requirement is complete.

- [ ] **Step 6: Commit verification state**

```bash
git add .planning/STATE.md
git commit -m "docs(11): record dynamic conversation repair verification"
```
