# Teacher Sidebar Interaction Design

## Goal

Make clickable teacher-workspace elements feel interactive and keep class navigation readable when class names are long.

## Behavior

- Teacher-workspace links and buttons receive a subtle background, border, color, or elevation transition on hover without changing layout.
- Keyboard focus remains clearly visible through `:focus-visible` styles.
- Class roster counts use the same solid blue pill treatment as the Needs Review count.
- Each class name occupies one line and truncates with an ellipsis when it exceeds the available sidebar width.
- Hovering or keyboard-focusing an overflowing class link animates the name left far enough to reveal its full text, then restores the initial position when interaction ends.
- Non-overflowing class names do not animate.
- `prefers-reduced-motion: reduce` disables the scrolling animation. The link retains its full class name in the native `title` tooltip and accessible text.

## Approach

Keep the existing sidebar link structure and add a dedicated inner span for the class-name track. A small client component measures whether the name overflows and sets an overflow marker plus the exact travel distance. CSS owns hover/focus transitions and runs the marquee only when that marker is present.

Class counts reuse the existing `.count` class rather than maintaining a second muted counter design. General hover rules stay scoped beneath `.teacher-shell` so student and authentication pages are unaffected.

## Verification

- Source tests assert class counts use `.count`, class names have a measurable track, links retain `title`, and reduced-motion CSS exists.
- Component/domain tests cover overflow detection and a zero-distance non-overflow case where practical.
- Focused teacher workspace tests, typecheck, lint, and build are run. Previously documented Phase 10.1 lint failures remain separately reported if unchanged.

## Non-goals

- No sidebar width change.
- No wrapping class names onto multiple lines.
- No continuous or automatic animation without hover/focus.
- No changes outside the teacher workspace.
