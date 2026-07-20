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
- [x] Revised implementation plan for the 2026-07-20 design is written and approved.
- [x] Long current messages paginate without internal scrolling.
- [x] Page boundaries preserve source text and translation phrase ranges.
- [x] Hint loading uses a visible spinner and opens the first translated phrase on its page.
- [x] Dynamic prompt rules favor expandable open questions.
- [x] Preset behavior remains unchanged.
- [x] Focused tests and proportionate project checks pass for the revised implementation.
- [x] Phone UAT (2026-07-20) confirms natural sentence-aligned pages, Hint-stable boundaries, and the pale-blue phrase control on device; Korean hint-bubble sizing fixed (`c6f6eced`) and merge approved by the user.

## Completion evidence

- Implementation merged to `main` in `5d797a06`.
- Phone UAT completed in the protected `worktree-dynamic-dialogue-pagination` worktree on 2026-07-20.
- The protected port-3200 worktree remains available until the user explicitly retires it.
