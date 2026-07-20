# Sentence-Aware Dialogue Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the budget-first dialogue paginator with sentence-aware pagination per `docs/superpowers/specs/2026-07-20-sentence-aware-dialogue-pagination-design.md`, freeze pages against Hint loading, and grow the chatbox/mascot stage to a constant four-line height.

**Architecture:** `paginateDialogueText` becomes a pure function of the source text alone (sentence-atomic pages, ≤10-word packing, 16-word single-sentence cap, clause→whitespace fallback). A new pure helper `clampPhrasesToPage` renders Hint phrases that straddle frozen page boundaries as per-page tappable segments. Style constants grow the dialogue shell, sprite offset, and stage height by the same 40px delta.

**Tech Stack:** TypeScript, React (Next.js), Vitest. Tests are pure-function domain tests, style-value tests, and source-string assertion tests (there is no jsdom/react-testing-library in this repo — do not add one).

**Supersedes:** the pagination portions of `docs/superpowers/plans/2026-07-19-dynamic-dialogue-pagination-open-followups.md`.

## Global Constraints

- Work only in the worktree `.claude/worktrees/dynamic-dialogue-pagination` on branch `worktree-dynamic-dialogue-pagination`.
- Do not push, merge, deploy, publish, manage the ngrok tunnel, remove the worktree, or modify production.
- Do not stop or replace the Node listener on port 3200 unless a code change requires a restart to serve it.
- Preserve full-source offsets, translation phrase ranges, current-message-only pagination, server-owned line descriptors, and preset mission behavior.
- Constants copied verbatim from the spec: single-sentence cap **16** source words; packing budget **10** combined source words; chatbox sized for **four rendered lines** at **360 CSS px** width; fragments of a split sentence never pack.
- Hint loading must never change page boundaries.
- Run all commands from the worktree root.

---

### Task 1: Rewrite the pagination domain module (sentence-aware)

**Files:**
- Modify: `src/domain/conversation/dialogue-pagination.ts`
- Test: `tests/domain/dialogue-pagination.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `paginateDialogueText(sourceText: string): DialoguePage[]` (the `protectedRanges` parameter is REMOVED), `findDialoguePageIndex(pages: DialoguePage[], sourceOffset: number): number` (unchanged), exported constants `DIALOGUE_PAGE_WORD_LIMIT = 16` and `DIALOGUE_PAGE_PACK_WORD_LIMIT = 10`, types `TextRange`, `DialoguePage` (unchanged shapes).

- [ ] **Step 1: Replace the test file with the sentence-aware suite**

Overwrite `tests/domain/dialogue-pagination.test.ts` with exactly:

```typescript
import { describe, expect, it } from "vitest";
import {
  DIALOGUE_PAGE_PACK_WORD_LIMIT,
  DIALOGUE_PAGE_WORD_LIMIT,
  findDialoguePageIndex,
  paginateDialogueText,
} from "@/domain/conversation/dialogue-pagination";

describe("paginateDialogueText", () => {
  it("locks the approved word limits", () => {
    expect(DIALOGUE_PAGE_WORD_LIMIT).toBe(16);
    expect(DIALOGUE_PAGE_PACK_WORD_LIMIT).toBe(10);
  });

  it("keeps a short line on one exact page", () => {
    const text = "What games do you play inside?";
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: text.length, text },
    ]);
  });

  it("splits the phone UAT line into two sentence-aligned pages", () => {
    const text =
      "It's almost summer vacation! What are you going to do during summer vacation?";
    const secondStart = text.indexOf("What");
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: secondStart, text: "It's almost summer vacation! " },
      {
        start: secondStart,
        end: text.length,
        text: "What are you going to do during summer vacation?",
      },
    ]);
  });

  it("computes pages from source text alone so Hint cannot move them", () => {
    expect(paginateDialogueText.length).toBe(1);
  });

  it("packs very short sentences up to the ten-word budget", () => {
    const packed = "Great job! Let's keep going.";
    expect(paginateDialogueText(packed)).toEqual([
      { start: 0, end: packed.length, text: packed },
    ]);

    const three = "I ran fast. You ran fast. We all won.";
    expect(paginateDialogueText(three)).toHaveLength(1);

    const overBudget =
      "One two three four five six. Seven eight nine ten eleven.";
    expect(paginateDialogueText(overBudget).map((page) => page.text)).toEqual([
      "One two three four five six. ",
      "Seven eight nine ten eleven.",
    ]);
  });

  it("keeps a lone eleven-to-sixteen-word sentence whole on its own page", () => {
    const text =
      "One two three four five six seven eight nine ten eleven twelve.";
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: text.length, text },
    ]);
  });

  it("splits an over-limit sentence at clause punctuation first", () => {
    const clauses =
      "One two three four five six seven eight nine, ten eleven twelve thirteen fourteen fifteen sixteen seventeen.";
    expect(paginateDialogueText(clauses).map((page) => page.text)).toEqual([
      "One two three four five six seven eight nine, ",
      "ten eleven twelve thirteen fourteen fifteen sixteen seventeen.",
    ]);
  });

  it("falls back to whitespace for one over-limit clause and preserves the source", () => {
    const text = Array.from(
      { length: 20 },
      (_, index) => `word${index + 1}`,
    ).join(" ");
    const pages = paginateDialogueText(text);

    expect(pages).toHaveLength(2);
    expect(pages[0]?.text.trim().split(/\s+/u)).toHaveLength(16);
    expect(pages.map((page) => page.text).join("")).toBe(text);
  });

  it("never packs fragments of a split sentence with a following sentence", () => {
    const longSentence = Array.from(
      { length: 20 },
      (_, index) => `word${index + 1}`,
    ).join(" ");
    const text = `${longSentence}. Nice job.`;
    const pages = paginateDialogueText(text).map((page) => page.text);

    expect(pages).toHaveLength(3);
    expect(pages[2]).toBe("Nice job.");
    expect(pages.join("")).toBe(text);
  });

  it("handles empty, whitespace-only, and over-limit single-word input", () => {
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

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npx vitest run tests/domain/dialogue-pagination.test.ts`
Expected: FAIL — `DIALOGUE_PAGE_PACK_WORD_LIMIT` is not exported, the UAT line test expects two pages but gets one, and the arity test expects 1 but gets 2.

- [ ] **Step 3: Replace the module implementation**

Overwrite `src/domain/conversation/dialogue-pagination.ts` with exactly:

```typescript
export const DIALOGUE_PAGE_WORD_LIMIT = 16;
export const DIALOGUE_PAGE_PACK_WORD_LIMIT = 10;

export type TextRange = { start: number; end: number };
export type DialoguePage = TextRange & { text: string };

const sentenceBoundaryPattern = /[.!?]+["')\]]*(?:\s+|$)/gu;
const clauseBoundaryPattern = /[,;:]+(?:\s+|$)/gu;

type PageUnit = TextRange & { words: number; fragment: boolean };

function boundaryEnds(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map(
    (match) => (match.index ?? 0) + match[0].length,
  );
}

function countWords(source: string, start: number, end: number): number {
  return [...source.slice(start, end).matchAll(/\S+/gu)].length;
}

function sentenceRanges(source: string): TextRange[] {
  const ranges: TextRange[] = [];
  let start = 0;
  for (const end of boundaryEnds(source, sentenceBoundaryPattern)) {
    ranges.push({ start, end });
    start = end;
  }
  if (start < source.length) ranges.push({ start, end: source.length });
  return ranges;
}

function splitLongSentence(source: string, sentence: TextRange): TextRange[] {
  const clauseEnds = boundaryEnds(source, clauseBoundaryPattern);
  const fragments: TextRange[] = [];
  let start = sentence.start;
  while (start < sentence.end) {
    const words = [...source.slice(start, sentence.end).matchAll(/\S+/gu)];
    if (words.length <= DIALOGUE_PAGE_WORD_LIMIT) {
      fragments.push({ start, end: sentence.end });
      break;
    }
    const overflowWordOffset = words[DIALOGUE_PAGE_WORD_LIMIT]?.index;
    const hardBoundary =
      overflowWordOffset === undefined
        ? sentence.end
        : start + overflowWordOffset;
    const inBudget = (value: number) => value > start && value <= hardBoundary;
    const clause = clauseEnds.filter(inBudget).at(-1);
    const end = clause ?? hardBoundary;
    fragments.push({ start, end });
    start = end;
  }
  return fragments;
}

export function paginateDialogueText(sourceText: string): DialoguePage[] {
  if (sourceText.length === 0) return [];

  const units: PageUnit[] = [];
  for (const sentence of sentenceRanges(sourceText)) {
    const words = countWords(sourceText, sentence.start, sentence.end);
    if (words <= DIALOGUE_PAGE_WORD_LIMIT) {
      units.push({ ...sentence, words, fragment: false });
      continue;
    }
    for (const fragment of splitLongSentence(sourceText, sentence)) {
      units.push({
        ...fragment,
        words: countWords(sourceText, fragment.start, fragment.end),
        fragment: true,
      });
    }
  }

  const pages: DialoguePage[] = [];
  let pageWords = 0;
  let pageHasFragment = false;
  for (const unit of units) {
    const current = pages.at(-1);
    const packable =
      current !== undefined &&
      !unit.fragment &&
      !pageHasFragment &&
      pageWords + unit.words <= DIALOGUE_PAGE_PACK_WORD_LIMIT;
    if (current !== undefined && packable) {
      current.end = unit.end;
      current.text = sourceText.slice(current.start, current.end);
      pageWords += unit.words;
    } else {
      pages.push({
        start: unit.start,
        end: unit.end,
        text: sourceText.slice(unit.start, unit.end),
      });
      pageWords = unit.words;
      pageHasFragment = unit.fragment;
    }
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

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npx vitest run tests/domain/dialogue-pagination.test.ts`
Expected: PASS (11 tests). NOTE: `src/components/student/CocoDialogueBox.tsx` still passes a second argument, so `npm run typecheck` fails until Task 3 — that is expected mid-plan; do not "fix" the component here.

- [ ] **Step 5: Commit**

```bash
git add src/domain/conversation/dialogue-pagination.ts tests/domain/dialogue-pagination.test.ts
git commit -m "feat: sentence-aware dialogue pagination domain rule"
```

---

### Task 2: Phrase clamping helper for cross-page Hint highlights

**Files:**
- Modify: `src/domain/ai/translation-hint.ts`
- Test: `tests/domain/translation-hint.test.ts`

**Interfaces:**
- Consumes: existing `TranslationPhrase` type (`{ source: string; start: number; end: number; translation: string }`) from the same file.
- Produces: `clampPhrasesToPage(phrases: TranslationPhrase[], page: { start: number; end: number; text: string }): TranslationPhrase[]` — returns page-relative phrases; a phrase straddling the page edge is clamped to the portion inside the page, keeps the full `translation`, and its `source` is the clamped page-text slice.

- [ ] **Step 1: Append the failing tests**

Append to `tests/domain/translation-hint.test.ts` (add `clampPhrasesToPage` to the existing import from `@/domain/ai/translation-hint`):

```typescript
describe("clampPhrasesToPage", () => {
  // Source: "One two three four five six"
  //          0123456789...
  // Pages:  [0,14) "One two three " and [14,27) "four five six"
  const pageOne = { start: 0, end: 14, text: "One two three " };
  const pageTwo = { start: 14, end: 27, text: "four five six" };

  it("clamps a straddling phrase to per-page segments with the full translation", () => {
    const phrase = {
      source: "three four",
      start: 8,
      end: 18,
      translation: "셋 넷",
    };
    expect(clampPhrasesToPage([phrase], pageOne)).toEqual([
      { source: "three ", start: 8, end: 14, translation: "셋 넷" },
    ]);
    expect(clampPhrasesToPage([phrase], pageTwo)).toEqual([
      { source: "four", start: 0, end: 4, translation: "셋 넷" },
    ]);
  });

  it("keeps inside phrases page-relative and drops outside phrases", () => {
    const inside = { source: "two", start: 4, end: 7, translation: "둘" };
    const outside = { source: "five", start: 19, end: 23, translation: "다섯" };
    expect(clampPhrasesToPage([inside, outside], pageOne)).toEqual([
      { source: "two", start: 4, end: 7, translation: "둘" },
    ]);
    expect(clampPhrasesToPage([], pageOne)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/domain/translation-hint.test.ts`
Expected: FAIL — `clampPhrasesToPage` is not exported.

- [ ] **Step 3: Implement the helper**

Add to the end of `src/domain/ai/translation-hint.ts`:

```typescript
export function clampPhrasesToPage(
  phrases: TranslationPhrase[],
  page: { start: number; end: number; text: string },
): TranslationPhrase[] {
  return phrases
    .filter((phrase) => phrase.start < page.end && phrase.end > page.start)
    .map((phrase) => {
      const start = Math.max(phrase.start, page.start) - page.start;
      const end = Math.min(phrase.end, page.end) - page.start;
      return {
        source: page.text.slice(start, end),
        start,
        end,
        translation: phrase.translation,
      };
    });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/domain/translation-hint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/ai/translation-hint.ts tests/domain/translation-hint.test.ts
git commit -m "feat: clamp translation phrases to frozen dialogue pages"
```

---

### Task 3: Wire the component to stable pages and clamped phrases

**Files:**
- Modify: `src/components/student/CocoDialogueBox.tsx`
- Test: `tests/domain/tts-ui-source.test.ts`

**Interfaces:**
- Consumes: `paginateDialogueText(sourceText)` and `findDialoguePageIndex` from Task 1; `clampPhrasesToPage` from Task 2.
- Produces: no new exports; `CocoDialogueBox` props are unchanged.

- [ ] **Step 1: Extend the failing source assertions**

In `tests/domain/tts-ui-source.test.ts`, inside the test `"paginates only the current Coco line with accessible fixed controls"`, immediately after the line `expect(dialogueSource).toContain("findDialoguePageIndex");`, add:

```typescript
    expect(dialogueSource).toContain('paginateDialogueText(dialogueText ?? "")');
    expect(dialogueSource).not.toContain("protectedPages");
    expect(dialogueSource).toContain("clampPhrasesToPage");
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/domain/tts-ui-source.test.ts`
Expected: FAIL on the three new assertions (`protectedPages` still present, `clampPhrasesToPage` absent).

- [ ] **Step 3: Edit the component**

In `src/components/student/CocoDialogueBox.tsx`, make these four edits:

Edit A — add the helper to the existing translation-hint import block:

```typescript
import {
  buildTranslationSegments,
  clampPhrasesToPage,
  parseTranslationHint,
  toggleTranslationBubble,
  type TranslatableCocoLine,
  type TranslationPhrase,
} from "@/domain/ai/translation-hint";
```

Edit B — pages depend only on the dialogue text. Replace:

```typescript
  const pages = useMemo(
    () => paginateDialogueText(dialogueText ?? "", phrases),
    [dialogueText, phrases],
  );
```

with:

```typescript
  const pages = useMemo(
    () => paginateDialogueText(dialogueText ?? ""),
    [dialogueText],
  );
```

Edit C — in `loadTranslationHint`, pages are already frozen, so delete the recompute. Replace:

```typescript
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

with:

```typescript
      setTranslationState({ kind: "ready", phrases: parsed.hint.phrases });
      setExpandedPhraseIndex(0);
      setCurrentPageIndex(findDialoguePageIndex(pages, firstPhrase.start));
```

Edit D — clamp instead of filtering out straddling phrases, and look up the owning phrase by containment (a clamped segment's absolute range sits inside its phrase, so offset equality no longer works). Replace:

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
```

with:

```typescript
  const pagePhrases = currentPage
    ? clampPhrasesToPage(phrases, currentPage)
    : [];
```

and inside the segment render callback replace:

```typescript
                  const absoluteStart = currentPage.start + segment.phrase.start;
                  const phraseIndex = phrases.findIndex(
                    (phrase) =>
                      phrase.start === absoluteStart &&
                      phrase.end === currentPage.start + segment.phrase.end,
                  );
```

with:

```typescript
                  const absoluteStart = currentPage.start + segment.phrase.start;
                  const absoluteEnd = currentPage.start + segment.phrase.end;
                  const phraseIndex = phrases.findIndex(
                    (phrase) =>
                      phrase.start <= absoluteStart && phrase.end >= absoluteEnd,
                  );
```

and update the span key on the next JSX element from
`` key={`${absoluteStart}-${currentPage.start + segment.phrase.end}`} `` to
`` key={`${absoluteStart}-${absoluteEnd}`} ``.

- [ ] **Step 4: Run the focused suites and typecheck**

Run: `npx vitest run tests/domain/tts-ui-source.test.ts tests/domain/dialogue-pagination.test.ts tests/domain/translation-hint.test.ts && npm run typecheck`
Expected: all PASS; typecheck clean (the Task 1 arity break is resolved by Edit B/C).

- [ ] **Step 5: Commit**

```bash
git add src/components/student/CocoDialogueBox.tsx tests/domain/tts-ui-source.test.ts
git commit -m "feat: freeze dialogue pages against hint and split straddling highlights"
```

---

### Task 4: Constant four-line chatbox with matching stage growth

**Files:**
- Modify: `src/components/student/styles.ts:237-275` (`mascotStageStyle`, `mascotSpriteWrapStyle`, `mascotDialogueShellStyle`)
- Test: `tests/domain/mascot-layout.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: style constants only — `mascotDialogueShellStyle.height: 144`, `mascotSpriteWrapStyle.bottom: 166`, `mascotStageStyle.height: 400`.

Height derivation (record, don't guess): dialogue text is 18px × 1.3 line-height = 23.4px/line; four lines = 93.6px. The box has 22px padding and a 2px border on each side (border-box), so the shell needs ≥ 93.6 + 44 + 4 = 141.6px → **144**. Delta from 104 is 40, so the sprite bottom offset goes 126 → **166** and the stage height 360 → **400**, preserving the 10px sprite/chatbox overlap and the 54px headroom above the sprite. The pager overhangs 22px below the shell and the shell keeps its 32px bottom inset, so the pager stays inside the stage and cannot touch the answer panel below it.

- [ ] **Step 1: Add the failing layout tests**

In `tests/domain/mascot-layout.test.ts`, extend the import from `@/components/student/styles` with `mascotDialogueBoxStyle`, `mascotDialoguePagerStyle`, and `mascotDialogueTextStyle`, then append inside `describe("mascot stage geometry", ...)`:

```typescript
  it("fits four dialogue text lines inside the constant-height chatbox", () => {
    const shellHeight = numericStyleValue(mascotDialogueShellStyle.height);
    const padding = numericStyleValue(mascotDialogueBoxStyle.padding);
    const fontSize = numericStyleValue(mascotDialogueTextStyle.fontSize);
    const lineHeight = numericStyleValue(mascotDialogueTextStyle.lineHeight);
    expect(mascotDialogueBoxStyle.border).toBe("2px solid #2563EB");
    const borderWidth = 2;
    const textCapacity = shellHeight - 2 * padding - 2 * borderWidth;
    expect(textCapacity).toBeGreaterThanOrEqual(4 * fontSize * lineHeight);
  });

  it("keeps the pager inside the stage below the chatbox", () => {
    const dialogueBottom = numericStyleValue(mascotDialogueShellStyle.bottom);
    const pagerOverhang = -numericStyleValue(mascotDialoguePagerStyle.bottom);
    expect(dialogueBottom).toBeGreaterThan(pagerOverhang);
  });
```

- [ ] **Step 2: Run to verify the four-line test fails**

Run: `npx vitest run tests/domain/mascot-layout.test.ts`
Expected: FAIL — capacity 104 − 44 − 4 = 56 is under 93.6. (The pager test already passes; it guards the invariant.)

- [ ] **Step 3: Grow the three style constants**

In `src/components/student/styles.ts`: `mascotStageStyle.height: 360` → `400`; `mascotSpriteWrapStyle.bottom: 126` → `166`; `mascotDialogueShellStyle.height: 104` → `144`.

- [ ] **Step 4: Run to verify pass (overlap invariant included)**

Run: `npx vitest run tests/domain/mascot-layout.test.ts`
Expected: PASS — including the pre-existing "overlaps Coco's frame with the main chatbox by 10px" test, which proves the stage grew in step.

- [ ] **Step 5: Commit**

```bash
git add src/components/student/styles.ts tests/domain/mascot-layout.test.ts
git commit -m "feat: constant four-line dialogue chatbox with matching stage height"
```

---

### Task 5: Full verification and document reconciliation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-19-dynamic-dialogue-pagination-open-followups.md` (supersession note only)
- Modify: `TASK.md`

**Interfaces:**
- Consumes: all previous tasks committed.
- Produces: verified branch state ready for user phone UAT.

- [ ] **Step 1: Run the full gate**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: all tests pass (roughly 740+, 4 skipped); typecheck clean; lint clean except the pre-existing unused-argument warning in `scripts/check-student-feedback-states.mjs`. Any other failure blocks this task — fix it or report it; do not skip.

- [ ] **Step 2: Mark the old plan superseded**

At the top of `docs/superpowers/plans/2026-07-19-dynamic-dialogue-pagination-open-followups.md`, directly under the H1 title, insert:

```markdown
> **Superseded (pagination scope):** the pagination rules in this plan are superseded by `docs/superpowers/plans/2026-07-20-sentence-aware-dialogue-pagination.md` per the 2026-07-20 design spec. Open-follow-up prompt scope is unaffected.
```

- [ ] **Step 3: Update TASK.md**

In `TASK.md`: check the done-check `Revised implementation plan for the 2026-07-20 design is written and approved`, check `Focused tests and proportionate project checks pass for the revised implementation`, remove the two *(verified under the superseded budget rule; re-verify under the revised design)* annotations (they are now re-verified), and replace the final "Next:" line of Current Position with:

```markdown
Next: user runs phone UAT through the existing port-3200 tunnel and confirms sentence-aligned pages, Hint-stable boundaries, the four-line chatbox with no answer-panel overlap, and the `6d73777b` phrase-control height fix. Any phone screenshot must be labeled as user-supplied live UAT evidence.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-07-19-dynamic-dialogue-pagination-open-followups.md TASK.md
git commit -m "docs: reconcile task state for sentence-aware pagination"
```

- [ ] **Step 5: Confirm the port-3200 server serves the new build**

The dev server on port 3200 hot-reloads from this worktree. Verify it is still listening (`lsof -nP -iTCP:3200 -sTCP:LISTEN`) and report readiness for phone UAT to the user. Do NOT claim UAT success — the final gate is the user's phone evidence.
