# Preserve Preset Optional-Detail Corrections

**Status:** Complete

## Goal

Keep the new optional-detail relaxation limited to conversation mode so preset
missions retain their existing correction behavior.

## Scope

- Add preset regressions for correction-policy validation and no-op
  canonicalization.
- Gate the `pure_embellishment` relaxation on conversation mode.
- Preserve identical-sentence canonicalization in both modes.

## Non-goals

- Change conversation-mode behavior.
- Redesign correction policy or preset evaluation.

## Done checks

- The new preset regressions fail before the production change and pass after.
- The targeted conversation-feedback suite passes.
- Typecheck and lint pass.

## Plan

- [x] Add and run failing preset regressions.
- [x] Apply the smallest mode gate.
- [x] Run targeted tests, typecheck, lint, and diff checks.

## Verification

- Red: both preset regressions failed solely on `pure_embellishment`
  canonicalization/policy behavior.
- Green: focused suite passed, 59 tests.
- Targeted conversation-feedback suite passed, 384 tests.
- Typecheck passed.
- Lint passed with zero errors and one unrelated pre-existing warning in
  `scripts/check-student-feedback-states.mjs`.
- `git diff --check` passed.
