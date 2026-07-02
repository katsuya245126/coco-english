---
phase: 09-pronunciation-scoring
plan: 02
subsystem: database
tags: [postgres, supabase, rls, migration, schema-test]

# Dependency graph
requires:
  - phase: 09-pronunciation-scoring (09-01)
    provides: Azure Speech env var documentation (.env.example), FERPA/COPPA data-use note
provides:
  - "public.pronunciation_scores table (id, audio_clip_id unique FK -> audio_clips, provider, reference_text, accuracy/fluency/completeness/pronunciation_score, star_band, word_scores jsonb, scored_at, created_at), live on the remote database"
  - "public.is_audio_clip_owner(uuid) SECURITY DEFINER RLS helper tracing audio_clips -> attempt_turns -> attempts -> assignment_students -> assignments -> classes.teacher_id"
  - "'teachers manage own pronunciation scores' RLS policy + authenticated/service_role grants mirroring the audio_clips convention"
affects: [09-04-pipeline-wiring, 09-05-calibration, 09-06-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One-hop-extended ownership helper: is_audio_clip_owner replicates is_attempt_turn_owner's shape (language sql, stable, security definer, set search_path = public) but starts its join one table further out (audio_clips instead of attempt_turns)."
    - "unique (audio_clip_id) as the re-scorability mechanism: one row per clip, upsert-in-place rather than an append-only score history (D-06)."

key-files:
  created:
    - supabase/migrations/202607020001_pronunciation_scores.sql
  modified:
    - tests/schema/foundation-schema.test.ts

key-decisions:
  - "Migration was applied to the live Supabase database via `supabase db push`, run manually by the user (not by the executor agent), consistent with this project's established pattern of keeping schema-mutating commands out of automated execution."
  - "Checkpoint resolution was independently confirmed via the read-only `supabase migration list` command rather than trusted solely on the user's word — both Local and Remote columns show 202607020001 applied, so PRON-06's 'pushed to the live database' truth is verified, not assumed."

patterns-established:
  - "Ownership-chain RLS helpers can be extended one join-hop at a time (is_attempt_turn_owner -> is_audio_clip_owner) rather than duplicating the whole chain, keeping future tables (e.g. any table one hop further from audio_clips) cheap to secure."

requirements-completed: [PRON-06]

# Metrics
duration: 30min
completed: 2026-07-02
status: complete
---

# Phase 09 Plan 02: pronunciation_scores schema Summary

**Dedicated `pronunciation_scores` table keyed on `audio_clips.id` with teacher-ownership RLS, pushed and verified live on Supabase**

## Performance

- **Duration:** ~30 min (Tasks 1-2 executed earlier same session; checkpoint resolved and plan closed in this continuation)
- **Started:** 2026-07-02T12:19:00Z
- **Completed:** 2026-07-02T12:49:17Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 2 (migration + schema test)

## Accomplishments
- New `pronunciation_scores` table independent of `attempt_turns.evaluation`, satisfying PRON-06/D-06's independent-rescoring requirement
- `is_audio_clip_owner(uuid)` RLS helper extends the existing ownership chain one hop, reusing the exact `is_attempt_turn_owner` shape/attributes
- Schema test coverage asserting the FK, unique constraint, and `star_band` CHECK
- Migration confirmed live on the remote database via `supabase migration list` (Local/Remote columns both show `202607020001`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the pronunciation_scores migration (table + helper + RLS + grants)** - `27c50e04` (feat)
2. **Task 2: Add schema-test coverage for pronunciation_scores** - `51c8f1be` (test)
3. **Task 3: Push migration to live Supabase database (checkpoint)** - resolved by user confirmation ("supabase db push done"), independently verified read-only via `supabase migration list` (no new commit — no code change, only a remote-state change)

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/202607020001_pronunciation_scores.sql` - `pronunciation_scores` table, `is_audio_clip_owner` helper, RLS policy, authenticated/service_role grants
- `tests/schema/foundation-schema.test.ts` - schema assertions for the new table's FK, unique constraint, and star_band CHECK

## Decisions Made
- Trusted-but-verified checkpoint resolution: rather than relying only on the user's "supabase db push done" statement, ran the read-only `supabase migration list` command in this session. Output confirmed `202607020001` present in both the Local and Remote columns, so the live-push truth in the plan's `must_haves` is empirically satisfied, not just assumed.
- No schema-mutating command (`supabase db push` or equivalent) was run by the executor — consistent with the plan's checkpoint design (`autonomous: false`) and this project's established practice of keeping live database pushes as a human-gated action.

## Deviations from Plan

None - plan executed exactly as written. Tasks 1 and 2 were completed in a prior session; this continuation resolved the Task 3 checkpoint and closed out the plan.

## Issues Encountered
None. The `supabase migration list` read-only check ran successfully with existing CLI credentials in this environment, so live verification was possible (the plan's checkpoint instructions anticipated this might not be available and allowed trusting user confirmation as a fallback — that fallback was not needed here).

## User Setup Required

None - no external service configuration required beyond the `supabase db push` the user already ran.

## Next Phase Readiness
- `pronunciation_scores` exists both in migration form and live on the remote database, keyed on `audio_clips.id`, with teacher-ownership RLS and matching grants — PRON-06/D-06 fully satisfied.
- 09-04 (pipeline wiring) and 09-05 (calibration) can now write/read real rows against this table.
- No blockers identified for subsequent Phase 09 plans.

---
*Phase: 09-pronunciation-scoring*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: supabase/migrations/202607020001_pronunciation_scores.sql
- FOUND: tests/schema/foundation-schema.test.ts
- FOUND: .planning/phases/09-pronunciation-scoring/09-02-SUMMARY.md
- FOUND: commit 27c50e04 (Task 1)
- FOUND: commit 51c8f1be (Task 2)
- FOUND: `supabase migration list` shows 202607020001 in both Local and Remote columns (live push verified)
