# Full-Coverage Dynamic Translation Hints

**Status:** Complete
**Classification:** Consequential
**Started:** 2026-07-27

## Desired Outcome

Make the Hint action for generated conversation-mode Coco lines translate the
whole visible English line in useful Korean meaning chunks, with special care
that a paginated second-page question receives translation coverage. Preserve
preset mission hint ladders and the server-owned translation-source access
model.

## User Decision

On 2026-07-27, the user clarified that generated conversation hints should no
longer be capped at three short phrases and should translate everything. The
chosen UI behavior is phrase-by-phrase Korean bubbles that cover the full Coco
line, not a single Korean paragraph replacing the English text.

## Scope

- Dynamic conversation translation hints for `coco_dynamic_line`.
- Shared translation-hint parsing and rendering contracts only where needed to
  support full-coverage phrase spans.
- Translation provider prompt and schema policy.
- Cache policy versioning so old short-chunk rows are missed.
- Focused tests for page-two question coverage and old cache invalidation.

## Non-Goals

- Do not change preset mission hint ladders, repeat/correction behavior,
  mission evaluation, TTS, ownership checks, RLS, assignment state, attempt
  state, audio storage, or teacher review.
- Do not expose arbitrary client-supplied dialogue text to the translation
  route; keep source resolution server-owned.
- Do not add a separate full Korean transcript panel in this iteration.
- No OpenAI, Supabase, push, deployment, publication, or production mutation
  without separate exact-target approval.

## Assumptions

- Full coverage should mean every meaningful part of the Coco line is inside a
  translated phrase span, while spacing and punctuation may remain plain text or
  attach to neighboring phrase spans.
- Natural Korean phrase chunks are preferred over word-by-word mapping because
  English and Korean word order differ.
- Preset authored mission prompts can keep the current translation behavior for
  now; the user complaint is about generated conversation questions.

## Observable Done Checks

- A two-page dynamic Coco line has translated phrase coverage on the page that
  contains the actual question.
- The provider prompt no longer asks for zero to three short chunks or says not
  to cover every word for dynamic full-coverage hints.
- The Zod model/cache parser accepts enough ordered phrases to cover a normal
  generated Coco line.
- Existing filtering still rejects invalid, out-of-order, missing-source,
  punctuation-only, and isolated-function-word-only spans.
- The translation cache policy version changes from
  `translation-hint-v2-short-chunks`.
- Focused tests pass:
  `npm test -- tests/domain/translation-hint.test.ts tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts --run`
- Proportionate verification passes before completion:
  `npm test -- --run`, `npm run typecheck`, `npm run lint`,
  `npm run build`, and `git diff --check`, unless an environment-specific
  blocker is recorded exactly.

## Plan

- [x] Read project/task context and targeted translation hint code.
- [x] Clarify desired behavior and settle on full coverage with phrase-by-phrase
      bubbles.
- [x] Archive the unrelated active task as paused.
- [x] Write the approved full-coverage dynamic-translation-hints implementation plan.
- [x] Get user approval for inline execution.
- [x] Implement test-first changes.
- [x] Run focused and proportionate verification.
- [x] Review final diff for scope, privacy, and cache/version correctness.
- [x] Archive this task as complete.

## Current Position

Implementation is complete. The translation hint parser now accepts up to 12
ordered phrase spans, the provider prompt asks for full `sourceText` coverage in
natural Korean meaning chunks and specifically prioritizes question coverage,
and the cache policy version is now `translation-hint-v3-full-coverage`.

Focused verification passed:

- `npm test -- tests/domain/translation-hint.test.ts --run`
- `npm test -- tests/server/translation-hint-generator.test.ts --run`
- `npm test -- tests/server/translation-hint-cache.test.ts --run`
- `npm test -- tests/domain/translation-hint.test.ts tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts tests/domain/tts-ui-source.test.ts --run`

Broader verification:

- `npm test -- --run` failed in the sandbox because
  `tests/scripts/uat-worktree-runtime.test.ts` cannot bind local sockets there
  (`listen EPERM`), then was rerun outside the sandbox. The unsandboxed run
  cleared the socket tests and failed only the unrelated existing
  `tests/server/student-history-ui.test.ts` assertion that
  `src/app/student/history/[assignmentStudentId]/page.tsx` should contain
  `recap-back-btn:hover`; none of the files in this task touched that route.
- `npm run typecheck` passed.
- `npm run lint` passed with one existing warning in
  `scripts/check-student-feedback-states.mjs:435`.
- `npm run build` passed.
- `git diff --check` passed.

Final diff review found no preset hint ladder changes, no client-supplied
translation source text accepted by the route, no live OpenAI/Supabase calls in
tests, no student transcript/audio logging, and no unrelated source changes.

## Next Step

Optionally address the unrelated `student-history-ui` source assertion in a
separate task.
