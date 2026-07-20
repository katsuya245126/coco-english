# Dynamic dialogue pagination and open follow-ups

**Status:** Complete (phone UAT passed 2026-07-20; merge approved)

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

- [x] Approved design spec is committed (2026-07-20 sentence-aware spec supersedes the pagination rules of the 2026-07-19 spec).
- [x] Revised implementation plan for the 2026-07-20 design is written and approved (the 2026-07-19 plan is superseded).
- [x] Long current messages paginate without internal scrolling.
- [x] Page boundaries preserve source text and translation phrase ranges.
- [x] Hint loading uses a visible spinner and opens the first translated phrase on its page.
- [x] Dynamic prompt rules favor expandable open questions.
- [x] Preset behavior remains unchanged.
- [x] Focused tests and proportionate project checks pass for the revised implementation.
- [x] Phone UAT (2026-07-20) confirms natural sentence-aligned pages, Hint-stable boundaries, and the pale-blue phrase control on device; Korean hint-bubble sizing fixed (c6f6eced) and merge approved by the user.

## Plan

1. Write and review the design specification. Complete; revised 2026-07-20.
2. Create an implementation plan after user approval. The 2026-07-19 plan is superseded by the revised design; a revised plan is not yet written or approved.
3. Write and approve the revised implementation plan.
4. Implement test-first in small, scoped steps.
5. Verify with automated checks, then phone UAT, then archive this task.

## Current Position

Implementation is committed through `b55f6ac3`. Phone UAT exposed two regressions:

- the approved 16-word budget had been changed to 8, producing a 4/8/1 split for the 13-word summer-vacation line and different boundaries after hint ranges loaded;
- the English phrase control's 44px minimum height and negative vertical margin covered adjacent text.

Both regressions now have focused tests and local fixes. Verification on 2026-07-20:

- focused pagination/UI tests: 38 passed;
- full Vitest suite: 740 passed, 4 skipped;
- typecheck: passed;
- lint: passed with one pre-existing unused-argument warning in `scripts/check-student-feedback-states.mjs`.

Phone UAT (`Screenshot_20260720_024926_Chrome.jpg`, user-supplied) then showed the restored 16-word budget packs the 13-word summer-vacation message onto one page that overflows the 104px chatbox and hides the pager. On 2026-07-20 the user reviewed and approved a revised pagination design (sentence-atomic pages, ≤10-word packing, 16-word single-sentence cap with clause/whitespace fallback, pages frozen against Hint with split highlights, constant 4-line chatbox with matching mascot-stage growth): `docs/superpowers/specs/2026-07-20-sentence-aware-dialogue-pagination-design.md`.

Next: user runs phone UAT through the existing port-3200 tunnel and confirms sentence-aligned pages, Hint-stable boundaries, the four-line chatbox with no answer-panel overlap, and the `6d73777b` phrase-control height fix. Any phone screenshot must be labeled as user-supplied live UAT evidence.
