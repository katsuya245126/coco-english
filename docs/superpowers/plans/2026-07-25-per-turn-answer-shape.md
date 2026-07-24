# Per-Turn Answer Shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the evaluator coercing a child into the target example's choice on open/opinion turns by deciding each turn's answer-shape once (AI, at mission save-time) and branching the evaluator on it.

**Architecture:** Add a persisted `answer_shape` (`"fixed" | "open"`, default `open`) to `mission_turn_templates`. A batched save-time classifier sets it. It threads through the mission snapshot (built at assign-time) into the original-turn evaluator, which branches: `fixed` matches the target as today; `open` enforces only the taught frame and re-slots the child's own choice — never the example's.

**Tech Stack:** TypeScript, Next.js, Zod, Supabase (Postgres), OpenAI Responses API (`gpt-4.1-mini`), Vitest.

## Global Constraints

- New field name: `answerShape: "fixed" | "open"` (camelCase in TS, `answer_shape` in SQL). Default `"open"` everywhere.
- On any classifier failure, junk output, or missing value → `"open"` (lenient; never coerces). A mission save is never blocked by classification failing.
- Tests must never call the paid OpenAI API — inject a fake Responses client, mirroring `src/server/ai/opener-generator.test.ts`.
- No teacher-facing UI in this plan. Classification is fully automatic.
- Follow the existing adapter pattern in `src/server/ai/turn-evaluator.ts` for any new AI module (server-only, `deps.client` injectable, `deps.apiKey`/`OPENAI_API_KEY`, `resolveModel`).
- Work on branch `design/per-turn-answer-shape` (already checked out). Rename not required.

---

### Task 1: Add `answerShape` to the turn schemas

**Files:**
- Modify: `src/domain/mission/schemas.ts` (`missionTurnInputSchema` ~24-31, `missionSnapshotTurnSchema` ~99-101)
- Test: `src/domain/mission/schemas.test.ts`

**Interfaces:**
- Produces: `missionTurnInputSchema` and `missionSnapshotTurnSchema` each gain
  `answerShape: z.enum(["fixed","open"]).default("open")`. New exported type
  `AnswerShape = "fixed" | "open"`.

- [ ] **Step 1: Write the failing test**

Add to `src/domain/mission/schemas.test.ts`:

```typescript
import {
  missionTurnInputSchema,
  missionSnapshotTurnSchema,
  type AnswerShape,
} from "@/domain/mission/schemas";

describe("answerShape on turns", () => {
  const baseTurn = {
    prompt: "Which is best?",
    targetExample: "I think vanilla is the best.",
    hintLadder: { tier1: "a", tier2: "b", tier3: "c" },
  };

  it("defaults answerShape to open when omitted", () => {
    const parsed = missionTurnInputSchema.parse(baseTurn);
    expect(parsed.answerShape).toBe("open");
  });

  it("accepts an explicit fixed answerShape", () => {
    const parsed = missionTurnInputSchema.parse({ ...baseTurn, answerShape: "fixed" });
    expect(parsed.answerShape).toBe("fixed");
  });

  it("rejects an unknown answerShape", () => {
    expect(() =>
      missionTurnInputSchema.parse({ ...baseTurn, answerShape: "maybe" }),
    ).toThrow();
  });

  it("defaults answerShape on snapshot turns", () => {
    const parsed = missionSnapshotTurnSchema.parse({ ...baseTurn, turnOrder: 1 });
    const shape: AnswerShape = parsed.answerShape;
    expect(shape).toBe("open");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/mission/schemas.test.ts -t answerShape`
Expected: FAIL — `answerShape` is `undefined` / type `AnswerShape` not exported.

- [ ] **Step 3: Implement**

In `src/domain/mission/schemas.ts`, add after `missionLevelSchema` type:

```typescript
export const answerShapeSchema = z.enum(["fixed", "open"]);
export type AnswerShape = z.infer<typeof answerShapeSchema>;
```

Add `answerShape` to `missionTurnInputSchema`:

```typescript
export const missionTurnInputSchema = z.object({
  prompt: z.string().trim().min(1, "Buddy question is required."),
  targetExample: z
    .string()
    .trim()
    .min(1, "Example answer is required."),
  hintLadder: hintLadderSchema,
  answerShape: answerShapeSchema.default("open"),
});
```

`missionSnapshotTurnSchema` extends `missionTurnInputSchema`, so it inherits the
field — no change needed there beyond confirming the `.extend({ turnOrder })`
still compiles.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/mission/schemas.test.ts -t answerShape`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/mission/schemas.ts src/domain/mission/schemas.test.ts
git commit -m "feat: add answerShape field to mission turn schemas"
```

---

### Task 2: Persist `answer_shape` — DB migration + mission-service read/write

**Files:**
- Create: `supabase/migrations/202607250001_turn_answer_shape.sql`
- Modify: `src/server/mission/mission-service.ts` (`mapTurn` ~128-136, `toTurnRows` ~153-161; the `MissionTurn` type — find its definition and add `answerShape`)

**Interfaces:**
- Consumes: `AnswerShape` from Task 1.
- Produces: `mission_turn_templates` rows carry `answer_shape text not null default 'open'`. `mapTurn` returns `answerShape`; `toTurnRows` writes `answer_shape` from `turn.answerShape`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202607250001_turn_answer_shape.sql`:

```sql
-- Per-turn answer shape: "fixed" turns have a correct answer to match; "open"
-- turns (opinion/preference/choice) must never coerce the child toward the
-- target example. Default open so all existing rows are lenient.
alter table public.mission_turn_templates
  add column if not exists answer_shape text not null default 'open'
    check (answer_shape in ('fixed', 'open'));
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or the project's migration command — check `package.json` scripts / `AGENTS.md` if this fails).
Expected: migration applies; `mission_turn_templates` has an `answer_shape` column.

- [ ] **Step 3: Write the failing test for mission-service mapping**

Locate the `mission-service` test file (`src/server/mission/mission-service.test.ts` if present; if none, add a focused unit test for `toTurnRows`/`mapTurn` by exporting them or testing through the nearest public boundary). Add:

```typescript
// toTurnRows must emit answer_shape; mapTurn must read it back.
it("round-trips answerShape through toTurnRows and mapTurn", () => {
  const rows = toTurnRows("mission-1", [
    {
      prompt: "Which is best?",
      targetExample: "I think vanilla is the best.",
      hintLadder: { tier1: "a", tier2: "b", tier3: "c" },
      answerShape: "fixed",
    },
  ]);
  expect(rows[0].answer_shape).toBe("fixed");

  const mapped = mapTurn({
    id: "t1",
    turn_order: 1,
    prompt: "Which is best?",
    target_example: "I think vanilla is the best.",
    hint_ladder: { tier1: "a", tier2: "b", tier3: "c" },
    answer_shape: "fixed",
  } as never);
  expect(mapped.answerShape).toBe("fixed");
});
```

If `toTurnRows`/`mapTurn` are not exported, add `export` to both in
`mission-service.ts` (they are internal helpers; exporting for test is
acceptable and lower-risk than testing through Supabase mocks).

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/server/mission/mission-service.test.ts -t answerShape`
Expected: FAIL — `answer_shape` missing on row / `answerShape` missing on mapped turn.

- [ ] **Step 5: Implement mission-service changes**

Add `answerShape: AnswerShape` to the `MissionTurn` type (search the file/its
types module for `type MissionTurn`). Import `AnswerShape` from
`@/domain/mission/schemas`.

Update `mapTurn`:

```typescript
function mapTurn(row: TurnRow): MissionTurn {
  return {
    id: row.id,
    turnOrder: row.turn_order,
    prompt: row.prompt,
    targetExample: row.target_example,
    hintLadder: normalizeHintLadder(row.hint_ladder),
    answerShape: row.answer_shape === "fixed" ? "fixed" : "open",
  };
}
```

Add `answer_shape: string` to the `TurnRow` type.

Update `toTurnRows`:

```typescript
function toTurnRows(missionId: string, turns: MissionTurnInput[]) {
  return turns.map((turn, index) => ({
    mission_id: missionId,
    turn_order: index + 1,
    prompt: turn.prompt,
    target_example: turn.targetExample,
    hint_ladder: turn.hintLadder as unknown as Json,
    answer_shape: turn.answerShape,
  }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/server/mission/mission-service.test.ts -t answerShape`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202607250001_turn_answer_shape.sql src/server/mission/mission-service.ts src/server/mission/mission-service.test.ts
git commit -m "feat: persist answer_shape on mission turn templates"
```

---

### Task 3: The save-time classifier module

**Files:**
- Create: `src/server/ai/answer-shape-classifier.ts`
- Test: `src/server/ai/answer-shape-classifier.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type AnswerShapeClient = {
    responses: {
      parse(input: {
        model: string;
        input: Array<{ role: "system" | "user"; content: string }>;
        text: { format: unknown };
      }): Promise<{ output_parsed?: unknown }>;
    };
  };
  export type ClassifyTurnsInput = {
    turns: Array<{ prompt: string; targetExample: string }>;
  };
  export type ClassifyTurnsDeps = {
    apiKey?: string;
    model?: string;
    client?: AnswerShapeClient;
  };
  // Always resolves; never throws. Length always equals input.turns.length.
  export function classifyTurnAnswerShapes(
    input: ClassifyTurnsInput,
    deps?: ClassifyTurnsDeps,
  ): Promise<AnswerShape[]>;
  ```
- Consumes: `AnswerShape` from Task 1.

- [ ] **Step 1: Write the failing tests**

Create `src/server/ai/answer-shape-classifier.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  classifyTurnAnswerShapes,
  type AnswerShapeClient,
} from "@/server/ai/answer-shape-classifier";

function fakeClient(outputParsed: unknown, requests: unknown[] = []): AnswerShapeClient {
  return {
    responses: {
      parse: async (input) => {
        requests.push(input);
        return { output_parsed: outputParsed };
      },
    },
  };
}

function throwingClient(): AnswerShapeClient {
  return {
    responses: { parse: async () => { throw new Error("provider down"); } },
  };
}

const turns = [
  { prompt: "Which ice cream is the best: vanilla, strawberry, or chocolate?", targetExample: "I think vanilla ice cream is the best." },
  { prompt: "How do you say hello in English?", targetExample: "Hello." },
];

describe("classifyTurnAnswerShapes", () => {
  it("returns per-turn shapes from the model output", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "test", client: fakeClient({ shapes: ["open", "fixed"] }) },
    );
    expect(result).toEqual(["open", "fixed"]);
  });

  it("defaults every turn to open when the provider throws", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "test", client: throwingClient() },
    );
    expect(result).toEqual(["open", "open"]);
  });

  it("defaults to open when output is junk or wrong length", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "test", client: fakeClient({ shapes: ["fixed"] }) },
    );
    expect(result).toEqual(["open", "open"]);
  });

  it("defaults to open when no api key is configured", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "", client: fakeClient({ shapes: ["fixed", "fixed"] }) },
    );
    expect(result).toEqual(["open", "open"]);
  });

  it("returns [] for no turns without calling the provider", async () => {
    const requests: unknown[] = [];
    const result = await classifyTurnAnswerShapes(
      { turns: [] },
      { apiKey: "test", client: fakeClient({ shapes: [] }, requests) },
    );
    expect(result).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/ai/answer-shape-classifier.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the classifier**

Create `src/server/ai/answer-shape-classifier.ts`:

```typescript
/**
 * Server-only save-time classifier: is each mission turn a fixed-answer turn
 * (a correct answer to match) or an open turn (opinion/preference/choice with
 * no wrong answer)? Decided once here so the evaluator never re-guesses it per
 * attempt. Fails safe to "open" — the lenient shape that never coerces a child.
 */
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { log } from "@/server/logging/logger";
import { answerShapeSchema, type AnswerShape } from "@/domain/mission/schemas";

const DEFAULT_MODEL = "gpt-4.1-mini";

const classificationSchema = z.object({
  shapes: z.array(answerShapeSchema),
});

export type AnswerShapeClient = {
  responses: {
    parse(input: {
      model: string;
      input: Array<{ role: "system" | "user"; content: string }>;
      text: { format: unknown };
    }): Promise<{ output_parsed?: unknown }>;
  };
};

export type ClassifyTurnsInput = {
  turns: Array<{ prompt: string; targetExample: string }>;
};

export type ClassifyTurnsDeps = {
  apiKey?: string;
  model?: string;
  client?: AnswerShapeClient;
};

function resolveApiKey(deps?: ClassifyTurnsDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: ClassifyTurnsDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_EVALUATION_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

function allOpen(count: number): AnswerShape[] {
  return Array.from({ length: count }, () => "open" as const);
}

export async function classifyTurnAnswerShapes(
  input: ClassifyTurnsInput,
  deps?: ClassifyTurnsDeps,
): Promise<AnswerShape[]> {
  const count = input.turns.length;
  if (count === 0) return [];

  const apiKey = resolveApiKey(deps);
  if (!apiKey) return allOpen(count);

  try {
    const client =
      deps?.client ?? (new OpenAI({ apiKey }) as AnswerShapeClient);
    const prompt = {
      instructions: [
        "Classify each ESL mission turn as 'fixed' or 'open'.",
        "'fixed' = the question has a single correct answer being drilled (e.g. 'How do you say hello?', 'What is the past tense of go?').",
        "'open' = there is no wrong answer: opinion, preference, favourite, feelings, personal facts, or a choice among options the question itself offers (e.g. 'Which ice cream is best: vanilla, strawberry, or chocolate?').",
        "The targetExample is only ONE possible answer; a different valid choice must still be 'open'.",
        "When unsure, choose 'open'.",
        "Return shapes in the same order as turns, one per turn.",
      ],
      turns: input.turns.map((t, i) => ({
        index: i,
        question: t.prompt,
        targetExample: t.targetExample,
      })),
    };
    const response = await client.responses.parse({
      model: resolveModel(deps),
      input: [
        {
          role: "system",
          content:
            "Classify children's ESL mission turns. Return only data matching the schema.",
        },
        { role: "user", content: JSON.stringify(prompt) },
      ],
      text: {
        format: zodTextFormat(classificationSchema, "answer_shape_classification"),
      },
    });
    const parsed = classificationSchema.safeParse(response.output_parsed);
    if (!parsed.success || parsed.data.shapes.length !== count) {
      return allOpen(count);
    }
    return parsed.data.shapes;
  } catch {
    log("error", "ai.answer_shape_classification_failed", { turnCount: count });
    return allOpen(count);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/ai/answer-shape-classifier.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/answer-shape-classifier.ts src/server/ai/answer-shape-classifier.test.ts
git commit -m "feat: add save-time answer-shape classifier"
```

---

### Task 4: Wire the classifier into mission save

**Files:**
- Modify: `src/server/mission/mission-service.ts` (`createMission` ~218-245, `updateMission` ~247-285; `toTurnRows` call sites)

**Interfaces:**
- Consumes: `classifyTurnAnswerShapes` from Task 3; `toTurnRows` from Task 2.
- Produces: `createMission`/`updateMission` set `answerShape` on each parsed turn
  before persisting.

- [ ] **Step 1: Write the failing test**

In `src/server/mission/mission-service.test.ts`, add a test that injects a fake
classifier (add a `deps` param — see Step 3) and asserts the persisted rows
carry the classified shapes. Because `createMission` calls Supabase, prefer a
small extracted pure helper to test the merge:

```typescript
import { applyAnswerShapes } from "@/server/mission/mission-service";

it("applies classified shapes to turns in order", () => {
  const turns = [
    { prompt: "q1", targetExample: "a1", hintLadder: { tier1: "x", tier2: "y", tier3: "z" }, answerShape: "open" as const },
    { prompt: "q2", targetExample: "a2", hintLadder: { tier1: "x", tier2: "y", tier3: "z" }, answerShape: "open" as const },
  ];
  const result = applyAnswerShapes(turns, ["fixed", "open"]);
  expect(result.map((t) => t.answerShape)).toEqual(["fixed", "open"]);
});

it("leaves turns unchanged when shape count mismatches", () => {
  const turns = [
    { prompt: "q1", targetExample: "a1", hintLadder: { tier1: "x", tier2: "y", tier3: "z" }, answerShape: "open" as const },
  ];
  const result = applyAnswerShapes(turns, []);
  expect(result.map((t) => t.answerShape)).toEqual(["open"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/mission/mission-service.test.ts -t "classified shapes"`
Expected: FAIL — `applyAnswerShapes` not exported.

- [ ] **Step 3: Implement**

In `mission-service.ts`, import the classifier and add the helper:

```typescript
import { classifyTurnAnswerShapes } from "@/server/ai/answer-shape-classifier";

export function applyAnswerShapes(
  turns: MissionTurnInput[],
  shapes: AnswerShape[],
): MissionTurnInput[] {
  if (shapes.length !== turns.length) return turns;
  return turns.map((turn, i) => ({ ...turn, answerShape: shapes[i] }));
}
```

In `createMission`, after `const parsed = parseMissionInput(input);` and before
inserting turns, classify and apply:

```typescript
const shapes = await classifyTurnAnswerShapes({
  turns: parsed.turns.map((t) => ({ prompt: t.prompt, targetExample: t.targetExample })),
});
const shapedTurns = applyAnswerShapes(parsed.turns, shapes);
```

Then change the turn insert to use `shapedTurns`:

```typescript
.insert(toTurnRows(inserted.data.id, shapedTurns));
```

Apply the identical change in `updateMission` (classify `parsed.turns`, build
`shapedTurns`, pass to `toTurnRows(input.missionId, shapedTurns)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/mission/mission-service.test.ts -t "classified shapes"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mission/mission-service.ts src/server/mission/mission-service.test.ts
git commit -m "feat: classify answer shapes on mission create and update"
```

---

### Task 5: Thread `answerShape` through assign snapshot

**Files:**
- Modify: `src/server/mission/assign-service.ts` (`TurnRow` ~39-42, snapshot build ~61-72, select ~112)

**Interfaces:**
- Consumes: `answer_shape` column from Task 2; `missionSnapshotTurnSchema` (Task 1).
- Produces: snapshot `turns[].answerShape` is populated from the template's
  `answer_shape`.

- [ ] **Step 1: Write the failing test**

In the assign-service test file (create `src/server/mission/assign-service.test.ts` if absent, testing the snapshot-build helper — export it if internal). Assert:

```typescript
it("carries answer_shape into snapshot turns", () => {
  const snapshot = buildMissionSnapshot({
    // ...existing required fields for the helper...
    turns: [
      { id: "t1", turn_order: 1, prompt: "q", target_example: "a", hint_ladder: { tier1: "x", tier2: "y", tier3: "z" }, answer_shape: "fixed" },
    ],
  } as never);
  expect(snapshot.turns[0].answerShape).toBe("fixed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/mission/assign-service.test.ts -t answer_shape`
Expected: FAIL — `answerShape` undefined on snapshot turn.

- [ ] **Step 3: Implement**

Add `answer_shape: string;` to the `TurnRow` type (~39-42).

In the `.select(...)` for `mission_turn_templates` (~112), add `answer_shape`:

```typescript
.select("id, turn_order, prompt, target_example, hint_ladder, answer_shape")
```

In the snapshot turn mapping (~61-72), add the field:

```typescript
turnOrder: turn.turn_order,
prompt: turn.prompt,
targetExample: turn.target_example,
hintLadder: turn.hint_ladder,
answerShape: turn.answer_shape === "fixed" ? "fixed" : "open",
```

(`missionSnapshotSchema.parse` at the end will still validate; default `open`
covers any legacy row read before the column existed, though the migration's
`not null default 'open'` means every row has a value.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/mission/assign-service.test.ts -t answer_shape`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/mission/assign-service.ts src/server/mission/assign-service.test.ts
git commit -m "feat: carry answer_shape into assignment mission snapshot"
```

---

### Task 6: Evaluator branch — `open` vs `fixed` instruction sets

**Files:**
- Modify: `src/server/ai/turn-evaluator.ts` (`EvaluateOriginalTurnInput` ~50-65, `presetInstructions` ~100-114, `buildOriginalPrompt` ~151-244)
- Test: `src/server/ai/turn-evaluator.test.ts` (create if absent, using the fake-client pattern from `opener-generator.test.ts`)

**Interfaces:**
- Consumes: `AnswerShape` from Task 1.
- Produces: `EvaluateOriginalTurnInput` gains `answerShape?: AnswerShape`
  (optional; absent → treated as `open`). `buildOriginalPrompt` selects
  `openPresetInstructions` vs `fixedPresetInstructions` in preset mode.

- [ ] **Step 1: Write the failing tests**

Create/extend `src/server/ai/turn-evaluator.test.ts`. Capture the request the
fake client receives and assert the instruction payload branches on
`answerShape`:

```typescript
import { describe, expect, it } from "vitest";
import {
  evaluateOriginalTurn,
  type TurnEvaluationResponsesClient,
} from "@/server/ai/turn-evaluator";

function captureClient(requests: unknown[]): TurnEvaluationResponsesClient {
  return {
    responses: {
      parse: async (input) => {
        requests.push(input);
        return {
          output_parsed: {
            version: "ai-eval-v1",
            outcome: "correct",
            meaningUnderstood: true,
            targetPatternAttempted: true,
            correctionNeeded: false,
            correctionSeverity: "none",
            improvedSentence: null,
            englishLanguage: "english",
            confidence: "high",
            reviewReason: null,
          },
        };
      },
    },
  };
}

const base = {
  evaluationMode: "preset" as const,
  missionQuestion: "Which ice cream is the best: vanilla, strawberry, or chocolate?",
  targetPattern: "I think ___ is the best.",
  targetExample: "I think vanilla ice cream is the best.",
  level: "elementary" as const,
  transcript: "I think chocolate ice cream is the best.",
};

describe("buildOriginalPrompt answerShape branch", () => {
  it("open turn sends scaffolding-only instructions (never replace the child's choice)", async () => {
    const requests: unknown[] = [];
    await evaluateOriginalTurn(
      { ...base, answerShape: "open" },
      { apiKey: "test", client: captureClient(requests) },
    );
    const body = JSON.stringify(requests[0]);
    expect(body).toContain("Never use needs_correction to replace the child's choice");
    expect(body).toContain("frame");
    // must NOT tell the model the example is required content
    expect(body).not.toContain("Mark as correct (outcome: 'correct') if the target pattern appears");
  });

  it("fixed turn sends target-matching instructions", async () => {
    const requests: unknown[] = [];
    await evaluateOriginalTurn(
      { ...base, answerShape: "fixed", targetExample: "Hello.", missionQuestion: "How do you say hello?" },
      { apiKey: "test", client: captureClient(requests) },
    );
    const body = JSON.stringify(requests[0]);
    expect(body).toContain("target pattern appears anywhere");
  });

  it("missing answerShape defaults to the open branch", async () => {
    const requests: unknown[] = [];
    await evaluateOriginalTurn(
      base,
      { apiKey: "test", client: captureClient(requests) },
    );
    expect(JSON.stringify(requests[0])).toContain("Never use needs_correction to replace the child's choice");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/ai/turn-evaluator.test.ts -t answerShape`
Expected: FAIL — no branch; `answerShape` unknown on input type.

- [ ] **Step 3: Implement**

In `turn-evaluator.ts`:

Add to `EvaluateOriginalTurnInput`:

```typescript
import { answerShapeSchema, type AnswerShape } from "@/domain/mission/schemas";
// ...
  /** Fixed = match the target; open = enforce only the frame, never the choice. */
  answerShape?: AnswerShape;
```

Split `presetInstructions`. Rename the current constant to
`fixedPresetInstructions`, and **remove** the opinion band-aids that only
existed to fake the open behavior — delete the three items at current lines
107-112 (the `UAT 2026-07-24` comment block plus the two "opinion, preference,
or personal-fact" strings). Keep the rest (they describe genuine fixed-answer
acceptance). Add the new open set:

```typescript
const openPresetInstructions = [
  "This turn has NO single correct answer (opinion, preference, or a choice among options the question offers). The targetExample is scaffolding, not an answer key.",
  "The child's choice, preference, or opinion is always acceptable. Never use needs_correction to replace the child's choice with the example's choice. (This exact phrase is asserted by the regression guard in Task 8 — keep it verbatim.)",
  "Accept (outcome: 'correct') when the answer is a relevant, valid-English response that uses the taught frame (targetPattern). Extra words are fine.",
  "If the answer is relevant and valid English but does NOT use the taught frame (e.g. 'Chocolate.'), use needs_correction with an improvedSentence that puts the CHILD'S OWN choice into the frame — e.g. 'I think chocolate is the best.' — never the example's choice.",
  "If the English itself is genuinely wrong (grammar or structure), use needs_correction and write one natural improvedSentence that preserves the child's intended meaning and choice.",
  "Never copy the missionQuestion or the targetExample's choice into improvedSentence.",
];
```

In `buildOriginalPrompt`, select the preset set by shape:

```typescript
const isConversationMode = input.evaluationMode === "conversation";
const isOpenPreset =
  !isConversationMode && (input.answerShape ?? "open") === "open";
const modeInstructions = isConversationMode
  ? conversationInstructions
  : isOpenPreset
    ? openPresetInstructions
    : fixedPresetInstructions;
```

Leave `presetSeverityInstructions` selection as-is (it already keys off
`isConversationMode`; open and fixed both use the preset severity path).

Add `answerShape: input.answerShape ?? "open"` to the returned prompt object so
it is visible in the payload (and for debugging).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/ai/turn-evaluator.test.ts -t answerShape`
Expected: PASS.

- [ ] **Step 5: Run the full evaluator suite to catch regressions**

Run: `npx vitest run src/server/ai/`
Expected: PASS. If the warmup or other callers break on the renamed constant,
they reference it indirectly — the constant is module-private, so only this
file changes.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/turn-evaluator.ts src/server/ai/turn-evaluator.test.ts
git commit -m "feat: branch original-turn evaluator on answerShape (open vs fixed)"
```

---

### Task 7: Pass `answerShape` from the attempt flow into the evaluator

**Files:**
- Modify: `src/server/student-access/audio-upload.ts` (target/snapshot region ~785-789, evaluator call ~1112-1129)

**Interfaces:**
- Consumes: `snapshotTurn.answerShape` (Task 5 populates it on the snapshot);
  `evaluateOriginalTurn`'s new `answerShape` param (Task 6).
- Produces: the live evaluation call passes the turn's shape.

- [ ] **Step 1: Write the failing test**

`audio-upload.test.ts` already injects `deps.evaluateOriginalTurn`. Add a test
that a snapshot turn with `answerShape: "open"` reaches the injected evaluator
with that value:

```typescript
it("passes the snapshot turn's answerShape to the evaluator", async () => {
  const seen: Array<{ answerShape?: string }> = [];
  const fakeEvaluate: typeof evaluateOriginalTurn = async (input) => {
    seen.push({ answerShape: (input as { answerShape?: string }).answerShape });
    return {
      ok: true,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "correct",
        meaningUnderstood: true,
        targetPatternAttempted: true,
        correctionNeeded: false,
        correctionSeverity: "none",
        improvedSentence: null,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
      },
    };
  };
  // ...arrange an original_answer upload for a preset mission whose snapshot
  // turn has answerShape "open" (extend the existing test's snapshot fixture
  // with answer_shape/answerShape), non-exact transcript so the fast path is
  // skipped, then assert:
  expect(seen[0].answerShape).toBe("open");
});
```

Follow the arrangement of the nearest existing `original_answer` test in that
file; reuse its snapshot fixture, adding `answerShape: "open"` to the turn and
using a transcript that is NOT an exact target match.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/student-access/audio-upload.test.ts -t answerShape`
Expected: FAIL — evaluator receives `undefined`.

- [ ] **Step 3: Implement**

Derive the active turn's shape next to `targetExample` (~785-789). `snapshotTurn`
is the authored turn for preset/turn-1; for dynamic chat turns there is no
authored shape, so default `open`:

```typescript
const answerShape = snapshotTurn?.answerShape ?? "open";
```

In the evaluator call (~1114-1128), add the field:

```typescript
return evaluate({
  evaluationMode:
    snapshot.conversationMode === true ? "conversation" : "preset",
  missionQuestion: missionQuestion ?? undefined,
  targetPattern: snapshot.targetPattern,
  targetExample,
  level: snapshot.level,
  turnOrder: input.turnOrder,
  transcript,
  requireCompleteSentenceAnswers: snapshot.requireCompleteSentenceAnswers,
  koreanSpans,
  answerShape,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/student-access/audio-upload.test.ts -t answerShape`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/student-access/audio-upload.ts src/server/student-access/audio-upload.test.ts
git commit -m "feat: pass turn answerShape into the live evaluation call"
```

---

### Task 8: Regression guard — the vanilla/chocolate scenario

**Files:**
- Test: `src/server/ai/turn-evaluator.test.ts` (add scenario), reusing the fake
  client that lets us assert on the prompt payload.

**Interfaces:**
- Consumes: everything above. This is a documentation-grade guard test.

- [ ] **Step 1: Write the guard test**

Add to `turn-evaluator.test.ts` a test named exactly for the bug, asserting the
open branch does NOT instruct the model to substitute the example's choice, and
DOES instruct it to keep the child's choice:

```typescript
it("regression: chocolate answer is never coerced toward the vanilla example (open turn)", async () => {
  const requests: unknown[] = [];
  await evaluateOriginalTurn(
    {
      evaluationMode: "preset",
      answerShape: "open",
      missionQuestion: "Which ice cream is the best: vanilla, strawberry, or chocolate?",
      targetPattern: "I think ___ is the best.",
      targetExample: "I think vanilla ice cream is the best.",
      level: "elementary",
      transcript: "I think chocolate ice cream is the best.",
    },
    { apiKey: "test", client: captureClient(requests) },
  );
  const body = JSON.stringify(requests[0]);
  // Open branch must forbid swapping in the example's choice. Use a substring
  // that exists VERBATIM in openPresetInstructions (Task 6) — copy it exactly:
  expect(body).toContain("Never use needs_correction to replace the child's choice");
  // And the deleted fixed-mode "wrong answer -> targetExample" band-aid must
  // NOT appear on this open branch:
  expect(body).not.toContain("provide the assigned targetExample as the improvedSentence");
});
```

Note: the first assertion's string must match a substring you wrote verbatim in
`openPresetInstructions`. The Task 6 draft phrases it "Never use needs_correction
to replace the child's choice with the example's choice." — keep that wording so
this assertion passes without adjustment.

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/server/ai/turn-evaluator.test.ts -t regression`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/ai/turn-evaluator.test.ts
git commit -m "test: regression guard for opinion-turn coercion (chocolate/vanilla)"
```

---

### Task 9: Full suite + typecheck, then UAT note

**Files:**
- Create: `docs/tasks/2026-07-25-answer-shape-uat.md`

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. Fix any breakage from renamed/added fields before proceeding.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint` (use the project's actual script names — check `package.json`).
Expected: clean.

- [ ] **Step 3: Write the UAT note**

Create `docs/tasks/2026-07-25-answer-shape-uat.md` describing the manual check
(ear-verifiable by the user on a real device, per project convention):

```markdown
# Answer Shape UAT — 2026-07-25

Preconditions: apply migration 202607250001; re-save (edit + save) one mission
that has an opinion turn so the classifier runs (existing missions default to
open until re-saved, which is also correct behaviour).

1. Open a mission with an opinion turn, e.g. "Which ice cream is the best:
   vanilla, strawberry, or chocolate?" (target example mentions vanilla).
2. As a student, answer with a DIFFERENT valid choice using the frame:
   "I think chocolate ice cream is the best."
   EXPECT: accepted immediately. No hint, no repeat, no coercion to vanilla.
3. Answer the same turn with just "Chocolate."
   EXPECT: gentle correction to "I think chocolate is the best." (the child's
   own choice in the frame) — NOT vanilla.
4. Open a fixed turn (e.g. a "how do you say ___" drill) and give a wrong
   answer. EXPECT: still corrected toward the target as before.

Log the attempt with the inspect-attempts tool and confirm turn 1 shows
outcome accepted without a repeat.
```

- [ ] **Step 4: Commit**

```bash
git add docs/tasks/2026-07-25-answer-shape-uat.md
git commit -m "docs: answer-shape UAT script"
```

---

## Notes for the implementer

- **Migration command:** confirm the project's actual Supabase migration/apply
  command from `package.json` or `AGENTS.md` before Task 2 Step 2. Do not
  guess-run destructive DB commands.
- **Test-file existence:** several tasks say "create if absent." Check first
  with a directory listing; if a suite exists, extend it rather than replacing.
- **Exact substrings:** Tasks 6/8 assert on instruction substrings. After
  writing `openPresetInstructions`, copy the real substring into the assertions
  so they match verbatim.
- **Do NOT touch conversation mode.** Open turns are a *preset* branch; the
  conversation path is unchanged.
- **Backfill is out of scope.** Legacy turns stay `open` (correct default) until
  their mission is next saved.
