---
phase: 05
slug: voice-capture-and-evidence-storage
status: pending-manual-uat
created: 2026-06-27
last_updated: 2026-06-27
---

# Phase 05 UAT: Voice Capture And Evidence Storage

This checklist is the blocking manual gate for Phase 05 closeout. Do not mark
Phase 05 complete until every required row is `Pass` or explicitly
`Risk accepted` with owner, rationale, and follow-up.

## Test Environment

| Field | Value |
|-------|-------|
| App URL | Pending: HTTPS deployment URL or localhost URL reachable by real devices |
| Test assignment/student | Pending |
| Teacher account | Pending |
| Tester | Pending |
| Test date | Pending |

## Required Manual Checks

| ID | Requirement | Device / Browser | Steps | Expected Result | Status | Tester / Date | Owner | Follow-up / Notes |
|----|-------------|------------------|-------|-----------------|--------|---------------|-------|-------------------|
| UAT-05-01 | iOS Safari microphone prompt and original answer recording | iPhone, iOS Safari version pending | Open assigned mission over HTTPS or localhost. Start original answer recording, allow microphone prompt, stop recording. | Permission prompt appears; recording starts/stops; "Saving your voice..." and "Listening to your answer..." states are understandable; original transcript appears before progression. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-02 | iOS Safari repeat recording | iPhone, iOS Safari version pending | Continue to improved sentence. Record repeat attempt, stop recording, wait for transcript. | Repeat transcript appears; flow continues only after repeat transcript is available; active recorder stays visible on 375px viewport. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-03 | iOS Safari retry states | iPhone, iOS Safari version pending | Deny microphone once or force upload/transcription failure if available, then retry. | Denied/failed state uses child-friendly copy and allows retry without technical error strings. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-04 | Android Chrome microphone prompt and original answer recording | Android phone, Chrome version pending | Open assigned mission over HTTPS or localhost. Start original answer recording, allow microphone prompt, stop recording. | Permission prompt appears; recording starts/stops; "Saving your voice..." and "Listening to your answer..." states are understandable; original transcript appears before progression. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-05 | Android Chrome repeat recording | Android phone, Chrome version pending | Continue to improved sentence. Record repeat attempt, stop recording, wait for transcript. | Repeat transcript appears; flow continues only after repeat transcript is available; active recorder stays visible on 375px viewport. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-06 | Android Chrome retry states | Android phone, Chrome version pending | Deny microphone once or force upload/transcription failure if available, then retry. | Denied/failed state uses child-friendly copy and allows retry without technical error strings. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-07 | Upload/transcription failure state | Real device or controlled failure path | Force a failed upload or failed transcription response during original or repeat recording. | Student stays on the recorder; copy says "We could not save that recording. Try again." or "We could not hear that clearly. Record again."; no fake transcript is shown. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-08 | Teacher transcript-first evidence page | Desktop or mobile browser with teacher login | Open `/teacher/evidence/[attemptId]` for the tested attempt. | Student name, mission title, attempt status/submitted time, and transcripts are visible before any native audio controls. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |
| UAT-05-09 | Teacher on-demand audio playback and no autoplay | Desktop or mobile browser with teacher login | On the teacher evidence page, confirm no `<audio controls>` is visible initially. Click "Load audio" for original and repeat clips. | "Preparing audio..." appears while loading; native audio controls appear only after click; audio does not autoplay; object keys are not displayed. | Pending | Pending | Product/QA | Required before Phase 05 closeout. |

## Risk Acceptance

No risks have been accepted. All rows are pending real-device/manual execution.

## Automated Evidence Already Available

| Check | Command | Status |
|-------|---------|--------|
| Teacher evidence service | `npx vitest run tests/server/audio-evidence.test.ts` | Pass in executor environment |
| Teacher evidence source/browser contract | `npx playwright test tests/e2e/teacher-audio-evidence.spec.ts` | Pass in executor environment |
| TypeScript compile | `npx tsc --noEmit` | Pass in executor environment |

## Closeout Rule

Phase 05 remains blocked until this checklist is updated with real device,
browser version, tester, date, pass/fail status, and notes for every required
manual row.
