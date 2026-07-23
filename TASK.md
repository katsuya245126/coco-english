# Compact Homework Review

**Status:** Implemented; final saved-mobile evidence conditional
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
  spacing, bubble/avatar treatment, collapsed and expanded audio placement,
  and correction emphasis.
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

Implementation is complete at current HEAD `a357641c`, including compact audio
controls, on-demand signed playback URL loading, and the compact dynamic
Homework Review. The final review fix added a visible polite
`Preparing recording…` status during on-demand loading, disabled duplicate
activation while loading, and synchronized an external audio pause back to
`Play recording`.

The previously verified automated baseline, recorded before the final review
fix, passed the 7-file focused matrix (46 tests), typecheck, lint with one
pre-existing warning, build on Next 15.5.19, and the full test suite (95 files,
985 tests passed, 4 skipped). These remain verified historical facts; this
record does not claim a fresh final rerun after `a357641c`.

Authenticated localhost application UAT confirmed the dynamic review contract
at a live 390x844 mobile viewport and 1440x1200 desktop viewport, including
independent original/repeat players, all eight available recording controls,
circular Coco avatars, retry markers, blue answer bubbles, and the final Back
to homework link. The live 390x844 localhost application check specifically
confirmed an overflow-free layout and 44px controls. The preset Read-only recap
remained unchanged with pronunciation content present.

The saved file
`/private/tmp/compact-homework-review-localhost-application-mobile.png` is
actually a 1440x1987 full-page localhost application capture, not a saved
390x844 mobile screenshot. The saved desktop-width localhost application
evidence is
`/private/tmp/compact-homework-review-localhost-application-desktop.png`, a
1440x2059 full-page capture. These localhost application checks and captures
are distinct from the tracked synthetic preview used for qualitative
comparison.

## Next step

If the approved plan requires a persisted mobile screenshot, replace the
mislabeled mobile artifact with a true 390x844 localhost application capture.
No further code work is indicated.
