# Dynamic dialogue pagination and open follow-ups

**Status:** Awaiting phone UAT confirmation

## Goal

Make Coco's current dialogue easier to read in a compact chat box and make dynamic-conversation follow-ups invite phrases or short sentences instead of repetitive one-word answers.

## Scope

- Paginate only the current Coco message using semantic text boundaries.
- Keep translation phrase highlighting and bubbles aligned with the visible page.
- Add clear previous/next controls, a page indicator, and a visible Hint loading spinner.
- Prefer open, context-grounded dynamic follow-ups; reserve either/or questions for vague or stuck responses.

## Non-goals

- Conversation-history browsing.
- Changes to preset mission evaluation, correction, progression, or hint ladders.
- Mascot placement work already completed on `main`.
- Latency, TTS generation, or transition-pipeline optimization.

## Constraints

- Preserve server-owned prompt provenance, translation offsets, and attempt history.
- Preserve unrelated working-tree changes.
- Do not push, merge, deploy, publish, or modify production without explicit permission.

## Done Checks

- [x] Approved design spec is committed.
- [x] Implementation plan is approved.
- [x] Long current messages paginate without internal scrolling.
- [x] Page boundaries preserve source text and translation phrase ranges.
- [x] Hint loading uses a visible spinner and opens the first translated phrase on its page.
- [x] Dynamic prompt rules favor expandable open questions.
- [x] Preset behavior remains unchanged.
- [x] Focused tests and proportionate project checks pass.
- [ ] Phone UAT confirms natural page boundaries and non-overlapping phrase highlighting.

## Plan

1. Write and review the design specification. Complete.
2. Create an implementation plan after user approval. Complete.
3. Implement test-first in small, scoped steps.
4. Verify and archive this task.

## Current Position

Implementation is committed through `b55f6ac3`. Phone UAT exposed two regressions:

- the approved 16-word budget had been changed to 8, producing a 4/8/1 split for the 13-word summer-vacation line and different boundaries after hint ranges loaded;
- the English phrase control's 44px minimum height and negative vertical margin covered adjacent text.

Both regressions now have focused tests and local fixes. Verification on 2026-07-20:

- focused pagination/UI tests: 38 passed;
- full Vitest suite: 740 passed, 4 skipped;
- typecheck: passed;
- lint: passed with one pre-existing unused-argument warning in `scripts/check-student-feedback-states.mjs`.

Phone UAT then showed the restored 16-word budget packs the 13-word summer-vacation message onto one page that overflows the 104px chatbox and hides the pager. On 2026-07-20 the user approved a revised pagination design (sentence-atomic pages, ≤10-word packing, 16-word single-sentence cap with clause/whitespace fallback, pages frozen against Hint with split highlights, constant 4-line chatbox with matching mascot-stage growth): `docs/superpowers/specs/2026-07-20-sentence-aware-dialogue-pagination-design.md`.

Next: user reviews the new spec, then revise the implementation plan (writing-plans) before any code change. Phone UAT of `6d73777b`'s phrase-control height fix is still owed and folds into the next UAT pass.
