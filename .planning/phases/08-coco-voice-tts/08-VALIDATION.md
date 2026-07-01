---
phase: 08
slug: coco-voice-tts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.6, Playwright 1.61.1 |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/server/tts-generator.test.ts tests/server/tts-cache.test.ts tests/domain/tts.test.ts` |
| **Full suite command** | `npm run typecheck && npm run lint && npm test && npm run test:e2e` |
| **Estimated runtime** | Quick: under 30s after Wave 0; full: several minutes plus manual UAT |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/server/tts-generator.test.ts tests/server/tts-cache.test.ts tests/domain/tts.test.ts` once Wave 0 creates those files.
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm test`.
- **Before `$gsd-verify-work`:** Run full suite plus `npm run test:e2e`, then complete real low-end-device UAT for VOICE-04.
- **Max feedback latency:** Automated quick feedback should stay under 30 seconds once Wave 0 exists; manual UAT is intentionally outside this latency target.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-W0-01 | TBD | 0 | VOICE-01 | T-08-01 | OpenAI TTS stays server-only; missing key/provider failures are handled without paid calls in tests. | unit | `npx vitest run tests/server/tts-generator.test.ts` | no W0 | pending |
| 08-W0-02 | TBD | 0 | VOICE-02 | T-08-02 | Inline replay button is accessible and does not expose provider internals. | unit/static/e2e | `npx vitest run tests/domain/tts.test.ts && npx playwright test tests/e2e/student-coco-voice.spec.ts` | no W0 | pending |
| 08-W0-03 | TBD | 0 | VOICE-03 | T-08-03 | Server computes canonical cache key; second identical request is a cache hit with no provider call. | unit/integration | `npx vitest run tests/server/tts-cache.test.ts` | no W0 | pending |
| 08-W0-04 | TBD | 0 | VOICE-04 | T-08-04 | Playback uses standard `<audio>` and degrades to text-only if voice fails. | static + manual UAT | `npx playwright test tests/e2e/student-coco-voice.spec.ts` plus real device script | no W0 | pending |

*Status values: pending, green, red, flaky*

---

## Wave 0 Requirements

- [ ] `tests/domain/tts.test.ts` — canonical hash inputs, voiced-line eligibility rules, no student transcript voicing.
- [ ] `tests/server/tts-generator.test.ts` — fake OpenAI speech client, missing key branch, provider failure branch, response format/model assertions.
- [ ] `tests/server/tts-cache.test.ts` — cache miss/upload/insert path, cache hit/no provider call path, duplicate/concurrency-safe behavior.
- [ ] `tests/e2e/student-coco-voice.spec.ts` — inline replay UI, no OpenAI client import in student client modules, standard `<audio>` usage, autoplay fallback behavior.
- [ ] Manual UAT checklist in the final verification artifact for Chromebook or older tablet playback.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Low-end school device playback | VOICE-04 | The phase success criterion requires a real Chromebook or older tablet; local automation cannot prove device audio behavior. | On a real Chromebook or older tablet, complete a student mission with cached and cache-miss Coco lines. Confirm text appears immediately, voice plays through standard audio, replay works, recording remains available, and audio failure does not block completion. |
| Local Node engine parity | VOICE-01..VOICE-04 | Research found local Node `v20.12.0`, while `package.json` requires `>=20.19.0`; final verification must use a compliant runtime. | Before final verification, run `node -v` and confirm `v20.19.0` or newer, or run final automated checks in a compliant environment. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify commands or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all missing test references.
- [ ] No watch-mode flags in verification commands.
- [ ] Automated quick feedback latency remains under 30 seconds after Wave 0.
- [ ] Real low-end-device UAT is completed before phase verification.
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 and sampling map are satisfied.

**Approval:** pending
