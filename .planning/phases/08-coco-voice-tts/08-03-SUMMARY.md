---
phase: 08-coco-voice-tts
plan: 03
subsystem: api
tags: [openai, tts, supabase-storage, signed-urls, cache, zod, next-route, vitest]

# Dependency graph
requires:
  - phase: 08-01
    provides: TDD RED test suite (tts.test.ts, tts-generator.test.ts, tts-cache.test.ts) and source-boundary test scaffolding
  - phase: 08-02
    provides: tts_audio_cache table + private tts-audio Storage bucket (live remote schema) and typed table shape in src/lib/db/types.ts
provides:
  - Pure TTS domain module with provider/model/format constants, DEFAULT_COCO_TTS_VOICE = marin, bounded voice enum, Zod request schema, voice-eligible line-kind rules, whitespace-normalized canonical cache-input builder, and SHA-256 content-hash helper
  - Server-only OpenAI speech adapter (generateTtsAudio) confining the openai import to one server file
  - Assignment-gated, cache-first TTS service (getOrCreateTtsAudio) serving private signed URLs from tts-audio
  - Student-gated POST route that resolves Coco line text server-side and delegates to the cache service
affects: [08-04, coco-voice-ui, student-mission-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure domain / server-adapter / gated-service / thin-route four-layer split for a paid provider feature"
    - "Server-computed canonical content hash as the sole cache key; client-supplied hashes never trusted"
    - "Injected-dependency provider adapter so tests never call the paid API"
    - "Private bucket + short-lived signed URL playback (never public Storage URLs)"

key-files:
  created:
    - src/domain/audio/tts.ts
    - src/server/audio/tts-generator.ts
    - src/server/audio/tts-cache.ts
    - src/app/student/missions/[assignmentStudentId]/tts/route.ts
  modified: []

key-decisions:
  - "Widened getOrCreateTtsAudio input voice to string and coerced to the bounded TtsVoice enum internally, to satisfy the frozen RED test contract while keeping arbitrary voices out of the provider call"
  - "Route resolves line text from the mission snapshot (mission_prompt), attempt_turns.improved_sentence (improved_sentence), and bounded character-profile copy (transition/feedback/completion) — never from browser-supplied text"
  - "content_hash is derived from a JSON-array serialization with fixed field order for a deterministic SHA-256 digest"

patterns-established:
  - "TTS domain contracts (constants, enum, schema, hash) live in one pure module imported by adapter, service, and route"
  - "Provider/storage failures return small retryable error unions and never write a partial cache row (D-15 non-blocking posture)"

requirements-completed: [VOICE-01, VOICE-03]

# Metrics
duration: 6min
completed: 2026-07-01
status: complete
---

# Phase 08 Plan 03: Server-Owned Coco TTS Contract, Adapter, Cache & Route Summary

**Cache-first, assignment-gated OpenAI TTS: pure domain contracts (marin default, SHA-256 cache key), a server-only speech adapter, a signed-URL cache service, and a student-gated Next route — all provider access confined server-side and paid-call-free under tests.**

## Performance

- **Duration:** 6 min 11 s
- **Started:** 2026-07-01T14:56:27Z
- **Completed:** 2026-07-01T15:02:36Z
- **Tasks:** 3
- **Files modified:** 4 created (+1 deferred-items doc)

## Accomplishments
- Pure `src/domain/audio/tts.ts`: OpenAI/`gpt-4o-mini-tts`/mp3 constants, `DEFAULT_COCO_TTS_VOICE = "marin"`, bounded `TTS_VOICES` enum, Zod request schema with no student-text/hash fields (D-10, T-08-03), voice-eligible line kinds (D-06..D-11) with `isVoiceEligibleLineKind` rejecting transcript kinds (D-10), whitespace-normalized cache-input builder and deterministic SHA-256 hash (VOICE-03).
- Server-only `src/server/audio/tts-generator.ts`: `SpeechClient` + injected deps, `generateTtsAudio` defaulting Coco to marin, mp3 `audio/mpeg` Blob output, bounded supportive instructions; missing key skips the provider, provider errors log metadata only (no spoken text) and return `provider_failed`. `openai` imported only here (T-08-01).
- `src/server/audio/tts-cache.ts`: `getOrCreateTtsAudio` checks `assignment_students.id` + `student_id` ownership (T-08-04), computes the canonical hash server-side, returns cache hits without a provider call, and on miss calls the generator exactly once, uploads to the private `tts-audio` bucket, upserts cache metadata, and returns a short-lived signed URL (T-08-05). Provider/storage failures are non-blocking and write no partial row (D-15).
- Student route `src/app/student/missions/[assignmentStudentId]/tts/route.ts`: reads the student unlock cookie (401 on missing), schema-validates the line descriptor (400 on invalid), resolves line text from owned assignment/attempt/profile state, delegates to the cache service, and maps not-found → 404, provider/storage failure → 502 retryable (D-15). No replay telemetry recorded (D-16).

## Task Commits

Each task was committed atomically (TDD tests were pre-authored in plan 08-01 RED; this plan implemented GREEN):

1. **Task 1: Pure TTS domain contracts** - `d5ea8ea6` (feat)
2. **Task 2: Server-only OpenAI speech adapter** - `a209a696` (feat)
3. **Task 3: Assignment-gated cache service and student route** - `7c662979` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified
- `src/domain/audio/tts.ts` - Pure TTS constants, bounded voice enum, request schema, line-kind rules, canonical cache-input builder, SHA-256 hash helper
- `src/server/audio/tts-generator.ts` - Server-only OpenAI speech adapter with injected client/deps
- `src/server/audio/tts-cache.ts` - Assignment-gated, cache-first service returning private signed URLs
- `src/app/student/missions/[assignmentStudentId]/tts/route.ts` - Student-gated POST route with server-side line-text resolution
- `.planning/phases/08-coco-voice-tts/deferred-items.md` - Logged out-of-scope pre-existing test-fixture typecheck errors

## Decisions Made
- The frozen RED cache test passes `voice: "marin"` typed as plain `string`; to honor that contract without editing the test I widened `GetOrCreateTtsAudioInput.voice` to `string` and coerce it to the bounded `TtsVoice` enum inside the service (unknown → default marin). This keeps arbitrary voices out of the provider call while satisfying the spec.
- Line text is resolved server-side per line kind: `mission_prompt` from the mission snapshot turn, `improved_sentence` from `attempt_turns.improved_sentence`, and transition/feedback/completion from bounded character-profile copy. Browser text is never trusted (T-08-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened service input `voice` type to satisfy the frozen RED test**
- **Found during:** Task 3 (cache service + typecheck)
- **Issue:** `tests/server/tts-cache.test.ts` (authored in 08-01, immutable) passes `voice: "marin"` inferred as `string`; a `voice: TtsVoice` parameter produced 8 TS2345 errors, blocking `npm run typecheck`.
- **Fix:** Declared `GetOrCreateTtsAudioInput.voice: string` and coerced to the bounded `TtsVoice` enum inside `getOrCreateTtsAudio` via `ttsVoiceSchema` (unknown voice falls back to `DEFAULT_COCO_TTS_VOICE`). Security posture preserved — arbitrary voices never reach the provider.
- **Files modified:** src/server/audio/tts-cache.ts
- **Verification:** All 8 cache tests pass; no `src/` typecheck errors remain.
- **Committed in:** 7c662979 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to reconcile the implementation with the immutable RED test contract. No scope creep; the bounded-voice invariant is preserved.

## Issues Encountered
- **Pre-existing typecheck errors in the frozen RED test file (out of scope).** `npm run typecheck` reports 3 errors, all inside `tests/server/tts-cache.test.ts` (lines 59, 263, 268) — mock-fixture typings (`payload: unknown`, `...({...} as never)` spread, `mock.calls[0] ?? []` tuple destructure). Verified present at base commit `b47da9d` and unmodified by this plan. All `src/` implementation files typecheck clean and all 21 runtime tests pass. Not fixed here: editing the frozen RED test would violate the TDD contract and is outside this plan's file scope. Logged to `deferred-items.md` for a later cleanup pass or the verifier.

## User Setup Required
None - no external service configuration required in this plan. (`OPENAI_API_KEY` and the `tts-audio` bucket already exist; the runtime provider call is exercised in the UI plan 08-04.)

## Next Phase Readiness
- Server TTS contract is complete: validated student requests produce cache-first signed audio metadata, duplicate requests avoid provider regeneration, and provider access is server-only.
- Ready for plan 08-04 (student UI) to consume the `POST /student/missions/[assignmentStudentId]/tts` route via `CocoSpeechAudio` and wire visible Coco lines.
- No blockers. The 3 test-fixture typecheck errors are documented and non-blocking to runtime behavior.

## Known Stubs
None - all four modules are fully wired to live schema and the injected provider; no placeholder data or hardcoded empty values.

## TDD Gate Compliance
Tests were authored in plan 08-01 (RED). This plan implemented GREEN only: RED was confirmed failing (module-not-found) before implementation, then all 21 tests (10 domain + 3 generator + 8 cache) passed after implementation. No REFACTOR commit was needed.

## Self-Check: PASSED

- All 4 source files verified present on disk.
- SUMMARY.md verified present.
- All task commits (d5ea8ea6, a209a696, 7c662979) and docs commit (2692ae64) verified in git history.

---
*Phase: 08-coco-voice-tts*
*Completed: 2026-07-01*
