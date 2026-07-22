# Final Coco Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End every successfully completed dynamic conversation mission with a relevant, spoken Coco farewell and an explicit **Finish mission** button before the existing completion screen.

**Architecture:** Derive `follow_up` versus `closing` exclusively from the server-owned `turnOrder` and mission snapshot `requiredTurns`. Persist the final closing in the existing `attempt_turns.coco_line`, resolve its speech through the existing owned `coco_dynamic_line` TTS descriptor, complete the attempt atomically, and add one client-only `closing` state before the existing `complete` state.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Supabase service/RPC boundaries, OpenAI structured output, Zod, Vitest.

## Global Constraints

- Conversation mode only; preset mission behavior must remain unchanged.
- The mission snapshot's `requiredTurns` owns conversational ending semantics; `HARD_TURN_CAP = 8` remains only the absolute server safety ceiling.
- The final generated line must acknowledge the latest learner response, include a brief goodbye, and contain no question.
- The static closing fallback is exactly `That was fun! Thanks for talking with me. See you next time!`; it is non-interpolated and contains no student text.
- Persist final copy in the existing `attempt_turns.coco_line`; do not add a database column or migration.
- The browser continues to send only the bounded `coco_dynamic_line` descriptor and final turn order to TTS, never arbitrary text or storage identifiers.
- Complete the owned attempt before showing the closing screen; **Finish mission** performs no server mutation and only reveals the existing completion screen.
- Final teacher-review outcomes keep the existing review-pending flow and do not show a successful closing.
- TTS failure must not hide the closing text or disable **Finish mission**.
- Do not change correction thresholds, recast behavior, conversation-history representation, run-on repair, either/or policy, topic-drift policy, or follow-up fallback copy in this task.
- Preserve all server-side ownership filters, RLS assumptions, mission snapshots, per-turn audio, and signed-on-demand audio access.
- Do not push, deploy, or mutate an external Supabase environment without separate approval.
- Before `npm run build`, confirm `npm run dev` is not using this checkout's `.next` directory; otherwise use an isolated worktree/cache or defer the build with explicit evidence.

---

## File map

- `src/domain/ai/conversation-generation.ts`: derive the line role and required-turn prompt metadata; validate closings as no-question lines.
- `src/server/ai/conversation-generator.ts`: instruct and validate provider output according to the derived role.
- `src/domain/conversation/fallback-lines.ts`: own the separate, static closing fallback.
- `src/server/student-access/audio-upload.ts`: choose the role-aware fallback while preserving moderation, persistence, and TTS warmup.
- `src/domain/mission/student-question-state.ts`: resolve a final accepted conversation turn to a required closing line instead of directly to completion.
- `src/components/student/StepConversationClosing.tsx`: render only the **Finish mission** action; closing copy remains in Coco's persistent dialogue.
- `src/components/student/MissionFlowShell.tsx`: complete the attempt, enter `closing`, speak the persisted final line, then reveal `complete` locally.
- `src/domain/character/expression.ts`: give the closing step a stable happy expression.
- Existing co-located and `tests/` Vitest files: enforce each domain, server, TTS, flow, and preset regression contract.
- `TASK.md`: record implementation and verification evidence after checks actually run.

---

### Task 1: Generate and persist a required-turn closing

**Files:**
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `src/domain/ai/conversation-generation.test.ts`
- Modify: `src/server/ai/conversation-generator.ts`
- Modify: `src/server/ai/conversation-generator.test.ts`
- Modify: `src/domain/conversation/fallback-lines.ts`
- Create: `src/domain/conversation/fallback-lines.test.ts`
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Consumes: existing `GenerateCocoReplyInput`, `HARD_TURN_CAP`, `runConversationTurn`, `recordCocoLine`, output moderation, and TTS warmup boundaries.
- Produces: `ConversationReplyMode = "follow_up" | "closing"`, `conversationReplyMode(input)`, `selectClosingFallbackLine()`, and an upload result whose final `cocoLine` is a persisted no-question closing.

- [ ] **Step 1: Write failing pure-domain tests for required-turn semantics**

In `src/domain/ai/conversation-generation.test.ts`, remove `windDown` from the shared input fixture and add:

```ts
function historyThrough(turnOrder: number) {
  return Array.from({ length: turnOrder }, (_, index) => ({
    turnOrder: index + 1,
    cocoLine:
      index === turnOrder - 1
        ? "What did you enjoy today?"
        : `Question ${index + 1}?`,
    studentResponse:
      index === turnOrder - 1
        ? "I enjoyed swimming."
        : `Answer ${index + 1}.`,
  }));
}

it("derives follow-up and closing roles from requiredTurns", () => {
  const followUp = buildConversationPrompt({
    ...input,
    turnOrder: 4,
    requiredTurns: 5,
    conversationHistory: historyThrough(4),
  });
  expect(followUp).toMatchObject({
    replyMode: "follow_up",
    turnsRemaining: 1,
    windDown: true,
  });
  expect(followUp.instructions.join(" ")).toContain("ask exactly one question");

  const closing = buildConversationPrompt({
    ...input,
    turnOrder: 5,
    requiredTurns: 5,
    conversationHistory: historyThrough(5),
  });
  expect(closing).toMatchObject({
    replyMode: "closing",
    turnsRemaining: 0,
    windDown: false,
  });
  const closingInstructions = closing.instructions.join(" ");
  expect(closingInstructions).toContain("Acknowledge the latest studentResponse");
  expect(closingInstructions).toContain("short friendly goodbye");
  expect(closingInstructions).toContain("no question");
});

it("treats turn eight as a closing when requiredTurns is eight", () => {
  expect(
    conversationReplyMode({ turnOrder: 8, requiredTurns: 8 }),
  ).toBe("closing");
});
```

Import `conversationReplyMode` from the domain module. Update any fixture construction errors caused by removing `windDown`; do not change follow-up policy assertions.

- [ ] **Step 2: Run the domain test and verify the new contract fails**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts
```

Expected: FAIL because `conversationReplyMode` and `replyMode` do not exist, `turnsRemaining` still uses the hard cap, and the input still requires `windDown`.

- [ ] **Step 3: Implement the pure role and prompt contract**

In `src/domain/ai/conversation-generation.ts`:

1. Remove `windDown` from `conversationTurnInputSchema` so callers cannot supply a value inconsistent with `requiredTurns`.
2. Add the pure role helper:

```ts
export type ConversationReplyMode = "follow_up" | "closing";

export function conversationReplyMode(input: {
  turnOrder: number;
  requiredTurns: number;
}): ConversationReplyMode {
  return input.turnOrder >= input.requiredTurns ? "closing" : "follow_up";
}
```

3. At the start of `buildConversationPrompt`, derive all ending metadata:

```ts
const replyMode = conversationReplyMode(input);
const turnsRemaining = Math.max(0, input.requiredTurns - input.turnOrder);
const windDown = replyMode === "follow_up" && turnsRemaining <= 1;
```

4. Return `replyMode`, `turnsRemaining`, and `windDown` in the prompt. Replace hard-cap closing instructions with role-specific instructions:

```ts
replyMode === "closing"
  ? "Acknowledge the latest studentResponse specifically, then add a short friendly goodbye. Write one or two short complete sentences with no question."
  : "Acknowledge the latest studentResponse, then ask exactly one relevant question for new information.",
```

Keep `hardCap: HARD_TURN_CAP` in the prompt as the independent ceiling. Remove instructions that say only `turnOrder === hardCap` may close. Keep the existing child-safety, topic-grounding, and target-pattern constraints for follow-ups.

- [ ] **Step 4: Run the pure-domain tests to green**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts
```

Expected: PASS, including existing one-question and no-question policy tests.

- [ ] **Step 5: Write failing adapter tests for a five-turn closing and eight-turn boundary**

In `src/server/ai/conversation-generator.test.ts`, remove `windDown` from `baseInput`, replace the hard-cap-only closing test with:

```ts
it("uses a no-question closing policy at requiredTurns", async () => {
  const { generateCocoReply } = await import("@/server/ai/conversation-generator");
  const client = createFakeClient(async () => ({
    output_parsed: {
      line: "Sushi sounds delicious! Thanks for talking with me. See you next time!",
    },
  }));
  const conversationHistory = Array.from({ length: 5 }, (_, index) => ({
    turnOrder: index + 1,
    cocoLine:
      index === 4 ? "What will you eat?" : `Question ${index + 1}?`,
    studentResponse:
      index === 4 ? "I will eat sushi." : `Answer ${index + 1}.`,
  }));

  const result = await generateCocoReply(
    {
      ...baseInput,
      turnOrder: 5,
      requiredTurns: 5,
      conversationHistory,
    },
    { apiKey: "test-key", client },
  );

  expect(result).toEqual({
    ok: true,
    reply: {
      line: "Sushi sounds delicious! Thanks for talking with me. See you next time!",
    },
  });
  const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const combined = call?.input.map((message) => message.content).join(" ") ?? "";
  expect(combined).toContain("short friendly goodbye");
  expect(combined).toContain("no question");
});

it("allows an eight-turn mission closing through the hard-cap boundary", async () => {
  const { generateCocoReply } = await import("@/server/ai/conversation-generator");
  const client = createFakeClient(async () => ({
    output_parsed: { line: "That was fun! See you next time!" },
  }));
  const history = Array.from({ length: 8 }, (_, index) => ({
    turnOrder: index + 1,
    cocoLine: `Question ${index + 1}?`,
    studentResponse: `Answer ${index + 1}.`,
  }));

  const result = await generateCocoReply(
    {
      ...baseInput,
      turnOrder: 8,
      requiredTurns: 8,
      hardCap: 8,
      conversationHistory: history,
    },
    { apiKey: "test-key", client },
  );

  expect(result).toMatchObject({ ok: true });
  expect(client.responses.parse).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Run the adapter test and verify required-turn closing fails**

Run:

```bash
npx vitest run src/server/ai/conversation-generator.test.ts
```

Expected: FAIL because `expectsQuestion` and the system instructions still key closing on `hardCap`.

- [ ] **Step 7: Implement role-aware provider instructions and validation**

In `src/server/ai/conversation-generator.ts`:

1. Import `conversationReplyMode`.
2. Replace system-message claims that only the hard cap closes with:

```ts
"Follow replyMode from the user payload exactly.",
"When replyMode is follow_up, acknowledge the latest studentResponse and ask exactly one relevant question.",
"When replyMode is closing, acknowledge the latest studentResponse specifically, add a short friendly goodbye such as 'See you next time,' and ask no question.",
```

3. Derive policy mode after parsing:

```ts
const replyMode = conversationReplyMode(validInput.data);
const expectsQuestion = replyMode === "follow_up";
```

Use that same `expectsQuestion` for the first candidate, the correction prompt, and the corrected candidate. Keep the existing structured-output parsing, reason-only logging, moderation ownership, and single correction attempt.

- [ ] **Step 8: Run domain and adapter tests to green**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts
```

Expected: PASS.

- [ ] **Step 9: Write failing tests for the closing fallback and upload orchestration**

Create `src/domain/conversation/fallback-lines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CANNED_CLOSING_FALLBACK_LINE,
  selectClosingFallbackLine,
} from "@/domain/conversation/fallback-lines";

describe("conversation fallback lines", () => {
  it("provides a static no-question closing with no interpolation", () => {
    expect(selectClosingFallbackLine()).toBe(
      "That was fun! Thanks for talking with me. See you next time!",
    );
    expect(selectClosingFallbackLine()).toBe(CANNED_CLOSING_FALLBACK_LINE);
    expect(selectClosingFallbackLine()).not.toContain("?");
  });
});
```

In `src/server/student-access/audio-upload.test.ts`, replace the obsolete fixed-hard-cap `windDown` test with these cases. Use the existing `createMockSupabase`, `audioInput`, evaluator, generator, and moderation helpers:

```ts
it("requests and persists a closing on the final required turn", async () => {
  mockSupabase = createMockSupabase({
    previousTurns: Array.from({ length: 3 }, (_, index) => ({
      turn_order: index + 1,
      original_transcript: `Answer ${index + 1}.`,
      improved_sentence: null,
      coco_line: `Question ${index + 2}?`,
    })),
  });
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const closing =
    "Sushi sounds delicious! Thanks for talking with me. See you next time!";
  const generate = fakeGenerateCocoReply(async () => ({
    ok: true,
    reply: { line: closing },
  }));

  const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 4 }), {
    transcribeAudioFile: successfulTranscriber("I will eat sushi."),
    evaluateOriginalTurn: successfulOriginalEvaluator(),
    generateCocoReply: generate,
    isContentSafe: fakeIsContentSafe(async () => ({
      safe: true,
      failedOpen: false,
    })),
  });

  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({ turnOrder: 4, requiredTurns: 4 }),
  );
  expect(result).toMatchObject({ ok: true, cocoLine: closing });
  expect(mockSupabase.operations).toContainEqual(
    expect.objectContaining({
      table: "attempt_turns",
      action: "upsert",
      payload: expect.objectContaining({ coco_line: closing }),
    }),
  );
});

it("uses the static closing fallback for provider, schema, and policy failures", async () => {
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const failures: Array<{
    generation: GenerateCocoReplyResult;
    expectedEvent: Record<string, unknown>;
  }> = [
    {
      generation: { ok: false, error: "provider_failed" },
      expectedEvent: { kind: "canned_fallback", cause: "provider_failed" },
    },
    {
      generation: { ok: false, error: "schema_failed" },
      expectedEvent: { kind: "canned_fallback", cause: "schema_failed" },
    },
    {
      generation: {
        ok: false,
        error: "reply_policy_failed",
        violations: ["question_format"],
      },
      expectedEvent: {
        kind: "canned_fallback",
        cause: "reply_policy_failed",
        violations: ["question_format"],
      },
    },
  ];

  for (const { generation, expectedEvent } of failures) {
    mockSupabase = createMockSupabase({
      previousTurns: Array.from({ length: 3 }, (_, index) => ({
        turn_order: index + 1,
        original_transcript: `Answer ${index + 1}.`,
        improved_sentence: null,
        coco_line: `Question ${index + 2}?`,
      })),
    });

    const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 4 }), {
      transcribeAudioFile: successfulTranscriber("I will eat sushi."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      generateCocoReply: fakeGenerateCocoReply(async () => generation),
      isContentSafe: fakeIsContentSafe(async () => ({
        safe: true,
        failedOpen: false,
      })),
    });

    expect(result).toMatchObject({
      ok: true,
      cocoLine: "That was fun! Thanks for talking with me. See you next time!",
      cocoLineModerationEvent: expectedEvent,
    });
  }
});

it("uses the static closing fallback when output moderation is unavailable", async () => {
  mockSupabase = createMockSupabase({
    previousTurns: Array.from({ length: 3 }, (_, index) => ({
      turn_order: index + 1,
      original_transcript: `Answer ${index + 1}.`,
      improved_sentence: null,
      coco_line: `Question ${index + 2}?`,
    })),
  });
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  let moderationCall = 0;

  const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 4 }), {
    transcribeAudioFile: successfulTranscriber("I will eat sushi."),
    evaluateOriginalTurn: successfulOriginalEvaluator(),
    generateCocoReply: fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Sushi sounds delicious! See you next time!" },
    })),
    isContentSafe: fakeIsContentSafe(async () => {
      moderationCall += 1;
      return moderationCall === 1
        ? { safe: true as const, failedOpen: false as const }
        : { safe: false as const, failedOpen: true as const };
    }),
  });

  expect(result).toMatchObject({
    ok: true,
    cocoLine: "That was fun! Thanks for talking with me. See you next time!",
    cocoLineModerationEvent: {
      kind: "canned_fallback",
      cause: "output_moderation_unavailable",
    },
  });
});
```

Add the matching eight-turn orchestration test:

```ts
it("generates the closing on turn eight instead of short-circuiting at the hard cap", async () => {
  mockSupabase = createMockSupabase({
    missionSnapshot: {
      ...conversationMissionSnapshotFixture,
      requiredTurns: 8,
    },
    previousTurns: Array.from({ length: 7 }, (_, index) => ({
      turn_order: index + 1,
      original_transcript: `Answer ${index + 1}.`,
      improved_sentence: null,
      coco_line: `Question ${index + 2}?`,
    })),
  });
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const generate = fakeGenerateCocoReply(async () => ({
    ok: true,
    reply: { line: "That was fun! See you next time!" },
  }));

  const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 8 }), {
    transcribeAudioFile: successfulTranscriber("I enjoyed swimming."),
    evaluateOriginalTurn: successfulOriginalEvaluator(),
    generateCocoReply: generate,
    isContentSafe: fakeIsContentSafe(async () => ({
      safe: true,
      failedOpen: false,
    })),
  });

  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({ turnOrder: 8, requiredTurns: 8 }),
  );
  expect(result).toMatchObject({
    ok: true,
    cocoLine: "That was fun! See you next time!",
  });
});
```

- [ ] **Step 10: Run the fallback and orchestration tests and verify failure**

Run:

```bash
npx vitest run src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: FAIL because the closing selector does not exist, the upload caller still supplies `windDown`, and every failure still uses the follow-up fallback library.

- [ ] **Step 11: Implement the static closing fallback and role-aware orchestration**

In `src/domain/conversation/fallback-lines.ts`, add:

```ts
export const CANNED_CLOSING_FALLBACK_LINE =
  "That was fun! Thanks for talking with me. See you next time!" as const;

export function selectClosingFallbackLine(): string {
  return CANNED_CLOSING_FALLBACK_LINE;
}
```

In `src/server/student-access/audio-upload.ts`:

1. Import `conversationReplyMode` and `selectClosingFallbackLine`.
2. Remove the fixed-cap `windDown` calculation and omit `windDown` from `generationInput`.
3. Add one local selector:

```ts
function fallbackLineForContext(context: ConversationTurnContext): string {
  return conversationReplyMode(context) === "closing"
    ? selectClosingFallbackLine()
    : selectFallbackLine(context.turnOrder);
}
```

4. Replace every `selectFallbackLine(context.turnOrder)` inside
   `runConversationTurn` with `fallbackLineForContext(context)`. This includes
   flagged/unavailable student moderation, generation failure, unavailable
   output moderation, and unsafe-output retry exhaustion.

Do not change `canGenerateNextDynamicTurn`: its inclusive `<= 8` boundary is
what permits the eighth-turn closing. Keep `recordCocoLine`, moderation-event
persistence, and TTS warmup unchanged so the closing uses the existing owned
path.

- [ ] **Step 12: Run all Task 1 tests to green**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: PASS.

- [ ] **Step 13: Commit Task 1**

```bash
git add src/domain/ai/conversation-generation.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts
git commit -m "feat(conversation): generate final Coco closing"
```

---

### Task 2: Show the spoken closing before mission completion

**Files:**
- Modify: `src/domain/mission/student-question-state.ts`
- Modify: `src/domain/mission/student-question-state.test.ts`
- Create: `src/components/student/StepConversationClosing.tsx`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `src/domain/character/expression.ts`
- Modify: `tests/domain/character-expression.test.ts`
- Modify: `tests/domain/tts-ui-source.test.ts`
- Modify: `tests/server/student-mission-flow.test.ts`
- Modify: `tests/server/student-mission-page.test.ts`

**Interfaces:**
- Consumes: final upload `cocoLine`, `completeMissionAction`, the persisted `coco_dynamic_line` TTS descriptor, and the existing `complete` step.
- Produces: `AcceptedConversationTurnResolution` variant `{ kind: "closing"; closingLine: string }`, `FlowStep` value `"closing"`, and `StepConversationClosing({ onFinish })`.

- [ ] **Step 1: Write failing resolution tests that require a final line**

In `src/domain/mission/student-question-state.test.ts`, replace the test that completes without a line with:

```ts
it("resolves the final accepted chat turn to its closing line", () => {
  expect(
    resolveAcceptedConversationTurn({
      turnIndex: 3,
      requiredTurns: 4,
      pendingCocoLine:
        "Sushi sounds delicious! Thanks for talking with me. See you next time!",
    }),
  ).toEqual({
    kind: "closing",
    closingLine:
      "Sushi sounds delicious! Thanks for talking with me. See you next time!",
  });
});

it("fails closed when the final accepted turn has no closing line", () => {
  expect(
    resolveAcceptedConversationTurn({
      turnIndex: 3,
      requiredTurns: 4,
      pendingCocoLine: "   ",
    }),
  ).toEqual({ kind: "unavailable" });
});
```

- [ ] **Step 2: Run the resolution test and verify failure**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts
```

Expected: FAIL because the final branch still returns `{ kind: "complete" }` and ignores the line.

- [ ] **Step 3: Implement the closing resolution**

In `src/domain/mission/student-question-state.ts`, change the union and resolver:

```ts
export type AcceptedConversationTurnResolution =
  | {
      kind: "next";
      turnIndex: number;
      dynamicPrompt: string;
    }
  | { kind: "closing"; closingLine: string }
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
  const line = pendingCocoLine?.trim();
  if (!line) return { kind: "unavailable" };

  if (turnIndex + 1 >= requiredTurns) {
    return { kind: "closing", closingLine: line };
  }

  return {
    kind: "next",
    turnIndex: turnIndex + 1,
    dynamicPrompt: line,
  };
}
```

- [ ] **Step 4: Run the resolution test to green**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing client/TTS source contracts**

In `tests/server/student-mission-flow.test.ts`, add:

```ts
it("completes once, shows the final Coco closing, then waits for Finish mission", () => {
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );
  const closingSource = readFileSync(
    "src/components/student/StepConversationClosing.tsx",
    "utf8",
  );

  expect(shellSource).toContain('| "closing"');
  expect(shellSource).toContain('resolution.kind === "closing"');
  expect(shellSource).toContain("completeMissionAction");
  expect(shellSource).toContain('step: "closing"');
  expect(shellSource).toContain("<StepConversationClosing");
  expect(shellSource).toContain('lineKind: "coco_dynamic_line"');
  expect(shellSource).toContain(
    "continueAcceptedConversationTurn(aid, upload.cocoLine ?? null)",
  );
  expect(shellSource).toContain(
    "continueAcceptedConversationTurn(aid, flow.cocoLine)",
  );
  expect(shellSource).toMatch(
    /function finishConversationClosing\(\) \{\s*setFlow\(\(prev\) => \(\{ \.\.\.prev, step: "complete" \}\)\);\s*\}/,
  );
  expect(closingSource).toContain("Finish mission");
  expect(closingSource).toContain("onFinish");
  expect(closingSource).not.toContain("completeMissionAction");
  expect(closingSource).not.toContain("disabled=");
  expect(closingSource).not.toContain("CocoSpeechAudio");
});
```

In `tests/domain/tts-ui-source.test.ts`, add:

```ts
it("voices the final closing through the persisted dynamic-line descriptor", () => {
  const shellSource = readSource(
    "src/components/student/MissionFlowShell.tsx",
  );
  expect(shellSource).toMatch(
    /flow\.step === "closing"[\s\S]*lineKind: "coco_dynamic_line"[\s\S]*turnOrder: flow\.turnIndex \+ 1/,
  );
});
```

In `tests/domain/character-expression.test.ts`, add `"closing"` to
`allSteps` and add:

```ts
it("keeps Coco happy while delivering the final closing", () => {
  expect(deriveExpression({ step: "closing" })).toBe("happy");
});
```

In `tests/server/student-mission-page.test.ts`, add a source assertion that the
completed-status guard remains before `MissionFlowShell`, preserving safe
reload behavior:

```ts
it("keeps completed assignments out of the recorder on reload", () => {
  expect(pageSource).toContain('const RECORDABLE_STATUSES = new Set(["assigned", "started", "needs_retry"])');
  expect(pageSource.indexOf("RECORDABLE_STATUSES")).toBeLessThan(
    pageSource.indexOf("<MissionFlowShell"),
  );
});
```

- [ ] **Step 6: Run the client-focused tests and verify failure**

Run:

```bash
npx vitest run tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts tests/domain/character-expression.test.ts tests/server/student-mission-page.test.ts
```

Expected: FAIL because there is no closing flow step or component, and the expression table does not cover it.

- [ ] **Step 7: Create the isolated closing action card**

Create `src/components/student/StepConversationClosing.tsx`:

```tsx
"use client";

import { primaryButtonStyle, stepCardStyle } from "@/components/student/styles";

export type StepConversationClosingProps = {
  onFinish: () => void;
};

export function StepConversationClosing({
  onFinish,
}: StepConversationClosingProps) {
  return (
    <div style={{ ...stepCardStyle, textAlign: "center" }} aria-live="polite">
      <button
        type="button"
        style={primaryButtonStyle}
        onClick={onFinish}
      >
        Finish mission
      </button>
    </div>
  );
}
```

Do not duplicate the closing text in this card. Coco's persistent dialogue box
owns the text and replay control.

- [ ] **Step 8: Implement the closing state and one-time completion ordering**

In `src/components/student/MissionFlowShell.tsx`:

1. Import `StepConversationClosing` and add `"closing"` before `"complete"` in
   `FlowStep`.
2. Replace the final-resolution branch inside
   `continueAcceptedConversationTurn` with:

```ts
if (resolution.kind === "closing") {
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
  revokeAudioUrls();
  setFlow((prev) => ({
    ...prev,
    step: "closing",
    cocoLine: resolution.closingLine,
  }));
  return;
}
```

3. Add the local-only transition:

```ts
function finishConversationClosing() {
  setFlow((prev) => ({ ...prev, step: "complete" }));
}
```

4. Render the action card:

```tsx
{flow.step === "closing" && (
  <StepConversationClosing onFinish={finishConversationClosing} />
)}
```

5. Add this branch to `getMascotDialogue` before `complete`:

```ts
if (flow.step === "closing" && flow.cocoLine) {
  return {
    text: flow.cocoLine,
    line: {
      lineKind: "coco_dynamic_line",
      turnOrder: flow.turnIndex + 1,
    },
  };
}
```

Do not add a second call to `completeMissionAction` in
`finishConversationClosing`. Keep closing translation disabled in this task;
the existing `translationLine` remains question-only. Existing TTS failure
behavior already leaves dialogue text and buttons intact.

- [ ] **Step 9: Map the closing expression without changing completion celebration**

In `src/domain/character/expression.ts`, add before the `complete` branch:

```ts
if (input.step === "closing") return "happy";
```

Keep `complete -> celebrate` unchanged.

- [ ] **Step 10: Run the Task 2 tests to green**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts tests/domain/character-expression.test.ts tests/server/student-mission-page.test.ts
```

Expected: PASS.

- [ ] **Step 11: Run the combined focused regression matrix**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/domain/conversation/fallback-lines.test.ts src/server/student-access/audio-upload.test.ts src/domain/mission/student-question-state.test.ts tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts tests/domain/character-expression.test.ts tests/server/student-mission-page.test.ts
```

Expected: PASS with no preset, teacher-review, ownership, TTS, or resume regressions.

- [ ] **Step 12: Commit Task 2**

```bash
git add src/domain/mission/student-question-state.ts src/domain/mission/student-question-state.test.ts src/components/student/StepConversationClosing.tsx src/components/student/MissionFlowShell.tsx src/domain/character/expression.ts tests/domain/character-expression.test.ts tests/domain/tts-ui-source.test.ts tests/server/student-mission-flow.test.ts tests/server/student-mission-page.test.ts
git commit -m "feat(student): show final Coco closing"
```

---

### Task 3: Verify the release gate and record evidence

**Files:**
- Modify: `TASK.md`

**Interfaces:**
- Consumes: the two independently committed Task 1 and Task 2 deliverables.
- Produces: factual verification evidence and the exact remaining UAT action; no new runtime behavior.

- [ ] **Step 1: Run the full automated test suite**

Run:

```bash
npm test -- --run
```

Expected: all Vitest files pass; record exact file/test/skip counts in `TASK.md`.

- [ ] **Step 2: Run TypeScript verification**

Run:

```bash
npm run typecheck
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run lint verification**

Run:

```bash
npm run lint
```

Expected: exit 0. If the existing unused `label` warning in
`scripts/check-student-feedback-states.mjs` remains, record it as pre-existing;
do not edit unrelated code.

- [ ] **Step 4: Confirm the shared dev cache is idle before building**

Ask the user whether `npm run dev` is running in this checkout. Do not run the
production build against the same live `.next` directory. If it is idle, go to
Step 5. If it is active, stop and either obtain permission to stop it or move
build verification to an isolated worktree/cache.

- [ ] **Step 5: Run the production build**

Run only after Step 4 is satisfied:

```bash
npm run build
```

Expected: exit 0 with all routes compiled and no type or route errors.

- [ ] **Step 6: Update the active task with evidence and UAT status**

In `TASK.md`:

- mark implementation and automated verification checks complete only for
  commands actually run;
- record exact focused/full test, typecheck, lint, and build results;
- set status to `Implemented and verified; awaiting conversation-mode UAT`;
- leave one next step: run a five-turn conversation mission and confirm the
  final answer leads to a relevant spoken no-question closing, **Finish
  mission** reveals the existing completion screen, and reopening afterward
  cannot return to a recorder.

- [ ] **Step 7: Commit verification documentation**

```bash
git add TASK.md
git commit -m "docs: verify final Coco closing"
```

Do not archive `TASK.md` until the user confirms the real-device or localhost
conversation-mode UAT. Do not push or deploy without separate approval.

---

## Execution completion criteria

- The final required conversation answer produces a persisted closing rather
  than a discarded next question.
- The generated closing acknowledges the latest answer, says goodbye, and asks
  no question; all closing failure paths use the static no-question fallback.
- Both accepted-original and accepted-repeat final turns complete through the
  existing atomic RPC and show the closing step.
- The closing text is visible and uses the owned final-turn dynamic TTS
  descriptor; speech failure is non-blocking.
- **Finish mission** performs no network mutation and reveals the existing
  completion screen.
- Completed assignment reload cannot reopen recording or a phantom next turn.
- Preset and teacher-review flows remain unchanged.
- Focused tests, full tests, typecheck, lint, and an isolated/idle-cache build
  pass before automated verification is claimed.
