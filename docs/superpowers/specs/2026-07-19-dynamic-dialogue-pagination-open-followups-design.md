# Design dynamic dialogue pagination and open follow-ups

**Date:** 2026-07-19

**Status:** Approved in conversation; awaiting written-spec review

**Scope:** Recovered remainder of Codex task `019f6971-5098-7662-80f5-59dd076a538a`

## Problem

The current Coco dialogue shell has a fixed reading area with internal vertical scrolling. Longer lines crowd the box, especially on mobile, and the translation overlay makes the same small area harder to scan. The Hint control also changes to `Hint…` without a clear visual loading signal.

Dynamic conversation has a separate quality problem. Its prompt explicitly permits concrete either/or questions. That can produce repetitive chains such as `inside or outside?` followed by `friends or alone?`, which reward one-word answers instead of helping an elementary learner produce a useful phrase or short sentence.

Mascot placement from the recovered task has already been repaired on `main`; this design does not reopen it. Latency and TTS-pipeline improvements are a separate future task.

## Product Behavior

### Current-message pagination

- Pagination applies only to Coco's currently visible message. It is not conversation history.
- Short messages remain a single page and show no pagination controls.
- Long messages are split at sentence boundaries first, then natural clause punctuation, and finally whitespace only when one unit cannot fit within the page budget.
- The source text is preserved exactly. Pagination records source start and end offsets rather than rewriting or normalizing the text.
- A new Coco message always opens on page 1.
- The dialogue box keeps a compact, stable reading area and does not use an internal scrollbar.
- Multi-page messages show large previous and next controls attached to the lower-left and lower-right corners, outside the text area, with a centered `current / total` indicator.
- Both controls remain mounted to prevent layout shifts. The unavailable direction is disabled and visibly subdued.

The page budget is 16 source words, where each non-whitespace sequence counts as one word. Semantic boundaries take precedence over filling every page. This budget keeps generated dynamic lines, which are limited to 12 words, on one page while paginating longer authored and feedback lines. It also avoids viewport-, font-, and translation-dependent layout calculations.

### Translation hints across pages

- Translation phrase offsets remain relative to the complete source line.
- Each page retains its full-source start and end offsets, allowing phrase segments to be mapped to the correct visible page without guessing from rendered text.
- When a candidate page boundary falls inside a translated phrase, move the boundary to the phrase start if that leaves content on the current page. Otherwise, move it to the phrase end and allow that page to exceed 16 words. A translated phrase is never split across pages.
- Pressing Hint loads the phrase data, moves to the page containing the first phrase, and expands that phrase's Korean bubble.
- Selecting another highlighted phrase expands only that phrase.
- Korean bubbles may extend outside the dialogue shell and do not affect pagination.
- If loading fails, the existing retry behavior remains available.
- During loading, the control continues to read `Hint` and displays a visible spinner. Its accessible label is `Loading hint`, and `aria-busy` remains true.

### Dynamic follow-up quality

- After a meaningful answer, Coco asks an open question that invites a short phrase or sentence and connects directly to the student's answer.
- A short answer can still be meaningful. For example, after `Inside`, Coco should ask `What games do you play inside?`, not another binary question.
- Yes/no and either/or questions are not the default continuation pattern.
- Either/or scaffolding is allowed only after a genuinely vague, unclear, or stuck response such as `I don't know`, `anything`, or repeated non-informative replies.
- Coco continues to acknowledge the latest answer briefly, avoids asking for already-known information, stays within the scene, and uses elementary-level English.
- Existing turn caps, wind-down behavior, moderation, persistence, conversation-history grounding, and target-pattern soft context remain unchanged.
- Preset mission prompting, evaluation, correction, transitions, and hint ladders remain byte-for-behavior unchanged.

## Architecture

### Pure pagination domain

A small domain module owns semantic splitting and source offsets. It accepts the complete dialogue string plus optional protected translation ranges and returns ordered pages:

```ts
type DialoguePage = {
  start: number;
  end: number;
  text: string;
};
```

The module has no React or browser dependency. It packs sentence units into the 16-word budget, then splits an oversized sentence at clause punctuation such as commas, semicolons, or colons. It uses whitespace only when a clause still exceeds the budget. The returned ranges preserve every source character exactly once and never end inside a protected phrase range.

### Dialogue component state

`CocoDialogueBox` owns only presentation state:

- current page index;
- existing translation request state;
- expanded phrase index.

It derives pages from the current dialogue and loaded phrase ranges. A dialogue descriptor change resets the page and hint state. Loading a hint recomputes protected pages, selects the first phrase's page, and expands the phrase. Page navigation does not refetch translation data or alter the underlying Coco line.

### Conversation prompt policy

The duplicated conversation policy text in the pure prompt builder and server adapter is updated together. Tests assert both paths express the same rules: open questions after meaningful answers, either/or only as rescue scaffolding, and no changes to preset evaluation.

## Data Flow

1. The mission shell supplies the current server-owned Coco line and line descriptor.
2. `CocoDialogueBox` paginates the full line and renders the selected page.
3. Previous or next changes only the local page index.
4. Hint requests continue to send only the owned line descriptor.
5. The server returns full-line translation phrase offsets.
6. The client protects those ranges during repagination, selects the first phrase's page, and renders only segments intersecting the selected page.
7. A later dynamic turn replaces the line descriptor, resetting pagination to page 1.

Dynamic reply generation remains server-owned. It receives the same persisted conversation history and returns the same validated `{ line }` schema; only the generation instructions change.

## Error and Edge Handling

- Empty dialogue renders no text or pagination controls.
- Whitespace-only or malformed content falls back to one preserved page rather than throwing.
- A single over-budget word remains intact on its own page.
- If a protected translation phrase itself exceeds the page budget, it stays intact on one over-budget page.
- Stale or aborted Hint responses cannot change pages or expanded phrases.
- Hint failure leaves the English page readable and exposes Retry hint.
- Page indices are clamped whenever repagination changes the total page count.
- Disabled navigation controls remain keyboard-visible and screen-reader-labeled.

## Testing

### Domain tests

- Single-page text remains unchanged.
- Multiple sentences pack without splitting natural boundaries unnecessarily.
- A long sentence falls back to clauses, then whitespace.
- Concatenating page slices reproduces the exact source text.
- Protected translation phrases never cross a page boundary.
- Over-budget words and protected phrases remain intact.

### Component and source-contract tests

- Pagination controls appear only for multiple pages.
- A new line resets to page 1.
- Navigation exposes correct disabled states and page count.
- Hint loading shows a spinner while retaining the visible `Hint` label.
- Loaded hints move to and expand the first phrase's page.
- Translation errors preserve readable English and retry behavior.

### Conversation tests

- Prompt contracts explicitly prefer open, expandable follow-ups after meaningful short answers.
- Prompt contracts prohibit default chains of yes/no or either/or questions.
- Prompt contracts retain rescue scaffolding for vague or stuck answers.
- Existing conversation-history, moderation, wind-down, hard-cap, and preset-path tests remain green.

### Manual UAT

- On a phone-width viewport, verify a long message has no internal scroll and its arrows remain easy to tap.
- Reveal a phrase on a later page and confirm the correct page opens without clipping the Korean bubble.
- Run a conversation containing `I like to play games` followed by `Inside`; confirm Coco asks for an expandable detail rather than another binary choice.
- Give a genuinely vague response and confirm Coco may offer two helpful choices.

## Non-goals

- Browsing prior conversation turns.
- Provider-side conversation state or response chaining.
- New translation APIs or arbitrary client-supplied text.
- Changes to evaluation acceptance, pronunciation scoring, corrections, or completion.
- Mascot geometry changes.
- TTS, upload, generation-latency, or transition-pipeline optimization.
