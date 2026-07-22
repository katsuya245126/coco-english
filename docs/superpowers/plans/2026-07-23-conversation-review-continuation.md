# Conversation Review Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let dynamic conversation missions continue safely through internally reviewed turns, add a default-on complete-sentence mission policy, and present reviewed completions normally to students while preserving teacher evidence.

**Architecture:** Store the answer policy on the teacher-owned mission and copy it into immutable assignment snapshots. Keep reviewed attempts `in_progress` until the existing atomic completion boundary, where the database chooses `completed` or `teacher_review`; the student client treats reviewed conversation turns as normal automatic continuations, while teacher surfaces retain the internal status and evidence.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Supabase Postgres/RPC/Storage, Vitest, OpenAI structured-output adapters.

## Global Constraints

- Apply the complete-sentence setting only to dynamic conversation missions; preset behavior remains unchanged.
- Default `requireCompleteSentenceAnswers` and `require_complete_sentence_answers` to `true`, including legacy snapshot parsing.
- Keep mission snapshots immutable after assignment.
- Never turn genuine ambiguity, provider failure, schema failure, or unsafe uncertainty into invented student speech.
- Every service-role read or write involving students, assignments, attempts, turns, hints, TTS, or audio independently proves ownership.
- Keep reviewed assignments `started` and reviewed attempts `in_progress` until atomic mission completion.
- Preserve transcript-first teacher evidence and signed on-demand audio URLs.
- Do not return a dynamic Coco line to the client unless that exact line was persisted successfully.
- Do not expose internal teacher-review wording or status on student surfaces.
- Do not apply either migration to any Supabase environment without separate approval naming the environment and action.
- Do not push, deploy, publish, merge, or mutate an external environment without separate approval.
- Preserve the unrelated untracked files listed in `TASK.md`.

---

### Task 1: Persist and snapshot the complete-sentence mission policy

**Files:**
- Create: `supabase/migrations/202607230001_conversation_answer_policy.sql`
- Create: `tests/schema/conversation-answer-policy-schema.test.ts`
- Modify: `src/domain/mission/schemas.ts`
- Modify: `src/domain/mission/schemas.test.ts`
- Modify: `tests/domain/mission-schemas.test.ts`
- Modify: `src/app/teacher/missions/actions.ts`
- Modify: `src/components/teacher/MissionForm.tsx`
- Modify: `tests/server/teacher-mission-create-source.test.ts`
- Modify: `src/server/mission/mission-service.ts`
- Modify: `tests/server/mission-service.test.ts`
- Modify: `src/server/mission/assign-service.ts`
- Modify: `tests/server/mission-assign.test.ts`
- Modify: `src/lib/db/types.ts`

**Interfaces:**
- Consumes: existing `missionFormSchema`, `missionSnapshotSchema`, `TeacherMission`, `buildMissionSnapshot`, and teacher mission create/update actions.
- Produces: `requireCompleteSentenceAnswers: boolean` in `MissionFormInput`, `MissionSnapshot`, and `TeacherMission`; `missions.require_complete_sentence_answers boolean not null default true` in Postgres.

- [ ] **Step 1: Write failing schema, service, snapshot, and form-source tests**

Add this migration contract test:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/202607230001_conversation_answer_policy.sql",
  ),
  "utf8",
).toLowerCase();

describe("conversation answer policy schema", () => {
  it("adds a default-on mission-owned complete-sentence policy", () => {
    expect(sql).toContain("alter table public.missions");
    expect(sql).toContain(
      "require_complete_sentence_answers boolean not null default true",
    );
  });
});
```

Add schema assertions to `src/domain/mission/schemas.test.ts`:

```ts
it("defaults the dynamic complete-sentence policy on for forms and snapshots", () => {
  const form = missionFormSchema.parse({
    ...baseFormFields,
    requiredTurns: 3,
    conversationMode: true,
    turns: makeTurns(1),
  });
  const snapshot = missionSnapshotSchema.parse({
    ...baseSnapshotFields,
    requiredTurns: 3,
    conversationMode: true,
    turns: makeSnapshotTurns(1),
  });

  expect(form.requireCompleteSentenceAnswers).toBe(true);
  expect(snapshot.requireCompleteSentenceAnswers).toBe(true);
});

it("preserves an explicitly disabled dynamic complete-sentence policy", () => {
  const form = missionFormSchema.parse({
    ...baseFormFields,
    requiredTurns: 3,
    conversationMode: true,
    requireCompleteSentenceAnswers: false,
    turns: makeTurns(1),
  });

  expect(form.requireCompleteSentenceAnswers).toBe(false);
});
```

Extend the mission fixture in `tests/server/mission-assign.test.ts`:

```ts
const missionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Food likes",
  target_pattern: "I like ___.",
  topic: "Food",
  level: "elementary",
  required_turns: 1,
  character_id: "default-buddy",
  scene_premise: null,
  conversation_mode: false,
  require_complete_sentence_answers: false,
};
```

Add these assertions to the snapshot test:

```ts
expect(snapshot.requireCompleteSentenceAnswers).toBe(false);

const storedSnapshot = JSON.parse(JSON.stringify(snapshotAtAssign));
const editedMission = {
  ...missionRow,
  title: "Edited Food Opinions",
  topic: "Cooking",
  require_complete_sentence_answers: true,
};
expect(storedSnapshot.requireCompleteSentenceAnswers).toBe(false);
expect(freshSnapshot.requireCompleteSentenceAnswers).toBe(true);
```

Add this source contract to `tests/server/teacher-mission-create-source.test.ts`:

```ts
it("shows a default-on complete-sentence toggle only with dynamic conversation mode", () => {
  const form = readSource("src/components/teacher/MissionForm.tsx");
  const actions = readSource("src/app/teacher/missions/actions.ts");

  expect(form).toContain("Require complete-sentence answers");
  expect(form).toContain("requireCompleteSentenceAnswers");
  expect(form).toMatch(
    /\{conversationMode \? \([\s\S]*Require complete-sentence answers[\s\S]*\) : null\}/,
  );
  expect(actions).toContain('formData.get("requireCompleteSentenceAnswers")');
});
```

In `tests/server/mission-service.test.ts`, add the property to `completeInput` and assert the mission insert:

```ts
requireCompleteSentenceAnswers: true,
```

```ts
expect(calls.find((call) => call.table === "missions")?.payload).toMatchObject({
  require_complete_sentence_answers: true,
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run src/domain/mission/schemas.test.ts tests/domain/mission-schemas.test.ts tests/server/teacher-mission-create-source.test.ts tests/server/mission-service.test.ts tests/server/mission-assign.test.ts tests/schema/conversation-answer-policy-schema.test.ts
```

Expected: FAIL because the migration and policy fields do not exist.

- [ ] **Step 3: Add the database column and Zod defaults**

Create `supabase/migrations/202607230001_conversation_answer_policy.sql`:

```sql
alter table public.missions
  add column if not exists
    require_complete_sentence_answers boolean not null default true;
```

Add this field to both `missionFormSchema` and `missionSnapshotSchema`:

```ts
requireCompleteSentenceAnswers: z.boolean().default(true),
```

Add the corresponding database fields in `src/lib/db/types.ts`:

```ts
require_complete_sentence_answers: boolean;
```

```ts
require_complete_sentence_answers?: boolean;
```

- [ ] **Step 4: Wire teacher form parsing and UI**

Add this parser in `src/app/teacher/missions/actions.ts`:

```ts
function parseBooleanSetting(
  value: FormDataEntryValue | null,
  defaultValue: boolean,
): boolean {
  if (value === null) return defaultValue;
  return value === "true" || value === "on" || value === "1";
}
```

Add this field to `missionPayloadFromFormData`:

```ts
requireCompleteSentenceAnswers: parseBooleanSetting(
  formData.get("requireCompleteSentenceAnswers"),
  true,
),
```

In `MissionForm`, initialize state from the loaded mission:

```ts
const [requireCompleteSentenceAnswers, setRequireCompleteSentenceAnswers] =
  useState(mission?.requireCompleteSentenceAnswers ?? true);
```

Set the form value immediately before calling the create/update action:

```ts
formData.set(
  "requireCompleteSentenceAnswers",
  requireCompleteSentenceAnswers ? "true" : "false",
);
```

Inside the existing `{conversationMode ? (...) : null}` settings block, render:

```tsx
<div style={{ marginTop: 24 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <input
      id="require-complete-sentence-answers"
      type="checkbox"
      checked={requireCompleteSentenceAnswers}
      onChange={(event) =>
        setRequireCompleteSentenceAnswers(event.target.checked)
      }
      aria-describedby="require-complete-sentence-answers-help"
      style={toggleInputStyle}
    />
    <label htmlFor="require-complete-sentence-answers" style={labelStyle}>
      Require complete-sentence answers
    </label>
  </div>
  <p id="require-complete-sentence-answers-help" style={helpTextStyle}>
    When an answer is understandable but incomplete, Coco helps the student
    say one complete sentence before continuing.
  </p>
</div>
```

- [ ] **Step 5: Persist and snapshot the policy**

Add `requireCompleteSentenceAnswers: boolean` to `TeacherMission`, add
`require_complete_sentence_answers: boolean` to both mission-row types, and map it:

```ts
requireCompleteSentenceAnswers: row.require_complete_sentence_answers,
```

Add it to `toMissionInsert`:

```ts
require_complete_sentence_answers: input.requireCompleteSentenceAnswers,
```

Add `require_complete_sentence_answers` to every mission projection in
`src/server/mission/mission-service.ts` and the assignment projection in
`src/server/mission/assign-service.ts`.

Add it to `buildMissionSnapshot`:

```ts
requireCompleteSentenceAnswers:
  input.mission.require_complete_sentence_answers,
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the command from Step 2.

Expected: all listed test files pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add supabase/migrations/202607230001_conversation_answer_policy.sql tests/schema/conversation-answer-policy-schema.test.ts src/domain/mission/schemas.ts src/domain/mission/schemas.test.ts tests/domain/mission-schemas.test.ts src/app/teacher/missions/actions.ts src/components/teacher/MissionForm.tsx tests/server/teacher-mission-create-source.test.ts src/server/mission/mission-service.ts tests/server/mission-service.test.ts src/server/mission/assign-service.ts tests/server/mission-assign.test.ts src/lib/db/types.ts
git commit -m "feat(missions): configure complete-sentence answers"
```

---

### Task 2: Apply the answer policy and contextual review continuation to AI prompts

**Files:**
- Modify: `src/server/ai/turn-evaluator.ts`
- Modify: `tests/server/turn-evaluator.test.ts`
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `src/domain/ai/conversation-generation.test.ts`
- Modify: `src/server/ai/conversation-generator.test.ts`
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Consumes: Task 1's `MissionSnapshot.requireCompleteSentenceAnswers`.
- Produces: optional `EvaluateOriginalTurnInput.requireCompleteSentenceAnswers`; `GenerateCocoReplyInput.responseHandling: "normal" | "review_pending"`; prompt rules for meaningful fragments and reviewed-response fallback priority.

- [ ] **Step 1: Write failing evaluator-policy tests**

Add these tests to `tests/server/turn-evaluator.test.ts`:

```ts
it("requires a meaning-preserving complete sentence for an understandable fragment when enabled", async () => {
  const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
  const client = createFakeClient({
    output_parsed: {
      ...correctOriginalProviderResult,
      outcome: "needs_correction",
      targetPatternAttempted: false,
      correctionNeeded: true,
      improvedSentence: "I like to play soccer at school.",
    },
  });

  const result = await evaluateOriginalTurn(
    {
      evaluationMode: "conversation",
      missionQuestion: "Where do you like to play soccer?",
      transcript: "School.",
      targetPattern: "I like to play soccer at _____.",
      targetExample: null,
      level: "elementary",
      requireCompleteSentenceAnswers: true,
    },
    { apiKey: "test-key", client },
  );

  expect(result).toMatchObject({
    ok: true,
    evaluation: {
      outcome: "needs_correction",
      improvedSentence: "I like to play soccer at school.",
    },
  });
  const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const userMessage = request?.input.find((message) => message.role === "user");
  const prompt = JSON.parse(userMessage?.content ?? "{}") as {
    requireCompleteSentenceAnswers?: boolean;
    instructions?: string[];
  };
  expect(prompt.requireCompleteSentenceAnswers).toBe(true);
  expect(prompt.instructions?.join(" ")).toContain(
    "Where do you like to play soccer?",
  );
  expect(prompt.instructions?.join(" ")).toContain("School.");
  expect(prompt.instructions?.join(" ")).toContain(
    "I like to play soccer at school.",
  );
});

it("allows a relevant fragment when complete sentences are disabled", async () => {
  const { evaluateOriginalTurn } = await import("@/server/ai/turn-evaluator");
  const client = createFakeClient({
    output_parsed: correctOriginalProviderResult,
  });

  await evaluateOriginalTurn(
    {
      evaluationMode: "conversation",
      missionQuestion: "Where do you like to play soccer?",
      transcript: "School.",
      targetPattern: "I like to play soccer at _____.",
      targetExample: null,
      level: "elementary",
      requireCompleteSentenceAnswers: false,
    },
    { apiKey: "test-key", client },
  );

  const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const userMessage = request?.input.find((message) => message.role === "user");
  const prompt = JSON.parse(userMessage?.content ?? "{}") as {
    requireCompleteSentenceAnswers?: boolean;
    instructions?: string[];
  };
  expect(prompt.requireCompleteSentenceAnswers).toBe(false);
  expect(prompt.instructions?.join(" ")).toContain(
    "accept a relevant understandable fragment",
  );
});
```

- [ ] **Step 2: Write failing reviewed-response generation tests**

Add `responseHandling: "normal"` to the shared input fixture in
`src/domain/ai/conversation-generation.test.ts`, then add:

```ts
it("grounds an internally reviewed response without inventing its meaning", () => {
  const prompt = buildConversationPrompt({
    ...input,
    responseHandling: "review_pending",
    conversationHistory: [
      {
        turnOrder: 1,
        cocoLine: "Who do you play soccer with?",
        studentResponse: "I play with my friend.",
      },
      {
        turnOrder: 2,
        cocoLine: "Where do you play soccer?",
        studentResponse: "Something unclear.",
      },
    ],
  });
  const instructions = prompt.instructions.join(" ");

  expect(prompt.responseHandling).toBe("review_pending");
  expect(instructions).toContain("Use the latest studentResponse only when");
  expect(instructions).toContain("most recent earlier studentResponse");
  expect(instructions).toContain("scenePremise");
  expect(instructions).toContain("do not invent");
});
```

In `src/server/student-access/audio-upload.test.ts`, add a test using the
existing injected evaluator/generator helpers:

```ts
it("passes the snapshotted answer policy and review disposition to owned AI adapters", async () => {
  mockSupabase = createMockSupabase({
    missionSnapshot: {
      ...conversationMissionSnapshotFixture,
      requireCompleteSentenceAnswers: false,
    },
  });
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const evaluate = successfulOriginalEvaluator({
    outcome: "teacher_review",
    meaningUnderstood: false,
    targetPatternAttempted: false,
    confidence: "medium",
    reviewReason: "ambiguous",
  });
  const generate = fakeGenerateCocoReply(async () => ({
    ok: true,
    reply: { line: "Soccer is fun! Who do you usually play with?" },
  }));

  await uploadAttemptAudioClip(audioInput(), {
    transcribeAudioFile: successfulTranscriber("School."),
    evaluateOriginalTurn: evaluate,
    generateCocoReply: generate,
    isContentSafe: fakeIsContentSafe(async () => ({
      safe: true,
      failedOpen: false,
    })),
  });

  expect(evaluate).toHaveBeenCalledWith(
    expect.objectContaining({ requireCompleteSentenceAnswers: false }),
  );
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({ responseHandling: "review_pending" }),
  );
});
```

- [ ] **Step 3: Run the focused AI tests and verify RED**

Run:

```bash
npx vitest run tests/server/turn-evaluator.test.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: FAIL because the answer-policy and response-handling inputs are not wired.

- [ ] **Step 4: Implement complete-sentence evaluator instructions**

Add this optional field to `EvaluateOriginalTurnInput`:

```ts
requireCompleteSentenceAnswers?: boolean;
```

In `buildOriginalPrompt`, derive:

```ts
const requireCompleteSentenceAnswers =
  input.evaluationMode === "conversation" &&
  input.requireCompleteSentenceAnswers !== false;
```

Return `requireCompleteSentenceAnswers` in the prompt payload. Replace the
unconditional conversation fragment rule with these conditional instructions:

```ts
const completeSentenceInstructions = requireCompleteSentenceAnswers
  ? [
      "When a relevant fragment has an understandable meaning, use needs_correction and write one short complete declarative improvedSentence in the student's own words.",
      "Example: missionQuestion 'Where do you like to play soccer?' plus transcript 'School.' becomes improvedSentence 'I like to play soccer at school.'; do not route that understandable fragment to teacher_review.",
    ]
  : [
      "When complete sentences are not required, accept a relevant understandable fragment even when it is not a complete sentence.",
    ];
```

Spread `completeSentenceInstructions` into conversation instructions before the
genuine-ambiguity rule. Keep the existing rule that forbids inventing meaning.

Pass the snapshot value in `audio-upload.ts`:

```ts
requireCompleteSentenceAnswers:
  snapshot.requireCompleteSentenceAnswers,
```

- [ ] **Step 5: Implement reviewed-response grounding**

Add this schema and field in `conversation-generation.ts`:

```ts
export const conversationResponseHandlingSchema = z.enum([
  "normal",
  "review_pending",
]);
```

```ts
responseHandling: conversationResponseHandlingSchema,
```

Return it from `buildConversationPrompt`, and conditionally add:

```ts
const reviewPendingInstructions =
  input.responseHandling === "review_pending"
    ? [
        "The latest studentResponse is internally uncertain. Use the latest studentResponse only when its meaning is clear from Coco's active question; do not invent or state guessed details as facts.",
        "If the latest response is unclear, continue from the most recent earlier studentResponse with understandable meaning.",
        "If no studentResponse is usable, ask one short neutral question grounded in scenePremise.",
      ]
    : [];
```

Spread those lines into the prompt instructions before the normal follow-up
rules. Add this field to `ConversationTurnContext`:

```ts
responseHandling: "normal" | "review_pending";
```

Pass it into `GenerateCocoReplyInput`, and construct it after evaluation:

```ts
responseHandling:
  originalEvaluation?.outcome === "teacher_review"
    ? "review_pending"
    : "normal",
```

Update every direct `GenerateCocoReplyInput` fixture to include
`responseHandling: "normal"`.

- [ ] **Step 6: Run focused AI tests and verify GREEN**

Run the command from Step 3.

Expected: all listed test files pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/server/ai/turn-evaluator.ts tests/server/turn-evaluator.test.ts src/domain/ai/conversation-generation.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts
git commit -m "feat(conversation): apply answer and review context"
```

---

### Task 3: Defer teacher-review terminal state and complete atomically

**Files:**
- Create: `supabase/migrations/202607230002_deferred_teacher_review_completion.sql`
- Modify: `tests/schema/complete-attempt-rpc-schema.test.ts`
- Modify: `src/server/student-access/mission-flow.ts`
- Modify: `src/server/student-access/mission-flow.test.ts`
- Modify: `tests/server/student-mission-flow.test.ts`
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`
- Modify: `src/domain/flow/completion.ts`
- Modify: `tests/server/mission-flow.test.ts`

**Interfaces:**
- Consumes: existing owned assignment/attempt loaders and `complete_student_attempt` RPC call.
- Produces: `flagAttemptForTeacherReview(input): Promise<RouteTeacherReviewResult>` that only sets `attempts.needs_review_reason`; atomic completion that terminalizes to `teacher_review` when flagged; reviewed turns count as finished for resume and completion.

- [ ] **Step 1: Write failing owned-review and resume tests**

Extend the mock in `src/server/student-access/mission-flow.test.ts` so
`Operation["action"]` includes `"update"` and the query builder records update
payloads. Add:

```ts
describe("flagAttemptForTeacherReview", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase = createMockSupabase();
  });

  it("records an owned review reason without terminalizing assignment or attempt", async () => {
    const { flagAttemptForTeacherReview } = await import(
      "@/server/student-access/mission-flow"
    );

    const result = await flagAttemptForTeacherReview({
      studentId: "student-1",
      assignmentStudentId: "as-1",
      attemptId: "attempt-1",
      reviewReason: "ambiguous",
    });

    expect(result).toEqual({ ok: true });
    expect(
      mockSupabase.operations.find(
        (operation) =>
          operation.table === "attempts" && operation.action === "update",
      )?.payload,
    ).toEqual({ needs_review_reason: "ambiguous" });
    expect(
      mockSupabase.operations.some(
        (operation) => operation.table === "assignment_students" && operation.action === "update",
      ),
    ).toBe(false);
    expect(JSON.stringify(mockSupabase.operations)).not.toContain(
      '"status":"teacher_review"',
    );
  });

  it("rejects a non-owned or non-active attempt", async () => {
    mockSupabase = createMockSupabase({ attemptFound: false });
    const { flagAttemptForTeacherReview } = await import(
      "@/server/student-access/mission-flow"
    );
    await expect(
      flagAttemptForTeacherReview({
        studentId: "student-1",
        assignmentStudentId: "as-1",
        attemptId: "wrong-attempt",
        reviewReason: "low_confidence",
      }),
    ).resolves.toEqual({ ok: false, error: "not_found" });
  });
});
```

Add this completion-helper test in `tests/server/mission-flow.test.ts`:

```ts
it("treats a persisted teacher-review turn as finished for resume", () => {
  const reviewedTurn = makeTurn(1, {
    original_transcript: "School.",
    repeat_transcript: null,
    repeat_accepted: null,
    evaluation: {
      version: "ai-eval-v1",
      outcome: "teacher_review",
      requireRepeat: false,
    },
  });

  expect(nextUnfinishedTurnOrder(2, [reviewedTurn])).toBe(2);
});
```

- [ ] **Step 2: Write failing completion-RPC migration tests**

Point `tests/schema/complete-attempt-rpc-schema.test.ts` at
`202607230002_deferred_teacher_review_completion.sql` and add:

```ts
it("counts reviewed turns and selects the final status from the owned attempt flag", () => {
  expect(sql).toContain("needs_review_reason");
  expect(sql).toContain("teacher_review");
  expect(sql).toContain("v_terminal_status");
  expect(sql).toContain("outcome' = 'teacher_review'");
  expect(sql).toContain("v_assignment_status = 'teacher_review'");
  expect(sql).toContain("v_attempt_status = 'teacher_review'");
});

it("writes one matching terminal status event and remains idempotent", () => {
  expect(sql).toContain("v_terminal_status");
  expect(sql).toContain("v_reason_code");
  expect(sql).toContain("mission_completed");
  expect(sql).toContain("return 'ok'");
});
```

- [ ] **Step 3: Write a failing Coco-line persistence test**

Change the existing `cocoLineUpsertError` case in
`src/server/student-access/audio-upload.test.ts` to require a retryable failure:

```ts
it("does not return an ephemeral Coco line when persistence fails", async () => {
  mockSupabase = createMockSupabase({
    cocoLineUpsertError: { message: "write failed" },
  });
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );

  const result = await uploadAttemptAudioClip(audioInput(), {
    transcribeAudioFile: successfulTranscriber("I like juice."),
    evaluateOriginalTurn: successfulOriginalEvaluator(),
    generateCocoReply: fakeGenerateCocoReply(async () => ({
      ok: true,
      reply: { line: "Juice is tasty! What juice do you like?" },
    })),
    isContentSafe: fakeIsContentSafe(async () => ({
      safe: true,
      failedOpen: false,
    })),
  });

  expect(result).toEqual({ ok: false, error: "db_error", retryable: true });
  expect(
    mockSupabase.operations.some(
      (operation) =>
        operation.table === "audio_clips" &&
        operation.action === "update" &&
        JSON.stringify(operation.payload).includes('"processing_status":"failed"'),
    ),
  ).toBe(true);
});
```

- [ ] **Step 4: Run lifecycle tests and verify RED**

Run:

```bash
npx vitest run src/server/student-access/mission-flow.test.ts tests/server/student-mission-flow.test.ts tests/server/mission-flow.test.ts tests/schema/complete-attempt-rpc-schema.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: FAIL because review routing still terminalizes immediately, reviewed
turns are unfinished, the replacement migration is absent, and Coco-line write
failure is non-blocking.

- [ ] **Step 5: Replace immediate review routing with an owned attempt flag**

Rename `routeAssignmentStudentToTeacherReview` to
`flagAttemptForTeacherReview`. Keep `TeacherReviewReason` and the existing
result union. Implement the function as:

```ts
export async function flagAttemptForTeacherReview(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
  reviewReason: TeacherReviewReason;
}): Promise<RouteTeacherReviewResult> {
  try {
    const supabase = createSupabaseServiceClient();
    const asRow = await loadOwnedAssignmentStudent(
      supabase,
      input.assignmentStudentId,
      input.studentId,
    );
    if (!asRow || asRow.status !== "started") {
      return { ok: false, error: "not_found" };
    }

    const attempt = await loadOwnedAttempt(
      supabase,
      input.assignmentStudentId,
      input.attemptId,
    );
    if (!attempt.ok) return attempt;
    if (attempt.attempt.status !== "in_progress") {
      return { ok: false, error: "not_found" };
    }

    const { error } = await supabase
      .from("attempts")
      .update({ needs_review_reason: input.reviewReason })
      .eq("id", input.attemptId)
      .eq("assignment_student_id", input.assignmentStudentId)
      .eq("status", "in_progress");

    return error ? { ok: false, error: "db_error" } : { ok: true };
  } catch {
    return { ok: false, error: "db_error" };
  }
}
```

Update both original and repeat call sites in `audio-upload.ts` to use the new
name. Delete the immediate assignment-status update, attempt-status update, and
status-event insert formerly owned by the route function.

- [ ] **Step 6: Count reviewed turns as finished in app-owned resume logic**

Replace the final outcome condition in `originalAnswerAccepted` with:

```ts
return (
  evaluation.version === "ai-eval-v1" &&
  evaluation.requireRepeat === false &&
  (evaluation.outcome === "accepted_original" ||
    evaluation.outcome === "teacher_review")
);
```

Update the function comment to say it recognizes accepted or internally
reviewed original answers. Do not add a pending-review feedback mapping;
reviewed conversation turns resume at the next turn.

- [ ] **Step 7: Fail the upload when Coco-line persistence fails**

Replace the current log-and-continue branch after `recordCocoLine` with:

```ts
if (!recordResult.ok) {
  await supabase
    .from("audio_clips")
    .update({ processing_status: "failed" })
    .eq("id", audioClip.id);
  log("warn", "audio.coco_line_persist_failed", {
    assignmentStudentId: input.assignmentStudentId,
    attemptId: input.attemptId,
    turnOrder: input.turnOrder,
    error: recordResult.error,
  });
  logTiming("failed", {
    error: "db_error",
    step: "coco_line_write",
  });
  return { ok: false, error: "db_error", retryable: true };
}
```

Keep TTS warmup inside the successful persistence branch.

- [ ] **Step 8: Add the atomic reviewed-completion migration**

Create `supabase/migrations/202607230002_deferred_teacher_review_completion.sql`
by replacing `public.complete_student_attempt(uuid, uuid, uuid)`. Preserve its
existing ownership filters, row locks, service-role grant, and required-turn
snapshot lookup. Add these declarations and selection:

```sql
v_needs_review_reason text;
v_terminal_status public.assignment_student_status;
v_reason_code text;
```

```sql
select attempt.status, attempt.needs_review_reason
into v_attempt_status, v_needs_review_reason
from public.attempts as attempt
where attempt.id = p_attempt_id
  and attempt.assignment_student_id = p_assignment_student_id
for update;
```

Use this idempotence gate:

```sql
if (
  v_assignment_status = 'completed'
  and v_attempt_status = 'completed'
) or (
  v_assignment_status = 'teacher_review'
  and v_attempt_status = 'teacher_review'
) then
  return 'ok';
end if;
```

Add teacher review to the finished-turn predicate:

```sql
or (
  turn_row.evaluation ->> 'version' = 'ai-eval-v1'
  and turn_row.evaluation ->> 'outcome' = 'teacher_review'
  and turn_row.evaluation ->> 'requireRepeat' = 'false'
)
```

Choose and apply terminal state atomically:

```sql
v_terminal_status := case
  when nullif(btrim(v_needs_review_reason), '') is not null
    then 'teacher_review'::public.assignment_student_status
  else 'completed'::public.assignment_student_status
end;
v_reason_code := case
  when v_terminal_status = 'teacher_review' then v_needs_review_reason
  else 'mission_completed'
end;

update public.assignment_students
set status = v_terminal_status,
    submitted_at = v_now,
    latest_attempt_id = p_attempt_id
where id = p_assignment_student_id;

insert into public.assignment_status_events (
  assignment_student_id,
  previous_status,
  next_status,
  actor_type,
  reason_code
)
values (
  p_assignment_student_id,
  'started',
  v_terminal_status,
  case
    when v_terminal_status = 'teacher_review'
      then 'ai_evaluator'::public.status_actor_type
    else 'student_session'::public.status_actor_type
  end,
  v_reason_code
);

update public.attempts
set status = case
      when v_terminal_status = 'teacher_review'
        then 'teacher_review'::public.attempt_status
      else 'completed'::public.attempt_status
    end,
    completed_at = v_now
where id = p_attempt_id;
```

End the migration with the same `revoke all` and `grant execute ... to
service_role` statements as the current RPC migration.

- [ ] **Step 9: Update structural review-routing tests**

Replace assertions in `tests/server/student-mission-flow.test.ts` that require
immediate status writes with:

```ts
const flagStart = missionFlowSource.indexOf(
  "export async function flagAttemptForTeacherReview",
);
const flagEnd = missionFlowSource.indexOf(
  "export async function startOrResumeAttempt",
  flagStart,
);
const flagSource = missionFlowSource.slice(flagStart, flagEnd);

expect(missionFlowSource).toContain("flagAttemptForTeacherReview");
expect(missionFlowSource).toContain("needs_review_reason");
expect(missionFlowSource).not.toContain(
  "routeAssignmentStudentToTeacherReview",
);
expect(flagSource).not.toContain('status: "teacher_review"');
expect(flagSource).not.toContain("assignment_status_events");
```

- [ ] **Step 10: Run lifecycle tests and verify GREEN**

Run the command from Step 4.

Expected: all listed test files pass.

- [ ] **Step 11: Commit Task 3**

```bash
git add supabase/migrations/202607230002_deferred_teacher_review_completion.sql tests/schema/complete-attempt-rpc-schema.test.ts src/server/student-access/mission-flow.ts src/server/student-access/mission-flow.test.ts tests/server/student-mission-flow.test.ts src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts src/domain/flow/completion.ts tests/server/mission-flow.test.ts
git commit -m "fix(student): defer conversation teacher review"
```

---

### Task 4: Make reviewed conversation turns and completions normal on student surfaces

**Files:**
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `tests/server/student-mission-flow.test.ts`
- Modify: `src/server/student-access/assignment-list.ts`
- Modify: `src/components/student/AssignmentListItem.tsx`
- Modify: `tests/server/assignment-list.test.ts`
- Modify: `src/server/student-access/student-history.ts`
- Modify: `tests/server/student-history-ui.test.ts`
- Modify: `TASK.md`

**Interfaces:**
- Consumes: Task 3's non-terminal review flag and reviewed-turn completion behavior.
- Produces: automatic reviewed-turn continuation in dynamic mode; `teacher_review` mapped to student `done`/Past/history while teacher data remains unchanged.

- [ ] **Step 1: Write failing client-flow source tests**

Replace the obsolete conversation review-feedback assertions in
`tests/server/student-mission-flow.test.ts` with:

```ts
it("silently advances reviewed conversation originals and repeats", () => {
  const shellSource = readFileSync(
    "src/components/student/MissionFlowShell.tsx",
    "utf8",
  );

  expect(shellSource).toMatch(
    /conversationMode[\s\S]*originalFeedback\.kind === "acceptedOriginal"[\s\S]*originalFeedback\.kind === "teacherReview"[\s\S]*continueAcceptedConversationTurn/,
  );
  expect(shellSource).toMatch(
    /conversationMode[\s\S]*repeatFeedback\.kind === "repeatAccepted"[\s\S]*repeatFeedback\.kind === "repeatReview"[\s\S]*continueAcceptedConversationTurn/,
  );
  const reviewHandlerStart = shellSource.indexOf(
    "async function finishTeacherReviewFeedback",
  );
  const reviewHandlerEnd = shellSource.indexOf(
    "async function finishAcceptedOriginal",
    reviewHandlerStart,
  );
  expect(
    shellSource.slice(reviewHandlerStart, reviewHandlerEnd),
  ).not.toContain("conversationMode");
});
```

Keep the preset feedback branches and their existing teacher-check copy; the
new test only forbids that path for conversation mode.

- [ ] **Step 2: Write failing student list/history tests**

Replace the teacher-review Current-tab test in
`tests/server/assignment-list.test.ts` with:

```ts
it("presents teacher-reviewed submissions as completed Past work", async () => {
  rows = [
    row("review", "teacher_review", null, "2026-07-11T10:00:00Z"),
    row("done", "completed", null, "2026-07-10T10:00:00Z"),
  ];
  const { listStudentAssignmentPage } = await import(
    "@/server/student-access/assignment-list"
  );

  const current = await listStudentAssignmentPage("student-1", {
    tab: "current",
    page: 1,
  });
  const past = await listStudentAssignmentPage("student-1", {
    tab: "past",
    page: 1,
  });

  expect(current.items).toEqual([]);
  expect(past.items.map((item) => [item.assignmentStudentId, item.displayStatus])).toEqual([
    ["review", "done"],
    ["done", "done"],
  ]);
});
```

Update `tests/server/student-history-ui.test.ts`:

```ts
it("authorizes completed and internally reviewed recap ownership", () => {
  expect(recapMapper).toContain(
    '.in("status", ["completed", "teacher_review"])',
  );
  expect(recapMapper).not.toContain(
    '.eq("status", "completed")',
  );
});
```

- [ ] **Step 3: Run student-flow tests and verify RED**

Run:

```bash
npx vitest run tests/server/student-mission-flow.test.ts tests/server/assignment-list.test.ts tests/server/student-history-ui.test.ts tests/server/student-mission-page.test.ts tests/domain/tts-ui-source.test.ts
```

Expected: FAIL because reviewed conversation turns still render feedback and
teacher-reviewed submissions remain visible as Current/Teacher review.

- [ ] **Step 4: Auto-advance reviewed conversation turns**

Change the original conversation branch in `handleSubmitOriginalVoice` to:

```ts
if (
  conversationMode &&
  (originalFeedback.kind === "acceptedOriginal" ||
    originalFeedback.kind === "teacherReview")
) {
  await continueAcceptedConversationTurn(aid, upload.cocoLine ?? null);
  return;
}
```

Change the repeat conversation branch to:

```ts
if (
  conversationMode &&
  (repeatFeedback.kind === "repeatAccepted" ||
    repeatFeedback.kind === "repeatReview")
) {
  await continueAcceptedConversationTurn(aid, flow.cocoLine);
  return;
}
```

Remove the conversation-mode branch from `finishTeacherReviewFeedback`; it now
serves preset mode only. Leave preset `reviewPending`, feedback copy, and retry
behavior unchanged.

- [ ] **Step 5: Present reviewed submissions as completed to students**

In `assignment-list.ts`, define:

```ts
const STUDENT_COMPLETED_STATUSES = new Set(["completed", "teacher_review"]);
```

Use it for tab filtering and map both terminal statuses to `displayStatus =
"done"`. Remove `"review"` from `AssignmentDisplayStatus` and remove the
student-facing `Teacher review` badge entry from `AssignmentListItem`.

In `student-history.ts`, change both owned assignment/attempt status filters to:

```ts
.in("status", ["completed", "teacher_review"])
```

Change both nested signed-audio ownership filters to `.in` with the same two
statuses. Keep the student-id, latest-attempt, cancellation, expiry, deletion,
and signed-URL checks unchanged.

- [ ] **Step 6: Run student-flow tests and verify GREEN**

Run the command from Step 3.

Expected: all listed test files pass.

- [ ] **Step 7: Run the combined regression matrix**

Run:

```bash
npx vitest run src/domain/mission/schemas.test.ts tests/domain/mission-schemas.test.ts tests/server/teacher-mission-create-source.test.ts tests/server/mission-service.test.ts tests/server/mission-assign.test.ts tests/schema/conversation-answer-policy-schema.test.ts tests/server/turn-evaluator.test.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/mission-flow.test.ts tests/server/student-mission-flow.test.ts tests/server/mission-flow.test.ts tests/schema/complete-attempt-rpc-schema.test.ts src/server/student-access/audio-upload.test.ts tests/server/assignment-list.test.ts tests/server/student-history-ui.test.ts tests/server/student-mission-page.test.ts tests/domain/tts-ui-source.test.ts tests/server/translation-hint-route-source.test.ts
```

Expected: all listed test files pass with no provider or live-database calls.

- [ ] **Step 8: Run proportionate release verification**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
```

Expected:
- full Vitest suite passes, except only explicitly identified pre-existing environment failures if reproduced with evidence;
- typecheck exits 0;
- lint exits 0 errors, with only already-recorded unrelated warnings permitted.

Before `npm run build`, check whether the current checkout still has `next dev`
listening on port 3200. Ask the user to stop it before building; do not stop the
user's process without permission. Then run:

```bash
npm run build
```

Expected: all routes compile successfully.

- [ ] **Step 9: Update active task evidence and commit Task 4**

Update `TASK.md` with:

```markdown
**Status:** Remediation implemented and automated-verified; awaiting conversation-mode UAT
```

Record the exact test counts and outcomes actually observed. Do not copy
expected counts into evidence.

```bash
git add src/components/student/MissionFlowShell.tsx tests/server/student-mission-flow.test.ts src/server/student-access/assignment-list.ts src/components/student/AssignmentListItem.tsx tests/server/assignment-list.test.ts src/server/student-access/student-history.ts tests/server/student-history-ui.test.ts TASK.md
git commit -m "fix(student): hide internal conversation review"
```

---

## Manual UAT checkpoint

Do not apply either migration merely to make UAT possible. Obtain separate
approval naming the localhost Supabase environment and both migration files,
then apply them through the project's normal migration command.

With the development server on `http://localhost:3200`, use a five-turn dynamic
conversation mission whose **Require complete-sentence answers** setting is on:

1. Answer a location question with `School.` and verify Coco supplies a
   meaning-preserving complete sentence to repeat.
2. Complete the repeat and verify the next generated question has working TTS
   and translation hint.
3. Trigger one internally reviewed turn and verify there is no teacher-review
   message or extra Continue button.
4. Verify the reviewed turn's generated line is relevant to the current usable
   answer, otherwise prior understood context, otherwise neutral scene context.
5. Record the following turn and verify the upload succeeds.
6. Finish turn five and verify the spoken no-question Coco closing, **Finish
   mission**, and normal completion screen.
7. Return home and verify the mission is under Past as **Completed** and its
   read-only history/audio remains available.
8. Reopen the mission URL and verify it cannot return to a recorder.
9. Open teacher evidence and verify the submission is queued as
   `teacher_review` with the stored review reason, transcripts, and signed audio.

If all checks pass, update `TASK.md`, archive it to
`docs/tasks/archive/2026-07-23-final-coco-closing.md` with status `Complete`, and
commit the UAT evidence. Do not push, deploy, or apply production migrations
without separate approval.
