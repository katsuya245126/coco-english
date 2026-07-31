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
- `292110b7` fix: repair budget denial UX and teacher action error contract

## Code review

Two findings were raised against the initial implementation and fixed in
`292110b7`, test-first.

1. **Rate-limited TTS was invisible and unrecoverable on the main student
   path.** `CocoSpeechAudio` suppressed its status text when
   `presentation="dialogue-tab"` — the presentation `MissionFlowShell` uses —
   while a 429 also disabled the only button, leaving a dead speaker with no
   explanation. The wait-and-retry message now renders in every presentation
   (never labelled "Voice unavailable"), alongside a "Try again" control that
   re-requests the line via a reload counter in the fetch effect.
2. **Teacher actions could escape their typed error contract.** The ownership
   reads added for budget ordering (`getMissionForTeacher` in
   `updateMissionAction`, the ownership `Promise.all` in `assignMissionAction`)
   sat outside their try/catch, so a database failure rejected the server
   action instead of returning `GENERIC_FAILURE`/`ASSIGN_FAILURE`. Both now sit
   inside the try. The same exposure existed at three sites the review did not
   name (create, premise, opener), so `teacherProviderAllowed` additionally
   fails closed on rejection — an unreachable budget RPC denies rather than
   escaping the result union. Foreign resources still consume no budget.

## Verification

- Focused provider-budget tests: PASS.
- Database integration tests: PASS 3/3 against an isolated local PostgreSQL 17 Supabase project.
- Full Vitest: PASS.
- Typecheck: PASS.
- Lint: PASS.
- Build and ffmpeg postbuild: PASS.
- `git diff --check`: PASS.
- No remote migration, paid-provider request, deployment, push, or production mutation was performed.

### Verification detail

- Focused budget suites: 15 files, 191 passed, 3 skipped (the skips are the
  integration cases, which skip under the default environment and were executed
  separately below).
- **Database verification gap closed.** The three integration cases in
  `tests/server/provider-request-budgets.integration.test.ts` were executed
  against an isolated local Supabase project (`coco-budget-verify`, PostgreSQL
  17.6) and all passed:
  - `atomically permits exactly 24 of 25 concurrent audio requests` — PASS.
    Confirms the single-statement upsert admits no more than the quota under
    genuine concurrency.
  - `resets an expired window and admits one global warm-up` — PASS. Confirms
    fixed-window rollover and the 1/90s warm-up ceiling.
  - `denies table and RPC access to anon and authenticated roles` — PASS.
    Confirms RLS plus the service-role-only grants.
  - Isolation followed the precedent in
    `docs/tasks/archive/2026-07-31-student-access-security-remediation.md`: a
    scratch copy of `supabase/` with `project_id = "coco-budget-verify"`, so
    Docker created separate `supabase_db_coco-budget-verify` /
    `supabase_storage_coco-budget-verify` volumes. The pre-existing PostgreSQL
    15 volume `supabase_db_english-speaking-practice` was never started,
    stopped with `--no-backup`, deleted, or modified, and remains present. The
    repository's own `supabase/config.toml` was not edited. Keys were passed as
    one-shot environment variables; no `.env` file was written.
- Full Vitest: 114 files, 1465 passed, 8 skipped.
- Lint: 0 errors, 1 warning — pre-existing and unrelated
  (`scripts/check-student-feedback-states.mjs:435`, unused `label`, last touched
  by `6312cbc9`). Not introduced and not fixed by this work.
- Privacy scan over the migration and admission module found no
  `student_id`/`teacher_id`/`ip_address`/`transcript`/`provider_input` storage or
  logging.

## Follow-ups

- Apply `202607310002_provider_request_budgets.sql` to a non-production
  environment, then production, under separate explicit approval. The migration
  is still applied nowhere outside the disposable verification project.
