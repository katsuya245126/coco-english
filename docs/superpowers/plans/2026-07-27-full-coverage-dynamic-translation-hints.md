# Full-Coverage Dynamic Translation Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generated conversation-mode Coco hints translate the full Coco line in natural Korean phrase chunks, including the important question when dialogue is paginated onto a second page.

**Architecture:** Keep the existing server-owned translation-source route and inline phrase-bubble UI. Replace the current short-chunk translation contract with a full-coverage phrase contract for generated Coco lines by widening the parser/model schema, updating the provider prompt, and bumping the cache version so old three-phrase rows are ignored.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, OpenAI Responses structured outputs, Supabase-backed `translation_hint_cache`.

## Global Constraints

- Preserve preset mission hint ladders and student answer hint levels.
- Do not expose arbitrary client-supplied dialogue text to translation; resolve source text server-side through `resolveOwnedTranslationSource`.
- Keep Korean translations inline in anchored phrase bubbles; do not replace the English Coco line with a Korean paragraph.
- Preserve student-data ownership checks, RLS assumptions, attempt state, audio storage, TTS, and teacher review behavior.
- Bump `TRANSLATION_HINT_POLICY_VERSION` so cached `translation-hint-v2-short-chunks` rows are missed.
- Use TDD: write or update the focused failing tests before implementation.
- Do not call OpenAI, Supabase, push, deploy, publish, or mutate production without separate exact approval.

---

## File Structure

- Modify `src/domain/ai/translation-hint.ts`: widen accepted phrase counts and keep deterministic parsing, ordering, filtering, segmentation, and page clamping.
- Modify `src/server/ai/translation-hint-generator.ts`: update the structured-output prompt from short selective chunks to full-coverage natural meaning chunks.
- Modify `src/server/ai/translation-hint-cache.ts`: change the cache policy version string.
- Modify `tests/domain/translation-hint.test.ts`: prove full-coverage phrase counts are accepted and page-two question spans survive clamping.
- Modify `tests/server/translation-hint-generator.test.ts`: prove the production prompt requests full coverage and no longer contains the old short-chunk rules.
- Modify `tests/server/translation-hint-cache.test.ts`: prove the new version misses old short-chunk cached rows.
- Optionally modify `tests/domain/tts-ui-source.test.ts` only if a source-boundary assertion names the old contract.

---

### Task 1: Widen the Translation Hint Domain Contract

**Files:**
- Modify: `src/domain/ai/translation-hint.ts`
- Test: `tests/domain/translation-hint.test.ts`

**Interfaces:**
- Consumes: `parseTranslationHint(sourceText: string, value: unknown): ParseTranslationHintResult`
- Produces: the same `TranslationHint` shape with more than three ordered phrase spans allowed.

- [ ] **Step 1: Write the failing tests**

Add this import to `tests/domain/translation-hint.test.ts` if it is not already present:

```ts
import { paginateDialogueText } from "@/domain/conversation/dialogue-pagination";
```

Replace the existing `"more than three phrases"` rejection case with a positive test:

```ts
it("accepts enough ordered phrase spans to cover a full Coco line", () => {
  const text =
    "That sounds fun! What do you like to play with your friends after school?";

  expect(
    parseTranslationHint(text, {
      phrases: [
        { source: "That sounds fun", translation: "재미있겠다" },
        { source: "What do you like to play", translation: "너는 무엇을 하는 것을 좋아해?" },
        { source: "with your friends", translation: "친구들과 함께" },
        { source: "after school", translation: "방과 후에" },
      ],
    }),
  ).toEqual({
    ok: true,
    hint: {
      phrases: [
        { source: "That sounds fun", start: 0, end: 15, translation: "재미있겠다" },
        {
          source: "What do you like to play",
          start: 17,
          end: 41,
          translation: "너는 무엇을 하는 것을 좋아해?",
        },
        { source: "with your friends", start: 42, end: 59, translation: "친구들과 함께" },
        { source: "after school", start: 60, end: 72, translation: "방과 후에" },
      ],
    },
  });
});
```

Add a page-two coverage test near `describe("clampPhrasesToPage", ...)`:

```ts
it("keeps translated question coverage on the second dialogue page", () => {
  const text =
    "That sounds fun because games with friends are exciting. What game do you like to play after school with Minju?";
  const parsed = parseTranslationHint(text, {
    phrases: [
      { source: "That sounds fun", translation: "재미있겠다" },
      { source: "because games with friends are exciting", translation: "친구들과 하는 게임은 신나니까" },
      { source: "What game do you like to play", translation: "너는 어떤 게임을 하는 것을 좋아해?" },
      { source: "after school", translation: "방과 후에" },
      { source: "with Minju", translation: "민주와 함께" },
    ],
  });
  if (!parsed.ok) throw new Error("fixture must be valid");

  const pages = paginateDialogueText(text);
  expect(pages.length).toBeGreaterThan(1);
  const pageTwo = pages[1];
  const pageTwoPhrases = clampPhrasesToPage(parsed.hint.phrases, pageTwo);

  expect(pageTwo.text).toContain("What game");
  expect(pageTwoPhrases.map((phrase) => phrase.source).join(" ")).toContain(
    "What game do you like to play",
  );
  expect(pageTwoPhrases.map((phrase) => phrase.translation)).toEqual(
    expect.arrayContaining([
      "너는 어떤 게임을 하는 것을 좋아해?",
      "방과 후에",
      "민주와 함께",
    ]),
  );
});
```

Keep these cases in the rejection table:

```ts
{
  name: "empty Korean",
  phrases: [{ source: "How often", translation: "   " }],
},
{
  name: "empty source",
  phrases: [{ source: "", translation: "빈 문자열" }],
},
{
  name: "non-array phrases",
  phrases: "How often",
},
```

- [ ] **Step 2: Run the domain tests to verify failure**

Run:

```bash
npm test -- tests/domain/translation-hint.test.ts --run
```

Expected: FAIL because `translationHintModelSchema` and `translationHintInputSchema` still cap `phrases` at 3.

- [ ] **Step 3: Implement the minimal domain change**

In `src/domain/ai/translation-hint.ts`, add:

```ts
export const TRANSLATION_HINT_MAX_PHRASES = 12;
```

Change both schema arrays from `.max(3)` to:

```ts
.max(TRANSLATION_HINT_MAX_PHRASES)
```

Do not change `TranslationPhrase`, `TranslationHint`, `buildTranslationSegments`, `clampPhrasesToPage`, or request validation in this task.

- [ ] **Step 4: Run the domain tests to verify pass**

Run:

```bash
npm test -- tests/domain/translation-hint.test.ts --run
```

Expected: PASS.

---

### Task 2: Change Provider Prompt to Full-Coverage Meaning Chunks

**Files:**
- Modify: `src/server/ai/translation-hint-generator.ts`
- Test: `tests/server/translation-hint-generator.test.ts`

**Interfaces:**
- Consumes: `translationHintModelSchema` from `src/domain/ai/translation-hint.ts`
- Produces: the same `generateTranslationHint(input, deps)` result shape, with prompt rules that request full coverage.

- [ ] **Step 1: Write the failing generator prompt tests**

In `tests/server/translation-hint-generator.test.ts`, replace the test named `"instructs the selector not to translate every word or isolated function words"` with:

```ts
it("instructs the selector to cover the full line in natural meaning chunks", async () => {
  const { generateTranslationHint } = await import(
    "@/server/ai/translation-hint-generator"
  );
  const client = createFakeClient({ phrases: [] });

  await generateTranslationHint(
    {
      sourceText:
        "That sounds fun! What game do you like to play after school with Minju?",
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
      expect.stringContaining("Cover the full sourceText"),
      expect.stringContaining("natural meaning chunks"),
      expect.stringContaining("source order"),
      expect.stringContaining("question"),
      expect.stringContaining("exact substring"),
      expect.stringContaining("Do not translate word by word"),
    ]),
  );
  expect(prompt.instructions?.join("\n")).not.toContain("zero to three");
  expect(prompt.instructions?.join("\n")).not.toContain("Do not cover every word");
});
```

Replace the source text smoke test named `"keeps the short-chunk rules in the production prompt source"` with:

```ts
it("keeps the full-coverage rules in the production prompt source", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const source = await fs.readFile(
    path.resolve(process.cwd(), "src/server/ai/translation-hint-generator.ts"),
    "utf8",
  );

  expect(source).toContain("Cover the full sourceText");
  expect(source).toContain("natural meaning chunks");
  expect(source).toContain("Do not translate word by word");
  expect(source).not.toContain("Return zero to three");
  expect(source).not.toContain("Do not cover every word");
});
```

- [ ] **Step 2: Run the generator tests to verify failure**

Run:

```bash
npm test -- tests/server/translation-hint-generator.test.ts --run
```

Expected: FAIL because the provider prompt still contains short-chunk rules.

- [ ] **Step 3: Implement the prompt change**

In `src/server/ai/translation-hint-generator.ts`, replace the system content with:

```ts
"Translate Coco's English line into Korean phrase hints for a young ESL learner. Return only data matching the schema.",
```

Replace the `instructions` array with:

```ts
instructions: [
  "Cover the full sourceText with useful Korean meaning chunks in source order.",
  "Use natural phrase or clause chunks, not word-by-word translations.",
  "For a line with a reaction and a question, include coverage for the question because it is the part the student must answer.",
  "Each phrase's source must be an exact substring copied verbatim from sourceText.",
  "Avoid selecting whitespace-only or punctuation-only spans.",
  "Do not translate word by word; translate each chunk's contextual meaning into targetLocale.",
  "Keep chunks short enough to fit inline, usually one clause or one natural phrase.",
],
```

- [ ] **Step 4: Run the generator tests to verify pass**

Run:

```bash
npm test -- tests/server/translation-hint-generator.test.ts --run
```

Expected: PASS.

---

### Task 3: Bump Cache Version for Full-Coverage Hints

**Files:**
- Modify: `src/server/ai/translation-hint-cache.ts`
- Test: `tests/server/translation-hint-cache.test.ts`

**Interfaces:**
- Consumes: `computeTranslationSourceDigest(sourceText: string): string`
- Produces: a new policy version string that changes cache digests while leaving lookup keys and upsert shape unchanged.

- [ ] **Step 1: Write the failing cache version test**

In `tests/server/translation-hint-cache.test.ts`, update the version expectation:

```ts
expect(TRANSLATION_HINT_POLICY_VERSION).toBe(
  "translation-hint-v3-full-coverage",
);
```

Rename the test to:

```ts
it("versions the source digest so short-chunk cached hints are missed", async () => {
```

- [ ] **Step 2: Run the cache tests to verify failure**

Run:

```bash
npm test -- tests/server/translation-hint-cache.test.ts --run
```

Expected: FAIL because `TRANSLATION_HINT_POLICY_VERSION` is still `translation-hint-v2-short-chunks`.

- [ ] **Step 3: Implement the cache version bump**

In `src/server/ai/translation-hint-cache.ts`, change:

```ts
export const TRANSLATION_HINT_POLICY_VERSION =
  "translation-hint-v3-full-coverage" as const;
```

- [ ] **Step 4: Run the cache tests to verify pass**

Run:

```bash
npm test -- tests/server/translation-hint-cache.test.ts --run
```

Expected: PASS.

---

### Task 4: Focused Integration Verification and Static Contract Check

**Files:**
- Optionally modify: `tests/domain/tts-ui-source.test.ts`
- Verify: `src/components/student/CocoDialogueBox.tsx`

**Interfaces:**
- Consumes: `buildTranslationSegments`, `clampPhrasesToPage`, and `findDialoguePageIndex`
- Produces: no new runtime interface; confirms existing UI can render more phrase spans and page-local translations.

- [ ] **Step 1: Search for stale short-chunk assertions**

Run:

```bash
rg -n "zero to three|short-chunk|short chunks|max\\(3\\)|translation-hint-v2" src tests docs/superpowers/plans/2026-07-27-full-coverage-dynamic-translation-hints.md
```

Expected: only archived historical specs/plans may mention old policy; active source and tests should not.

- [ ] **Step 2: Update static source tests only if they fail**

If `tests/domain/tts-ui-source.test.ts` fails because it asserts the old short-chunk contract, replace that assertion with checks for the existing rendering primitives:

```ts
expect(dialogueSource).toContain("buildTranslationSegments");
expect(dialogueSource).toContain("clampPhrasesToPage");
expect(dialogueSource).toContain("currentPage.start + segment.phrase.start");
expect(dialogueSource).toContain("phrase.translation");
```

Do not change `CocoDialogueBox.tsx` unless a focused test proves a rendering bug.

- [ ] **Step 3: Run focused verification**

Run:

```bash
npm test -- tests/domain/translation-hint.test.ts tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts tests/domain/tts-ui-source.test.ts --run
```

Expected: PASS.

---

### Task 5: Broader Verification and Task Closeout

**Files:**
- Modify: `TASK.md`
- No production source changes unless verification exposes a defect.

**Interfaces:**
- Consumes: completed implementation from Tasks 1-4.
- Produces: verification evidence in `TASK.md` and a reviewed final diff.

- [ ] **Step 1: Run proportionate checks**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: all pass. If a command fails due to sandbox-only socket binding or another environment limitation, rerun with approved escalation when required by policy or record the exact blocker and the narrower passing evidence.

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git diff -- src/domain/ai/translation-hint.ts src/server/ai/translation-hint-generator.ts src/server/ai/translation-hint-cache.ts tests/domain/translation-hint.test.ts tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts tests/domain/tts-ui-source.test.ts TASK.md
```

Check for:

- no preset hint ladder changes;
- no client-supplied source text accepted by the route;
- no OpenAI/Supabase live calls added to tests;
- no student transcript or audio data logged;
- no unrelated formatting churn.

- [ ] **Step 3: Update `TASK.md`**

Record:

- focused test commands and results;
- broad verification commands and results;
- any pre-existing warning or environment-specific blocker;
- final next step.

- [ ] **Step 4: Archive on completion**

After implementation and verification are complete, move `TASK.md` to:

```text
docs/tasks/archive/2026-07-27-full-coverage-dynamic-translation-hints.md
```

Set status to:

```md
**Status:** Complete
```

---

## Self-Review

- Spec coverage: the plan covers full dynamic line translation, phrase-by-phrase UI, page-two question coverage, cache invalidation, and preservation of server-owned source resolution.
- Placeholder scan: no `TBD`, `TODO`, unspecified tests, or deferred implementation steps remain.
- Type consistency: all tasks preserve the existing `TranslationHint`, `TranslationPhrase`, `parseTranslationHint`, `generateTranslationHint`, and cache interfaces; only the accepted phrase count and prompt/cache policy change.
