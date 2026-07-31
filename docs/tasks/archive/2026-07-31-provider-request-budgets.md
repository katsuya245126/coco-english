# Provider Request Budgets

**Status:** Complete

**Class:** Consequential — student data, service-role access, external-provider cost, database migration

## Goal

Bound authenticated callers' paid-provider work and student-audio growth without
slowing the first speaking turn. Preserve the signed, eight-hour stateless
student session; individual revocation is out of scope.

## Scope

- Add an atomic, service-role-only Supabase request-budget primitive.
- Limit authenticated student audio, TTS, and translation requests.
- Limit teacher-triggered provider work.
- Retain evaluator warm-up, but admit only one global refresh per 90 seconds.
- Return a clear rate-limited result before provider work or audio-clip insertion.

## Non-goals

- Opaque or revocable student sessions.
- CAPTCHA, edge/WAF configuration, or a new limiter service.
- Audio-retention redesign.
- Applying a migration, paid-provider UAT, deployment, push, or production changes.

## Done checks

- Concurrent calls cannot exceed any budget threshold.
- Budget state stores no raw actor identifier, network address, transcript, or provider input.
- A denied audio request reads no blob, creates no clip, uploads no object, and invokes no provider.
- Denied TTS and translation requests do no cache or provider work.
- Denied teacher actions do no provider or mission/assignment/review mutation.
- Only one evaluator warm-up is admitted in each 90-second global window.
- Student routes return `429`, `rate_limited`, and an accurate `Retry-After`.
- Existing ownership checks, signed URLs, RLS, mission snapshots, and first-turn warm-up remain intact.
- Focused tests, full Vitest, typecheck, lint, and build pass.

## Result

Implemented from the approved plan
`docs/superpowers/plans/2026-07-31-provider-request-budgets.md`, test-first, in
task-sized local commits.

- Migration `supabase/migrations/202607310002_provider_request_budgets.sql` adds
  `public.request_budgets` (RLS enabled, service-role-only grants) and the
  atomic `public.consume_request_budget` fixed-window RPC. Written but **not
  applied to any environment**.
- `src/server/security/request-budget.ts` derives an HMAC-SHA-256 actor digest
  under the `request-budget:v1:` purpose prefix from `STUDENT_ACCESS_SECRET` and
  fails closed on an invalid secret, an RPC error, or a malformed row.
- Literal budgets: `student_audio` 24/600s, `student_helper` 60/600s,
  `teacher_provider` 10/600s, `evaluator_warmup` 1/90s.
- Gates run after authentication, input validation, and ownership resolution,
  and before every provider call, cache lookup, blob read, Storage upload, and
  state mutation.
- Student surfaces show wait-and-retry copy distinct from provider-outage copy
  (mission flow, `CocoSpeechAudio`, `CocoDialogueBox`); teacher surfaces show
  the shared AI-request wait copy via `role="alert"`.

### Commits

- `0e30f77e` feat: add atomic provider request budgets
- `be601323` feat: add provider budget admission
- `5e935f8c` feat: budget student audio uploads
- `5b61f47a` feat: budget student helper requests
- `69245895` feat: budget teacher mission provider work
- `42b373fd` feat: budget pronunciation reprocessing
- `84246541` feat: budget evaluator warmups

## Verification

- Focused provider-budget tests: PASS, with local-Supabase skips stated explicitly when unconfigured.
- Full Vitest: PASS.
- Typecheck: PASS.
- Lint: PASS.
- Build and ffmpeg postbuild: PASS.
- `git diff --check`: PASS.
- No remote migration, paid-provider request, deployment, push, or production mutation was performed.

### Verification detail

- Focused budget suites: 15 files, 183 passed, 3 skipped. The 3 skips are the
  local-Supabase integration cases in
  `tests/server/provider-request-budgets.integration.test.ts` (concurrency
  ceiling, window reset, anon/authenticated denial). Local Supabase could not be
  started: the existing local data volume was initialized by PostgreSQL 15 while
  the installed CLI ships PostgreSQL 17.6, and resolving that would destroy the
  user's local volume, so it was left intact. Those three database-level
  guarantees are therefore **asserted by the migration and unit tests but not
  executed locally**, and should be run once a compatible local Supabase or a
  non-production environment is available.
- Full Vitest: 114 files, 1457 passed, 8 skipped.
- Lint: 0 errors, 1 warning — pre-existing and unrelated
  (`scripts/check-student-feedback-states.mjs:435`, unused `label`, last touched
  by `6312cbc9`). Not introduced and not fixed by this work.
- Privacy scan over the migration and admission module found no
  `student_id`/`teacher_id`/`ip_address`/`transcript`/`provider_input` storage or
  logging.

## Follow-ups

- Apply `202607310002_provider_request_budgets.sql` to a non-production
  environment, then production, under separate explicit approval.
- Run the three integration cases against a working local or staging Supabase.
