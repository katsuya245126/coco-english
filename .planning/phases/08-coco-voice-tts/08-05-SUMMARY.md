---
phase: 08-coco-voice-tts
plan: 05
subsystem: testing
tags: [tts, playwright, vitest, verification, coco-voice]

# Dependency graph
requires:
  - phase: 08-coco-voice-tts (plan 04)
    provides: CocoSpeechAudio component and voiced question/model-sentence/feedback/transition/completion wiring
provides:
  - Final automated verification record (08-VERIFICATION.md) for VOICE-01..04
  - Nyquist-compliant validation status (08-VALIDATION.md) reflecting real Wave 0 + sampling results
  - tsc/eslint-clean tts-cache test mocks
affects: [phase-08-closeout, gsd-verify-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verification artifact records blockers explicitly (Node engine mismatch) rather than omitting them"
    - "Manual UAT sections are prepared with exact steps + empty evidence table, never pre-filled with fabricated results"

key-files:
  created:
    - .planning/phases/08-coco-voice-tts/08-VERIFICATION.md
  modified:
    - tests/server/tts-cache.test.ts
    - .planning/phases/08-coco-voice-tts/08-VALIDATION.md

key-decisions:
  - "Task 1 (voice transition/completion surfaces) was already fully implemented and tested by Plan 04 (commit 36de2edb); verified via the 8 passing tests in tests/domain/tts-ui-source.test.ts rather than re-implementing or re-committing unchanged code."
  - "Fixed 3 pre-existing tsc errors and 1 follow-on eslint error in tests/server/tts-cache.test.ts because they blocked Task 2's required npm run typecheck / npm run lint verification commands (Rule 1/3)."
  - "Did not upgrade the local Node runtime (v20.12.0) to satisfy the >=20.19.0 engine requirement — no version manager or alternate install was available; recorded as an explicit open blocker in 08-VERIFICATION.md rather than silently proceeding or fabricating compliance."
  - "Did not perform or fabricate the VOICE-04 real low-end-device UAT (Task 3) — this requires a human with physical access to a Chromebook or older tablet. Execution stopped at the Task 3 checkpoint per the plan's blocking gate."

patterns-established:
  - "When a plan's verify command blocks on a pre-existing bug in a file the plan already lists under files_modified, fix it inline (Rule 1/3) and commit separately from the plan's own new work, with rationale documented."

requirements-completed: []
# NOTE: VOICE-01/02/03 have automated PASS evidence recorded in 08-VERIFICATION.md,
# and VOICE-04's automated/source portion also passes, but VOICE-04's manual UAT
# is human_needed. Per plan-05's own success_criteria ("Phase 8 is complete when
# ... low-end-device UAT is recorded or explicitly marked human-needed"), this
# plan intentionally leaves requirements-completed empty rather than marking
# VOICE-01..04 complete while a blocking checkpoint remains open. Requirements
# should be marked complete only after Task 3's human UAT is recorded.

# Metrics
duration: 35min
completed: 2026-07-02
status: checkpoint_paused
---

# Phase 08 Plan 05: Final Voice Wiring and Verification Summary

**Confirmed transition/completion Coco voice wiring (already shipped in Plan 04) and recorded real automated verification evidence (29 focused TTS tests, full 298-test suite, full 25-test Playwright e2e suite, typecheck, lint) — paused at the blocking VOICE-04 real-device UAT checkpoint with no fabricated human evidence.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-02T01:25:47Z
- **Completed (through Task 2):** 2026-07-02T02:00:00Z
- **Tasks:** 2 of 3 complete (Task 3 is a blocking human-verify checkpoint, intentionally not executed)
- **Files modified:** 3 (1 test file fixed, 1 verification file created, 1 validation file updated)

## Accomplishments
- Confirmed Task 1's D-08/D-11/D-14/D-16 voiced-surface requirements are already fully satisfied by Plan 04's `StepTurnTransition.tsx` / `StepMissionComplete.tsx` wiring — verified via the existing 8-test `tests/domain/tts-ui-source.test.ts` suite (all passing), so no redundant re-implementation was made.
- Fixed 3 pre-existing TypeScript errors and 1 follow-on ESLint error in `tests/server/tts-cache.test.ts` that were blocking the plan's required `npm run typecheck` / `npm run lint` commands.
- Ran and recorded every command in the plan's `<verification>` block, creating `08-VERIFICATION.md` as the canonical evidence record.
- Proved VOICE-03's cache-hit behavior via `tests/server/tts-cache.test.ts`'s provider-call-count assertion (exactly one call across a miss+hit pair).
- Updated `08-VALIDATION.md` to `nyquist_compliant: true` / `wave_0_complete: true` now that Wave 0 test files exist and pass, while leaving the "Real low-end-device UAT is completed" sign-off item explicitly unchecked.
- Prepared the VOICE-04 manual UAT section in `08-VERIFICATION.md` with exact steps and an empty evidence table — did not run or fabricate the human check.

## Task Commits

1. **Task 1: Voice transition and completion surfaces** - No new commit. Behavior already implemented and committed in `36de2edb` (Plan 04); verified via `npx vitest run tests/domain/tts-ui-source.test.ts` (8/8 passing) with no code changes required.
2. **Task 2: Run final automated verification and record evidence** - `18764d5d` (fix: tsc errors), `29c95eab` (fix: eslint error), `7ec1b6ff` (docs: 08-VERIFICATION.md + 08-VALIDATION.md update)
3. **Task 3: Complete real low-end-device playback UAT** - NOT STARTED. Blocking `checkpoint:human-verify` — execution paused here per plan design. No commit.

**Plan metadata:** (this commit, once created — see below)

## Files Created/Modified
- `tests/server/tts-cache.test.ts` - Fixed 3 tsc errors (upsert payload cast, `as never` spread replaced with a typed input cast, fake mock parameter typed so `mock.calls[0][0]` indexes correctly) and 1 follow-on eslint `no-empty-object-type` error (declared `cacheRow` as `unknown` instead of casting to `{} | null`).
- `.planning/phases/08-coco-voice-tts/08-VERIFICATION.md` - New. Records Node version mismatch, all automated command results (PASS), requirement-level status table, cache-hit proof detail, Supabase schema status, and the VOICE-04 manual UAT checklist (PENDING/human_needed, empty evidence table).
- `.planning/phases/08-coco-voice-tts/08-VALIDATION.md` - Updated frontmatter (`nyquist_compliant: true`, `wave_0_complete: true`), per-task verification map, Wave 0 checklist, and sign-off checklist to reflect real (not placeholder) results.

## Decisions Made
- Task 1 required no new implementation — Plan 04 already wired `CocoSpeechAudio` into both `StepTurnTransition` and `StepMissionComplete` with the correct `lineKind` descriptors (`coco_transition`, `completion_celebration`), and the corresponding source-contract tests in `tests/domain/tts-ui-source.test.ts` already assert this wiring. Re-implementing or re-committing unchanged code would have been redundant; instead this was verified and documented as already-satisfied.
- The pre-existing `tsc`/`eslint` errors in `tests/server/tts-cache.test.ts` were fixed under Rule 1 (bug — the test file did not previously compile cleanly) / Rule 3 (blocking — they prevented the plan's mandatory `npm run typecheck` and `npm run lint` verification commands from passing). Both fixes are minimal, type-only changes with no behavior change; the same 8 tests still pass after each fix.
- The Node engine mismatch (`v20.12.0` present vs. `>=20.19.0` required) was NOT auto-fixed. No version manager (nvm/fnm/volta/asdf/n) or alternate Node install was available on this machine to switch runtimes, and installing a new Node version is an environment change outside this plan's file scope. This is recorded as an explicit open item in `08-VERIFICATION.md` rather than silently ignored or worked around.
- Per the plan's own checkpoint contract, Task 3 (real low-end-device UAT) was not run, self-approved, or fabricated. The plan's `<acceptance_criteria>` for Task 3 explicitly states: "If no low-end device is available, `08-VERIFICATION.md` remains `human_needed` for VOICE-04 and the phase is not represented as fully verified." That is exactly the state left behind.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Rule 3 - Blocking] Fixed pre-existing TypeScript errors in tts-cache test mocks**
- **Found during:** Task 2 (`npm run typecheck`)
- **Issue:** `tests/server/tts-cache.test.ts` had 3 `tsc` errors: (a) `cacheRow = payload` assigning `unknown` to an implicitly narrower `{} | null` type, (b) a `...( { ... } as never)` spread that TypeScript rejected as "Spread types may only be created from object types," and (c) `fakeGenerateTtsAudio.mock.calls[0]` indexing into an inferred empty tuple `[]` because the mock's callback took no typed parameter.
- **Fix:** Declared `cacheRow` explicitly as `let cacheRow: unknown`; replaced the `as never` spread with an object literal cast via `as unknown as Parameters<typeof getOrCreateTtsAudio>[0]`; typed the fake mock's callback parameter as `(_input: unknown) => ...` so `mock.calls[0]` is a 1-tuple.
- **Files modified:** `tests/server/tts-cache.test.ts`
- **Verification:** `npm run typecheck` clean; `npx vitest run tests/server/tts-cache.test.ts` still 8/8 passing after each edit.
- **Committed in:** `18764d5d`

**2. [Rule 1 - Bug] Fixed follow-on ESLint error from the typecheck fix**
- **Found during:** Task 2 (`npm run lint`, after the typecheck fix above)
- **Issue:** The `payload as {} | null` cast used in the first fix tripped `@typescript-eslint/no-empty-object-type` ("The `{}` type allows any non-nullish value").
- **Fix:** Removed the cast entirely by declaring `cacheRow`'s type at the `let` binding (`let cacheRow: unknown = ...`) instead of casting at each assignment site.
- **Files modified:** `tests/server/tts-cache.test.ts`
- **Verification:** `npm run lint` clean; `npm run typecheck` still clean; `npx vitest run tests/server/tts-cache.test.ts` still 8/8 passing.
- **Committed in:** `29c95eab`

---

**Total deviations:** 2 auto-fixed (both Rule 1/3 — pre-existing type/lint errors blocking mandatory verification commands, both in a test file already listed under this plan's scope via the shared cache-service test suite).
**Impact on plan:** Both fixes were required to make the plan's own `<verify>` commands (`npm run typecheck`, `npm run lint`) pass; no scope creep, no behavior change to the tested service.

## Issues Encountered

**Node engine version below the required minimum.** `package.json` declares `"engines": { "node": ">=20.19.0" }`, but the executing machine has `v20.12.0` with no version manager or alternate Node install available. All automated verification commands were still run and passed on this version, but per `08-VALIDATION.md`'s "Local Node engine parity" manual-only verification row, this is recorded as an open item requiring re-verification on a compliant runtime before final sign-off. Not resolved automatically — this is an environment/infrastructure gap outside the scope of auto-fixable code changes.

**Task 3 blocking checkpoint reached as designed.** VOICE-04's real Chromebook/older-tablet UAT cannot be performed by an automated agent. Execution stopped here per the plan's `gate="blocking"` design; see the checkpoint report returned alongside this summary for the exact human steps required.

## User Setup Required

None from this plan's code changes. The remaining action is the **human UAT** described in `08-VERIFICATION.md`'s Manual UAT section — a human must complete it on a real Chromebook or older tablet and record the result there (or explicitly accept the risk of shipping without it).

## Next Phase Readiness

- All automated verification for Phase 8 is green: VOICE-01, VOICE-02, VOICE-03 fully proven; VOICE-04's automated/source-level checks pass.
- Phase 8 is **NOT** ready to be marked complete/verified until either (a) a human completes the VOICE-04 low-end-device UAT and records a PASS in `08-VERIFICATION.md`, or (b) an explicit risk-acceptance decision is logged in its place (consistent with how Phase 5's iOS Safari UAT and other phases' `human_needed` items were handled at milestone close).
- `requirements-completed` in this summary's frontmatter is intentionally left empty; VOICE-01..04 should be marked complete in `REQUIREMENTS.md` only after Task 3 resolves (or an explicit risk-acceptance is recorded).
- No blockers for future phases (Phase 9+) — Phase 8's server/domain/UI code is complete and stable regardless of the open UAT item.

## Self-Check: PASSED

- FOUND: .planning/phases/08-coco-voice-tts/08-VERIFICATION.md
- FOUND: tests/server/tts-cache.test.ts (modified, 8/8 tests passing)
- FOUND commit: 18764d5d
- FOUND commit: 29c95eab
- FOUND commit: 7ec1b6ff

---
*Phase: 08-coco-voice-tts*
*Completed through Task 2; Task 3 checkpoint pending human action: 2026-07-02*
