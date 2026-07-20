# Dynamic Dialogue Pagination and Open Follow-ups Implementation Plan

> **Superseded (pagination scope):** the pagination rules in this plan are superseded by `docs/superpowers/plans/2026-07-20-sentence-aware-dialogue-pagination.md` per the 2026-07-20 design spec. Open-follow-up prompt scope is unaffected.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginate only Coco's current message without breaking translation phrases, and make dynamic follow-ups invite phrases or short sentences by default.

**Architecture:** Add a pure, offset-preserving pagination module under `src/domain/conversation/`. `CocoDialogueBox` derives local page state from the server-owned full line and optional translation ranges; no new API or persisted state is introduced. Update the duplicated pure/server conversation instructions together while leaving preset evaluation and mission flow unchanged.

**Tech Stack:** TypeScript 5.7, React 19, Next.js 15, Vitest 3, existing inline `CSSProperties` style system.

## Global Constraints

- Paginate only the currently visible Coco message; never expose conversation-history browsing.
- Use a deterministic 16-word budget, preferring sentence boundaries, then commas/semicolons/colons, then whitespace.
- Preserve every source character and every server-computed translation offset.
- Never split a protected translation phrase across pages.
- Keep the visible loading label `Hint`, use accessible label `Loading hint`, and retain `aria-busy`.
- Preserve server-owned line descriptors; never send arbitrary dialogue text to translation or text-to-speech routes.
- Preserve preset evaluation, correction, progression, transitions, and hint ladders.
- Preserve conversation history, moderation, persistence, hard cap, wind-down, and target-pattern soft context.
- Do not add dependencies, database changes, provider-side conversation state, or latency work.
- Preserve unrelated working-tree changes. Do not push, merge, deploy, publish, or modify production.

---

## File structure

- Create `src/domain/conversation/dialogue-pagination.ts`: pure semantic pagination, phrase-range protection, and offset-to-page lookup.
- Create `tests/domain/dialogue-pagination.test.ts`: exact source-preservation and boundary regression tests.
- Modify `src/components/student/CocoDialogueBox.tsx`: current-page state, phrase-to-page mapping, pager controls, and Hint spinner.
- Modify `src/components/student/styles.ts`: non-scrolling dialogue box and attached pager styles.
- Modify `tests/domain/tts-ui-source.test.ts`: deterministic UI/source contracts matching the project's existing test pattern.
- Modify `src/domain/ai/conversation-generation.ts`: pure prompt instructions.
- Modify `src/domain/ai/conversation-generation.test.ts`: pure prompt policy regression tests.
- Modify `src/server/ai/conversation-generator.ts`: server system instructions.
- Modify `src/server/ai/conversation-generator.test.ts`: adapter prompt parity regression tests.
- Modify `TASK.md`: milestone evidence and the final archive position.

### Task 1: Build the pure semantic paginator

**Files:**

- Create: `src/domain/conversation/dialogue-pagination.ts`
- Create: `tests/domain/dialogue-pagination.test.ts`

**Interfaces:**

- Consumes: a complete source string and optional `{ start: number; end: number }[]` ranges using full-source offsets.
- Produces: `DIALOGUE_PAGE_WORD_LIMIT`, `DialoguePage`, `TextRange`, `paginateDialogueText(sourceText, protectedRanges?)`, and `findDialoguePageIndex(pages, sourceOffset)`.

- [ ] **Step 1: Write failing source-preservation and semantic-boundary tests**

Create `tests/domain/dialogue-pagination.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  DIALOGUE_PAGE_WORD_LIMIT,
  findDialoguePageIndex,
  paginateDialogueText,
} from "@/domain/conversation/dialogue-pagination";

describe("paginateDialogueText", () => {
  it("keeps a short line on one exact page", () => {
    const text = "What games do you play inside?";
    expect(DIALOGUE_PAGE_WORD_LIMIT).toBe(16);
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: text.length, text },
    ]);
  });

  it("prefers sentence and clause boundaries before whitespace", () => {
    const sentences =
      "One two three four five six seven eight nine. Ten eleven twelve thirteen fourteen fifteen sixteen seventeen.";
    const clauses =
      "One two three four five six seven eight nine, ten eleven twelve thirteen fourteen fifteen sixteen seventeen.";

    expect(paginateDialogueText(sentences).map((page) => page.text)).toEqual([
      "One two three four five six seven eight nine. ",
      "Ten eleven twelve thirteen fourteen fifteen sixteen seventeen.",
    ]);
    expect(paginateDialogueText(clauses).map((page) => page.text)).toEqual([
      "One two three four five six seven eight nine, ",
      "ten eleven twelve thirteen fourteen fifteen sixteen seventeen.",
    ]);
  });

  it("uses whitespace for one over-budget clause and preserves the source", () => {
    const text = Array.from({ length: 20 }, (_, index) => `word${index + 1}`).join(" ");
    const pages = paginateDialogueText(text);

    expect(pages).toHaveLength(2);
    expect(pages[0]?.text.trim().split(/\s+/u)).toHaveLength(16);
    expect(pages.map((page) => page.text).join("")).toBe(text);
  });

  it("moves a boundary before a protected phrase", () => {
    const words = Array.from({ length: 20 }, (_, index) => `word${index + 1}`);
    const text = words.join(" ");
    const source = "word15 word16 word17 word18";
    const start = text.indexOf(source);
    const pages = paginateDialogueText(text, [{ start, end: start + source.length }]);

    expect(pages.map((page) => page.text).join("")).toBe(text);
    expect(pages.some((page) => page.start > start && page.start < start + source.length)).toBe(false);
    expect(pages.some((page) => page.end > start && page.end < start + source.length)).toBe(false);
  });

  it("keeps an over-budget protected phrase intact", () => {
    const phrase = Array.from({ length: 18 }, (_, index) => `word${index + 1}`).join(" ");
    const text = `${phrase} tail`;
    const pages = paginateDialogueText(text, [{ start: 0, end: phrase.length }]);

    expect(pages[0]?.text).toBe(phrase);
    expect(pages.map((page) => page.text).join("")).toBe(text);
  });

  it("handles empty, whitespace-only, and over-budget single-word input", () => {
    expect(paginateDialogueText("")).toEqual([]);
    expect(paginateDialogueText("   ")).toEqual([
      { start: 0, end: 3, text: "   " },
    ]);
    const longWord = "x".repeat(200);
    expect(paginateDialogueText(longWord)[0]?.text).toBe(longWord);
  });

  it("finds and clamps the page containing a full-source offset", () => {
    const pages = paginateDialogueText(
      Array.from({ length: 20 }, (_, index) => `word${index + 1}`).join(" "),
    );
    expect(findDialoguePageIndex(pages, 0)).toBe(0);
    expect(findDialoguePageIndex(pages, pages[1]?.start ?? 0)).toBe(1);
    expect(findDialoguePageIndex(pages, Number.MAX_SAFE_INTEGER)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the new tests and verify the import fails**

Run:

```bash
npm test -- --run tests/domain/dialogue-pagination.test.ts
```

Expected: FAIL because `@/domain/conversation/dialogue-pagination` does not exist.

- [ ] **Step 3: Implement exact, protected semantic pagination**

Create `src/domain/conversation/dialogue-pagination.ts`:

```typescript
export const DIALOGUE_PAGE_WORD_LIMIT = 16;

export type TextRange = { start: number; end: number };
export type DialoguePage = TextRange & { text: string };

const sentenceBoundaryPattern = /[.!?]+["')\]]*(?:\s+|$)/gu;
const clauseBoundaryPattern = /[,;:]+(?:\s+|$)/gu;

function boundaries(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map(
    (match) => (match.index ?? 0) + match[0].length,
  );
}

function nextBudgetBoundary(source: string, start: number): number {
  const words = [...source.matchAll(/\S+/gu)].filter(
    (match) => (match.index ?? 0) >= start,
  );
  if (words.length <= DIALOGUE_PAGE_WORD_LIMIT) return source.length;

  const hardBoundary = words[DIALOGUE_PAGE_WORD_LIMIT]?.index ?? source.length;
  const inBudget = (value: number) => value > start && value <= hardBoundary;
  const sentence = boundaries(source, sentenceBoundaryPattern).filter(inBudget).at(-1);
  if (sentence !== undefined) return sentence;
  const clause = boundaries(source, clauseBoundaryPattern).filter(inBudget).at(-1);
  return clause ?? hardBoundary;
}

function protectBoundary(
  source: string,
  pageStart: number,
  boundary: number,
  protectedRanges: TextRange[],
): number {
  let adjusted = boundary;
  for (const range of protectedRanges) {
    if (adjusted <= range.start || adjusted >= range.end) continue;
    const beforePhrase = source.slice(pageStart, range.start);
    adjusted = beforePhrase.trim().length > 0 ? range.start : range.end;
  }
  return Math.min(source.length, Math.max(pageStart + 1, adjusted));
}

export function paginateDialogueText(
  sourceText: string,
  protectedRanges: TextRange[] = [],
): DialoguePage[] {
  if (sourceText.length === 0) return [];
  const ranges = [...protectedRanges].sort((a, b) => a.start - b.start);
  const pages: DialoguePage[] = [];
  let start = 0;

  while (start < sourceText.length) {
    const candidate = nextBudgetBoundary(sourceText, start);
    const end = protectBoundary(sourceText, start, candidate, ranges);
    pages.push({ start, end, text: sourceText.slice(start, end) });
    start = end;
  }
  return pages;
}

export function findDialoguePageIndex(
  pages: DialoguePage[],
  sourceOffset: number,
): number {
  if (pages.length === 0) return 0;
  const index = pages.findIndex(
    (page) => sourceOffset >= page.start && sourceOffset < page.end,
  );
  return index >= 0 ? index : pages.length - 1;
}
```

- [ ] **Step 4: Run paginator tests and verify they pass**

Run:

```bash
npm test -- --run tests/domain/dialogue-pagination.test.ts
```

Expected: 7 tests PASS with no failures.

- [ ] **Step 5: Commit the pure paginator**

```bash
git add src/domain/conversation/dialogue-pagination.ts tests/domain/dialogue-pagination.test.ts
git commit -m "feat(student): paginate Coco dialogue semantically"
```

### Task 2: Integrate current-message pagination and Hint feedback

**Files:**

- Modify: `src/components/student/CocoDialogueBox.tsx:3-224`
- Modify: `src/components/student/styles.ts:268-392`
- Modify: `tests/domain/tts-ui-source.test.ts:88-176`

**Interfaces:**

- Consumes: `paginateDialogueText()` and `findDialoguePageIndex()` from Task 1; existing `TranslationPhrase` full-source offsets.
- Produces: local-only page navigation, stable phrase-index expansion, and four new style exports: `mascotDialoguePagerStyle`, `mascotDialoguePageButtonStyle`, `mascotDialoguePageIndicatorStyle`, and `mascotHintSpinnerStyle`.

- [ ] **Step 1: Replace the old Hint/loading source contract with failing pagination contracts**

In `tests/domain/tts-ui-source.test.ts`, keep the existing translation safety tests. Replace the `Hint…` expectations in `retries translation through the same visible Hint action` and add these assertions:

```typescript
expect(dialogueSource).toContain('const hintLabel =');
expect(dialogueSource).toContain('"Loading hint"');
expect(dialogueSource).toContain('"Retry hint"');
expect(dialogueSource).toContain("<HintSpinner />");
expect(dialogueSource).toContain("aria-busy={isHintLoading}");
expect(dialogueSource).not.toContain('"Hint…"');
```

Add a new test after the attached-chatbox test:

```typescript
it("paginates only the current Coco line with accessible fixed controls", () => {
  const dialogueSource = readSource(
    "src/components/student/CocoDialogueBox.tsx",
  );
  const stylesSource = readSource("src/components/student/styles.ts");

  expect(dialogueSource).toContain("paginateDialogueText");
  expect(dialogueSource).toContain("findDialoguePageIndex");
  expect(dialogueSource).toContain('aria-label="Previous dialogue page"');
  expect(dialogueSource).toContain('aria-label="Next dialogue page"');
  expect(dialogueSource).toContain("safePageIndex + 1");
  expect(dialogueSource).not.toContain("conversationHistory");
  expect(stylesSource).toContain("mascotDialoguePagerStyle");
  expect(stylesSource).not.toMatch(
    /mascotDialogueBoxStyle[\s\S]*overflowY: "auto"/,
  );
});
```

Replace `opens the first Korean phrase immediately and toggles without refetching` with this version so it no longer requires the removed `getFirstTranslationPhraseSegmentIndex` helper:

```typescript
it("opens the first Korean phrase on its page without refetching", () => {
  const dialogueSource = readSource(
    "src/components/student/CocoDialogueBox.tsx",
  );

  expect(dialogueSource).toContain("toggleTranslationBubble");
  expect(dialogueSource).toContain("setCurrentPageIndex(");
  expect(dialogueSource).toContain("firstPhrase.start");
  expect(dialogueSource).toContain("currentPage.start + segment.phrase.start");
  expect(dialogueSource).toMatch(
    /translationState\.kind === "ready"[\s\S]*setExpandedPhraseIndex[\s\S]*return/,
  );
  const readyBranchIndex = dialogueSource.indexOf(
    'if (translationState.kind === "ready")',
  );
  const fetchIndex = dialogueSource.indexOf("await fetch(");
  expect(readyBranchIndex).toBeGreaterThan(-1);
  expect(fetchIndex).toBeGreaterThan(readyBranchIndex);
  expect(dialogueSource).toContain(
    "aria-pressed={expandedPhraseIndex !== null}",
  );
  expect(dialogueSource).not.toContain(
    "getFirstTranslationPhraseSegmentIndex",
  );
});
```

- [ ] **Step 2: Run the UI source tests and verify the new contracts fail**

Run:

```bash
npm test -- --run tests/domain/tts-ui-source.test.ts
```

Expected: FAIL because pagination controls, the spinner, and the new style exports do not exist.

- [ ] **Step 3: Add non-scrolling pager and spinner styles**

In `src/components/student/styles.ts`, change `mascotDialogueBoxStyle` and `mascotHintTabStyle`, then add the pager exports:

```typescript
export const mascotDialogueBoxStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#FFFFFF",
  border: "2px solid #2563EB",
  borderRadius: 8,
  padding: 22,
  boxSizing: "border-box",
  overflow: "visible",
};

export const mascotHintTabStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  minHeight: "clamp(38px, 10vw, 44px)",
  padding: "0 clamp(8px, 2.5vw, 12px)",
  border: 0,
  borderRight: "1px solid #BFDBFE",
  borderRadius: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  color: "#2563EB",
  fontSize: "clamp(13px, 3.3vw, 14px)",
  fontWeight: 700,
  cursor: "pointer",
};

export const mascotDialoguePagerStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  right: 8,
  bottom: -22,
  zIndex: 4,
  display: "grid",
  gridTemplateColumns: "44px 1fr 44px",
  alignItems: "center",
  pointerEvents: "none",
};

export const mascotDialoguePageButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  border: "2px solid #2563EB",
  borderRadius: "50%",
  background: "#FFFFFF",
  color: "#2563EB",
  fontSize: 24,
  fontWeight: 700,
  cursor: "pointer",
  pointerEvents: "auto",
};

export const mascotDialoguePageIndicatorStyle: CSSProperties = {
  justifySelf: "center",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#FFFFFF",
  color: "#4B5563",
  fontSize: 13,
  fontWeight: 700,
};

export const mascotHintSpinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  flexShrink: 0,
};
```

Do not change mascot geometry, stage height, sprite offsets, or attached tab positions.

- [ ] **Step 4: Add derived pages, stable phrase indexes, and navigation state**

In `CocoDialogueBox.tsx`, import `useMemo`, the Task 1 functions, and the four new styles. Remove the `getFirstTranslationPhraseSegmentIndex` import. Keep `expandedPhraseIndex`, but reinterpret it as the index in `translationState.phrases`, not an index in the rendered segment array.

Add page state after the existing translation state:

```typescript
const [currentPageIndex, setCurrentPageIndex] = useState(0);
const phrases = useMemo(
  () =>
    translationState.kind === "ready" ? translationState.phrases : [],
  [translationState],
);
const pages = useMemo(
  () => paginateDialogueText(dialogueText ?? "", phrases),
  [dialogueText, phrases],
);
const safePageIndex = Math.min(
  currentPageIndex,
  Math.max(0, pages.length - 1),
);
const currentPage = pages[safePageIndex] ?? null;
```

In the existing descriptor-reset effect, add:

```typescript
setCurrentPageIndex(0);
```

After the reset effect, clamp page state when protected ranges change pagination:

```typescript
useEffect(() => {
  setCurrentPageIndex((index) =>
    Math.min(index, Math.max(0, pages.length - 1)),
  );
}, [pages.length]);
```

Replace the ready-state Hint toggle with:

```typescript
if (translationState.kind === "ready") {
  const firstPhrase = translationState.phrases[0];
  if (!firstPhrase) return;
  const nextIndex = toggleTranslationBubble(expandedPhraseIndex, 0);
  setExpandedPhraseIndex(nextIndex);
  if (nextIndex !== null) {
    setCurrentPageIndex(findDialoguePageIndex(pages, firstPhrase.start));
  }
  return;
}
```

Replace the post-parse first-segment lookup with full-source phrase lookup:

```typescript
const firstPhrase = parsed.hint.phrases[0];
if (!firstPhrase) {
  setTranslationState({ kind: "error" });
  return;
}
const protectedPages = paginateDialogueText(
  dialogueText,
  parsed.hint.phrases,
);
setTranslationState({ kind: "ready", phrases: parsed.hint.phrases });
setExpandedPhraseIndex(0);
setCurrentPageIndex(
  findDialoguePageIndex(protectedPages, firstPhrase.start),
);
```

- [ ] **Step 5: Render only page-local translation segments**

Replace the full-line `segments` derivation with:

```typescript
const pagePhrases = currentPage
  ? phrases
      .filter(
        (phrase) =>
          phrase.start >= currentPage.start && phrase.end <= currentPage.end,
      )
      .map((phrase) => ({
        ...phrase,
        start: phrase.start - currentPage.start,
        end: phrase.end - currentPage.start,
      }))
  : [];
const segments = currentPage
  ? buildTranslationSegments(currentPage.text, pagePhrases)
  : null;
```

Render `currentPage.text` instead of `dialogueText`. In the phrase branch, derive the stable full-line phrase index:

```typescript
const absoluteStart = currentPage.start + segment.phrase.start;
const phraseIndex = phrases.findIndex(
  (phrase) =>
    phrase.start === absoluteStart &&
    phrase.end === currentPage.start + segment.phrase.end,
);
const isExpanded = expandedPhraseIndex === phraseIndex;
```

Use `phraseIndex` for `setExpandedPhraseIndex()` and use full-source offsets in the React key:

```typescript
key={`${absoluteStart}-${currentPage.start + segment.phrase.end}`}
```

- [ ] **Step 6: Render the visible Hint spinner and fixed pager**

Replace the loading label calculation with:

```typescript
const isHintLoading = translationState.kind === "loading";
const hintVisibleLabel =
  translationState.kind === "error" ? "Retry hint" : "Hint";
const hintLabel = isHintLoading ? "Loading hint" : hintVisibleLabel;
```

Render the button content as:

```tsx
<span>{hintVisibleLabel}</span>
{isHintLoading ? <HintSpinner /> : null}
```

Add this presentational helper below `CocoDialogueBox`:

```tsx
function HintSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      style={mascotHintSpinnerStyle}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}
```

After the dialogue box, render navigation only when `pages.length > 1`:

```tsx
{pages.length > 1 ? (
  <nav aria-label="Dialogue pages" style={mascotDialoguePagerStyle}>
    <button
      type="button"
      aria-label="Previous dialogue page"
      disabled={safePageIndex === 0}
      onClick={() => setCurrentPageIndex((index) => Math.max(0, index - 1))}
      style={{
        ...mascotDialoguePageButtonStyle,
        opacity: safePageIndex === 0 ? 0.35 : 1,
      }}
    >
      ‹
    </button>
    <span style={mascotDialoguePageIndicatorStyle}>
      {safePageIndex + 1} / {pages.length}
    </span>
    <button
      type="button"
      aria-label="Next dialogue page"
      disabled={safePageIndex === pages.length - 1}
      onClick={() =>
        setCurrentPageIndex((index) => Math.min(pages.length - 1, index + 1))
      }
      style={{
        ...mascotDialoguePageButtonStyle,
        opacity: safePageIndex === pages.length - 1 ? 0.35 : 1,
      }}
    >
      ›
    </button>
  </nav>
) : null}
```

- [ ] **Step 7: Run focused dialogue tests and fix only scoped regressions**

Run:

```bash
npm test -- --run tests/domain/dialogue-pagination.test.ts tests/domain/translation-hint.test.ts tests/domain/tts-ui-source.test.ts tests/domain/mascot-layout.test.ts
```

Expected: all selected files PASS. The mascot geometry test must remain unchanged.

- [ ] **Step 8: Commit the dialogue integration**

```bash
git add src/components/student/CocoDialogueBox.tsx src/components/student/styles.ts tests/domain/tts-ui-source.test.ts
git commit -m "feat(student): add flippable Coco dialogue"
```

### Task 3: Prefer expandable dynamic follow-ups

**Files:**

- Modify: `src/domain/ai/conversation-generation.test.ts:79-97`
- Modify: `src/server/ai/conversation-generator.test.ts:150-277`
- Modify: `src/domain/ai/conversation-generation.ts:98-113`
- Modify: `src/server/ai/conversation-generator.ts:76-96`

**Interfaces:**

- Consumes: the existing conversation history and unchanged `GenerateCocoReplyInput`.
- Produces: the unchanged `{ line: string }` schema with stricter prompt policy only.

- [ ] **Step 1: Add failing pure prompt-policy tests**

In `src/domain/ai/conversation-generation.test.ts`, add:

```typescript
it("asks expandable questions after meaningful short answers", () => {
  const prompt = buildConversationPrompt({
    ...input,
    conversationHistory: [
      {
        turnOrder: 1,
        cocoLine: "Where do you like to play games?",
        studentResponse: "Inside.",
      },
    ],
    turnOrder: 1,
  });
  const instructions = prompt.instructions.join(" ");

  expect(instructions).toContain("open question");
  expect(instructions).toContain("short phrase or sentence");
  expect(instructions).toContain("Do not default to yes/no or either/or questions");
  expect(instructions).toContain("What games do you play inside?");
});
```

Update the vague-response test so it still requires choices, but only as rescue scaffolding:

```typescript
expect(instructions).toContain("only when the latest response is vague, unclear, or shows the learner is stuck");
expect(instructions).toContain("two concrete child-friendly choices");
```

- [ ] **Step 2: Add a failing server prompt-parity test**

In `src/server/ai/conversation-generator.test.ts`, add after the kid-friendly test:

```typescript
it("prefers open follow-ups and reserves choices for stuck learners", async () => {
  const { generateCocoReply } = await import("@/server/ai/conversation-generator");
  const client = createFakeClient(async () => ({
    output_parsed: { line: "Great! What games do you play inside?" },
  }));

  await generateCocoReply(baseInput, { apiKey: "test-key", client });
  const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
  const system = call?.input.find((message) => message.role === "system")?.content ?? "";
  const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
  const prompt = JSON.parse(user) as { instructions?: string[] };

  for (const fragment of [
    "open question",
    "short phrase or sentence",
    "Do not default to yes/no or either/or questions",
    "only when the latest response is vague, unclear, or shows the learner is stuck",
  ]) {
    expect(system).toContain(fragment);
    expect(prompt.instructions?.join(" ")).toContain(fragment);
  }
});
```

- [ ] **Step 3: Run prompt tests and verify the new rules fail**

Run:

```bash
npm test -- --run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts
```

Expected: FAIL because the current prompt prefers concrete choices without limiting them to vague or stuck responses.

- [ ] **Step 4: Replace the duplicated follow-up policy in both prompt paths**

In both `CONVERSATION_SYSTEM_MESSAGE` and `buildConversationPrompt().instructions`, place these sentences immediately after the latest-response acknowledgement rule:

```typescript
"After a meaningful answer, ask an open question that connects directly to the answer and invites a short phrase or sentence.",
"Treat a short answer as meaningful when it adds a real detail; after 'Inside.', ask an expandable question such as 'What games do you play inside?'.",
"Do not default to yes/no or either/or questions after a meaningful answer.",
```

Replace the current unconditional choice preference with:

```typescript
"Use two concrete child-friendly choices only when the latest response is vague, unclear, or shows the learner is stuck.",
```

Keep these existing constraints unchanged in both locations:

```typescript
"Treat every detail in conversationHistory as already known.",
"Do not shame the learner or demand a more specific answer.",
"Treat targetPattern as soft lesson context only, never as a next-line template — do not steer the student back into the targetPattern format.",
```

- [ ] **Step 5: Run conversation tests and verify prompt parity**

Run:

```bash
npm test -- --run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts tests/server/turn-evaluator.test.ts tests/domain/turn-evaluation.test.ts
```

Expected: all selected files PASS. Evaluation tests confirm the prompt-only change did not alter preset or conversation acceptance rules.

- [ ] **Step 6: Commit the prompt-policy change**

```bash
git add src/domain/ai/conversation-generation.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.ts src/server/ai/conversation-generator.test.ts
git commit -m "fix(ai): ask expandable Coco follow-ups"
```

### Task 4: Verify the combined experience and close the task

**Files:**

- Modify: `TASK.md`
- Create on completion: `docs/tasks/archive/2026-07-19-dynamic-dialogue-pagination-open-followups.md`

**Interfaces:**

- Consumes: the independently committed paginator, dialogue UI, and prompt policy.
- Produces: fresh verification evidence and an archived task record; no production deployment.

- [ ] **Step 1: Run the combined focused suite**

Run:

```bash
npm test -- --run tests/domain/dialogue-pagination.test.ts tests/domain/translation-hint.test.ts tests/domain/tts-ui-source.test.ts tests/domain/mascot-layout.test.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts tests/server/turn-evaluator.test.ts tests/domain/turn-evaluation.test.ts
```

Expected: all selected test files PASS with zero failures.

- [ ] **Step 2: Run proportionate project gates**

Run each command separately and record its exact result in `TASK.md`:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Expected: full test suite, typecheck, lint, and production build exit 0. If a development server is actively using this checkout's `.next` directory, stop and ask before running `npm run build`; do not risk corrupting the user's live session.

- [ ] **Step 3: Perform localhost manual UAT with disposable student data**

Use `http://localhost:3000` and label all screenshots as localhost evidence. Complete these exact checks:

1. Open a current Coco line longer than 16 words at a phone-width viewport.
2. Confirm the dialogue has no internal scrollbar and both corner controls remain mounted.
3. Navigate forward and backward; confirm the page indicator and disabled states update.
4. Reveal a translated phrase on a later page; confirm Hint shows a spinner, opens the correct page, and the Korean bubble is not clipped.
5. Complete a dynamic exchange with `I like to play games` then `Inside`; confirm Coco asks for an expandable detail.
6. Give `I don't know`; confirm Coco may offer two child-friendly choices.

If credentialed localhost UAT is unavailable, leave the task active with these checks explicitly pending. Do not describe a synthetic or inferred render as actual application evidence.

- [ ] **Step 4: Archive the completed task only after every required gate passes**

Move `TASK.md` to `docs/tasks/archive/2026-07-19-dynamic-dialogue-pagination-open-followups.md`. Set `**Status:** Complete`, check every done item, and record:

```markdown
## Verification

- Focused dialogue and conversation tests: passed, with exact file/test counts.
- Full test suite: passed, with exact file/test counts.
- Typecheck: passed.
- Lint: passed, including any warnings.
- Production build: passed, or explicitly deferred because an active local server made it unsafe.
- Manual UAT: passed on localhost, with viewport and scenario details.
```

- [ ] **Step 5: Commit the verified task archive**

```bash
git add TASK.md docs/tasks/archive/2026-07-19-dynamic-dialogue-pagination-open-followups.md
git commit -m "docs: archive dynamic dialogue task"
```

Because `TASK.md` is moved, stage the deletion and archive path explicitly if Git reports them separately. Do not stage unrelated files.
