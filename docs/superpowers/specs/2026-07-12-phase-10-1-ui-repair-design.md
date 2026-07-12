# Phase 10.1 UI Repair Design

## Goal

Finish the approved Phase 10.1 experience by repairing class-name reveal, clearing the owner's legacy review backlog, and faithfully porting the approved class-review and student mission-page prototypes.

## Locked Visual Sources

- Teacher class review: `.superpowers/brainstorm/61517-1783782204/content/class-inbox-revised.html`
- Student Current/Past home: `.superpowers/brainstorm/61517-1783782204/content/student-mission-pages.html`
- Student Past presentation: `.superpowers/brainstorm/61517-1783782204/content/student-past-recordings.html`
- Shared teacher shell: `.superpowers/brainstorm/61517-1783782204/content/teacher-home-combined-inbox.html`

## Class-name Reveal Repair

Measure the text track's `scrollWidth` against the stable clipping window's `clientWidth`. Observe the stable window, not the animated track, so hover cannot reset the travel distance. At rest, long names show an ellipsis. Hover and keyboard focus translate only overflowing tracks left far enough to expose the final characters. Reduced motion retains the ellipsis and full-name tooltip.

## Legacy Needs Review Backlog

Resolve the signed-in owner's current pending queue through existing server-owned review operations. Each queue attempt is marked reviewed using the same ownership checks and atomic RPC path as the UI. Do not update another teacher's rows and do not broadly modify completed assignments outside the current queue. Report before/after counts.

## Teacher Class Review

Remove the nested legacy page shell because the route already lives inside `TeacherWorkspaceShell`. Render a class-focused content surface matching the approved prototype:

- Class title, active-student count, and current review-policy summary.
- Prototype tab row for Needs Review, All Activity, Assignments, Students, and Class Settings.
- Styled review-setting control aligned with the title area.
- Existing owned review queue in the primary section.
- Assignment and student sections as consistent cards with hover/focus feedback and responsive stacking.
- Preserve every existing route, ownership check, review policy action, assignment link, and student sound-profile link.

## Student Current/Past Home

Replace generic inline presentation with the approved 430px mobile surface:

- White rounded phone card on a soft slate background.
- Greeting `Hi, {name}!` with class name and Coco avatar treatment.
- Current and Past Missions tabs with active underline and Current count.
- Five cards per page using existing server ordering and authorization.
- Current cards show status-specific badge/action, due metadata, turn progress, and progress bar where started.
- Past cards show completion date and `View what I said` without mutation controls.
- Prototype pager with active page styling and disabled edge controls.
- Retain Switch Class as a secondary action.

## Verification and Screenshots

- Test-first source/domain regressions for stable overflow measurement, prototype structure, Current/Past links, card states, and no duplicated teacher shell.
- Run focused tests, full Vitest, typecheck, lint, and build. Keep the existing explicit-`any` Phase 10.1 lint gap visible if unchanged.
- Verify real rendered desktop and 375px layouts in an authenticated local session.
- Deliver screenshots of teacher home/class review and student Current/Past views. If real account data cannot produce a page state, use temporary local-only fixture state without committing credentials or fixture access values.

## Non-goals

- No authorization, status-transition, queue-ordering, or pagination rule changes.
- No new design direction beyond the approved prototypes.
- No changes to mission conversation/recording screens.
