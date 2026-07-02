---
phase: 08
slug: coco-voice-tts
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-01
updated: 2026-07-02
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.6, Playwright 1.61.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/server/tts-generator.test.ts tests/server/tts-cache.test.ts tests/domain/tts.test.ts tests/domain/tts-ui-source.test.ts` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test && npm run test:e2e` |
| **Estimated runtime** | Quick: under 30s after Wave 0; full: several minutes plus manual UAT |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/server/tts-generator.test.ts tests/server/tts-cache.test.ts tests/domain/tts.test.ts tests/domain/tts-ui-source.test.ts` once Wave 0 creates those files.
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm test`.
- **Before `$gsd-verify-work`:** Run full suite plus `npm run test:e2e`, then record manual device evidence for VOICE-04 or explicit risk acceptance if the requested Chromebook/older-tablet hardware is unavailable.
- **Max feedback latency:** Automated quick feedback should stay under 30 seconds once Wave 0 exists; manual UAT is intentionally outside this latency target.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-W0-01 | 01/03 | 0 | VOICE-01 | T-08-01 | OpenAI TTS stays server-only; missing key/provider failures are handled without paid calls in tests. | unit | `npx vitest run tests/server/tts-generator.test.ts` | yes | green |
| 08-W0-02 | 01/04/05 | 0 | VOICE-02 | T-08-02 | Inline replay button is accessible and does not expose provider internals. | unit/static | `npx vitest run tests/domain/tts.test.ts tests/domain/tts-ui-source.test.ts` | yes | green |
| 08-W0-03 | 01/03 | 0 | VOICE-03 | T-08-03 | Server computes canonical cache key; second identical request is a cache hit with no provider call. | unit/integration | `npx vitest run tests/server/tts-cache.test.ts` | yes | green |
| 08-W0-04 | 01/04/05 | 0 | VOICE-04 | T-08-04 | Playback uses standard `<audio>` and degrades to text-only if voice fails. | static + browser + manual UAT | `npx vitest run tests/domain/tts-ui-source.test.ts && npx playwright test tests/e2e/student-coco-voice.spec.ts` plus real device script | yes | green (automated); manual smoke pass on Samsung S23 + Mac; Chromebook/older-tablet risk accepted — see 08-VERIFICATION.md |

*Status values: pending, green, red, flaky*

---

## Wave 0 Requirements

- [x] `tests/domain/tts.test.ts` — canonical hash inputs, voiced-line eligibility rules, no student transcript voicing.
- [x] `tests/domain/tts-ui-source.test.ts` — inline replay UI source contracts, no OpenAI client import in student client modules, standard `<audio>` usage, no transcript descriptors.
- [x] `tests/server/tts-generator.test.ts` — fake OpenAI speech client, missing key branch, provider failure branch, response format/model assertions.
- [x] `tests/server/tts-cache.test.ts` — cache miss/upload/insert path, cache hit/no provider call path, duplicate/concurrency-safe behavior.
- [x] `tests/e2e/student-coco-voice.spec.ts` — browser-required autoplay/audio fallback behavior only; static/source assertions belong in Vitest.
- [x] Manual UAT checklist in the final verification artifact for Chromebook or older tablet playback. Checklist exists in `08-VERIFICATION.md`; available-device smoke test passed on Samsung S23 + Mac, and missing Chromebook/older-tablet coverage is explicitly risk-accepted.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Low-end school device playback | VOICE-04 | The phase success criterion asked for a real Chromebook or older tablet; local automation cannot prove device audio behavior. | Original Chromebook/older-tablet test remains unperformed because hardware was unavailable. Product owner smoke-tested the deployed preview on Samsung S23 and Mac on 2026-07-02 and accepted the residual older-device risk for Phase 8 closeout. |
| Local Node engine parity | VOICE-01..VOICE-04 | Research found local Node `v20.12.0`, while `package.json` requires `>=20.19.0`; final verification must use a compliant runtime. | Before final verification, run `node -v` and confirm `v20.19.0` or newer, or run final automated checks in a compliant environment. |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing test references.
- [x] No watch-mode flags in verification commands.
- [x] Automated quick feedback latency remains under 30 seconds after Wave 0 (`tests/domain/tts-ui-source.test.ts` etc. complete in well under 1s; full suite in ~2s).
- [x] Real-device playback evidence is recorded before phase closeout. **Samsung S23 + Mac smoke tests passed; Chromebook/older-tablet coverage unavailable and risk-accepted, see `08-VERIFICATION.md`.**
- [x] `nyquist_compliant: true` set in frontmatter after Wave 0 and sampling map are satisfied.

**Approval:** automated checks approved 2026-07-02; Phase 8 closed 2026-07-02 with Samsung S23 + Mac smoke-test evidence and explicit risk acceptance for missing Chromebook/older-tablet coverage (see `08-VERIFICATION.md`).
