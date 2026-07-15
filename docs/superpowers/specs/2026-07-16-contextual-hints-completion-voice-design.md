# Contextual Dynamic Hints and Completion Voice Design

**Date:** 2026-07-16
**Scope:** Phase 11 dynamic conversation UAT follow-up

## Problem

Dynamic Coco follow-ups currently reuse the mission's original target-pattern hint. After Coco changes the conversational question, that hint can be unrelated to the answer the student now needs to give. For example, `What do you like to do for fun?` currently reveals `Try using: How often do you ____?`.

The completion screen also sends its full visible status message to text-to-speech. Coco consequently reads both the celebratory heading and the administrative explanation intended for the student.

## Approved Behavior

### Dynamic conversation hints

- Do not show the original mission pattern as a fallback hint for a dynamic Coco line.
- Use the Korean semantic phrase-hint flow already specified in `2026-07-15-korean-phrase-hints-chatbox.md` for the current visible Coco line.
- Phrase hints must be resolved from the current server-owned line descriptor, not from arbitrary client text.
- If no contextual phrase hint is available, keep the English prompt usable and show no misleading pattern fallback.
- Authored preset-mission hint ladders remain unchanged.

### Completion speech

- Keep the completion heading and explanatory body visible:
  - `Mission complete!`
  - `Great work! You finished all N turns. Your teacher will see your answers.`
- The completion TTS descriptor resolves only to `Mission complete!`.
- Assignment-time TTS cache warming uses the same short completion line so warmed and on-demand audio cannot diverge.

## Data Flow

The existing bounded line descriptor (`mission_prompt` or `coco_dynamic_line` plus turn order) identifies the current Coco prompt. The phrase-hint resolver verifies student access, resolves that exact prompt from the assignment snapshot or persisted attempt turn, and returns validated Korean phrase hints. The client renders only returned phrase spans and never reconstructs the old target-pattern fallback.

For completion, the client continues requesting the existing completion TTS descriptor. The server maps that descriptor to `completionHeading` only. Visible completion copy remains owned by `StepMissionComplete` and is unaffected.

## Failure Behavior

- Phrase selection or translation failure does not block recording or completion.
- A dynamic line with no returned phrases remains visible in English without a stale pattern hint.
- Completion TTS failure retains the existing retryable speaker-control behavior and does not hide the completion text.

## Verification

- A regression proves a dynamic follow-up cannot derive `Try using: <original target pattern>`.
- Phrase-hint tests prove resolution is tied to the current dynamic line and that unavailable hints do not fall back to the mission pattern.
- TTS route and cache-warming tests expect exactly `Mission complete!` for completion audio.
- Existing preset hint-ladder and visible completion-copy tests continue to pass.

## Non-Goals

- Changing authored preset hints.
- Removing the visible teacher-review completion message.
- Speaking Korean translations.
- Introducing a second completion audio descriptor or new completion UI.
