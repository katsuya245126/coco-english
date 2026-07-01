---
phase: 5
slug: voice-capture-and-evidence-storage
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-27
validated: 2026-07-01
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
| FLOW-03 | Student answers and repeats by voice | component/e2e/manual | `npx playwright test tests/e2e/student-audio.spec.ts` | ✓ | covered (+ manual) |
| AUDIO-01 | Original answer clip is recorded/uploaded | unit + server | `npx vitest run tests/domain/audio-recorder.test.ts tests/server/audio-upload.test.ts` | ✓ | covered |
| AUDIO-02 | Repeat attempt clip is recorded/uploaded | unit + server | `npx vitest run tests/server/audio-upload.test.ts` | ✓ | covered |
| AUDIO-03 | Permission/upload failure states are understandable | e2e/manual | `npx playwright test tests/e2e/student-audio.spec.ts` | ✓ | covered (+ manual) |
| AUDIO-04 | Clips are transcribed through a stubbed server adapter | unit | `npx vitest run tests/server/transcription.test.ts` | ✓ | covered |
| AUDIO-05 | Transcript, object key, metadata, and processing status are stored | server | `npx vitest run tests/server/audio-upload.test.ts` | ✓ | covered |
| REV-05 | Teacher can play clips on demand | server + e2e | `npx vitest run tests/server/audio-evidence.test.ts` | ✓ | covered |
| PILOT-02 | Mic permission and recording failure handling works on target devices | manual | UAT checklist in `05-UAT.md` | manual | manual-only |

## Wave 0 Requirements

- [x] `tests/domain/audio-recorder.test.ts` - MIME candidate selection, unsupported browser detection, duration cap helpers. (4 tests green)
- [x] `tests/server/audio-upload.test.ts` - upload route/service ownership gates, metadata persistence, processing status transitions. (13 tests green)
- [x] `tests/server/transcription.test.ts` - OpenAI adapter wrapper with stubbed client, success/failure mapping. (5 tests green)
- [x] `tests/server/audio-evidence.test.ts` - teacher ownership gate and signed URL generation. (4 tests green)
- [x] `tests/e2e/student-audio.spec.ts` - Playwright fake media happy path and failure-state assertions. (present; also `tests/e2e/teacher-audio-evidence.spec.ts`)

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safari mic prompt and recording | PILOT-02, FLOW-03 | Headless tests cannot prove real iOS permission and recording behavior | On HTTPS or localhost, open a mission on iPhone Safari, record original and repeat clips, verify upload/transcription states and retry copy. |
| Android Chrome mic prompt and recording | PILOT-02, FLOW-03 | Headless tests cannot prove real Android device behavior | On HTTPS or localhost, repeat the full mission voice flow on Android Chrome. |
| MIME/browser fallback | AUDIO-01, AUDIO-02 | Browser-specific `MediaRecorder.isTypeSupported` behavior varies | Confirm recording works and stored MIME type matches the actual browser output. |
| Teacher playback no autoplay | REV-05 | Browser media policy and UX need visual confirmation | Open teacher evidence page, verify transcripts show first and audio controls appear only after "Load audio". |

## Validation Sign-Off

- [x] All plans have automated checks or documented manual-only checks.
- [x] Storage bucket/migration plan includes a blocking schema push. (`202606270001_student_audio_storage.sql` pushed; `storage.buckets` public=false verified)
- [x] Transcription tests stub external OpenAI calls. (injectable client, no network in `transcription.test.ts`)
- [x] No watch-mode commands.
- [ ] Manual mobile device verification completed before Phase 5 closeout. (9 UAT rows in `05-UAT.md` remain Pending — separate closeout gate, not a Nyquist gap.)
- [x] `nyquist_compliant: true` set after Wave 0 tests exist and pass.

## Validation Audit 2026-07-01

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

State-A audit: all 6 Wave-0 test files exist; `npx vitest run` quick-run command passed **26/26** green (audio-recorder 4, audio-upload 13, transcription 5, audio-evidence 4). Every requirement carrying an automated command is COVERED. No tests were generated — VALIDATION.md statuses had never been reconciled from the initial `pending` draft. PILOT-02 remains legitimately manual-only. Phase 5 is Nyquist-compliant; the real-device UAT closeout gate is tracked independently in [[coco-english-phase5-state]] / `05-UAT.md`.
