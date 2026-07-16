# Natural Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ground every dynamic Coco reply in the current attempt's ordered conversation so Coco acknowledges the latest answer and never asks for information already established.

**Architecture:** Replace the generator's last-line/last-transcript pair with a bounded structured `conversationHistory`. Reconstruct that history from the immutable mission opener and owned `attempt_turns`, pass it as untrusted user-payload data, and keep provider calls stateless. No migration or second AI request is introduced.

**Tech Stack:** TypeScript, Zod, Next.js server code, Supabase query builders, OpenAI Responses structured output, Vitest.

## Global Constraints

- The mascot artwork, stage, sizing, position, animation, and cropping are out of scope.
- Conversation history contains 1–8 ordered exchanges from the current owned attempt only.
- Use `improved_sentence` instead of `original_transcript` when a meaning-preserving correction exists.
- Keep student text in the JSON user payload; never concatenate it into system instructions.
- Keep moderation order, canned fallbacks, hard cap, TTS warming, correction/repeat flow, and preset missions unchanged.
- Do not add provider conversation state, `previous_response_id`, a second AI request, a table, or a migration.
- Follow TDD: add each regression, run it and observe the expected failure, then implement the minimum production change.
- Every implementation commit must update both the YAML header and prose Current Position in `.planning/STATE.md`; obtain the exact timestamp with `date -u +%Y-%m-%dT%H:%M:%SZ`.

---

## File Structure

- Modify `src/domain/ai/conversation-generation.ts`: own the validated exchange/history contract and generation payload.
- Create `src/domain/ai/conversation-generation.test.ts`: test history bounds, ordering, and prompt payload without provider or database mocks.
- Modify `src/server/ai/conversation-generator.ts`: align system instructions with history-grounded natural-flow rules.
- Modify `src/server/ai/conversation-generator.test.ts`: verify provider payload, statelessness, and the Minju/classroom regression contract.
- Create `src/server/student-access/conversation-history.ts`: reconstruct exchanges from snapshot/persisted turn data.
- Create `src/server/student-access/conversation-history.test.ts`: test opener anchoring, persisted-line chaining, corrections, and fail-closed history validation.
- Modify `src/server/student-access/audio-upload.ts`: load current-attempt rows, build history, and pass it into generation.
- Modify `src/server/student-access/audio-upload.test.ts`: verify query ownership, retryable database failures, and exact generated history.
- Modify `.planning/STATE.md`: keep GSD execution state truthful after every task.

---

### Task 1: Define the bounded conversation-history contract

**Files:**
- Create: `src/domain/ai/conversation-generation.test.ts`
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: existing `HARD_TURN_CAP`, `generatedCocoReplySchema`, and `buildConversationPrompt` conventions.
- Produces: `ConversationExchange`, `conversationHistorySchema`, and `GenerateCocoReplyInput.conversationHistory` for Tasks 2–4.

- [ ] **Step 1: Write failing domain tests**

Create `src/domain/ai/conversation-generation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  HARD_TURN_CAP,
  buildConversationPrompt,
  conversationTurnInputSchema,
  type GenerateCocoReplyInput,
} from "@/domain/ai/conversation-generation";

const history = [
  {
    turnOrder: 1,
    cocoLine: "Who do you talk with at school?",
    studentResponse: "I talk with Minju.",
  },
  {
    turnOrder: 2,
    cocoLine: "Where do you talk with Minju?",
    studentResponse: "In the classroom.",
  },
];

const input: GenerateCocoReplyInput = {
  scenePremise: "Friends talk together during the school day.",
  targetPattern: "I talk with ___ in ___.",
  turnOrder: 2,
  requiredTurns: 5,
  hardCap: HARD_TURN_CAP,
  windDown: false,
  conversationHistory: history,
};

describe("conversation history generation contract", () => {
  it("accepts ordered history and places the complete history in the prompt", () => {
    expect(conversationTurnInputSchema.safeParse(input).success).toBe(true);
    expect(buildConversationPrompt(input)).toMatchObject({
      conversationHistory: history,
      turnOrder: 2,
    });
  });

  it.each([
    { label: "empty", value: [] },
    {
      label: "duplicate order",
      value: [history[0], { ...history[1], turnOrder: 1 }],
    },
    {
      label: "out of order",
      value: [history[1], history[0]],
    },
    {
      label: "blank response",
      value: [{ ...history[0], studentResponse: "   " }],
    },
    {
      label: "over hard cap",
      value: Array.from({ length: HARD_TURN_CAP + 1 }, (_, index) => ({
        turnOrder: index + 1,
        cocoLine: `Question ${index + 1}?`,
        studentResponse: `Answer ${index + 1}.`,
      })),
    },
  ])("rejects $label history", ({ value }) => {
    expect(
      conversationTurnInputSchema.safeParse({
        ...input,
        turnOrder: Math.max(1, value.length),
        conversationHistory: value,
      }).success,
    ).toBe(false);
  });

  it("rejects history whose final exchange is not the requested turn", () => {
    expect(
      conversationTurnInputSchema.safeParse({ ...input, turnOrder: 3 }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts
```

Expected: FAIL because `conversationHistory` and its ordered-array validation do not exist and the old input still requires `studentTranscript`/`previousCocoLine`.

- [ ] **Step 3: Implement the history schema and prompt payload**

In `src/domain/ai/conversation-generation.ts`, replace the old last-exchange fields with:

```ts
export const conversationExchangeSchema = z.object({
  turnOrder: z.number().int().min(1).max(HARD_TURN_CAP),
  cocoLine: z.string().trim().min(1),
  studentResponse: z.string().trim().min(1),
});

export type ConversationExchange = z.infer<typeof conversationExchangeSchema>;

export const conversationHistorySchema = z
  .array(conversationExchangeSchema)
  .min(1)
  .max(HARD_TURN_CAP)
  .superRefine((history, context) => {
    history.forEach((exchange, index) => {
      if (exchange.turnOrder !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "turnOrder"],
          message: "conversation history must be contiguous and ordered",
        });
      }
    });
  });

export const conversationTurnInputSchema = z
  .object({
    scenePremise: z.string().trim().min(1),
    targetPattern: z.string().trim().min(1),
    turnOrder: z.number().int().min(1).max(HARD_TURN_CAP),
    requiredTurns: z.number().int().min(3).max(8),
    hardCap: z.literal(HARD_TURN_CAP),
    windDown: z.boolean(),
    conversationHistory: conversationHistorySchema,
  })
  .superRefine((input, context) => {
    if (input.conversationHistory.at(-1)?.turnOrder !== input.turnOrder) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conversationHistory"],
        message: "history must end at turnOrder",
      });
    }
  });
```

Update `buildConversationPrompt` to emit `conversationHistory: input.conversationHistory` and remove `lastStudentTranscript`/`lastCocoLine`. Add these exact instruction strings to its `instructions` array:

```ts
"Treat every detail in conversationHistory as already known.",
"Acknowledge the latest studentResponse, then ask exactly one question for new information whose answer is not present or directly implied anywhere in conversationHistory.",
"Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
"If the current subject has no natural unanswered detail, transition gently to a nearby part of the scene.",
```

- [ ] **Step 4: Run the domain test and verify GREEN**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update GSD state and commit**

Set `.planning/STATE.md` to Phase 11 executing with `stopped_at` and Current Position stating that the bounded history contract is complete and server adapter/orchestration tasks remain. Use the exact UTC output from `date -u +%Y-%m-%dT%H:%M:%SZ` for `last_updated`.

```bash
git add src/domain/ai/conversation-generation.ts src/domain/ai/conversation-generation.test.ts .planning/STATE.md
git commit -m "feat(11): define bounded conversation history"
```

---

### Task 2: Make provider instructions prohibit known-answer questions

**Files:**
- Modify: `src/server/ai/conversation-generator.ts`
- Modify: `src/server/ai/conversation-generator.test.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: Task 1 `GenerateCocoReplyInput.conversationHistory`.
- Produces: a stateless Responses payload whose system and user instructions agree on natural continuity.

- [ ] **Step 1: Update adapter fixtures and add the Minju regression test**

Replace `baseInput`'s `studentTranscript` and `previousCocoLine` with:

```ts
conversationHistory: [
  {
    turnOrder: 1,
    cocoLine: "What would you like to eat today?",
    studentResponse: "I would like a sandwich please.",
  },
  {
    turnOrder: 2,
    cocoLine: "Who do you eat lunch with?",
    studentResponse: "I eat with Minju.",
  },
],
```

Update the existing target-pattern regression to use one complete exchange and `turnOrder: 1`:

```ts
conversationHistory: [{
  turnOrder: 1,
  cocoLine: "How often do you play soccer?",
  studentResponse: "I don't play soccer.",
}],
```

Update the existing kid-friendly follow-up regression the same way:

```ts
conversationHistory: [{
  turnOrder: 1,
  cocoLine: "What do you do after school?",
  studentResponse: "I play games.",
}],
```

Remove every remaining test fixture property named `studentTranscript` or `previousCocoLine`; the history array is the only provider-grounding input.

Add this test to `src/server/ai/conversation-generator.test.ts`:

```ts
it("forbids asking for a fact already established in the conversation", async () => {
  const client = createFakeClient(async () => ({
    output_parsed: {
      line: "Oh, in the classroom! What do you and Minju talk about?",
    },
  }));

  await generateCocoReply(
    {
      ...baseInput,
      turnOrder: 2,
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "Who do you talk with at school?",
          studentResponse: "I talk with Minju.",
        },
        {
          turnOrder: 2,
          cocoLine: "Where do you talk with Minju?",
          studentResponse: "In the classroom.",
        },
      ],
    },
    { apiKey: "test-key", client },
  );

  const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const system = call?.input.find((message) => message.role === "system")?.content ?? "";
  const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
  const prompt = JSON.parse(user) as {
    conversationHistory?: unknown;
    instructions?: string[];
  };
  const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

  expect(prompt.conversationHistory).toHaveLength(2);
  expect(combined).toContain("already known");
  expect(combined).toContain("not present or directly implied");
  expect(combined).toContain("Who do you talk with in class?");
  expect(combined).toContain("invalid");
  expect(JSON.stringify(call)).not.toContain("previous_response_id");
});
```

- [ ] **Step 2: Run the adapter tests and verify RED**

Run:

```bash
npx vitest run src/server/ai/conversation-generator.test.ts
```

Expected: FAIL because fixtures still use the old input and the system message does not state the known-answer prohibition or Minju invalid example.

- [ ] **Step 3: Align the server system message**

In `CONVERSATION_SYSTEM_MESSAGE`, retain the existing word-limit, safety, soft-target, wind-down, and hard-cap sentences. Replace the generic 5-W follow-up guidance with:

```ts
"Treat every detail in conversationHistory as already known.",
"Acknowledge or react specifically to the latest studentResponse before asking a follow-up.",
"Ask exactly one short question for genuinely new information whose answer is not present or directly implied anywhere in conversationHistory.",
"Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
"Example: after 'Who do you talk with at school?' -> 'I talk with Minju.' -> 'Where do you talk with Minju?' -> 'In the classroom.', 'Who do you talk with in class?' is invalid because Minju is already known; ask a new detail such as 'What do you and Minju talk about?'.",
"Keep the current subject while a natural unanswered detail remains; otherwise transition gently to a nearby part of the scene.",
```

Do not add a second generation or validation call.

- [ ] **Step 4: Run adapter and domain tests**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update GSD state and commit**

Record that the provider prompt contract is complete and history reconstruction/orchestration remain.

```bash
git add src/server/ai/conversation-generator.ts src/server/ai/conversation-generator.test.ts .planning/STATE.md
git commit -m "fix(11): prohibit redundant Coco follow-ups"
```

---

### Task 3: Reconstruct exchanges from persisted attempt turns

**Files:**
- Create: `src/server/student-access/conversation-history.ts`
- Create: `src/server/student-access/conversation-history.test.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: Task 1 `ConversationExchange`.
- Produces: `buildConversationHistory(input): { ok: true; history: ConversationExchange[] } | { ok: false; error: "invalid_history" }` for Task 4.

- [ ] **Step 1: Write failing reconstruction tests**

Create `src/server/student-access/conversation-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildConversationHistory } from "@/server/student-access/conversation-history";

describe("buildConversationHistory", () => {
  it("anchors the opener and chains persisted Coco lines in order", () => {
    const result = buildConversationHistory({
      openerLine: "Who do you talk with at school?",
      currentTurnOrder: 2,
      currentStudentResponse: "In the classroom.",
      priorTurns: [
        {
          turn_order: 1,
          original_transcript: "I talk Minju.",
          improved_sentence: "I talk with Minju.",
          coco_line: "Where do you talk with Minju?",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      history: [
        {
          turnOrder: 1,
          cocoLine: "Who do you talk with at school?",
          studentResponse: "I talk with Minju.",
        },
        {
          turnOrder: 2,
          cocoLine: "Where do you talk with Minju?",
          studentResponse: "In the classroom.",
        },
      ],
    });
  });

  it("builds turn one with no persisted rows", () => {
    expect(
      buildConversationHistory({
        openerLine: "How often do you play soccer?",
        currentTurnOrder: 1,
        currentStudentResponse: "I don't play soccer.",
        priorTurns: [],
      }),
    ).toMatchObject({ ok: true, history: [{ turnOrder: 1 }] });
  });

  it.each([
    {
      label: "missing row",
      input: { currentTurnOrder: 2, priorTurns: [] },
    },
    {
      label: "wrong row order",
      input: {
        currentTurnOrder: 2,
        priorTurns: [{ turn_order: 2, original_transcript: "Minju.", improved_sentence: null, coco_line: "Where?" }],
      },
    },
    {
      label: "missing linking Coco line",
      input: {
        currentTurnOrder: 2,
        priorTurns: [{ turn_order: 1, original_transcript: "Minju.", improved_sentence: null, coco_line: null }],
      },
    },
    {
      label: "blank prior response",
      input: {
        currentTurnOrder: 2,
        priorTurns: [{ turn_order: 1, original_transcript: null, improved_sentence: null, coco_line: "Where?" }],
      },
    },
  ])("fails closed for $label", ({ input }) => {
    expect(
      buildConversationHistory({
        openerLine: "Who do you talk with?",
        currentStudentResponse: "In class.",
        ...input,
      }),
    ).toEqual({ ok: false, error: "invalid_history" });
  });
});
```

- [ ] **Step 2: Run the reconstruction test and verify RED**

Run:

```bash
npx vitest run src/server/student-access/conversation-history.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure reconstruction helper**

Create `src/server/student-access/conversation-history.ts` with these exported types and behavior:

```ts
import {
  conversationHistorySchema,
  type ConversationExchange,
} from "@/domain/ai/conversation-generation";

export type PersistedConversationTurn = {
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  coco_line: string | null;
};

export type BuildConversationHistoryResult =
  | { ok: true; history: ConversationExchange[] }
  | { ok: false; error: "invalid_history" };

export function buildConversationHistory(input: {
  openerLine: string;
  currentTurnOrder: number;
  currentStudentResponse: string;
  priorTurns: PersistedConversationTurn[];
}): BuildConversationHistoryResult {
  if (
    !input.openerLine.trim() ||
    !input.currentStudentResponse.trim() ||
    input.priorTurns.length !== input.currentTurnOrder - 1
  ) {
    return { ok: false, error: "invalid_history" };
  }

  const history: ConversationExchange[] = [];
  let question = input.openerLine;

  for (let index = 0; index < input.priorTurns.length; index += 1) {
    const row = input.priorTurns[index];
    if (!row || row.turn_order !== index + 1) {
      return { ok: false, error: "invalid_history" };
    }
    const response = row.improved_sentence?.trim() || row.original_transcript?.trim();
    if (!response || !row.coco_line?.trim()) {
      return { ok: false, error: "invalid_history" };
    }
    history.push({ turnOrder: row.turn_order, cocoLine: question, studentResponse: response });
    question = row.coco_line;
  }

  history.push({
    turnOrder: input.currentTurnOrder,
    cocoLine: question,
    studentResponse: input.currentStudentResponse,
  });

  const parsed = conversationHistorySchema.safeParse(history);
  return parsed.success
    ? { ok: true, history: parsed.data }
    : { ok: false, error: "invalid_history" };
}
```

- [ ] **Step 4: Run the reconstruction and domain tests**

Run:

```bash
npx vitest run src/domain/ai/conversation-generation.test.ts src/server/student-access/conversation-history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update GSD state and commit**

Record that deterministic history reconstruction is complete and audio-upload integration remains.

```bash
git add src/server/student-access/conversation-history.ts src/server/student-access/conversation-history.test.ts .planning/STATE.md
git commit -m "feat(11): reconstruct owned conversation history"
```

---

### Task 4: Load owned history and ground live generation

**Files:**
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: Task 3 `buildConversationHistory` and Task 1 `GenerateCocoReplyInput.conversationHistory`.
- Produces: live conversation generation grounded in current-attempt rows only.

- [ ] **Step 1: Extend the Supabase mock and write failing orchestration regressions**

Add `previousTurns` and `historyLookupError` options to `createMockSupabase`, plus chainable `lt` and `order` methods. The `attempt_turns` history `order()` terminal must return only `options.previousTurns`:

```ts
previousTurns?: Array<{
  turn_order: number;
  original_transcript: string | null;
  improved_sentence: string | null;
  coco_line: string | null;
}>;
historyLookupError?: { message: string } | null;
```

Add these exact methods to the query mock so the test records the ownership/range filters and terminates the ordered history read:

```ts
lt: vi.fn((column: string, value: unknown) => {
  operation.filters.push([`${column}<`, value]);
  return query;
}),
order: vi.fn(async () => {
  if (!operations.includes(operation)) operations.push(operation);
  if (table === "attempt_turns" && operation.action === "select") {
    return {
      data: options.previousTurns ?? [],
      error: options.historyLookupError ?? null,
    };
  }
  return { data: [], error: null };
}),
```

Delete the old `maybeSingle()` branch that returns `options.previousCocoLine`; keep `maybeSingle()` for assignment and attempt ownership reads.

Add a Minju regression test:

```ts
it("passes the complete current-attempt history into generation", async () => {
  mockSupabase = createMockSupabase({
    missionSnapshot: {
      ...conversationMissionSnapshotFixture,
      turns: [{
        ...conversationMissionSnapshotFixture.turns[0],
        prompt: "Who do you talk with at school?",
      }],
    },
    previousTurns: [{
      turn_order: 1,
      original_transcript: "I talk Minju.",
      improved_sentence: "I talk with Minju.",
      coco_line: "Where do you talk with Minju?",
    }],
  });
  const generate = fakeGenerateCocoReply(async () => ({
    ok: true,
    reply: { line: "Oh, in the classroom! What do you talk about?" },
  }));

  const result = await uploadAttemptAudioClip(audioInput({ turnOrder: 2 }), {
    transcribeAudioFile: successfulTranscriber("In the classroom."),
    evaluateOriginalTurn: successfulOriginalEvaluator(),
    generateCocoReply: generate,
    isContentSafe: fakeIsContentSafe(async () => ({ safe: true, failedOpen: false })),
  });

  expect(result.ok).toBe(true);
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({
    conversationHistory: [
      { turnOrder: 1, cocoLine: "Who do you talk with at school?", studentResponse: "I talk with Minju." },
      { turnOrder: 2, cocoLine: "Where do you talk with Minju?", studentResponse: "In the classroom." },
    ],
  }));
  const historyRead = mockSupabase.operations.find((operation) =>
    operation.table === "attempt_turns" &&
    operation.action === "select" &&
    operation.filters.some(([column, value]) => column === "attempt_id" && value === "attempt-1"),
  );
  expect(historyRead?.filters).toContainEqual(["turn_order<", 2]);
});
```

Add a lookup-failure test expecting `{ ok: false, error: "db_error", retryable: true }`, no upload, and no generator call. Update the existing dynamic-turn test to expect `conversationHistory` instead of `previousCocoLine`. Keep the preset test asserting no generator/moderator calls.

- [ ] **Step 2: Run the orchestration test and verify RED**

Run:

```bash
npx vitest run src/server/student-access/audio-upload.test.ts
```

Expected: FAIL because audio upload still performs a single `maybeSingle()` previous-line lookup and passes the old pair into generation.

- [ ] **Step 3: Load prior turns and fail closed before processing audio**

Import `buildConversationHistory` and `PersistedConversationTurn`. For conversation-mode original answers, replace the previous-line query with:

```ts
let priorConversationTurns: PersistedConversationTurn[] = [];
let previousCocoLine: string | null = null;

if (
  snapshot.conversationMode === true &&
  input.clipKind === "original_answer" &&
  input.turnOrder > 1
) {
  const { data, error } = await timeStage("conversationHistoryLookup", () =>
    supabase
      .from("attempt_turns")
      .select("turn_order, original_transcript, improved_sentence, coco_line")
      .eq("attempt_id", input.attemptId)
      .lt("turn_order", input.turnOrder)
      .order("turn_order", { ascending: true }),
  );
  if (error) {
    logTiming("failed", { error: "db_error", step: "conversation_history" });
    return { ok: false, error: "db_error", retryable: true };
  }
  priorConversationTurns = data ?? [];
  previousCocoLine = priorConversationTurns.at(-1)?.coco_line ?? null;
}
```

Retain the existing pre-upload fail-closed check for dynamic turns, and additionally require `priorConversationTurns.length === input.turnOrder - 1`.

- [ ] **Step 4: Build the evaluated history and pass it into generation**

After the original evaluation write succeeds and before `runConversationTurn`, resolve the current response and build history:

```ts
const currentStudentResponse =
  originalEvaluation?.improvedSentence?.trim() || transcript;
const historyResult = buildConversationHistory({
  openerLine: snapshot.turns[0]?.prompt ?? "",
  currentTurnOrder: input.turnOrder,
  currentStudentResponse,
  priorTurns: priorConversationTurns,
});
if (!historyResult.ok) {
  logTiming("failed", { error: "invalid_audio", step: "conversation_history" });
  return { ok: false, error: "invalid_audio", retryable: false };
}
```

Change `ConversationTurnContext` to retain raw `studentTranscript` for pre-generation moderation and add `conversationHistory: ConversationExchange[]`. Build the provider input with `conversationHistory` and remove `previousCocoLine` from the generation input. Pass `historyResult.history` from the upload call site.

- [ ] **Step 5: Run focused server tests and verify GREEN**

Run:

```bash
npx vitest run \
  src/domain/ai/conversation-generation.test.ts \
  src/server/ai/conversation-generator.test.ts \
  src/server/student-access/conversation-history.test.ts \
  src/server/student-access/audio-upload.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update GSD state and commit**

Record that natural conversation history is code-complete and awaiting full verification plus live UAT.

```bash
git add src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts .planning/STATE.md
git commit -m "fix(11): ground Coco replies in attempt history"
```

---

### Task 5: Verify natural conversation history without claiming live UAT

**Files:**
- Modify: `.planning/STATE.md`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: automated verification evidence and an explicit live-UAT handoff.

- [ ] **Step 1: Run the focused regression matrix**

```bash
npx vitest run \
  src/domain/ai/conversation-generation.test.ts \
  src/server/ai/conversation-generator.test.ts \
  src/server/student-access/conversation-history.test.ts \
  src/server/student-access/audio-upload.test.ts \
  src/server/student-access/mission-flow.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run type, lint, and full-suite checks**

```bash
npm run typecheck
npm run lint
npx vitest run
```

Expected: all commands exit 0. The known pre-existing warning in `scripts/check-student-feedback-states.mjs` may remain; no new warnings are acceptable.

- [ ] **Step 3: Run the production build**

Run only after stopping any development server using this same worktree, because `next build` rewrites `.next`:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 4: Record verification and commit**

Update both STATE header/prose with the exact test counts and command results. Keep live Minju/classroom UAT explicitly pending unless it was actually run against this worktree.

```bash
git add .planning/STATE.md
git commit -m "docs(11): record conversation-history verification"
```

- [ ] **Step 5: Live UAT handoff**

After the correct worktree server is running, speak this sequence:

1. Coco: `Who do you talk with at school?`
2. Student: `I talk with Minju.`
3. Coco: `Where do you talk with Minju?`
4. Student: `In the classroom.`

Pass condition: Coco acknowledges the classroom and asks new information. `Who do you talk with in class?` is a failure because Minju is already established.
