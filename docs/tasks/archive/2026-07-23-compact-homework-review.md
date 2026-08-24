# Compact Homework Review

**Status:** Complete
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

- Written design: approved compact homework-review visual contract.
- Planning preview: synthetic planning evidence, not an application screenshot.
- The planning preview was the visual source of truth for hierarchy, alignment, relative
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

Implementation is complete at HEAD `748d860c`, including compact audio
controls, on-demand signed playback URL loading, and the compact dynamic
Homework Review. The final review fix added a visible polite
`Preparing recording…` status during on-demand loading, disabled duplicate
activation while loading, and synchronized an external audio pause back to
`Play recording`.

The previously verified automated baseline, recorded before the final review
fix, passed the 7-file focused matrix (46 tests), typecheck, lint with one
pre-existing warning, build on Next 15.5.19, and the full test suite (95 files,
985 tests passed, 4 skipped). These remain verified historical facts.

Authenticated localhost application UAT confirmed the dynamic review contract
at a live 390x844 mobile viewport and 1440x1200 desktop viewport, including
independent original/repeat players, all eight available recording controls,
circular Coco avatars, retry markers, blue answer bubbles, and the final Back
to homework link. The live 390x844 localhost application check specifically
confirmed an overflow-free layout and 44px controls. The preset Read-only recap
remained unchanged with pronunciation content present.

The saved mobile localhost application evidence,
`/private/tmp/compact-homework-review-localhost-application-mobile.png`, is a
real authenticated application capture from
`http://localhost:3000/student/history/cb087fc4-9d41-4788-a99b-3ce18166bb0b`
at an actual 390x844 Chrome viewport. The saved file is a 390x844 PNG with no
resizing or synthetic rendering. The saved desktop-width localhost application
evidence remains
`/private/tmp/compact-homework-review-localhost-application-desktop.png`, a
1440x2059 capture.

The approved plan's localhost mobile and desktop screenshot comparison with
the tracked preview is complete. These real localhost application checks and
captures remain distinct from the tracked synthetic preview used for
qualitative comparison.

## Follow-up fix (commit `748d860c`)

A narrow-layout audio pass (`f12acd2e`) plus a second round fixed three
remaining issues:

- The compact audio control's loading state now shows a spinner icon inside
  the 44px button instead of visible `Preparing recording…` body text; the
  text remains for screen readers via a visually-hidden `aria-live="polite"`
  status span.
- The answer bubble uses `width: fit-content` with a chat-style asymmetric
  border-radius (tail toward the sender) instead of a fixed-width block.
- The student name label wraps and constrains its width so long names no
  longer overflow next to the avatar.

Verified: focused tests (9/9), full suite (95 files, 988 passed, 4 skipped),
typecheck clean, lint clean (0 errors, 1 pre-existing warning), production
build succeeds (9/9 pages). User manually confirmed the spinner and long-name
wrap behave correctly on the authenticated localhost app.

## Next step

No remaining work in the approved scope.
