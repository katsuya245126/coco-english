# Page-Local Chunked Translation Hints

**Status:** Complete
**Classification:** Normal
**Started:** 2026-07-27

## Desired Outcome

Fix two follow-up hint bugs: clicking Hint must not jump from the current
dialogue page to page 1, and simple second-page questions such as "What will
you do at the beach?" must still receive a translation even if the provider
returns that question as one span.

## Scope

- Coco dialogue hint expansion behavior.
- Translation hint parser long-sentence guard.
- Focused static/domain tests.

## Non-Goals

- No preset hint ladder changes.
- No translation route authorization changes.
- No live provider or Supabase calls.

## Plan

- [x] Add failing tests for page-local hint expansion and fallback sentence
      translation.
- [x] Implement page-local expansion and soften the parser guard.
- [x] Run focused verification, typecheck, lint, build, and diff check.
- [x] Archive this task as complete.

## Verification

- `npm test -- tests/domain/translation-hint.test.ts tests/domain/tts-ui-source.test.ts --run` passed.
- `npm test -- tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts tests/server/translation-hint-route-source.test.ts --run` passed.
- `npm run typecheck` passed.
- `npm run lint` passed with the existing warning in
  `scripts/check-student-feedback-states.mjs:435`.
- `npm run build` passed.
- `git diff --check` passed.
