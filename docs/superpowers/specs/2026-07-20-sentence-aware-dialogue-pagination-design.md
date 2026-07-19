# Sentence-Aware Dialogue Pagination Design

**Date:** 2026-07-20
**Status:** Approved (pending user review of this document)
**Supersedes:** the "page budget" and protected-range boundary rules in
`2026-07-19-dynamic-dialogue-pagination-open-followups-design.md`. All other
sections of that spec (controls, spinner, open follow-up prompt rules, preset
behavior) remain in force.

## Motivation

Phone UAT (user-supplied live screenshot,
`/Users/john/Downloads/Screenshot_20260719_202529_Chrome.jpg`) showed two
failures of the budget-first rule:

1. With a reduced 8-word budget, the sentence "What are you going to do during
   summer vacation?" split at an awkward word boundary, and the split moved
   after Hint phrases loaded.
2. With the approved 16-word budget, the 13-word two-sentence message packed
   onto a single page that overflows the fixed 104px chatbox (four rendered
   lines) and hides the pager entirely.

The word budget alone cannot express the real requirement: sentences should
stay whole, short sentences may share, long content must still paginate, and
Hint must never move page boundaries.

## Decision summary

| Decision | Choice |
| --- | --- |
| Page unit | Sentence-aware packing: sentences are atomic; very short sentences may share a page |
| Packing budget | Two or more sentences share a page only while the combined total is ≤ 10 source words |
| Single-sentence cap | A lone sentence stays whole up to 16 source words |
| Overflow fallback | A sentence over 16 words splits at clause punctuation within the 16-word budget, then whitespace as a last resort |
| Hint stability | Pages are a pure function of the English source text; Hint loading never changes boundaries |
| Straddling phrase | A Hint phrase crossing a frozen boundary renders as one highlight segment per page; each segment is tappable and opens the same translation bubble |
| Chatbox height | Constant height sized for four rendered lines at the narrowest supported phone width |
| Stage layout | The mascot stage's reserved height grows by the same delta so nothing overlaps the answer panel |

## Pagination rules

Definitions: a **word** is a maximal non-whitespace run (`/\S+/gu`), matching
the existing implementation. A **sentence** ends at the existing sentence
boundary pattern (`[.!?]` runs plus trailing quotes/brackets and whitespace);
trailing text without a terminator counts as a final sentence.

1. Split the source text into sentences.
2. Build pages greedily in source order. A page starts with one sentence. The
   next sentence joins the current page only if the page's combined word count
   would stay ≤ `DIALOGUE_PAGE_PACK_WORD_LIMIT` (10).
3. A single sentence is atomic up to `DIALOGUE_PAGE_WORD_LIMIT` (16) words,
   even though 11–16 words exceeds the packing budget. Such a sentence is
   always alone on its page.
4. A sentence over 16 words is exceptionally long: split it at the last clause
   boundary (`[,;:]`) within the 16-word budget, else at the last whitespace
   within the budget, and repeat on the remainder until every fragment is
   ≤ 16 words. Fragments of a split sentence never pack with neighboring
   sentences or with each other.
5. `paginateDialogueText` takes only the source text. The current
   `protectedRanges` parameter and `protectBoundary` adjustment are removed:
   pages are computed once from English source text and are immutable
   thereafter.

Worked examples:

- "It's almost summer vacation! What are you going to do during summer
  vacation?" (5 + 8 words) → two sentence-aligned pages, identical before and
  after Hint loads.
- "Great job! Let's keep going." (2 + 4 words) → one page.
- Three 3-word sentences (9 combined) → one page; a fourth pushes to a new
  page.

## Hint and translation behavior

- Loading Hint (protected phrase ranges) must not reshuffle existing page
  boundaries under any circumstance.
- A translated phrase can straddle a page boundary only inside a clause- or
  whitespace-split long sentence. In that case each page renders its own
  portion of the phrase as a highlight segment; tapping either segment opens
  the same translation bubble for the full phrase.
- Opening Hint still navigates to the page containing the first translated
  phrase's first character (existing `findDialoguePageIndex` behavior).
- Full-source offsets, translation phrase ranges, current-message-only
  pagination, server-owned line descriptors, and preset mission behavior are
  preserved.

## Layout requirements

- The dialogue text region has a constant height sized for four rendered
  lines of dialogue text at the narrowest supported phone width, defined here
  as **360 CSS px** (Galaxy-class; the UAT device). Worst case is a 16-word
  single sentence.
- Increasing the dialogue shell height (currently 104px in
  `mascotDialogueShellStyle`) **must** be matched by increasing the mascot
  stage's reserved height: the sprite's bottom offset (currently 126px) and
  the stage height (currently 360px) grow by the same delta so the sprite
  stays attached to the box and the chatbox, pager, and Hint bubble cannot
  overlap the answer panel below the stage.
- Positions of the mascot, chatbox, pager controls, and answer panel remain
  fixed while paging; no element shifts as the student taps through pages.
- Short pages leave visible empty space inside the box; this is an accepted
  tradeoff.
- Verify at 360×800 and 390×844 viewports.

## Testing and verification

Test-first regressions before code changes:

1. The summer-vacation message paginates to exactly two sentence-aligned
   pages, and the rendered page boundaries are identical before and after
   Hint ranges load (asserted at the rendering layer, since the domain
   function no longer accepts ranges).
2. Combined ≤ 10-word sentences pack onto one page; an 11+ combined pair does
   not.
3. A 17+ word sentence clause-splits; a phrase spanning the split renders one
   tappable highlight segment per page, both opening the same bubble.
4. Existing focused pagination/UI tests updated where budget-packing
   semantics changed.

Automated gate: focused tests, full Vitest suite, typecheck, lint.

Final gate: **user-supplied live phone UAT** through the existing port-3200
tunnel. Desktop or synthetic captures are not phone proof. The same UAT pass
must also confirm the pale-blue English phrase control no longer covers
adjacent text (fix landed in `6d73777b`, unconfirmed on phone).

## Non-goals

- Rendered-height (measured) pagination.
- Conversation-history browsing, preset mission evaluation changes, mascot
  artwork changes, latency or TTS work.
