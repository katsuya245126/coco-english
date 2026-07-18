# Dynamic dialogue pagination and open follow-ups

**Status:** Planning

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

- [ ] Approved design spec is committed.
- [ ] Implementation plan is approved.
- [ ] Long current messages paginate without internal scrolling.
- [ ] Page boundaries preserve source text and translation phrase ranges.
- [ ] Hint loading uses a visible spinner and opens the first translated phrase on its page.
- [ ] Dynamic prompt rules favor expandable open questions.
- [ ] Preset behavior remains unchanged.
- [ ] Focused tests and proportionate project checks pass.

## Plan

1. Write and review the design specification.
2. Create an implementation plan after user approval.
3. Implement test-first in small, scoped steps.
4. Verify and archive this task.

## Current Position

The recovered design was approved on 2026-07-19. Next: user review of the written specification.
