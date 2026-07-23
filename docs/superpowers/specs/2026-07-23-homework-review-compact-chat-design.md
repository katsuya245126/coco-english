# Compact Homework Review Design

**Date:** 2026-07-23
**Status:** Approved
**Scope:** Dynamic Homework Review only

## Goal

Make Homework Review feel like a compact, friendly conversation rather than a
stack of evidence cards. A learner should be able to scan what Coco said, what
they said, and whether an answer needed another try before deciding whether to
listen to a recording.

## Evidence and approved direction

The user supplied a localhost screenshot on 2026-07-23. It showed that the
screen's main problem was visual hierarchy:

- expanded native audio controls consumed most of each answer bubble;
- pronunciation cards competed with correction and success feedback;
- a corrected turn became much taller than the surrounding conversation;
- Coco's portrait and name read as a header rather than a chat avatar.

The user approved the **Compact Chat** direction, the audio-button-inside-bubble
variant, and a Messenger-style circular Coco portrait beside each left-aligned
message.

## Visual source of truth

The tracked preview at
`docs/superpowers/specs/previews/2026-07-23-homework-review-compact-chat.html`
is the visual source of truth for:

- single-column conversation hierarchy;
- left/right message alignment;
- relative width and spacing of message bubbles;
- Coco portrait size, circular crop, and placement;
- collapsed audio-button placement and minimum target size;
- retry, accepted repeat, minor recast, and success emphasis;
- desktop reading-column width and mobile wrapping intent.

The preview is synthetic planning evidence, not an application screenshot.
Written requirements in this specification control behavior, accessibility,
loading/error states, and security details that a static preview cannot show.
If implementation needs an intentional visual deviation, update the preview
and obtain user approval before continuing.

Implementation verification must capture localhost screenshots at a mobile
viewport and a desktop viewport, label them as localhost evidence, and compare
them against the tracked preview. A passing test suite alone is not sufficient
visual verification.

## Presentation

### Page and conversation

- Keep the `Homework Review` heading and add one short supporting sentence:
  `Look back at your conversation with Coco.`
- Retain a centered, single-column reading flow.
- Set the desktop review column to a 590px maximum, replacing the current
  430px limit so message text and compact controls have room without making
  lines difficult to read.
- Keep the layout overflow-free at 320px, 375px, 414px, 768px, 1024px, and
  1440px viewport widths.
- Preserve the existing final Coco goodbye and full-width
  `Back to homework` action at the end.

### Coco messages

- Use the existing `/images/coco-happy-alpha.png` asset.
- Crop it inside a true circular avatar beside every left-aligned Coco bubble,
  aligned with the lower edge of the bubble in the familiar Messenger pattern.
- Render `Coco` as a small speaker name immediately above the bubble.
- Keep the portrait decorative after the first occurrence if repeated
  alternative text would add noise; the visible name continues to identify the
  speaker.

### Student messages

- Keep the student's visible name above right-aligned answer bubbles.
- Do not add a second student portrait; right alignment and blue bubble styling
  already distinguish the learner.
- Keep original and repeat attempts as separate bubbles so their transcript and
  audio evidence cannot be confused.

## Audio interaction

- Remove always-expanded audio controls from Homework Review.
- For every attempt whose audio playback state is `available`, render a
  minimum-44px SVG audio button inside that attempt's answer bubble, on the
  same row as the transcript.
- The button's accessible label identifies its action, such as
  `Listen to this recording`.
- On first activation:
  1. request the signed playback URL through the existing
     `loadHistoryAudioAction`;
  2. show a bounded preparing state without shifting unrelated messages;
  3. reveal a compact responsive player beneath the transcript when the URL is
     ready.
- The revealed state includes a clear collapse control. Collapsing preserves
  the already-loaded signed URL for the lifetime of the component and does not
  issue a second request when reopened.
- Loading and unavailable feedback stays associated with the exact attempt.
- Original and repeat recordings retain separate component state and signed
  URL requests. Opening one must never play or relabel the other.
- Multiple attempts may be open at once; enforcing a single globally open
  player would add coordination without serving the approved goal.
- Use a Homework Review-specific compact variant or wrapper so the shared
  preset Read-only recap remains visually unchanged.

## Pronunciation presentation

- Do not render pronunciation stars, scores, green cards, `Great job!`, or
  words-to-practice content anywhere in dynamic Homework Review.
- Do not remove pronunciation queries, stored results, or teacher evidence.
- Do not change the preset Read-only recap, which may continue to show its
  existing pronunciation presentation.

## Correction and success states

- Preserve the red circular `!` beside an original answer that required a
  repeat.
- Preserve the accepted repeat as its own right-aligned bubble beneath the
  original.
- Show exactly one green `✓ Good job!` after the accepted answer for the turn.
- Preserve minor naturalizations beneath the learner's original answer.
- Mark changed words in red and underline them so color is not the only signal.
- Preserve neutral teacher-review turns without exposing internal review
  reasons or showing incorrect success feedback.
- Keep the existing screen-reader-only explanation for a retry.

## Accessibility and responsive behavior

- Use semantic buttons with visible keyboard focus.
- Maintain at least 44px pointer targets.
- Do not use emoji as interactive icons; use stable SVG icons.
- Keep text contrast at or above WCAG AA.
- Ensure audio loading, failure, expanded, and collapsed states are available
  to assistive technology.
- Avoid animation that changes layout unexpectedly; any decorative transition
  must respect `prefers-reduced-motion`.
- No horizontal scrolling or clipped native controls at supported widths.

## Error handling

- `expired` and unavailable recordings remain non-interactive and display the
  existing bounded recording-status message near the associated transcript.
- A failed signed-URL request exposes `Recording unavailable` as an inline
  alert without hiding the transcript or correction result.
- Audio failure never blocks navigation back to homework.

## Implementation boundaries

Expected implementation surfaces are limited to:

- `src/components/student/HomeworkReview.tsx`;
- `src/components/student/HomeworkReview.module.css`;
- the shared audio player through an opt-in compact variant, or a narrowly
  scoped Homework Review audio wrapper;
- focused component and UI contract tests.

No database, RLS, ownership, signed-URL authorization, scoring, teacher-review,
mission-flow, or recap-data-model change is required.

## Verification

Test first and prove:

- pronunciation presentation is absent from Homework Review;
- preset Read-only recap behavior remains unchanged;
- available original and repeat audio controls retain the correct clip IDs;
- compact controls expose loading, playable, collapsible, and unavailable
  states;
- controls have semantic labels and minimum target sizing;
- retry, minor-recast, neutral, final-goodbye, and success states still render
  correctly;
- changed words use both color and underline;
- focused tests, typecheck, lint, full tests, and build pass.

Then run a localhost visual comparison against the tracked preview at mobile
and desktop widths. Record any difference; do not silently accept visual drift.
