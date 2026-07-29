# Test Suite Simplification

Status: Complete
Date: 2026-07-29
Base SHA: `c34930bd`

## Goal

Reduce brittle and zero-value test maintenance without weakening unique
ownership, RLS, audio privacy, state-transition, learner-safety, or real user
behavior coverage.

## Result

- Added `docs/testing/test-suite-inventory.md` with risk-first keep,
  consolidate, convert, and delete dispositions and named coverage owners.
- Deleted six export-existence cases, one no-op scaffold, one generated-type
  runtime assertion, one redundant stateless source scan, two exact CSS-module
  tests, and embedded exact CSS assertions from an otherwise behavioral test.
- Removed six source-only Playwright cases.
- Replaced two important Coco audio source scans with rendered component tests
  for rejected autoplay and playback failure.
- Kept security, privacy, schema, state-transition, provider, domain, and real
  browser coverage.
- Rejected a generic shared audio-upload fixture because the preset and
  conversation mock shapes have diverged enough that the abstraction would add
  flags and indirection rather than simplify ownership.

## Verification

- Baseline full Vitest with local-port permission: 102 files passed; 1,397
  passed, 4 skipped; 9.82s.
- Focused changed suites: 7 files passed; 137 passed.
- Final full Vitest with local-port permission: 103 files passed; 1,388 passed,
  4 skipped; 9.27s.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 with one pre-existing warning at
  `scripts/check-student-feedback-states.mjs:435` for unused `label`.
- `npx playwright test --list`: 20 tests in 9 files.
- `rg` found no `readFileSync` or `readFile(` usage under `tests/e2e/`.
- Final inventory: 112 test/spec files, 1,186 declared cases, 28,207 test
  lines.
- Production build was not run because no production or test configuration
  file changed.

The first restricted-sandbox Vitest attempt reported three timeouts and
`listen EPERM` errors in the UAT launcher port checks. The identical command
passed after temporary localhost binding was permitted; this was environment
evidence, not a product or test regression.

## Scope Boundaries

No production behavior, source, dependency, schema, provider, database, or
external environment was changed. Nothing was pushed, merged, deployed, or
published. The three unrelated untracked handoff documents under `docs/tasks/`
were preserved.

## Current Position

Complete and locally verified. Changes remain uncommitted for user review.

## Next Step

Review the diff and decide whether to commit the test simplification.
