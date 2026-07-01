---
phase: 08-coco-voice-tts
plan: 02
subsystem: database
tags: [supabase, postgres, storage, tts, rls, cache]

# Dependency graph
requires:
  - phase: 05-student-audio
    provides: private student-audio bucket pattern and service-role Storage/RLS posture
provides:
  - Private tts-audio Storage bucket (public=false)
  - public.tts_audio_cache table keyed by unique server-computed content_hash
  - Typed tts_audio_cache Row/Insert/Update in src/lib/db/types.ts
  - Service-role-only grants and RLS on the cache table
affects: [tts-cache-service, tts-route, coco-speech-audio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache table stores only rendering metadata + content hash; no student transcripts (VOICE-03 privacy boundary)"
    - "Private generated-audio bucket separate from student recording evidence, served via signed URLs only"
    - "RLS enabled with no teacher policy + explicit service_role grants (RLS-first posture)"

key-files:
  created:
    - supabase/migrations/202607010001_tts_audio_cache.sql
  modified:
    - src/lib/db/types.ts

key-decisions:
  - "content_hash and object_key are UNIQUE so identical input reuses one row and cannot force paid regeneration (T-08-02/03)"
  - "Cache table RLS enabled with no teacher/anon policy; access is service-role only (T-08-04)"
  - "tts-audio bucket is private; no public Storage policy introduced (T-08-05)"

patterns-established:
  - "Additive schema: no changes to homework status, attempts, audio_clips, or student-audio semantics"
  - "Explicit service_role GRANTs required for raw-SQL tables under auto-expose-disabled posture"

requirements-completed: [VOICE-03]

# Metrics
duration: 1min
completed: 2026-07-01
status: complete
---

# Phase 08 Plan 02: TTS Cache Schema Foundation Summary

**Private tts-audio Storage bucket and public.tts_audio_cache table (unique content_hash + object_key, service-role-only RLS) plus typed DB access for cache-first Coco TTS — remote `supabase db push` completed and verified 2026-07-01.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-07-01T14:29:01Z
- **Completed:** 2026-07-01T14:31:00Z
- **Tasks:** 1 of 2 complete (Task 2 blocked)
- **Files modified:** 2

## Accomplishments
- Created migration `202607010001_tts_audio_cache.sql`: private `tts-audio` bucket (`public=false`) and `public.tts_audio_cache` table with all required columns.
- `content_hash` and `object_key` carry UNIQUE constraints; `byte_size` has a non-negative check; no student transcript/full-text column exists (VOICE-03).
- Enabled RLS on the cache table with no teacher/anon policy and added explicit `service_role` CRUD grants (RLS-first posture).
- Added typed `tts_audio_cache` Row/Insert/Update to `src/lib/db/types.ts` with no removal of existing table or enum types.

## Task Commits

1. **Task 1: Add private TTS cache schema** - `1c2477f8` (feat)
2. **Task 2: [BLOCKING] Push and verify Supabase schema** - RESOLVED 2026-07-01 (human-run `supabase db push`; no code commit — deploy action only)

## Files Created/Modified
- `supabase/migrations/202607010001_tts_audio_cache.sql` - Private tts-audio bucket + tts_audio_cache table, RLS + service_role grants.
- `src/lib/db/types.ts` - Typed tts_audio_cache Row/Insert/Update.

## Decisions Made
- Followed plan as specified. Cache table intentionally omits any transcript/spoken-text column; the server-computed `content_hash` is the sole lookup key (VOICE-03, T-08-02).
- RLS enabled with no policy rather than a teacher policy — the cache is server-owned and never selected by the browser (T-08-04), mirroring the intent of the student-audio server-owned access pattern.

## Deviations from Plan

None - plan executed exactly as written for Task 1.

## Issues Encountered

**Task 1 verify command references a downstream module (not a defect in this plan).**
- The plan's Task 1 automated verify is `npx vitest run tests/server/tts-cache.test.ts`. That test imports `@/server/audio/tts-cache` (the `getOrCreateTtsAudio` service), which is created by a **later** plan in this phase — not plan 08-02. Per `<artifacts_this_phase_produces>`, `src/server/audio/tts-cache.ts` is a separate artifact; plan 08-02 delivers only the migration and DB types.
- Result: the test fails with `Cannot find module '@/server/audio/tts-cache'`. This is dependency ordering, not a schema/type error.
- Verified instead that this plan's own deliverables are correct: `npx tsc --noEmit` reports **zero errors in `src/`** (all remaining tsc errors are in `tests/*` files referencing not-yet-created downstream TTS modules). The added `tts_audio_cache` typings compile cleanly.

## Blockers

**Task 2 (`[BLOCKING]` remote schema push) — RESOLVED 2026-07-01 by human-run `supabase db push`.**
- **Original blocker:** the worktree sub-agent could not run `supabase db push` — the auto-mode sandbox classified it as a `[Production Deploy]`, and the worktree had no `SUPABASE_ACCESS_TOKEN`. Per Task 2's acceptance criteria the executor named the error and marked the plan blocked rather than proceeding silently.
- **Resolution:** The developer ran `supabase db push` from the main checkout against the linked project (ref `pcxxhfjnkjkjnpdtdqtp`). Migration `202607010001` now appears in both Local and Remote columns of `supabase migration list`.
- **Verified against remote** (via `supabase db query --linked`, all `true`):
  - `public.tts_audio_cache` table exists.
  - `content_hash` carries a unique constraint.
  - `tts-audio` Storage bucket is private (`public=false`).
- Downstream TTS routes may now rely on the remote schema.

## User Setup Required
None from this plan's code. The remote schema push (Blockers, above) is an operator/deploy action, not app configuration.

## Next Phase Readiness
- Local schema and DB types are complete and committed; downstream plans can build `src/server/audio/tts-cache.ts` against the typed table.
- Remote schema is live and verified (see Blockers) — no gating blocker remains for TTS route plans.

## Self-Check: PASSED
- FOUND: supabase/migrations/202607010001_tts_audio_cache.sql
- FOUND: src/lib/db/types.ts (tts_audio_cache typings present)
- FOUND commit: 1c2477f8

---
*Phase: 08-coco-voice-tts*
*Completed: 2026-07-01 (Task 1 code + Task 2 human-run db push, remote-verified)*
