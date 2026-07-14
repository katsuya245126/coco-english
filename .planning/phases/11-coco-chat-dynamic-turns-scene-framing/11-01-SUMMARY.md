---
phase: 11-coco-chat-dynamic-turns-scene-framing
plan: 01
subsystem: database
tags: [supabase, postgres, zod, vitest, migration, mission-schema]

# Dependency graph
requires:
  - phase: 09-pronunciation-scoring
    provides: additive-migration precedent (jsonb column style, RLS-inherited additive columns)
  - phase: 10-mascot-vn-style
    provides: stable mission/attempt_turns v1 core schema this plan extends
provides:
  - Four additive live columns (missions.scene_premise, missions.conversation_mode, attempt_turns.coco_line, attempt_turns.moderation_event)
  - missionFormSchema/missionSnapshotSchema conditional refine (turns.length === requiredTurns skipped when conversationMode=true)
  - 3-8 required-turns range guard for chat-mode missions
  - buildMissionSnapshot capturing scenePremise + conversationMode at assign time
  - Broadened Vitest include (tests/**/*.test.ts + src/**/*.test.ts) unblocking colocated src test discovery for the rest of Phase 11
affects: [11-02-coco-reply-generation, 11-03-dynamic-turn-orchestration, 11-04-scene-premise-ui, 11-05-mission-form-chat-toggle, 11-06-evidence-transcript]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional Zod refine: predicate becomes `value.conversationMode || value.requiredTurns === value.turns.length` so chat-mode drafts skip the exact-turn-count check while preset missions keep it byte-for-byte"
    - "Additive-only migrations: alter table ... add column if not exists, never drop/rename/retype, verified by acceptance-criteria grep gate"

key-files:
  created:
    - supabase/migrations/202607030001_coco_chat_dynamic_turns.sql
    - src/domain/mission/schemas.test.ts
  modified:
    - vitest.config.ts
    - src/domain/mission/schemas.ts
    - src/server/mission/assign-service.ts
    - src/lib/db/types.ts
    - tests/server/mission-service.test.ts
    - tests/server/mission-assign.test.ts

key-decisions:
  - "Migration pushed live by the user via `supabase db push --include-all`; verified independently both via `supabase migration list` (local=remote for 202607030001) and a direct `supabase db query --linked` against information_schema.columns confirming all four columns' exact types/nullability/defaults"
  - "Task 5 (checkpoint) required no code changes — it is a live-verification gate only; recorded as a no-file-change task in this summary rather than an empty commit"

requirements-completed: [SCENE-01, CHAT-01, CHAT-06]

coverage:
  - id: D1
    description: "Additive migration adds missions.scene_premise, missions.conversation_mode, attempt_turns.coco_line, attempt_turns.moderation_event with no destructive statements"
    requirement: "SCENE-01"
    verification:
      - kind: unit
        ref: "acceptance-criteria grep: no drop column/rename/alter column type in 202607030001_coco_chat_dynamic_turns.sql"
        status: pass
      - kind: other
        ref: "supabase db query --linked information_schema.columns — 4/4 columns present live with correct type/nullable/default"
        status: pass
    human_judgment: false
  - id: D2
    description: "vitest.config.ts include broadened to discover colocated src/**/*.test.ts tests without dropping the existing tests/** suite"
    verification:
      - kind: unit
        ref: "npx vitest run — 63 files / 556 passed, 4 skipped"
        status: pass
    human_judgment: false
  - id: D3
    description: "missionFormSchema/missionSnapshotSchema accept conversationMode/scenePremise; refine conditional on conversationMode; chat-mode requiredTurns constrained to 3-8; preset-mission behavior unchanged"
    requirement: "CHAT-01"
    verification:
      - kind: unit
        ref: "src/domain/mission/schemas.test.ts (conditional refine, 3-8 range, backward-compat cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildMissionSnapshot captures scenePremise + conversationMode from the mission row into the assign-time snapshot; DB types updated for all 4 new columns"
    requirement: "CHAT-06"
    verification:
      - kind: unit
        ref: "tests/server/mission-assign.test.ts"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-15
status: complete
---

# Phase 11 Plan 01: Coco Chat Additive Schema Foundation Summary

**Additive migration live on production (missions.scene_premise/conversation_mode, attempt_turns.coco_line/moderation_event) plus a conditional Zod refine on mission schemas so zero-turn chat-mode drafts validate while preset missions keep their exact-turn-count requirement.**

## Performance

- **Duration:** 25 min (across two executor sessions; this session resumed at Task 5)
- **Started:** 2026-07-14 (Task 1)
- **Completed:** 2026-07-15T00:40:00Z
- **Tasks:** 5 (4 code tasks + 1 checkpoint verification, all complete)
- **Files modified:** 8 (6 source/migration files + 2 test files)

## Accomplishments

- Additive migration `202607030001_coco_chat_dynamic_turns.sql` written, pushed live by the user, and independently verified against the live database: all four columns exist with correct types, nullability, and defaults
- `vitest.config.ts` include broadened to `["tests/**/*.test.ts", "src/**/*.test.ts"]`, unblocking colocated `src/**` test discovery for every remaining Phase 11 plan (11-02 through 11-06)
- `missionFormSchema` and `missionSnapshotSchema` extended with `conversationMode`/`scenePremise`, a conditional `turns.length === requiredTurns` refine, and a 3-8 required-turns range guard for chat mode — all via TDD (RED then GREEN)
- `buildMissionSnapshot` in `assign-service.ts` now captures `scenePremise` and `conversationMode` from the mission row into the immutable assign-time snapshot; `src/lib/db/types.ts` hand-extended to match the four new live columns
- Full regression suite green post-migration-verification: 63 files / 556 tests passed (4 skipped), `npm run typecheck` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the additive migration for chat-mode columns** - `f4ef71a3` (feat)
2. **Task 2: Broaden Vitest include to discover colocated src tests** - `88f9eaa3` (chore)
3. **Task 3: Extend mission form + snapshot schemas with conditional refine** - `77a50cb6` (test, RED) → `2971ba42` (feat, GREEN)
4. **Task 4: Capture premise + mode in assign-time snapshot and regenerate DB types** - `315d20e6` (feat)
5. **Task 5: Push migration live and verify columns (checkpoint:human-verify)** - no code changes; verification-only, documented below

**Plan metadata:** (this commit)

_Note: Task 3 is TDD (test → feat); no refactor commit was needed._

## Files Created/Modified

- `supabase/migrations/202607030001_coco_chat_dynamic_turns.sql` - Additive migration: 4 new nullable/defaulted columns on `missions` and `attempt_turns`
- `vitest.config.ts` - Broadened `test.include` to also discover `src/**/*.test.ts`
- `src/domain/mission/schemas.ts` - Added `conversationMode`/`scenePremise` fields, conditional refine, 3-8 chat-mode range guard on both `missionFormSchema` and `missionSnapshotSchema`
- `src/domain/mission/schemas.test.ts` - New test file covering the five TDD behaviors (backward-compat, zero-turn chat pass, 3-8 range, snapshot defaults)
- `src/server/mission/assign-service.ts` - `MissionRow` extended with `scene_premise`/`conversation_mode`; `buildMissionSnapshot` maps them into the snapshot
- `src/lib/db/types.ts` - Hand-extended `missions` and `attempt_turns` Row/Insert/Update shapes for the four new columns
- `tests/server/mission-service.test.ts` - Updated for new schema fields
- `tests/server/mission-assign.test.ts` - Updated to assert snapshot capture of premise + mode

## Decisions Made

- Migration was pushed live by the user directly (`supabase db push --include-all`) rather than via the automation-first checkpoint flow, since the user had already run and confirmed it before this session resumed. This session independently re-verified via two methods rather than trusting the prior confirmation alone: `supabase migration list` (showing `local` = `remote` = `202607030001`) and a direct `supabase db query --linked` against `information_schema.columns`, which returned all 4 expected columns with exact matching types (`text`/`boolean`/`text`/`jsonb`), nullability (`YES`/`NO`/`YES`/`YES`), and defaults (`null`/`false`/`null`/`null`) as specified in the plan's must-haves.
- Task 5 produced no file changes — it is a live-infrastructure verification checkpoint, not a code task. No empty commit was created; this is documented here instead per the plan's `<output>` spec.

## Deviations from Plan

None - plan executed exactly as written. Task 5's live push was already completed and confirmed by the user prior to this session; this session performed the plan's own independent verification steps (column-existence query) rather than re-requesting user confirmation of the push itself.

## Issues Encountered

None. The `supabase db query` CLI defaults to `--local`, which failed to connect (no local Postgres running) — resolved by adding `--linked` to target the linked remote project directly, per the CLI's own `--help` output. Not a deviation from the plan; just tooling flag discovery during verification.

## User Setup Required

None - no further external service configuration required. The one external step this plan needed (`supabase db push`) was already completed by the user before this session.

## Next Phase Readiness

- All four live DB columns confirmed present; 11-02 (Coco reply generation) and 11-03 (dynamic turn orchestration) can now read/write `coco_line` and `moderation_event` on `attempt_turns`.
- `missionSnapshotSchema` accepts and validates `conversationMode`/`scenePremise`, and `buildMissionSnapshot` populates them — 11-05 (mission form chat-mode toggle) can wire the teacher-facing form fields directly onto schemas already proven correct.
- Vitest now discovers `src/**/*.test.ts`, which every remaining Phase 11 plan's colocated unit tests depend on (11-02 moderation/generator tests, 11-03 mission-flow/generator tests, 11-06 evidence tests) — this was the phase's single Wave 0 prerequisite and is now satisfied.
- No blockers for 11-02.

---
*Phase: 11-coco-chat-dynamic-turns-scene-framing*
*Completed: 2026-07-15*

## Self-Check: PASSED

All 8 key files and 6 commit hashes (5 task commits + this summary commit) verified present on disk and in git log.
