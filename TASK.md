# Compact Homework Review

**Status:** Design approved; written specification ready for user review
**Classification:** Normal
**Started:** 2026-07-23

## Desired outcome

Make the dynamic Homework Review easier for elementary learners to scan by
removing pronunciation cards, keeping recordings collapsed until requested,
and presenting Coco with a familiar Messenger-style circular portrait beside
each left-aligned message.

## Scope

- Dynamic Homework Review only.
- Remove pronunciation presentation from this screen without deleting or
  changing stored pronunciation data.
- Put a 44px audio control inside each answer bubble that has an available
  recording.
- Load the existing signed playback URL only when the learner requests audio,
  then reveal a compact responsive player for that exact original or repeat
  attempt.
- Render Coco's existing portrait as a circular avatar beside every Coco
  message.
- Preserve retry, accepted repeat, minor recast, success, neutral-review, final
  goodbye, and Back to homework behavior.
- Slightly widen the desktop reading column while retaining a single-column,
  overflow-free mobile layout.

## Non-goals

- No changes to the preset Read-only recap.
- No database, authorization, signed-URL, scoring, teacher-review, or mission
  flow changes.
- No changes to stored pronunciation or audio evidence.
- No push, deploy, publish, production mutation, or Supabase mutation.

## Approved visual contract

- Written design:
  `docs/superpowers/specs/2026-07-23-homework-review-compact-chat-design.md`
- Tracked preview:
  `docs/superpowers/specs/previews/2026-07-23-homework-review-compact-chat.html`
- The preview is synthetic planning evidence, not an application screenshot.
- The preview is the visual source of truth for hierarchy, alignment, relative
  spacing, bubble/avatar treatment, collapsed audio placement, and correction
  emphasis.
- Intentional visual deviations require updating the preview and obtaining
  user approval before implementation continues.

## Observable done checks

- Homework Review renders no pronunciation stars, scores, or green
  pronunciation cards.
- Every available original or repeat recording remains associated with its own
  transcript and compact audio control.
- The compact control loads the existing signed URL on demand and exposes
  loading, playable, collapsible, and unavailable states accessibly.
- Coco's real portrait is circular and aligned beside each Coco bubble.
- Retry and minor-recast states match the tracked preview and remain
  understandable without relying on color alone.
- The preset Read-only recap is unchanged.
- Component tests, focused server/UI contract tests, typecheck, lint, and build
  pass.
- Localhost screenshots at mobile and desktop widths are compared with the
  tracked preview and labeled as localhost evidence.

## Current position

The conversational design and tracked preview were approved by the user on
2026-07-23. The written specification is ready for review. No runtime
implementation has started.

## Next step

Obtain user approval of the written specification, then write a test-first
implementation plan.
