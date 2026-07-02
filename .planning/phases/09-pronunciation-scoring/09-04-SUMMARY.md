---
phase: 09-pronunciation-scoring
plan: 04
subsystem: api
tags: [azure-speech, pronunciation-scoring, audio-pipeline, supabase, vitest]

# Dependency graph
requires:
  - phase: 09-pronunciation-scoring (plan 02)
    provides: live pronunciation_scores table with RLS, keyed on audio_clip_id
  - phase: 09-pronunciation-scoring (plan 03)
    provides: scorePronunciation adapter + scoreToStarBand domain mapping
provides:
  - Inline, concurrent, best-effort pronunciation scoring wired into uploadAttemptAudioClip
  - Live pronunciation_scores rows for real student turns (silent, no student/teacher UI yet)
affects: [09-05 (teacher diagnostic panel + calibration), 09-06 (student-facing stars)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort side-effect wrapped in try/catch mirroring the existing warmTtsAudioCache template, logging a warn event and never altering the function's return value"
    - "Concurrent (not serial) execution: the scoring promise is started immediately after transcription succeeds, before the turnWrite IIFE executes, then awaited only after turnWrite succeeds"

key-files:
  created: []
  modified:
    - src/server/student-access/audio-upload.ts
    - tests/server/audio-upload.test.ts

key-decisions:
  - "Reference text passed to scorePronunciation is the turn's target/improved sentence (snapshotTurn.targetExample for original_answer, turn.improved_sentence ?? snapshotTurn.targetExample for repeat_attempt), never the raw transcript"
  - "pronunciation_scores upsert uses onConflict: audio_clip_id so re-scoring replaces the existing row in place (D-06)"
  - "Scoring output is not added to uploadAttemptAudioClip's return payload in this plan — student-facing starBand plumbing is deferred to 09-06 (PRON-04 no-raw-score groundwork stays intact)"

patterns-established:
  - "Third best-effort side-effect in this file (after evaluation write and TTS warmup) follows the identical try/catch + log('warn', ...) shape"

requirements-completed: [PRON-01]

# Metrics
duration: 12min
completed: 2026-07-02
status: complete
---

# Phase 9 Plan 4: Wire pronunciation scoring inline into audio upload Summary

**Every scored turn upload now runs Azure pronunciation scoring concurrently with OpenAI turn evaluation and upserts a `pronunciation_scores` row keyed on the audio clip, with scoring/DB failures degrading gracefully to the pre-existing `{ ok: true }` response.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-02T12:57:00Z
- **Completed:** 2026-07-02T12:59:19Z
- **Tasks:** 1 (TDD: RED then GREEN)
- **Files modified:** 2

## Accomplishments
- `UploadAttemptAudioClipDeps` now accepts an injectable `scorePronunciation`, matching the existing injectable-adapter convention used for transcription/evaluation/TTS.
- `uploadAttemptAudioClip` kicks off pronunciation scoring immediately after transcription succeeds, running concurrently with the existing `evaluateOriginalTurn`/`evaluateRepeatTurn` call rather than serially after it.
- On success, a `pronunciation_scores` row is upserted (`onConflict: "audio_clip_id"`) with accuracy/fluency/completeness/pronunciation scores, the derived star band, and per-word scores — keyed on `audio_clip_id`, independent of `attempt_turns.evaluation`.
- On any scoring or DB-write failure, `audio.pronunciation_scoring_failed` is logged with structured context only (no leaked audio/text) and the upload still returns `{ ok: true, ... }` unchanged — the student's core meaning/pattern feedback is never blocked (T-09-09, RESEARCH.md Open Question 1).
- Extended `tests/server/audio-upload.test.ts` with 6 new cases covering: success + upsert shape, reference-text resolution for original vs. repeat turns, scorer failure, scorer throw, DB-write failure, and concurrent-not-serial execution ordering.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 (RED): add failing tests for inline pronunciation scoring** - `ac5eac68` (test)
2. **Task 1 (GREEN): wire pronunciation scoring inline into audio upload pipeline** - `e9f13625` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/server/student-access/audio-upload.ts` - Added `scorePronunciation` to `UploadAttemptAudioClipDeps`; resolves reference text per turn kind; starts the scoring promise concurrently with evaluation; best-effort upsert into `pronunciation_scores` after `turnWrite` succeeds, wrapped in try/catch with a `audio.pronunciation_scoring_failed` warn log on any failure path.
- `tests/server/audio-upload.test.ts` - 6 new test cases: success upsert assertion, original-vs-repeat reference-text resolution, provider-failure graceful degradation, thrown-exception graceful degradation, DB-write-failure graceful degradation, and a call-order assertion proving scoring starts before evaluation resolves (concurrency, not serial chaining).

## Decisions Made
- Followed the plan's `<action>` exactly: reference text source, `Promise` kicked off before the `turnWrite` IIFE (concurrent), `await`ed only after `turnWrite` succeeds, and the best-effort try/catch modeled on the existing `warmTtsAudioCache` block.
- No architectural deviations. No new dependencies. No schema changes (09-02's live table used as-is).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The existing mock-Supabase test harness in `tests/server/audio-upload.test.ts` already supported `upsert(...)` on new tables without modification (the mock query builder is table-agnostic), so no test-infrastructure changes were needed beyond adding new `it()` blocks and one small `from` override for the DB-write-failure case.

## User Setup Required

None - no external service configuration required (Azure Speech key/region were already configured in 09-01; this plan's automated tests never call the paid Azure API, consistent with the injected-fakes convention).

## Next Phase Readiness

- PRON-01 is complete end-to-end at the pipeline level: scored turns silently produce `pronunciation_scores` rows keyed on the audio clip, available for the 09-05 calibration pass and teacher diagnostic panel to consume.
- No student-facing or teacher-facing UI exists yet for these scores (by design — Pitfall 3 ordering: calibration must happen before any UI is shown). 09-05 can now query real `pronunciation_scores` data against the 6 real students' stored audio for the D-04 manual calibration spot-check.
- `npm test` (full suite, 40 files / 347 tests / 4 skipped) and `npm run typecheck` are both green; `npm run lint` is clean.

## Self-Check: PASSED

- FOUND: src/server/student-access/audio-upload.ts (modified, contains scorePronunciation/pronunciation_scores/audio.pronunciation_scoring_failed)
- FOUND: tests/server/audio-upload.test.ts (modified, 21 tests passing)
- FOUND commit ac5eac68 (test(09-04): add failing tests for inline pronunciation scoring in audio upload)
- FOUND commit e9f13625 (feat(09-04): wire pronunciation scoring inline into audio upload pipeline)

---
*Phase: 09-pronunciation-scoring*
*Completed: 2026-07-02*
