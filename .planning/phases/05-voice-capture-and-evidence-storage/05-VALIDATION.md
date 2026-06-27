---
phase: 5
slug: voice-capture-and-evidence-storage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 5 - Validation Strategy

> Per-phase validation contract for voice capture, storage, transcription, and playback.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x + Playwright 1.49.x |
| Config files | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npx vitest run tests/domain/audio-recorder.test.ts tests/server/audio-upload.test.ts tests/server/transcription.test.ts tests/server/audio-evidence.test.ts` |
| Full suite command | `npx vitest run && npx playwright test` |
| Manual gate | Real-device microphone verification on iOS Safari and Android Chrome |

## Sampling Rate

- After every task commit: run the relevant Vitest file for that task.
- After every plan wave: run `npx vitest run`.
- Before verification: run `npx vitest run && npx playwright test`.
- Before marking Phase 5 complete: finish manual mobile device checks.

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| FLOW-03 | Student answers and repeats by voice | component/e2e/manual | `npx playwright test tests/e2e/student-audio.spec.ts` | W0 | pending |
| AUDIO-01 | Original answer clip is recorded/uploaded | unit + server | `npx vitest run tests/domain/audio-recorder.test.ts tests/server/audio-upload.test.ts` | W0 | pending |
| AUDIO-02 | Repeat attempt clip is recorded/uploaded | unit + server | `npx vitest run tests/server/audio-upload.test.ts` | W0 | pending |
| AUDIO-03 | Permission/upload failure states are understandable | e2e/manual | `npx playwright test tests/e2e/student-audio.spec.ts` | W0 | pending |
| AUDIO-04 | Clips are transcribed through a stubbed server adapter | unit | `npx vitest run tests/server/transcription.test.ts` | W0 | pending |
| AUDIO-05 | Transcript, object key, metadata, and processing status are stored | server | `npx vitest run tests/server/audio-upload.test.ts` | W0 | pending |
| REV-05 | Teacher can play clips on demand | server + e2e | `npx vitest run tests/server/audio-evidence.test.ts` | W0 | pending |
| PILOT-02 | Mic permission and recording failure handling works on target devices | manual | UAT checklist in `05-UAT.md` | manual | pending |

## Wave 0 Requirements

- [ ] `tests/domain/audio-recorder.test.ts` - MIME candidate selection, unsupported browser detection, duration cap helpers.
- [ ] `tests/server/audio-upload.test.ts` - upload route/service ownership gates, metadata persistence, processing status transitions.
- [ ] `tests/server/transcription.test.ts` - OpenAI adapter wrapper with stubbed client, success/failure mapping.
- [ ] `tests/server/audio-evidence.test.ts` - teacher ownership gate and signed URL generation.
- [ ] `tests/e2e/student-audio.spec.ts` - Playwright fake media happy path and failure-state assertions.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safari mic prompt and recording | PILOT-02, FLOW-03 | Headless tests cannot prove real iOS permission and recording behavior | On HTTPS or localhost, open a mission on iPhone Safari, record original and repeat clips, verify upload/transcription states and retry copy. |
| Android Chrome mic prompt and recording | PILOT-02, FLOW-03 | Headless tests cannot prove real Android device behavior | On HTTPS or localhost, repeat the full mission voice flow on Android Chrome. |
| MIME/browser fallback | AUDIO-01, AUDIO-02 | Browser-specific `MediaRecorder.isTypeSupported` behavior varies | Confirm recording works and stored MIME type matches the actual browser output. |
| Teacher playback no autoplay | REV-05 | Browser media policy and UX need visual confirmation | Open teacher evidence page, verify transcripts show first and audio controls appear only after "Load audio". |

## Validation Sign-Off

- [ ] All plans have automated checks or documented manual-only checks.
- [ ] Storage bucket/migration plan includes a blocking schema push.
- [ ] Transcription tests stub external OpenAI calls.
- [ ] No watch-mode commands.
- [ ] Manual mobile device verification completed before Phase 5 closeout.
- [ ] `nyquist_compliant: true` set after Wave 0 tests exist and pass.
