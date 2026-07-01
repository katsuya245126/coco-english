# Deferred Items — Phase 08 Coco Voice TTS

Out-of-scope discoveries logged during execution (not fixed, per SCOPE BOUNDARY).

## Pre-existing typecheck errors in frozen RED test fixture

**Discovered during:** 08-03 Task 3 (plan-level `npm run typecheck`)

**File:** `tests/server/tts-cache.test.ts` (authored in plan 08-01 RED phase; present at
base commit `b47da9d`, unmodified by 08-03)

Three `tsc --noEmit` errors originate entirely inside the test's own mock/fixture code
and are independent of the 08-03 source implementation (all `src/` TTS files typecheck
clean):

| Line | Error | Cause |
|------|-------|-------|
| 59 | TS2322: `unknown` not assignable to `{} \| null` | mock `cacheRow = payload` where `payload: unknown` |
| 263 | TS2698: spread of non-object type | deliberate forged-input `...({...} as never)` construct |
| 268 | TS2493: tuple `[]` has no element at index 0 | `mock.calls[0] ?? []` destructure fallback |

**Why not fixed here:** Editing the frozen RED test would violate the TDD contract (the
test is the fixed spec for this plan) and is outside 08-03's file scope
(`src/domain/audio/tts.ts`, `src/server/audio/tts-generator.ts`,
`src/server/audio/tts-cache.ts`, the student TTS route). All 21 runtime tests pass.

**Suggested owner:** A later cleanup pass or the phase verifier may tighten the test
fixture's mock typings (e.g. type `payload` as `Record<string, unknown>`, narrow the
forged-field construct, and default the destructure to a typed tuple) without changing
any assertions.
