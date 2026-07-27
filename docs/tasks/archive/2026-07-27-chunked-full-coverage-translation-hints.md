# Chunked Full-Coverage Translation Hints

**Status:** Complete
**Classification:** Normal
**Started:** 2026-07-27

## Desired Outcome

Keep full Korean coverage for generated Coco conversation hints, but prevent
normal-length questions from appearing as one whole-sentence translation bubble.
Hints should be natural meaning chunks across the whole line.

## Scope

- Translation hint provider prompt.
- Deterministic parser guard against long complete-sentence spans.
- Cache policy version so whole-sentence v3 hints are missed.
- Focused tests for the prompt, parser guard, and cache version.

## Non-Goals

- No preset hint ladder changes.
- No UI redesign.
- No live OpenAI, Supabase, push, deploy, or production mutation.

## Plan

- [x] Add failing tests for smaller chunk rules and whole-sentence guard.
- [x] Implement prompt/parser/cache changes.
- [x] Run focused verification plus typecheck/lint/build/diff check.
- [x] Archive this task as complete.

## Verification

- `npm test -- tests/domain/translation-hint.test.ts tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts --run` passed.
- `npm test -- tests/domain/tts-ui-source.test.ts --run` passed.
- `npm run typecheck` passed.
- `npm run lint` passed with the existing warning in
  `scripts/check-student-feedback-states.mjs:435`.
- `npm run build` passed.
- `git diff --check` passed.
