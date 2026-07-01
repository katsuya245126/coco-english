---
phase: 08-coco-voice-tts
plan: 01
subsystem: testing
tags: [vitest, playwright, tts, openai, tdd-red, supabase-storage]

# Dependency graph
requires: []
provides:
  - "Failing (RED) Vitest contract tests for domain TTS constants and cache-hash-input shape (tests/domain/tts.test.ts)"
  - "Failing (RED) Vitest tests for OpenAI speech adapter with fake-client injection (tests/server/tts-generator.test.ts)"
  - "Failing (RED) Vitest tests for server-side cache/provider/storage orchestration (tests/server/tts-cache.test.ts)"
  - "Failing (RED) Vitest source-boundary checks for student TTS UI wiring (tests/domain/tts-ui-source.test.ts)"
  - "Failing (RED) Playwright spec for browser-required autoplay/permission semantics (tests/e2e/student-coco-voice.spec.ts)"
affects: [08-02, 08-03, 08-04, 08-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fake-client dependency injection for OpenAI adapters (mirrors src/server/audio/transcription.ts)"
    - "ok/error result unions for server adapters, never throwing across the boundary"
    - "Provider-call-count assertions (not just return values) to verify cache-hit behavior"
    - "Cache-hash-input structure assertions (not raw hash string) to keep hashing implementation flexible"
    - "Source-contract static scans (SCAN_DIRS/FORBIDDEN_TOKENS) styled after tests/domain/ai-boundary.test.ts"

key-files:
  created:
    - tests/domain/tts.test.ts
    - tests/server/tts-generator.test.ts
    - tests/server/tts-cache.test.ts
    - tests/domain/tts-ui-source.test.ts
    - tests/e2e/student-coco-voice.spec.ts
  modified: []

key-decisions:
  - "Cache hash input is asserted as a structured object (schemaVersion/provider/model/voice/responseFormat/characterId/text), not a raw digest, so the implementer retains freedom over the actual hashing algorithm"
  - "Server cache tests assert exact provider call counts across miss-then-hit sequences to directly guard against a cache layer that always calls the provider"
  - "Server cache tests assert that a spread-in client-supplied contentHash/transcript is never forwarded to the provider or persisted, guarding the 'never trust a client-supplied hash' pitfall"
  - "Playwright spec kept to only 3 tests, matching this repo's established e2e style (static source assertions plus one lightweight browser check), reserving true browser-required checks for autoplay/permission semantics"

requirements-completed: [VOICE-01, VOICE-02, VOICE-03, VOICE-04]

# Metrics
duration: 55min
completed: 2026-07-01
status: complete
---

# Phase 8 Plan 01: Coco Voice Test-First Validation Net Summary

**Five RED Vitest/Playwright test files establishing the executable contract for OpenAI TTS generation, cache-hit behavior, and student playback UI before any Coco Voice production code exists.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-01T13:26:00Z (approx, prior session)
- **Completed:** 2026-07-01T14:21:05Z
- **Tasks:** 3
- **Files modified:** 5 (all new test files)

## Accomplishments
- Pure-domain TTS contract locked down: provider/model/response-format/default-voice constants, voice-eligible line kinds (D-06..D-11), and a canonical cache-hash-input builder with whitespace normalization and cross-field sensitivity checks (VOICE-01, VOICE-03)
- Server-side OpenAI speech adapter contract locked down with fake-client injection, missing-API-key branch, and provider-failure branch that never leaks upstream error detail (VOICE-01)
- Server-side cache/storage orchestration contract locked down: miss-then-hit with exactly one provider call, assignment-ownership filter before generation, non-blocking failure states with no partial cache row (D-15), tamper-resistance against client-supplied hash/transcript fields, and signed-URL-only serving from a private bucket (VOICE-03)
- Student UI and source-boundary contract locked down: inline icon-only replay control with `aria-label="Play Coco"` (D-12/D-13), standard `<audio>` usage with caught `play()` rejections, recording controls never disabled by TTS state (D-04), student transcripts never voiced (D-10), student client modules kept clear of OpenAI/server-adapter imports, and no teacher-facing replay telemetry (D-16) (VOICE-02, VOICE-04)
- All three plan verification commands run to a coherent, syntactically-correct RED state pointing only at intentionally-missing modules (`@/domain/audio/tts`, `@/server/audio/tts-generator`, `@/server/audio/tts-cache`, `src/components/student/CocoSpeechAudio.tsx`) or not-yet-wired integration, never at syntax errors in the test files themselves

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pure TTS contract tests** - `0ec99f0a` (test)
2. **Task 2: Add server TTS adapter and cache tests** - `91de9d5d` (test)
3. **Task 3: Add student playback and source-boundary checks** - `fa6cd3cd` (test)

**Plan metadata:** committed separately below (docs: complete plan)

_Note: This is a Wave 0 test-only plan — no feat/refactor commits are expected. The full RED→GREEN→REFACTOR cycle completes across Plans 02-05._

## Files Created/Modified
- `tests/domain/tts.test.ts` - Pure TTS constants (provider/model/format/voice), voice-eligible line kinds, canonical cache-hash-input builder contract
- `tests/server/tts-generator.test.ts` - OpenAI speech adapter contract with fake-client injection, missing-key and provider-failure branches
- `tests/server/tts-cache.test.ts` - Cache/provider/storage orchestration contract: miss/hit, ownership check, non-blocking failures, tamper-resistance, signed URLs
- `tests/domain/tts-ui-source.test.ts` - Source-contract checks for replay UI, mission-step wiring, student/server boundary, no-transcript-voicing, no teacher telemetry
- `tests/e2e/student-coco-voice.spec.ts` - Playwright spec reserved for browser-required autoplay/permission semantics

## Decisions Made
- Cache-hash-input asserted as a structured object rather than a raw digest, preserving hashing-algorithm freedom for the implementer (Plan 03)
- Provider-call-count assertions used throughout cache tests to make cache-hit verification unambiguous, directly addressing the "cache hit is not actually verified" pitfall from 08-RESEARCH.md
- Tamper-resistance test added proactively (Rule 2 spirit, though still within test-writing scope) asserting a spread-in client-supplied `contentHash`/`transcript` is never forwarded to the provider or persisted — this is a security-relevant contract the plan's threat model (T-08-01) implies but does not spell out verbatim
- Playwright spec intentionally kept small (3 tests) and consistent with this repo's existing e2e style (mostly static source assertions), since true browser-required autoplay semantics are inherently limited before any component exists to load into a page

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 deviations were triggered; no production source code was created (correctly out of scope for this Wave 0 plan); no auth gates were encountered (all tests use fake/injected clients, no live OpenAI or Supabase credentials required).

## Issues Encountered
None. All three verification commands produced the expected RED state on first run, with failures isolated to `Cannot find module` / `ENOENT` errors for planned-but-not-yet-created files (`@/domain/audio/tts`, `@/server/audio/tts-generator`, `@/server/audio/tts-cache`, `src/components/student/CocoSpeechAudio.tsx`) and missing integration wiring in existing mission step components — never syntax errors in the new test files.

## User Setup Required

None - no external service configuration required. All tests use dependency-injected fake clients; no live OPENAI_API_KEY or Supabase credentials are exercised in this plan.

## Next Phase Readiness

Plan 02 (or whichever wave-1 plan implements `src/domain/audio/tts.ts` first) can proceed directly against `tests/domain/tts.test.ts` as its GREEN target. Plans implementing `src/server/audio/tts-generator.ts` and `src/server/audio/tts-cache.ts` have concrete, already-committed test contracts to satisfy, including the private-bucket/signed-URL requirement and the tamper-resistance guarantee. Plan(s) implementing `src/components/student/CocoSpeechAudio.tsx` and wiring it into `StepBuddyQuestion`, `StepImprovedRepeat`, `StepTurnTransition`, and `StepMissionComplete` have both a Vitest source-contract target and a minimal Playwright target to turn green.

No blockers. One environment note carried forward from prior planning (non-blocking for this plan): local Node is `v20.12.0` while `package.json` requires `>=20.19.0` — flagged for manual attention before the phase's final verification, not before individual plan execution.

---
*Phase: 08-coco-voice-tts*
*Completed: 2026-07-01*
