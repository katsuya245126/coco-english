# Failed-Schema Evaluation Recovery

**Status:** Paused; local verification complete; awaiting live UAT rerun
**Classification:** Consequential
**Started:** 2026-07-27

## Desired outcome

Find and fix the reason a clear English conversation answer can produce
`ai.evaluation_schema_failed`, while preserving the committed Korean proper-noun
and conversation-evaluation safeguards. Complete proportionate automated
verification and leave the five-turn localhost UAT as the only possible
human/live-environment check.

## Authorization

The Codex goal objective supplied on 2026-07-27 explicitly authorizes
independent repository inspection, edits, tests, builds, and reasonable
technical decisions through verification and review. It does not authorize a
paid OpenAI replay, Supabase read or mutation, push, deployment, publication,
or other external action; each still requires separate exact-target approval.

## Evidence

- Primary handoff:
  `docs/tasks/2026-07-27-failed-schema-handoff.md`.
- Localhost attempt:
  `scripts/output/inspect-attempts-2026-07-27T04-56-59-697Z.txt`.
- Turn 2 transcribed exactly as `Play games.` with high-quality transcription
  and pronunciation evidence, but stored the `failed_schema` fallback.
- Commit `4455619f` added safe diagnostic logging, but the originating terminal
  is no longer attached and no process is listening on port 3000.
- The installed OpenAI JavaScript SDK (`6.45.0`) parses a completed structured
  response through the supplied Zod schema before returning it. A locally
  executed SDK probe proves invalid completed JSON throws; an incomplete
  response returns `output_parsed: null`.
- `audio-upload.ts` maps two different failures to the same persisted
  `failed_schema` fallback: an adapter result with no parsed output, and a valid
  provider evaluation that still violates the correction contract after its
  one policy-repair attempt.
- Prior raw attempt evidence retained in the local Claude session history
  contains `contractViolations` for the second path. The current formatted
  attempt report omitted that field, so its fallback values cannot distinguish
  the two paths.
- The attempt-report formatter now whitelists `contractViolations` without
  exposing arbitrary evaluation metadata. Its focused regression test passed
  6/6.
- Confirmed local hypothesis: a real SDK incomplete/refusal-style response can
  return `output_parsed: null`; the adapter previously sent that through local
  schema validation and mislabeled it as `schema_failed`.
- The adapter now classifies null parsed output as `provider_failed` before
  local Zod validation and logs only response status, incomplete reason, and
  refusal state under `ai.evaluation_unparsed`.
- Live UAT rerun on 2026-07-27 at port 3200 proved the app was running from
  this checkout, but both new turns transcribed as Hangul and failed the second
  overloaded path: parsed model output was rejected by deterministic correction
  policy with `contractViolations: fragment_too_long`.
- Confirmed second local hypothesis: the fragment length guard still compared
  Hangul transcript token count with English completion token count even when
  the evaluator had already resolved the Hangul as English. This made a short,
  question-grounded completion such as "I like to play games in the summer."
  look too long.
- Live UAT rerun ending 2026-07-27T06:04:24 shows turns 1 and 2 now passed
  the previous paths: both got repeat targets and accepted repeats. The
  remaining failure is all-Latin: `My friend.` for "Who do you like to play
  Valorant with?" failed deterministic policy as `fragment_too_long`.
- Confirmed third local hypothesis: the normal Latin length guard counted
  function words and question-grounded words in a valid fragment completion.
  `My friend.` -> `I like to play Valorant with my friend.` failed only because
  the raw word delta was greater than five.

## Scope

- Original and repeat evaluator response-state handling.
- The smallest deterministic regression tests that reproduce the confirmed
  failure mode.
- One bounded recovery path only if evidence shows it is safe and necessary.
- Diagnostic accuracy sufficient to distinguish provider response states
  without logging child-authored text.

## Non-goals

- No prompt redesign, model migration, database migration, or historical-row
  rewrite without evidence that it is the root fix.
- No change to preset behavior, ownership checks, RLS, mission snapshots,
  assignment/attempt state transitions, per-turn audio, or signed playback.
- Do not revert `bef1361d` or weaken the committed romanization-artifact guards.
- Do not start a development server; the owner controls port 3000.
- No paid-provider call, Supabase action, push, deploy, or publish without
  separate exact-target approval.

## Observable done checks

- A deterministic test reproduces the real SDK condition that currently becomes
  `schema_failed`.
- The response state is classified correctly; an incomplete/refused/provider
  failure is not mislabeled as a local schema mismatch.
- If a bounded retry is the root-safe remedy, it occurs at most once and cannot
  bypass deterministic correction policy or teacher review.
- Existing preset and conversation behavior remains unchanged for valid model
  evaluations.
- The exact committed Korean-romanization regression remains covered and green.
- Focused tests, full test suite, typecheck, lint, build, and `git diff --check`
  pass, with any pre-existing warning or unrelated dirty file called out.
- The final diff is reviewed for privacy leaks, unsafe fallback acceptance,
  unnecessary changes, and unfinished work.
- The handoff's five-turn localhost UAT is run after the fix if the required
  human audio and live services are available under separate approval;
  otherwise it is reported as the exact remaining external blocker.

## Plan

- [x] Reconcile the handoff with Git, current source, tests, SDK source, stored
      attempt evidence, and official API behavior.
- [x] Exhaust locally available retained-log and persisted-response evidence;
      the current row's hidden metadata now requires one approved read-only
      Supabase query.
- [x] State and minimally test one root-cause hypothesis.
- [x] Write the exact test-first implementation plan once the hypothesis is
      confirmed; do not speculate about the fix before then.
- [x] Add the failing regression, observe the expected failure, implement one
      surgical fix, and make the focused checks pass.
- [x] Add the second failing regression for Hangul-resolved fragment length,
      observe `fragment_too_long`, implement the surgical policy fix, and make
      focused correction, contract, evaluator, upload, and report checks pass.
- [x] Add the third failing regression for question-grounded who-answer
      fragments, observe `fragment_too_long`, refine the length guard to count
      newly introduced learner-owned content, and make focused checks pass.
- [x] Run broader verification and inspect the final diff and working tree.
- [ ] Archive this task as complete, or record the one genuine external blocker
      after completing every local check.

## Current position

The takeover audit and locally available evidence search are complete. The live
terminal diagnostic requested by the handoff is unavailable through the Codex
terminal bridge, no process currently listens on port 3000, and Computer Use is
prohibited from reading Terminal. The originating Claude session confirms that
the handoff inferred a provider-schema failure from fallback fields without
reading the diagnostic. Earlier raw-row evidence confirms that the same fallback
is also produced by correction-contract exhaustion.

A deterministic adapter regression now covers an incomplete evaluator response
where `output_parsed` is null. It failed as expected when the adapter returned
`schema_failed`, then passed after the adapter began returning
`provider_failed` for unparsed provider output. Malformed parsed objects still
use the existing `schema_failed` path.

A deterministic correction-policy regression now covers the rerun path:
`플레이 게임즈` resolved as English and completed as
`I like to play games in the summer.` failed as `fragment_too_long`, then passed
after the Hangul-resolved length guard began counting learner-owned English
content rather than raw Hangul-vs-English token delta.

A deterministic correction-policy regression now also covers the latest
all-Latin rerun path: `My friend.` completed as
`I like to play Valorant with my friend.` failed as `fragment_too_long`, then
passed after the length guard began ignoring function words and words already
grounded by Coco's question or the student's transcript.

Focused checks passed:

- `npm test -- tests/domain/correction-policy.test.ts --run`
- `npm test -- src/domain/ai/original-evaluation-contract.test.ts --run`
- `npm test -- tests/server/turn-evaluator.test.ts --run`
- `npm test -- src/server/student-access/audio-upload.test.ts --run`
- `node --test scripts/lib/attempt-report.test.mjs`
- `npm test -- --run` passed outside the sandbox: 102 test files, 1218 tests,
  4 skipped. The first sandboxed full run failed only because local socket
  binding in `tests/scripts/uat-worktree-runtime.test.ts` raised `EPERM`.
- `npm run typecheck` passed.
- `npm run lint` passed with one existing warning in
  `scripts/check-student-feedback-states.mjs:435`.
- `npm run build` passed.
- `git diff --check` passed.
- After the second policy fix, `npm test -- --run` passed outside the sandbox:
  102 test files, 1219 tests, 4 skipped.
- After the second policy fix, `npm run typecheck`, `npm run lint`,
  `npm run build`, and `git diff --check` passed. Lint still reports the same
  unrelated pre-existing warning in
  `scripts/check-student-feedback-states.mjs:435`.
- After the third policy fix, `npm test -- --run` passed outside the sandbox:
  102 test files, 1220 tests, 4 skipped.
- After the third policy fix, `npm run typecheck`, `npm run lint`,
  `npm run build`, and `git diff --check` passed. Lint still reports the same
  unrelated pre-existing warning in
  `scripts/check-student-feedback-states.mjs:435`.

The pre-existing modification to `.superpowers/sdd/task-1-report.md`, the stale
untracked `docs/tasks/2026-07-27-attempt-4c1f229e-handoff.md`, and the primary
untracked handoff are preserved untouched.

## Next step

Rerun the five-turn localhost UAT with live services and human audio. The
historical bounded read-only Supabase metadata query is no longer necessary for
the latest rerun because the attempt report now prints `contractViolations`.
If Coco speech/audio appears disabled again, capture the browser console and
server log lines around the `/tts` request; the attempt report does not persist
TTS playback state.
