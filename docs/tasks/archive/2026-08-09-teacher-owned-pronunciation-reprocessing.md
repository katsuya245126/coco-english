# Deepen Teacher-Owned Pronunciation Reprocessing

**Status:** Complete
**Completed:** 2026-08-10
**Classification:** Consequential architecture and security work
**Plan revision:** `b2766610`
**Plan approval:** Approved by the owner on 2026-08-09 for `b2766610`
**Implementation base:** `b2766610b854f1b3936922b70bcbfc2640e0d570`

## Desired outcome

Every teacher-triggered pronunciation reprocessing request proves teacher
ownership inside the same server-owned module that admits provider work and
performs the service-role audio mutation.

## Why this is active

The 2026-08-09 architecture review ranked this candidate first. The owner chose
to address candidates in order. Pronunciation reprocessing is the next
candidate. The owner completed and confirmed its design session.

All findings remain in `docs/improve-codebase-architecture.md`. The other three
candidates are not active work.

## Current flow

`reprocessPronunciationAction` currently coordinates:

1. `teacherOwnsAudioClip`
2. `consumeRequestBudget`
3. `reprocessClipPronunciation`

The reprocessing module uses the service-role client and accepts only an audio
clip ID. It relies on its caller to prove ownership first.

## Scope

- Teacher-triggered pronunciation reprocessing only.
- Ownership proof for the audio clip.
- Provider request admission after ownership proof.
- Service-role clip loading and score persistence.
- Focused tests at the deepened module interface.
- The minimum server-action changes required by the deeper module.

## Non-goals

- No mission snapshot refactor.
- No teacher lifecycle refactor.
- No general provider-admission refactor.
- No student pronunciation-practice UI change.
- No schema or migration change unless design evidence proves one is required.
- No new dependency or speculative adapter.
- No production mutation, deployment, push, or paid-provider test.

## Constraints

- Every service-role audio query and mutation must independently prove teacher
  ownership server-side.
- Caller-supplied audio clip and attempt IDs are not authorization.
- Stored audio remains private and uses signed playback URLs.
- Provider admission happens after ownership proof and before paid scoring.
- Tests use a mock Azure scorer adapter and local or controlled Supabase data.
- The server action keeps teacher authentication and page refresh behavior.
- Existing public failure behavior changes only after an explicit design
  decision.
- Preserve unrelated working-tree changes.

## Assumptions

- The current action path proves ownership before reprocessing.
- The architecture gap concerns the callable service-role module and future
  callers, not evidence of a current browser-route authorization bypass.
- The existing Azure scorer adapter remains sufficient.
- The existing local Supabase stack remains the database test substitute.

## Design decisions

- `src/server/audio/pronunciation-reprocess.ts` owns authorization, provider
  admission, scoring, and score persistence.
- The server action gives `{ teacherId, audioClipId }` to the reprocessing
  module. The module proves ownership from both values.
- The server action keeps the `unauthorized`, `already_scored`, `unavailable`,
  `failed`, and `rate_limited` result types.
- Pronunciation reprocessing creates a missing pronunciation assessment for an
  existing audio clip. It does not replace an existing score.
- Only one Azure scoring request can be active for an audio clip. A teacher can
  retry after a failed Azure request.
- A concurrent request does not wait. It returns `unavailable` while another
  Azure request is active for the clip.
- The system does not clear an abandoned active marker automatically. An
  authorized database maintainer can clear the marker only after the maintainer
  makes sure that no Azure request is active.
- The module proves ownership, sets the active marker, downloads the audio,
  consumes the provider budget, and then sends the Azure request.
- The `audio_clips.pronunciation_reprocessing_started_at` column stores the
  active marker. A separate table is not necessary.
- An authorized database maintainer can clear an abandoned active marker after
  the maintainer makes sure that no Azure request is active for the clip. The
  application does not clear abandoned markers automatically.
- Three service-role-only database operations control the lifecycle:
  `begin_pronunciation_reprocessing`,
  `complete_pronunciation_reprocessing`, and
  `clear_pronunciation_reprocessing`. Each operation proves teacher
  ownership.
- Permanent repair instructions live in
  `docs/operations/pronunciation-reprocessing.md`. The task does not add a
  repair tool, application endpoint, or application page.
- The deep module tests own authorization, active-marker, budget-order, Azure,
  cleanup, and score-persistence behavior. The server-action tests own
  authentication, module input, result mapping, and page refresh.
- A schema-contract test proves the column, database-operation definitions,
  ownership checks, and service-role-only access. A local Supabase integration
  test proves concurrent begin behavior and unauthorized denial.
- `begin_pronunciation_reprocessing` returns `outcome`, `object_key`,
  `duration_ms`, and `reference_text`. Only an `ok` result contains clip values.
- Manual repair uses the idempotent `clear_pronunciation_reprocessing`
  operation. It does not update `audio_clips` directly.
- Authenticated teachers retain ownership-filtered `SELECT` access to
  `audio_clips`, but authenticated `INSERT`, `UPDATE`, and `DELETE` privileges
  are revoked. Existing application audio mutations use the service-role
  client, and direct authenticated writes must not bypass the three
  ownership-proving reprocessing operations.

## Done checks

- [x] The design tree has no unanswered decisions.
- [x] The owner approves the written implementation plan.
- [x] A focused test fails when a teacher does not own the requested clip.
- [x] A focused test proves that unauthorized work consumes no provider budget.
- [x] A focused test proves that denied provider work performs no scoring or
      score mutation.
- [x] A focused test proves that owned and admitted work scores and persists
      exactly once.
- [x] The service-role reprocessing implementation proves ownership itself.
- [x] The server action no longer coordinates ownership, admission, and
      mutation as separate modules.
- [x] Existing signed audio playback behavior remains unchanged.
- [x] Focused tests, typecheck, lint, and proportionate broader tests pass.
- [x] The final diff contains no unrelated refactor.

## Decision frontier

The owner confirmed the complete design on 2026-08-09.

Settled:

1. The existing pronunciation-reprocessing module owns the deepened operation.
2. `{ teacherId, audioClipId }` crosses the external seam.
3. The server action keeps its current result types.
4. Only one Azure request can be active for a clip. A teacher can retry after a
   failed request.
5. A concurrent request returns `unavailable` without waiting.
6. An abandoned active marker requires manual database repair. A fixed timeout
   does not clear it.
7. Provider admission occurs after ownership proof, the active marker, and the
   audio download. It occurs before the Azure request.
8. The `audio_clips` row stores the active marker in a nullable
   `pronunciation_reprocessing_started_at` column.
9. An authorized database maintainer repairs an abandoned active marker. The
   repair requires approval for the exact environment and action.
10. Three service-role-only database operations begin, complete, and clear
    reprocessing. Each operation independently proves teacher ownership.
11. The permanent repair instructions live in
    `docs/operations/pronunciation-reprocessing.md`.
12. Module tests own orchestration behavior. Server-action tests keep only the
    thin action boundary.
13. Schema-contract and local Supabase integration tests prove the new database
    behavior.
14. The begin operation returns the owned clip values that provider work needs.
15. Manual repair uses the ownership-proving clear operation.

Open: None. The owner confirmed shared understanding.

## Plan

- [x] Record all architecture findings.
- [x] Pause and archive the previous active task.
- [x] Select pronunciation reprocessing as the first candidate.
- [x] Start and complete the grilling design tree when the owner requests it.
- [x] Write the exact TDD implementation plan.
- [x] Obtain owner approval for the plan.
- [x] Implement the smallest ownership-first deepening.
- [x] Run focused and proportionate verification.
- [x] Review the diff against the safety constraints.
- [x] Archive this task when complete.

## Verification evidence

- Architecture review traced the current ownership → admission → mutation flow.
- The current action and reprocessing tests were inspected.
- Existing `audio_clips` and `pronunciation_scores` RLS policies independently
  prove teacher ownership for authenticated table operations.
- Existing application `audio_clips` mutations use the service-role client; no
  current application path needs authenticated insert, update, or delete
  privileges on that table.
- The private `student-audio` bucket has no authenticated download policy.
- No existing RPC combines ownership proof and pronunciation reprocessing.
- The existing teacher audio path can create a short-lived signed URL after an
  ownership-filtered query.
- The design trace found no existing atomic database primitive that can prevent
  concurrent Azure requests across server processes.
- The owner confirmed every design decision in the completed grilling tree.
- The owner approved tracked plan revision `b2766610` on 2026-08-09, and
  `b2766610b854f1b3936922b70bcbfc2640e0d570` is the fixed implementation and
  review base.
- `CONTEXT.md` records the canonical pronunciation-reprocessing term.
- ADR 0001 records the active-marker and no-timeout tradeoff.
- No application test applies to these documentation-only changes.
- Task 1 commit `17a206c2` adds the ownership-proving database seam. Fresh
  controller verification passed 8/8 focused schema/integration tests with
  zero skips and `supabase db lint --local --schema public --level error
  --fail-on error` reported no schema errors.
- Task 2 commits `95e8f632` and `c32ecafe` deepen the reprocessing module and
  strengthen its security/cleanup tests. The focused module suite passes
  15/15 and task review is approved. Repository typecheck/full-suite evidence
  is intentionally pending Task 3's sole-caller update.
- Task 3 commits `2f6ae2a1` and `af4c0a4a` thin the server action and strengthen
  its authentication boundary test. Fresh controller verification passed
  18/18 focused action/evidence tests and typecheck; task review is approved.
- Task 4 commit `b3965b24` documents the approved manual abandoned-marker
  repair path. Task review found no critical, important, or minor issues.
- Final local verification applied the migration history through
  `202608090001`, then passed 4 focused files and 30 tests with zero skips.
  Typecheck passed; lint exited 0 with one existing warning after ignored
  generated artifacts were temporarily isolated and restored; the full suite
  passed 115 files and 1,470 tests with 15 environment-gated skips; the build
  passed including the ffmpeg trace assertion; and local public-schema lint
  reported no errors.
- The final ownership search found no direct service-role `audio_clips` or
  `pronunciation_scores` access and no `teacherOwnsAudioClip` helper in the
  module/action.
- The Standards-axis review found no documented-standard or smell-baseline
  issue. The Spec-axis review's only finding was missing final evidence in this
  task record; this evidence now resolves it. The broad final review found no
  Critical or Important issue, confirmed all 19 Issue #16 criteria, and judged
  the branch ready to merge.
- One non-blocking Minor remains: the module test fake does not assert the exact
  storage bucket, object key, and Blob identity. Production code uses the
  correct bucket/key/Blob; the reviewer classified this as test hardening.
- No review fix changed tracked implementation files, so no empty review-fix
  commit was created.

## Current position

Tasks 0-5 are complete. The approved database seam, deep module, thin server
action, repair documentation, local verification, and whole-branch review are
complete. No push, deployment, production migration, or paid Azure request
occurred.

## Next action

Keep branch `codex/improve-codebase-architecture` available for the owner's
chosen integration action. Pushing, opening a pull request, merging, or closing
Issue #16 each requires separate approval.
