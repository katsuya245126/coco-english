# Korean Phrase Hints and VN Chatbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every recordable Coco prompt on-demand Korean meanings for zero to three useful semantic phrases, remove stale dynamic pattern hints, and make completion narration say only `Mission complete!`.

**Architecture:** The browser sends only a bounded line descriptor. A student-gated server resolver loads the exact prompt from the assignment snapshot or persisted `attempt_turns.coco_line`, then a cache-first adapter selects and translates validated phrase spans. A focused client dialogue component preserves the original inline English, turns only returned spans into controls, and anchors a Korean-only bubble to the active phrase; `MascotStage` keeps its existing sprite, expression, crop, and speaking-pulse ownership.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, OpenAI Responses structured outputs with injected fake clients, Supabase Postgres/RLS, Vitest.

## Global Constraints

- MVP target locale is Korean (`ko`), defined once in server code and passed through locale-aware adapter/cache interfaces.
- Translation applies only to recordable `mission_prompt` and `coco_dynamic_line` descriptors; the client never submits arbitrary source text or a digest.
- Select zero to three exact, ordered, non-overlapping semantic phrases; do not select isolated function words or cover every word.
- English remains in its original inline sentence layout. Clicking Hint reveals phrase affordances; clicking a phrase opens one anchored bubble containing Korean only.
- No fixed translation panel, full-sentence translation, word-bank chip layout, press-and-hold requirement, heart/token economy, grade, or completion gate.
- Translation failure is retryable and never blocks English text, TTS, recording, or completion.
- Preset missions retain their pattern → word bank → full example ladder and gain translation. Conversation mode removes the pattern-derived single hint and uses translation only.
- The full completion explanation remains visible, but completion TTS and assignment-time cache warming use only `Mission complete!`.
- Keep the current mascot sprites, backdrop, crop, expression changes, pulse animation, TTS state machine, 44×44 TTS target, and `Play Coco` accessible label unchanged.
- Use `#2563EB`, existing pale-blue surfaces, 6–8px radii, 14–16px tab labels, visible focus, and current mobile width constraints.
- Automated tests inject fake provider clients and make no paid OpenAI calls.
- Implement after `2026-07-15-dynamic-conversation-repair.md`; its direct dynamic flow and resume behavior are assumed present.
- Preserve all unrelated dirty teacher-workspace files and untracked local files.

---

## File Map

- Create `src/domain/ai/translation-hint.ts`: request/response types, exact-span validation, stop-word rejection, and render segmentation.
- Create `tests/domain/translation-hint.test.ts`: pure schema, span, selection, and segmentation tests.
- Create `src/server/ai/translation-hint-generator.ts`: injected Responses adapter and semantic-selection prompt.
- Create `tests/server/translation-hint-generator.test.ts`: fake-client, schema, and no-paid-call tests.
- Create `supabase/migrations/202607150001_translation_hint_cache.sql`: service-role-only persistent cache.
- Modify `src/lib/db/types.ts`: `translation_hint_cache` generated-shape entry.
- Create `tests/schema/translation-hint-cache-schema.test.ts`: migration constraints and RLS test.
- Create `src/server/ai/translation-hint-cache.ts`: digest + level + locale cache-first service.
- Create `tests/server/translation-hint-cache.test.ts`: hit/miss/failure/cache-validation tests.
- Create `src/server/student-access/translation-source.ts`: owned snapshot/dynamic line resolution.
- Create `tests/server/translation-source.test.ts`: ownership and provenance tests.
- Create `src/app/student/missions/[assignmentStudentId]/translation-hint/route.ts`: student-gated descriptor endpoint.
- Create `tests/server/translation-hint-route-source.test.ts`: route boundary and failure mapping checks.
- Create `src/components/student/CocoDialogueBox.tsx`: folder tabs, on-demand fetch, inline phrase buttons, anchored Korean bubble.
- Modify `src/components/student/MascotStage.tsx`: delegate dialogue controls/text to the new component without changing sprite behavior.
- Modify `src/components/student/styles.ts`: shared VN tab/dialogue/phrase styles.
- Modify `src/components/student/MissionFlowShell.tsx`: pass the active recordable line descriptor to `MascotStage`.
- Modify `src/domain/mission/student-question-state.ts`: distinguish preset questions from conversation questions and remove `singleHint`.
- Modify `src/domain/mission/student-question-state.test.ts`: preset-ladder and conversation-translation-only state tests.
- Modify `src/components/student/HintRevealer.tsx`: preset ladder only.
- Modify `src/components/student/StepBuddyQuestion.tsx`: render answer-help ladder only when supplied.
- Modify `tests/server/student-mission-flow.test.ts`: preset ladder remains; dynamic pattern hint is gone.
- Modify `tests/domain/tts-ui-source.test.ts`: tab placement, sprite preservation, and TTS-regression source contracts.
- Modify `src/app/student/missions/[assignmentStudentId]/tts/route.ts`: resolve completion narration to the profile heading only.
- Modify `src/server/mission/assign-service.ts`: warm only the short completion heading.
- Modify `tests/server/mission-assign.test.ts`: assert the short completion cache entry and reject the administrative body.

### Task 1: Translation Hint Domain Contract and Exact-Span Validation

**Files:**
- Create: `src/domain/ai/translation-hint.ts`
- Create: `tests/domain/translation-hint.test.ts`

**Interfaces:**
- Consumes: `MissionLevel` from `src/domain/mission/schemas.ts`.
- Produces: `TranslationPhrase`, `TranslationHint`, `TranslatableCocoLine`, `translationHintSchema`, `translationHintRequestSchema`, `parseTranslationHint(sourceText, value)`, and `buildTranslationSegments(sourceText, phrases)`.

- [x] **Step 1: Write failing pure-domain tests**

Create `tests/domain/translation-hint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildTranslationSegments,
  parseTranslationHint,
  translationHintRequestSchema,
} from "@/domain/ai/translation-hint";

describe("translation hint domain contract", () => {
  const sourceText = "How often do you play soccer?";

  it("accepts zero to three exact semantic phrases in source order", () => {
    expect(
      parseTranslationHint(sourceText, {
        phrases: [
          {
            source: "How often",
            start: 0,
            end: 9,
            translation: "얼마나 자주",
          },
          {
            source: "play soccer",
            start: 17,
            end: 28,
            translation: "축구를 하다",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source: "How often",
            start: 0,
            end: 9,
            translation: "얼마나 자주",
          },
          {
            source: "play soccer",
            start: 17,
            end: 28,
            translation: "축구를 하다",
          },
        ],
      },
    });
    expect(parseTranslationHint(sourceText, { phrases: [] })).toEqual({
      ok: true,
      hint: { phrases: [] },
    });
  });

  it.each([
    {
      name: "more than three phrases",
      phrases: [
        { source: "How", start: 0, end: 3, translation: "어떻게" },
        { source: "often", start: 4, end: 9, translation: "자주" },
        { source: "play", start: 17, end: 21, translation: "하다" },
        { source: "soccer", start: 22, end: 28, translation: "축구" },
      ],
    },
    {
      name: "overlap",
      phrases: [
        { source: "How often", start: 0, end: 9, translation: "얼마나 자주" },
        { source: "often do", start: 4, end: 12, translation: "자주 하다" },
      ],
    },
    {
      name: "reordered",
      phrases: [
        { source: "soccer", start: 22, end: 28, translation: "축구" },
        { source: "How often", start: 0, end: 9, translation: "얼마나 자주" },
      ],
    },
    {
      name: "out of bounds",
      phrases: [
        { source: "soccer?", start: 22, end: 99, translation: "축구" },
      ],
    },
    {
      name: "substring mismatch",
      phrases: [
        { source: "How many", start: 0, end: 9, translation: "얼마나 많이" },
      ],
    },
    {
      name: "empty Korean",
      phrases: [
        { source: "How often", start: 0, end: 9, translation: "   " },
      ],
    },
    {
      name: "isolated function word",
      phrases: [
        { source: "you", start: 13, end: 16, translation: "너" },
      ],
    },
  ])("rejects $name", ({ phrases }) => {
    expect(parseTranslationHint(sourceText, { phrases })).toEqual({
      ok: false,
      error: "schema_failed",
    });
  });

  it("segments English without changing spaces or punctuation", () => {
    const parsed = parseTranslationHint(sourceText, {
      phrases: [
        {
          source: "How often",
          start: 0,
          end: 9,
          translation: "얼마나 자주",
        },
      ],
    });
    if (!parsed.ok) throw new Error("fixture must be valid");

    expect(buildTranslationSegments(sourceText, parsed.hint.phrases)).toEqual([
      {
        kind: "phrase",
        text: "How often",
        phrase: parsed.hint.phrases[0],
      },
      { kind: "text", text: " do you play soccer?" },
    ]);
  });

  it("accepts only recordable Coco prompt descriptors", () => {
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "mission_prompt",
        turnOrder: 1,
      }).success,
    ).toBe(true);
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "coco_dynamic_line",
        turnOrder: 1,
      }).success,
    ).toBe(true);
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "student_transcript",
        turnOrder: 1,
      }).success,
    ).toBe(false);
    expect(
      translationHintRequestSchema.safeParse({
        lineKind: "mission_prompt",
        turnOrder: 1,
        sourceText,
      }).success,
    ).toBe(false);
  });
});
```

- [x] **Step 2: Run the domain test and verify RED**

Run:

```bash
npx vitest run tests/domain/translation-hint.test.ts
```

Expected: FAIL because `src/domain/ai/translation-hint.ts` does not exist.

- [x] **Step 3: Implement the pure contract**

Create `src/domain/ai/translation-hint.ts` with these public types:

```ts
import { z } from "zod";

export const TRANSLATABLE_COCO_LINE_KINDS = [
  "mission_prompt",
  "coco_dynamic_line",
] as const;

export type TranslatableCocoLine = {
  lineKind: (typeof TRANSLATABLE_COCO_LINE_KINDS)[number];
  turnOrder: number;
};

export type TranslationPhrase = {
  source: string;
  start: number;
  end: number;
  translation: string;
};

export type TranslationHint = {
  phrases: TranslationPhrase[];
};

export type TranslationSegment =
  | { kind: "text"; text: string }
  | { kind: "phrase"; text: string; phrase: TranslationPhrase };
```

Export strict phrase/hint Zod schemas using `.max(3)`, positive/nonnegative integer bounds, and trimmed nonempty strings:

```ts
export const translationPhraseSchema = z
  .object({
    source: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    translation: z.string().trim().min(1),
  })
  .strict();

export const translationHintSchema = z
  .object({
    phrases: z.array(translationPhraseSchema).max(3),
  })
  .strict();
```

The request schema must also be `.strict()` so `sourceText`, `targetLocale`, and client digests are rejected:

```ts
export const translationHintRequestSchema = z
  .object({
    lineKind: z.enum(TRANSLATABLE_COCO_LINE_KINDS),
    turnOrder: z.coerce.number().int().positive(),
  })
  .strict();
```

Define an explicit lowercased function-word set containing:

```ts
const ISOLATED_FUNCTION_WORDS = new Set([
  "a", "an", "the", "do", "does", "did", "am", "is", "are", "was",
  "were", "to", "of", "and", "or", "you", "i", "he", "she", "it",
  "we", "they",
]);
```

`parseTranslationHint` must first Zod-parse, then walk phrases in given order and reject when `start >= end`, `end > sourceText.length`, `start < previousEnd`, `sourceText.slice(start, end) !== source`, translation is blank, or `source.trim().toLowerCase()` is an isolated function word. Return only:

```ts
export type ParseTranslationHintResult =
  | { ok: true; hint: TranslationHint }
  | { ok: false; error: "schema_failed" };
```

`buildTranslationSegments` must append untouched gaps, phrase segments, and the final untouched tail. It accepts only already validated phrases and never uses HTML.

- [x] **Step 4: Run the domain test and verify GREEN**

Run:

```bash
npx vitest run tests/domain/translation-hint.test.ts
```

Expected: all translation-domain tests PASS.

- [x] **Step 5: Commit the domain contract**

```bash
git add src/domain/ai/translation-hint.ts tests/domain/translation-hint.test.ts
git commit -m "feat(11): validate semantic translation phrase spans"
```

### Task 2: Fake-Client Translation Selector Adapter

**Files:**
- Create: `src/server/ai/translation-hint-generator.ts`
- Create: `tests/server/translation-hint-generator.test.ts`

**Interfaces:**
- Consumes: `parseTranslationHint`, `TranslationHint`, and `MissionLevel`.
- Produces: `generateTranslationHint({ sourceText, studentLevel, targetLocale }, deps)` and `GenerateTranslationHintResult`.

- [x] **Step 1: Write failing adapter tests**

Create tests that use an injected client matching the existing `responses.parse` adapter convention:

```ts
import { describe, expect, it, vi } from "vitest";
import type { TranslationHintResponsesClient } from "@/server/ai/translation-hint-generator";

function createFakeClient(outputParsed: unknown): TranslationHintResponsesClient {
  return {
    responses: {
      parse: vi.fn(async () => ({ output_parsed: outputParsed })) as
        TranslationHintResponsesClient["responses"]["parse"],
    },
  };
}

describe("generateTranslationHint", () => {
  it("returns validated Korean semantic phrases from a fake client", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    const client = createFakeClient({
      phrases: [
        {
          source: "How often",
          start: 0,
          end: 9,
          translation: "얼마나 자주",
        },
      ],
    });

    const result = await generateTranslationHint(
      {
        sourceText: "How often do you play soccer?",
        studentLevel: "elementary",
        targetLocale: "ko",
      },
      { apiKey: "test-key", model: "test-model", client },
    );

    expect(result).toEqual({
      ok: true,
      hint: {
        phrases: [
          {
            source: "How often",
            start: 0,
            end: 9,
            translation: "얼마나 자주",
          },
        ],
      },
    });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model" }),
    );
  });

  it("instructs the selector not to translate every word or isolated function words", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    const client = createFakeClient({ phrases: [] });

    await generateTranslationHint(
      {
        sourceText: "How often do you play soccer?",
        studentLevel: "elementary",
        targetLocale: "ko",
      },
      { apiKey: "test-key", client },
    );

    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const user = request?.input.find((message) => message.role === "user");
    const prompt = JSON.parse(user?.content ?? "{}") as {
      instructions?: string[];
    };
    expect(prompt.instructions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("zero to three"),
        expect.stringContaining("semantic meaning units"),
        expect.stringContaining("Do not select isolated function words"),
        expect.stringContaining("Do not cover every word"),
        expect.stringContaining("exact substring"),
      ]),
    );
  });

  it("rejects malformed provider spans after structured parsing", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    const client = createFakeClient({
      phrases: [
        { source: "How many", start: 0, end: 9, translation: "얼마나 많이" },
      ],
    });
    expect(
      await generateTranslationHint(
        {
          sourceText: "How often do you play soccer?",
          studentLevel: "elementary",
          targetLocale: "ko",
        },
        { apiKey: "test-key", client },
      ),
    ).toEqual({ ok: false, error: "schema_failed" });
  });

  it("returns missing_api_key without calling a provider", async () => {
    const { generateTranslationHint } = await import(
      "@/server/ai/translation-hint-generator"
    );
    expect(
      await generateTranslationHint(
        {
          sourceText: "How often do you play soccer?",
          studentLevel: "elementary",
          targetLocale: "ko",
        },
        { apiKey: "" },
      ),
    ).toEqual({ ok: false, error: "missing_api_key" });
  });
});
```

- [x] **Step 2: Run adapter tests and verify RED**

Run:

```bash
npx vitest run tests/server/translation-hint-generator.test.ts
```

Expected: FAIL because the adapter does not exist.

- [x] **Step 3: Implement the adapter**

Follow `turn-evaluator.ts`'s injected-client shape. Export:

```ts
export type TranslationHintResponsesClient = {
  responses: {
    parse(input: {
      model: string;
      input: Array<{
        role: "system" | "user";
        content: string;
      }>;
      text: { format: unknown };
    }): Promise<{ output_parsed?: unknown }>;
  };
};

export type GenerateTranslationHintInput = {
  sourceText: string;
  studentLevel: MissionLevel;
  targetLocale: string;
};

export type GenerateTranslationHintDeps = {
  apiKey?: string;
  model?: string;
  client?: TranslationHintResponsesClient;
};

export type GenerateTranslationHintResult =
  | { ok: true; hint: TranslationHint }
  | {
      ok: false;
      error: "missing_api_key" | "provider_failed" | "schema_failed";
    };
```

Use `OPENAI_TRANSLATION_HINT_MODEL`, falling back to `gpt-4.1-mini`. Build the user JSON with the exact three input fields plus these instructions:

```ts
instructions: [
  "Return zero to three useful semantic meaning units in source order.",
  "Prefer contextual chunks, idioms, and level-appropriate difficult phrases.",
  "Do not select isolated function words such as do, the, or you.",
  "Do not cover every word or turn the complete sentence into clickable pieces.",
  "For each phrase, source must be the exact substring sourceText.slice(start, end).",
  "Translate only that phrase's contextual meaning into targetLocale.",
]
```

Use `zodTextFormat` with the base structured schema, then call `parseTranslationHint(input.sourceText, response.output_parsed)` before returning success. Log only provider/model/error metadata; do not log source text.

- [x] **Step 4: Run adapter and domain tests**

Run:

```bash
npx vitest run tests/server/translation-hint-generator.test.ts tests/domain/translation-hint.test.ts
```

Expected: both files PASS with fake clients only.

- [x] **Step 5: Commit the provider adapter**

```bash
git add src/server/ai/translation-hint-generator.ts tests/server/translation-hint-generator.test.ts
git commit -m "feat(11): generate Korean semantic phrase hints"
```

### Task 3: Persistent Locale-Aware Translation Cache

**Files:**
- Create: `supabase/migrations/202607150001_translation_hint_cache.sql`
- Modify: `src/lib/db/types.ts`
- Create: `tests/schema/translation-hint-cache-schema.test.ts`
- Create: `src/server/ai/translation-hint-cache.ts`
- Create: `tests/server/translation-hint-cache.test.ts`

**Interfaces:**
- Consumes: `generateTranslationHint` from Task 2 and validated `TranslationHint` data.
- Produces: `DEFAULT_TRANSLATION_LOCALE = "ko"`, `computeTranslationSourceDigest(sourceText)`, and `getOrCreateTranslationHint(input, deps)` returning `cacheStatus: "hit" | "miss"`.

- [x] **Step 1: Write failing migration tests**

Create `tests/schema/translation-hint-cache-schema.test.ts` and assert the migration contains:

```ts
expect(migration).toContain("create table public.translation_hint_cache");
expect(migration).toContain("source_digest text not null");
expect(migration).toContain("student_level text not null");
expect(migration).toContain("target_locale text not null");
expect(migration).toContain("phrases jsonb not null");
expect(migration).toContain(
  "unique (source_digest, student_level, target_locale)",
);
expect(migration).toContain(
  "alter table public.translation_hint_cache enable row level security",
);
expect(migration).toContain(
  "grant select, insert, update, delete on table public.translation_hint_cache to service_role",
);
expect(migration).not.toContain("create policy");
```

- [x] **Step 2: Run migration tests and verify RED**

Run:

```bash
npx vitest run tests/schema/translation-hint-cache-schema.test.ts
```

Expected: FAIL because the migration file does not exist.

- [x] **Step 3: Add the service-role-only cache table and DB types**

Create an additive migration with this table shape:

```sql
create table public.translation_hint_cache (
  id uuid primary key default gen_random_uuid(),
  source_digest text not null,
  student_level text not null,
  target_locale text not null,
  phrases jsonb not null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  unique (source_digest, student_level, target_locale)
);

alter table public.translation_hint_cache enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete
  on table public.translation_hint_cache
  to service_role;
```

Do not store `sourceText`, assignment IDs, student IDs, or transcripts in this cache. Add the corresponding `Row`, `Insert`, `Update`, and empty `Relationships` entry to `src/lib/db/types.ts`.

- [x] **Step 4: Run migration tests and verify GREEN**

Run:

```bash
npx vitest run tests/schema/translation-hint-cache-schema.test.ts
```

Expected: PASS.

- [x] **Step 5: Write failing cache-service tests**

Create a Supabase mock following `tests/server/tts-cache.test.ts`, then test:

```ts
it("generates once and hits cache for the same source, level, and locale", async () => {
  const { getOrCreateTranslationHint } = await import(
    "@/server/ai/translation-hint-cache"
  );
  const generate = vi.fn(async () => ({
    ok: true as const,
    hint: {
      phrases: [
        {
          source: "How often",
          start: 0,
          end: 9,
          translation: "얼마나 자주",
        },
      ],
    },
  }));
  const input = {
    sourceText: "How often do you play soccer?",
    studentLevel: "elementary" as const,
    targetLocale: "ko",
  };

  expect(await getOrCreateTranslationHint(input, { generate })).toMatchObject({
    ok: true,
    cacheStatus: "miss",
  });
  expect(await getOrCreateTranslationHint(input, { generate })).toMatchObject({
    ok: true,
    cacheStatus: "hit",
  });
  expect(generate).toHaveBeenCalledTimes(1);
});
```

Also test that changing `studentLevel` or `targetLocale` changes query filters, a select/upsert error returns `{ ok: false, error: "cache_failed" }`, provider failure returns `{ ok: false, error: "generation_failed" }`, and an invalid cached span is never returned to the client.

- [x] **Step 6: Run cache tests and verify RED**

Run:

```bash
npx vitest run tests/server/translation-hint-cache.test.ts
```

Expected: FAIL because the cache service does not exist.

- [x] **Step 7: Implement exact-text digest and cache-first lookup**

Create `src/server/ai/translation-hint-cache.ts`. Export:

```ts
export const DEFAULT_TRANSLATION_LOCALE = "ko" as const;

export function computeTranslationSourceDigest(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

export type GetOrCreateTranslationHintResult =
  | {
      ok: true;
      cacheStatus: "hit" | "miss";
      hint: TranslationHint;
    }
  | { ok: false; error: "cache_failed" | "generation_failed" };

export type GetOrCreateTranslationHintInput = {
  sourceText: string;
  studentLevel: MissionLevel;
  targetLocale: string;
};

export type GetOrCreateTranslationHintDeps = {
  generate?: (
    input: GetOrCreateTranslationHintInput,
  ) => Promise<GenerateTranslationHintResult>;
};
```

Query `translation_hint_cache` by `source_digest`, `student_level`, and `target_locale`. Revalidate cached `phrases` with `parseTranslationHint(sourceText, { phrases })`; return a hit only when valid. On a miss, call the injected `generate` or `generateTranslationHint`, then upsert with `onConflict: "source_digest,student_level,target_locale"`. Treat select/upsert errors as retryable cache failures and never return unvalidated cache/provider JSON.

- [x] **Step 8: Run cache, adapter, domain, and schema tests**

Run:

```bash
npx vitest run tests/server/translation-hint-cache.test.ts tests/server/translation-hint-generator.test.ts tests/domain/translation-hint.test.ts tests/schema/translation-hint-cache-schema.test.ts
```

Expected: all four files PASS.

- [x] **Step 9: Commit persistent caching**

```bash
git add supabase/migrations/202607150001_translation_hint_cache.sql src/lib/db/types.ts tests/schema/translation-hint-cache-schema.test.ts src/server/ai/translation-hint-cache.ts tests/server/translation-hint-cache.test.ts
git commit -m "feat(11): cache locale-aware phrase translations"
```

### Task 4: Resolve Only Server-Owned Prompt Text

**Files:**
- Create: `src/server/student-access/translation-source.ts`
- Create: `tests/server/translation-source.test.ts`
- Create: `src/app/student/missions/[assignmentStudentId]/translation-hint/route.ts`
- Create: `tests/server/translation-hint-route-source.test.ts`

**Interfaces:**
- Consumes: student ID from `readStudentUnlock`, assignment-student ID from route params, `TranslatableCocoLine`, mission snapshot schema, and Task 3 cache service.
- Produces: `resolveOwnedTranslationSource(input)` returning `{ sourceText, studentLevel }` or `not_found`; POST route returning validated phrases or retryable unavailability.

- [x] **Step 1: Write failing provenance tests**

Create resolver tests with a mocked service-role Supabase client. Cover these exact results:

```ts
expect(
  await resolveOwnedTranslationSource({
    studentId: "student-1",
    assignmentStudentId: "as-1",
    line: { lineKind: "mission_prompt", turnOrder: 1 },
  }),
).toEqual({
  ok: true,
  source: {
    sourceText: "How often do you play soccer?",
    studentLevel: "elementary",
  },
});
```

For `coco_dynamic_line`, assert the result uses `attempt_turns.coco_line` from `assignment_students.latest_attempt_id` and the requested turn order, not `mission_snapshot.turns[].prompt`. Add failures for wrong student ownership, canceled assignment, missing snapshot turn, and missing dynamic row. Assert the resolver filters `attempt_turns.attempt_id` to the latest attempt so restarted missions cannot create duplicate turn-order matches.

- [x] **Step 2: Run resolver tests and verify RED**

Run:

```bash
npx vitest run tests/server/translation-source.test.ts
```

Expected: FAIL because the resolver does not exist.

- [x] **Step 3: Implement the owned resolver**

Export:

```ts
export type ResolveOwnedTranslationSourceResult =
  | {
      ok: true;
      source: {
        sourceText: string;
        studentLevel: MissionLevel;
      };
    }
  | { ok: false; error: "not_found" | "db_error" };
```

Perform the same app-level ownership query as TTS, including the current attempt pointer:

```ts
.from("assignment_students")
.select("id, student_id, latest_attempt_id, assignments(mission_snapshot, canceled_at)")
.eq("id", assignmentStudentId)
.eq("student_id", studentId)
.maybeSingle();
```

Parse `mission_snapshot` before reading level or turns. Resolve `mission_prompt` only from the matching immutable snapshot turn. Resolve `coco_dynamic_line` only from `attempt_turns.coco_line` filtered by `latest_attempt_id` plus requested `turn_order`. Trim only to test non-emptiness; return the persisted/source string itself so indices match exact rendered text.

- [x] **Step 4: Run resolver tests and verify GREEN**

Run:

```bash
npx vitest run tests/server/translation-source.test.ts
```

Expected: all provenance/ownership tests PASS.

- [x] **Step 5: Write failing route boundary tests**

Create a source-contract test that asserts the route:

```ts
expect(routeSource).toContain("translationHintRequestSchema.safeParse");
expect(routeSource).toContain("readStudentUnlock");
expect(routeSource).toContain("resolveOwnedTranslationSource");
expect(routeSource).toContain("DEFAULT_TRANSLATION_LOCALE");
expect(routeSource).toContain("getOrCreateTranslationHint");
expect(routeSource).not.toMatch(/body\.(sourceText|text|contentHash|sourceDigest)/);
expect(routeSource).toContain('error: "translation_unavailable_retryable"');
```

- [x] **Step 6: Run route boundary tests and verify RED**

Run:

```bash
npx vitest run tests/server/translation-hint-route-source.test.ts
```

Expected: FAIL because the route does not exist.

- [x] **Step 7: Implement the student-gated route**

The POST route must:

1. Return 401 `session_expired` when `readStudentUnlock()` is absent.
2. Parse JSON with `translationHintRequestSchema`; return 400 `invalid_input` on failure.
3. Call `resolveOwnedTranslationSource` with unlock student ID, route assignment ID, and parsed descriptor.
4. Map resolver `not_found` to 404 and `db_error` to retryable 502.
5. Call `getOrCreateTranslationHint` with resolved exact text/level and `DEFAULT_TRANSLATION_LOCALE`.
6. Return `{ ok: true, phrases, targetLocale }` on success.
7. Return 502 `{ ok: false, error: "translation_unavailable_retryable" }` for provider, schema, or cache failure.

The response must not return source text, a digest, provider metadata, or cache rows.

- [x] **Step 8: Run all server translation tests**

Run:

```bash
npx vitest run tests/server/translation-source.test.ts tests/server/translation-hint-route-source.test.ts tests/server/translation-hint-cache.test.ts tests/server/translation-hint-generator.test.ts
```

Expected: all server translation tests PASS.

- [x] **Step 9: Commit server-owned resolution and route**

```bash
git add src/server/student-access/translation-source.ts tests/server/translation-source.test.ts src/app/student/missions/'[assignmentStudentId]'/translation-hint/route.ts tests/server/translation-hint-route-source.test.ts
git commit -m "feat(11): serve hints from owned Coco prompt text"
```

### Task 5: Inline Phrase Interaction and Matched VN Tabs

**Files:**
- Create: `src/components/student/CocoDialogueBox.tsx`
- Modify: `src/components/student/MascotStage.tsx`
- Modify: `src/components/student/styles.ts`
- Modify: `tests/domain/tts-ui-source.test.ts`

**Interfaces:**
- Consumes: `TranslatableCocoLine`, `TranslationPhrase`, `buildTranslationSegments`, existing `voiceControl`, and existing dialogue text.
- Produces: a reusable dialogue box that owns Hint state and renders matched Coco/Hint/TTS tabs plus inline English/Korean phrase interaction.

- [x] **Step 1: Add failing VN/chatbox source tests**

Extend `tests/domain/tts-ui-source.test.ts`:

```ts
it("uses matched Coco, Hint, and TTS tabs while preserving the mascot stage", () => {
  const stageSource = readSource("src/components/student/MascotStage.tsx");
  const dialogueSource = readSource(
    "src/components/student/CocoDialogueBox.tsx",
  );
  const stylesSource = readSource("src/components/student/styles.ts");

  expect(stageSource).toContain("<CocoDialogueBox");
  expect(stageSource).toContain("SPRITE_BY_EXPRESSION");
  expect(stageSource).toContain("updateSpeakingVisual");
  expect(dialogueSource).toContain("displayName");
  expect(dialogueSource).toContain('>Hint<');
  expect(dialogueSource).toContain("voiceControl");
  expect(stylesSource).toContain('color: "#2563EB"');
  expect(stylesSource).toContain("minHeight: 44");
});

it("keeps English inline and shows Korean only in an anchored phrase bubble", () => {
  const dialogueSource = readSource(
    "src/components/student/CocoDialogueBox.tsx",
  );

  expect(dialogueSource).toContain("buildTranslationSegments");
  expect(dialogueSource).toContain('aria-expanded={isExpanded}');
  expect(dialogueSource).toContain("phrase.translation");
  expect(dialogueSource).not.toContain("phrase.source}</span>");
  expect(dialogueSource).not.toContain("dangerouslySetInnerHTML");
  expect(dialogueSource).not.toContain("onPointerDown");
  expect(dialogueSource).not.toContain("onTouchStart");
});

it("keeps translation failure retryable and recording-independent", () => {
  const dialogueSource = readSource(
    "src/components/student/CocoDialogueBox.tsx",
  );
  const shellSource = readSource(
    "src/components/student/MissionFlowShell.tsx",
  );

  expect(dialogueSource).toContain("Translation unavailable");
  expect(dialogueSource).toContain("loadTranslationHint");
  expect(dialogueSource).toContain("Retry translation");
  expect(shellSource).not.toMatch(
    /VoiceRecorderControl[\s\S]*disabled=\{.*translation/,
  );
});
```

- [x] **Step 2: Run source tests and verify RED**

Run:

```bash
npx vitest run tests/domain/tts-ui-source.test.ts
```

Expected: FAIL because `CocoDialogueBox.tsx` and the tab styles do not exist.

- [x] **Step 3: Implement `CocoDialogueBox` state and fetch contract**

Create props:

```ts
type CocoDialogueBoxProps = {
  assignmentStudentId: string;
  displayName: string;
  dialogueText?: string | null;
  voiceControl?: ReactNode;
  translationLine?: TranslatableCocoLine | null;
};
```

Use state:

```ts
type TranslationUiState =
  | { kind: "inactive" }
  | { kind: "loading" }
  | { kind: "ready"; phrases: TranslationPhrase[] }
  | { kind: "error" };

const [translationState, setTranslationState] =
  useState<TranslationUiState>({ kind: "inactive" });
const [expandedPhraseIndex, setExpandedPhraseIndex] =
  useState<number | null>(null);
```

Use this bounded route result type before parsing the response:

```ts
type TranslationHintRouteResult =
  | {
      ok: true;
      phrases: TranslationPhrase[];
      targetLocale: string;
    }
  | { ok: false; error?: string };
```

Reset both states whenever assignment ID, line kind, turn order, or dialogue text changes. `loadTranslationHint` must POST only:

```ts
JSON.stringify({
  lineKind: translationLine.lineKind,
  turnOrder: translationLine.turnOrder,
})
```

On non-OK/malformed response, set `error`; on success, validate again with `parseTranslationHint(dialogueText, { phrases: payload.phrases })` before setting `ready`. The client-side revalidation is defense-in-depth and rendering safety, not source-text authorization.

- [x] **Step 4: Render the matched controls and inline sentence**

Inside the existing white dialogue box, render one absolute top tab row:

```tsx
<div style={mascotDialogueTabsStyle}>
  <span style={mascotNameTabStyle}>{displayName}</span>
  {translationLine && dialogueText ? (
    <button
      type="button"
      aria-pressed={translationState.kind === "ready"}
      aria-busy={translationState.kind === "loading"}
      onClick={loadTranslationHint}
      style={mascotHintTabStyle}
    >
      Hint
    </button>
  ) : null}
  <span style={mascotVoiceTabStyle}>{voiceControl}</span>
</div>
```

When inactive/loading/error, render the unchanged `dialogueText` as one React text node. When ready, call `buildTranslationSegments` and render text segments as text nodes. Render phrase segments as inline wrappers containing a `<button>` with `aria-expanded={isExpanded}` and, only when expanded, an absolutely positioned `role="status"` bubble whose content is exactly `phrase.translation`. The bubble must not repeat `phrase.source`.

For error, keep the full English sentence visible and expose a compact button with accessible label/title `Retry translation` and visible copy `Translation unavailable`.

- [x] **Step 5: Add folder-tab and anchored-bubble styles**

In `src/components/student/styles.ts`:

- Increase dialogue text top padding/usable height while keeping the stage height, sprite frame, backdrop, crop, and bottom position unchanged.
- Add a left-aligned tab row protruding from the box top edge.
- Give Coco a solid `#2563EB` tab with white text.
- Give Hint the existing pale-blue surface with `#2563EB` text and a visible border/active state.
- Give the TTS wrapper the matched tab silhouette but do not alter `CocoSpeechAudio`'s internal 44×44 button.
- Use 6–8px top radii and 14–16px semibold labels.
- Style phrase buttons with visible boundaries, inherited 18px dialogue typography, keyboard focus, and a minimum 44px hit area using inline-block padding/negative block margin so the sentence remains inline.
- Position the Korean bubble `absolute` above or below its phrase wrapper with a higher z-index, max width that fits the 16px phone insets, and no effect on surrounding sentence layout.

- [x] **Step 6: Delegate only dialogue rendering from `MascotStage`**

Add `assignmentStudentId` and `translationLine` props to `MascotStage`, import `CocoDialogueBox`, and replace only the existing inner `mascotDialogueBoxStyle` JSX with:

```tsx
<CocoDialogueBox
  assignmentStudentId={assignmentStudentId}
  displayName={displayName}
  dialogueText={dialogueText}
  voiceControl={voiceControl}
  translationLine={translationLine}
/>
```

Do not change `SPRITE_BY_EXPRESSION`, Image props, stage geometry, animation effects, amplitude handling, or `deriveExpression`.

- [x] **Step 7: Run TTS/VN source tests**

Run:

```bash
npx vitest run tests/domain/tts-ui-source.test.ts tests/domain/translation-hint.test.ts
```

Expected: PASS. Existing `Play Coco`, native `<audio>`, no-Web-Audio, sprite, crop, and pulse assertions remain green.

- [x] **Step 8: Commit VN tabs and inline phrase UI**

```bash
git add src/components/student/CocoDialogueBox.tsx src/components/student/MascotStage.tsx src/components/student/styles.ts tests/domain/tts-ui-source.test.ts
git commit -m "feat(11): add VN phrase-hint dialogue tabs"
```

### Task 6: Wire Recordable Prompts and Remove Dynamic Pattern Hints

**Files:**
- Modify: `src/domain/mission/student-question-state.ts`
- Modify: `src/domain/mission/student-question-state.test.ts`
- Modify: `src/components/student/HintRevealer.tsx`
- Modify: `src/components/student/StepBuddyQuestion.tsx`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `tests/server/student-mission-flow.test.ts`

**Interfaces:**
- Consumes: `translationLine` prop from Task 5 and the existing active question line descriptor.
- Produces: preset questions with answer-help ladder plus translation; conversation opener/dynamic questions with translation only.

- [x] **Step 1: Write failing question-state tests**

Replace authored/dynamic expectations with mode-specific kinds:

```ts
it("keeps the answer-help ladder for preset missions", () => {
  expect(
    deriveActiveStudentQuestion({
      conversationMode: false,
      turnIndex: 0,
      turns: [opener],
      dynamicPrompt: null,
    }),
  ).toEqual({
    kind: "preset",
    prompt: opener.prompt,
    activeTurnOrder: 1,
    hintLadder: opener.hintLadder,
    targetExample: opener.targetExample,
    recordingEnabled: true,
    line: { lineKind: "mission_prompt", turnOrder: 1 },
  });
});

it("uses translation-only question state for a conversation opener", () => {
  const question = deriveActiveStudentQuestion({
    conversationMode: true,
    turnIndex: 0,
    turns: [opener],
    dynamicPrompt: null,
  });
  expect(question).toEqual({
    kind: "conversation",
    prompt: opener.prompt,
    activeTurnOrder: 1,
    recordingEnabled: true,
    line: { lineKind: "mission_prompt", turnOrder: 1 },
  });
  expect(question).not.toHaveProperty("singleHint");
  expect(question).not.toHaveProperty("hintLadder");
});

it("uses translation-only question state for persisted dynamic prompts", () => {
  const question = deriveActiveStudentQuestion({
    conversationMode: true,
    turnIndex: 1,
    turns: [opener],
    dynamicPrompt: "What do you like to do instead?",
  });
  expect(question).toEqual({
    kind: "conversation",
    prompt: "What do you like to do instead?",
    activeTurnOrder: 2,
    recordingEnabled: true,
    line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
  });
  expect(question).not.toHaveProperty("singleHint");
});
```

- [x] **Step 2: Run question-state tests and verify RED**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts
```

Expected: FAIL because the current model returns `authored`/`dynamic` and adds `singleHint`.

- [x] **Step 3: Split preset and conversation question types**

Replace `AuthoredStudentQuestion` and `DynamicStudentQuestion` with:

```ts
type PresetStudentQuestion = {
  kind: "preset";
  prompt: string;
  activeTurnOrder: number;
  hintLadder: HintLadder;
  targetExample: string;
  recordingEnabled: true;
  line: StudentQuestionSpeechLine;
};

type ConversationStudentQuestion = {
  kind: "conversation";
  prompt: string;
  activeTurnOrder: number;
  recordingEnabled: true;
  line: StudentQuestionSpeechLine;
};
```

When `snapshotTurn` exists, return `conversation` without ladder/example if `conversationMode` is true; otherwise return `preset` with the existing ladder/example. For later conversation turns, require only a nonblank dynamic prompt and return `conversation`; remove the `patternExample` gate and `singleHint` construction. Keep the existing unavailable fail-closed branch.

- [x] **Step 4: Run question-state tests and verify GREEN**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts
```

Expected: PASS.

- [x] **Step 5: Make `HintRevealer` preset-ladder-only**

Replace the union with:

```ts
type HintRevealerProps = {
  hintLadder: HintLadder;
  hintLevel: number;
  onReveal: (nextLevel: number) => void;
};
```

Always use the existing three `TIER_LABELS`, `maxLevel = 3`, and tier content. Remove `singleHint` and its one-level branch. Do not change reveal telemetry or preset copy.

Change `StepBuddyQuestion` props so these three are optional as one discriminated answer-help object:

```ts
type AnswerHelpProps =
  | {
      hintLadder: HintLadder;
      hintLevel: number;
      onRevealHint: (nextLevel: number) => void;
    }
  | {
      hintLadder?: never;
      hintLevel?: never;
      onRevealHint?: never;
    };
```

Render `<HintRevealer>` only when `hintLadder` exists. Keep the recorder spacing at 16px whether or not the answer-help ladder exists.

- [x] **Step 6: Wire the descriptor into `MascotStage` and update question branches**

Pass:

```tsx
<MascotStage
  assignmentStudentId={assignmentStudentId}
  displayName={characterProfile.displayName}
  dialogueText={mascotDialogue.text}
  translationLine={
    flow.step === "question" &&
    activeQuestion.kind !== "unavailable"
      ? activeQuestion.line
      : null
  }
  voiceControl={
    mascotDialogue.line ? (
      <CocoSpeechAudio
        assignmentStudentId={assignmentStudentId}
        line={mascotDialogue.line}
        onAmplitudeFrame={handleMascotAmplitudeFrame}
        onPlayingChange={handleMascotPlayingChange}
      />
    ) : null
  }
  playing={mascotPlaying}
  amplitudeRef={mascotAmplitudeRef}
  step={flow.step}
  originalFeedbackKind={flow.originalFeedback?.kind}
  repeatFeedbackKind={flow.repeatFeedback?.kind}
/>
```

Retain the existing expression override in the real JSX. Render `StepBuddyQuestion` for `preset` with its ladder callbacks, and for `conversation` without hint props. Update repeat fallback checks to use `activeQuestion.kind === "preset"`; conversation repeats always use `flow.improvedSentence` from a real correction.

Do not pass translation descriptors for feedback, correction encouragement, repeat instructions, transitions, errors, or completion because those are not recordable prompts in this scope.

- [x] **Step 7: Update flow source contracts**

Replace the old `singleHint` assertions in `tests/server/student-mission-flow.test.ts` with:

```ts
expect(hintSource).toContain("hintLadder: HintLadder");
expect(hintSource).not.toContain("singleHint");
expect(questionSource).toContain("hintLadder?: never");
expect(shellSource).toContain('activeQuestion.kind === "preset"');
expect(shellSource).toContain('activeQuestion.kind === "conversation"');
expect(shellSource).toContain("translationLine={");
expect(shellSource).not.toContain("activeQuestion.singleHint");
```

Keep assertions that preset `HintRevealer`, dynamic prompt provenance, recording availability, and server-owned line descriptors remain present.

- [x] **Step 8: Run state, flow, and TTS tests**

Run:

```bash
npx vitest run src/domain/mission/student-question-state.test.ts tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts
```

Expected: all files PASS. Preset ladder remains three levels; conversation has no answer-pattern hint.

- [x] **Step 9: Commit mode-specific hint wiring**

```bash
git add src/domain/mission/student-question-state.ts src/domain/mission/student-question-state.test.ts src/components/student/HintRevealer.tsx src/components/student/StepBuddyQuestion.tsx src/components/student/MissionFlowShell.tsx tests/server/student-mission-flow.test.ts
git commit -m "feat(11): use translation-only hints in dynamic chat"
```

### Task 7: Short Completion Narration

**Files:**
- Modify: `src/app/student/missions/[assignmentStudentId]/tts/route.ts`
- Modify: `src/server/mission/assign-service.ts`
- Modify: `tests/domain/tts-ui-source.test.ts`
- Modify: `tests/server/mission-assign.test.ts`

**Interfaces:**
- Consumes: the existing `completion_celebration` TTS descriptor and `CharacterProfile.completionHeading`.
- Produces: on-demand and prewarmed completion audio whose exact text is `Mission complete!`; visible `StepMissionComplete` body copy is unchanged.

- [ ] **Step 1: Write failing completion narration regressions**

Add this source contract to `tests/domain/tts-ui-source.test.ts`:

```ts
it("speaks only the short completion heading", () => {
  const routeSource = readSource(
    "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
  );

  expect(routeSource).toContain('case "completion_celebration"');
  expect(routeSource).toContain("return profile.completionHeading;");
  expect(routeSource).not.toContain(
    "`${profile.completionHeading} ${profile.completionBody(turnCount)}`",
  );
});
```

In the existing assignment cache-warming test in `tests/server/mission-assign.test.ts`, replace the long completion string with `"Mission complete!"`, then add:

```ts
const warmedTexts = mockWarmTtsAudioCache.mock.calls[0]?.[0].texts ?? [];
expect(warmedTexts).not.toContain(
  "Mission complete! Great work! You finished all 1 turns. Your teacher will see your answers.",
);
```

- [ ] **Step 2: Run completion tests and verify RED**

Run:

```bash
npx vitest run tests/domain/tts-ui-source.test.ts tests/server/mission-assign.test.ts
```

Expected: both new assertions FAIL because the TTS route and assignment warmer still concatenate `completionBody`.

- [ ] **Step 3: Resolve and warm only the heading**

In `resolveLineText` inside `src/app/student/missions/[assignmentStudentId]/tts/route.ts`, replace the completion branch with:

```ts
case "completion_celebration":
  return profile.completionHeading;
```

Remove the now-unused `turnCount` argument from `resolveLineText` and its call site if TypeScript proves it is no longer needed elsewhere in that function.

In `buildAssignmentTtsWarmTexts` inside `src/server/mission/assign-service.ts`, replace the combined completion entry with:

```ts
profile.completionHeading,
```

Do not change `completionBody`, `StepMissionComplete`, or the visible completion props.

- [ ] **Step 4: Run completion tests and verify GREEN**

Run:

```bash
npx vitest run tests/domain/tts-ui-source.test.ts tests/server/mission-assign.test.ts tests/domain/character-profile.test.ts
```

Expected: all three files PASS; profile tests still prove the full visible body contains the turn count and teacher-review message.

- [ ] **Step 5: Commit short completion narration**

```bash
git add src/app/student/missions/'[assignmentStudentId]'/tts/route.ts src/server/mission/assign-service.ts tests/domain/tts-ui-source.test.ts tests/server/mission-assign.test.ts
git commit -m "fix(11): keep completion narration concise"
```

### Task 8: Full Verification, Migration Checkpoint, and Phone-Width UAT

**Files:**
- Verify production changes from Tasks 1-7.
- Modify: `.planning/STATE.md` only after real verification results are known.

**Interfaces:**
- Consumes: all tasks in this plan and the completed dynamic-conversation repair plan.
- Produces: verified cache schema, server boundary, accessible prompt interaction, and regression evidence.

- [ ] **Step 1: Run focused translation/chatbox tests**

```bash
npx vitest run tests/domain/translation-hint.test.ts tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts tests/server/translation-source.test.ts tests/server/translation-hint-route-source.test.ts tests/schema/translation-hint-cache-schema.test.ts src/domain/mission/student-question-state.test.ts tests/server/student-mission-flow.test.ts tests/domain/tts-ui-source.test.ts tests/server/mission-assign.test.ts tests/domain/character-profile.test.ts
```

Expected: all listed files PASS; fake clients are the only provider clients used.

- [ ] **Step 2: Run repository quality gates**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: TypeScript exits 0, ESLint exits 0, and the full Vitest suite exits 0.

- [ ] **Step 3: Apply and verify the additive migration**

After reviewing the target Supabase project, run the project's normal linked migration workflow:

```bash
npx supabase db push
npx supabase migration list --linked
```

Expected: `202607150001_translation_hint_cache.sql` appears in both local and remote migration columns. If the linked project is unavailable, stop before claiming database completion and record that exact blocker in `.planning/STATE.md`.

- [ ] **Step 4: Run deterministic feedback-state coverage**

With the app running at `http://localhost:3000` and disposable access values held only in environment variables:

```bash
FEEDBACK_STATE_CLASS_CODE="$FEEDBACK_STATE_CLASS_CODE" \
FEEDBACK_STATE_STUDENT_NAME="$FEEDBACK_STATE_STUDENT_NAME" \
FEEDBACK_STATE_PIN="$FEEDBACK_STATE_PIN" \
npm run test:student-feedback-states
```

Expected: suite exits 0; no reusable class access is committed.

- [ ] **Step 5: Verify the UI at phone and desktop widths**

At 375px and 420px viewport widths, and once at desktop width, verify:

1. The actual Coco sprite, current crop, expression changes, and speaking pulse are unchanged.
2. Coco and Hint tabs are top-left in one row; the matched TTS tab is top-right.
3. Tabs do not overlap the English dialogue.
4. TTS still shows loading/ready/playing/error behavior and the `Play Coco` accessible label.
5. Before Hint is pressed, English is ordinary inline text.
6. After Hint is pressed, no more than three useful phrase groups become visibly clickable.
7. Clicking `How often` shows only `얼마나 자주` in an anchored bubble; the bubble does not repeat `How often`.
8. Spaces, punctuation, and sentence order remain unchanged; no chip row or fixed translation panel appears.
9. Keyboard Tab reaches Hint and each phrase; Enter/Space activates them; focus is visible; phrase `aria-expanded` tracks the bubble.
10. Simulated route failure shows `Translation unavailable` plus retry while English, TTS, and recording stay usable.
11. Conversation opener and later dynamic prompt have translation but no pattern-answer hint.
12. Preset prompt has both translation and the existing three-tier answer-help ladder.
13. Completion keeps the full explanatory text visible while Coco says only `Mission complete!`.

Expected: all thirteen checks pass.

- [ ] **Step 6: Record truthful GSD completion state**

Update `.planning/STATE.md` YAML and prose together with the actual test results, migration state, and UI UAT result. Keep the optional three-heart/token policy in `Deferred Items`; do not mark Phase 11 complete unless every other Phase 11 requirement is complete.

- [ ] **Step 7: Commit verification state**

```bash
git add .planning/STATE.md
git commit -m "docs(11): record phrase-hint chatbox verification"
```
