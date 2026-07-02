---
phase: 08-coco-voice-tts
verified: 2026-07-02
automated_status: pass
manual_status: human_needed
---

# Phase 08 — Verification Record (Coco Voice / TTS)

## Runtime Environment

| Check | Required | Actual | Status |
|-------|----------|--------|--------|
| Node engine (`package.json` `engines.node`) | `>=20.19.0` | `v20.12.0` | **FAIL — below minimum** |

**Blocker recorded, not omitted:** The local development machine used for this verification pass runs Node `v20.12.0`. `package.json` declares `"engines": { "node": ">=20.19.0" }`. No `nvm`/`fnm`/`volta`/`asdf`/`n` version manager and no alternate Node install were available on this machine (checked and confirmed absent) to switch to a compliant runtime for this pass.

All automated commands below were still run and passed on `v20.12.0`. Per 08-VALIDATION.md's manual-only verification row ("Local Node engine parity"), **final production sign-off must additionally re-run these same automated commands on a `>=20.19.0` runtime** before the phase is represented as fully verified in a compliant environment. Nothing in the current commands' behavior suggested an engine-specific incompatibility (no engine-gated syntax/API failures observed), but this has not been proven on the required minimum version and is recorded here as an open item rather than silently accepted.

## Automated Verification Results

| Command | Result | Notes |
|---------|--------|-------|
| `node -v` | `v20.12.0` | Below `>=20.19.0` — see Runtime Environment above. |
| `npx vitest run tests/domain/tts.test.ts tests/domain/tts-ui-source.test.ts tests/server/tts-generator.test.ts tests/server/tts-cache.test.ts` | **PASS** | 4 files, 29/29 tests passed. |
| `npm run typecheck` | **PASS** | Clean after fixing pre-existing `tsc` errors in `tests/server/tts-cache.test.ts` (see Deviations in 08-05-SUMMARY.md). |
| `npm run lint` | **PASS** | Clean after fixing a follow-on `@typescript-eslint/no-empty-object-type` error introduced by the typecheck fix. |
| `npm test` (full Vitest suite, `--run`) | **PASS** | 37 files, 298 passed, 4 skipped (pre-existing env-gated skips unrelated to Phase 8). |
| `npm run test:e2e` (full Playwright suite) | **PASS** | 25 passed, 10 skipped (pre-existing `test.skip` guards requiring seeded Supabase env data — unrelated to Phase 8), 0 failed. |
| `npx playwright test tests/e2e/student-coco-voice.spec.ts` | **PASS** | 3/3 tests passed (autoplay-rejection catch, error-affordance degrade, no microphone permission requested for playback). |

No full-suite command was blocked or skipped outright — every command listed in the plan's `<verification>` block was executed to completion on this machine, with the Node-version caveat above.

## Requirement-Level Status

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| VOICE-01 | OpenAI `gpt-4o-mini-tts` through current SDK, server-only | **PASS (automated)** | `tests/server/tts-generator.test.ts` (fake client, missing-key branch, provider-failure branch); `tests/domain/tts-ui-source.test.ts` "Student/server TTS boundary" suite confirms no client module imports OpenAI or the server adapter. |
| VOICE-02 | Replay any spoken Coco line | **PASS (automated)** | `tests/domain/tts-ui-source.test.ts` confirms icon-only `aria-label="Play Coco"` control wired into `StepBuddyQuestion`, `StepImprovedRepeat`, `StepTurnTransition`, `StepMissionComplete`; `tests/e2e/student-coco-voice.spec.ts` confirms rejected `play()` promises are caught, not thrown. |
| VOICE-03 | Content-hash cache avoids regeneration | **PASS (automated)** | `tests/server/tts-cache.test.ts`: "returns cacheStatus hit on the second identical request with exactly one provider call total" — `fakeGenerateTtsAudio` asserted `toHaveBeenCalledTimes(1)` across both the first (miss) and second (hit) identical requests. Server-computed hash only; forged `contentHash`/`transcript` fields are proven not to reach the provider call or cache row (D-10, T-08-03). |
| VOICE-04 | Standard audio on low-end device | **PENDING — human_needed** | Automated: `tests/domain/tts-ui-source.test.ts` and `tests/e2e/student-coco-voice.spec.ts` confirm standard `<audio>` element usage, no `getUserMedia` call for playback, and text-only degrade on error. **Real low-end-device (Chromebook / older tablet) playback has NOT been performed.** See Manual UAT section below. |

## Cache-Hit Proof (VOICE-03 detail)

Source: `tests/server/tts-cache.test.ts`, test `"returns cacheStatus hit on the second identical request with exactly one provider call total"`.

- First call to `getOrCreateTtsAudio(baseInput(), { generateTtsAudio: fakeGenerateTtsAudio })` returns `cacheStatus: "miss"`.
- Second call with the identical input returns `cacheStatus: "hit"`.
- `expect(fakeGenerateTtsAudio).toHaveBeenCalledTimes(1)` — asserted **after** the second call, proving the provider (OpenAI TTS) was invoked exactly once total across both requests.
- A companion test proves a forged `contentHash`/`transcript` on the input never reaches the provider call args or the cache upsert payload (server-owned hash only, T-08-03).

## Supabase Schema / Storage Status (from Plan 02)

- Migration `202607010001_tts_audio_cache.sql` applied via `supabase db push`, verified against the **remote** linked project (ref `pcxxhfjnkjkjnpdtdqtp`) on 2026-07-01 (see `08-02-SUMMARY.md` Blockers section).
- Remote-verified: `public.tts_audio_cache` exists, `content_hash` carries a unique constraint, `tts-audio` Storage bucket has `public=false`.
- No new schema changes introduced in Plan 05 — this plan only wires UI and records verification evidence.

## Manual UAT — Low-End Device Playback (VOICE-04)

**Status: PENDING / human_needed.** This section has NOT been completed. No real Chromebook or older tablet has been used to verify Coco voice playback for this phase as of this verification pass.

### Required steps (to be performed by a human on real hardware)

1. On a real Chromebook (ChromeOS) **or** an older tablet (e.g. an iPad or Android tablet 3+ years old), open the deployed/staging student mission URL for an assigned mission.
2. Confirm the mission prompt **text** appears immediately, before or regardless of Coco audio load state (D-03).
3. Trigger a **cache-miss** line (a mission prompt or feedback line not previously generated) and confirm:
   - Coco audio plays through the device's standard audio output path (speaker or connected audio), OR autoplay is blocked and the fallback is understandable — the icon-only speaker button is visibly tappable and its state (loading/ready/error) is clear to a student (D-01, D-02).
   - Tapping the replay/speaker control plays the line again.
4. Navigate to a line that has already been generated (repeat the mission, or return to a prior step if still visible) to trigger a **cache-hit** and confirm playback still works identically from the student's perspective.
5. Confirm the voice recorder / recording controls remain available and usable regardless of whether Coco audio is loading, playing, or in an error state (D-04).
6. Simulate or wait for a TTS failure state (e.g. block network to the `/tts` route, or use a device/browser where autoplay is aggressively blocked) and confirm:
   - The mission text is still readable and the flow is NOT blocked.
   - Recording and mission completion remain possible even if Coco's voice never plays (T-08-06, D-15).
7. Record below: device model/class, OS + browser + version, date tested, and PASS/FAIL for each of steps 2-6.

### Evidence table (fill in when performed)

| Device | OS / Browser | Date | Cache-miss playback | Replay | Cache-hit playback | Recording unaffected | Failure does not block completion | Result |
|--------|--------------|------|----------------------|--------|----------------------|------------------------|-------------------------------------|--------|
| _(not yet tested)_ | | | | | | | | **PENDING** |

**If no low-end device is available:** this section remains `human_needed` for VOICE-04, and Phase 8 is NOT represented as fully verified. The automated evidence above proves the code path is correct (standard `<audio>` element, no microphone permission requested, error-state text-only degrade, cache-hit provider-call-count proof) but does not substitute for real low-end-device confirmation.

## Overall Phase 8 Verification Status

- **Automated:** PASS (VOICE-01, VOICE-02, VOICE-03 fully proven by automated tests; VOICE-04's automated/source-level portion also passes).
- **Manual:** PENDING (VOICE-04 real-device UAT not yet performed — human_needed).
- **Phase 8 is NOT represented as fully verified** until the Manual UAT section above is completed with a PASS result, or an explicit risk-acceptance decision is recorded in its place.
