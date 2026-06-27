---
phase: 05
slug: voice-capture-and-evidence-storage
status: blocked
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
| App URL | ngrok HTTPS tunnel to localhost:3000 |
| Test assignment/student | Test mission "Say hello in English" assigned to student on Android |
| Teacher account | Test teacher account on Mac |
| Tester | John (user) |
| Test date | 2026-06-27 |

## Required Manual Checks

| ID | Requirement | Device / Browser | Steps | Expected Result | Status | Tester / Date | Owner | Follow-up / Notes |
|----|-------------|------------------|-------|-----------------|--------|---------------|-------|-------------------|
| UAT-05-01 | iOS Safari microphone prompt and original answer recording | iPhone, iOS Safari version pending | Open assigned mission over HTTPS or localhost. Start original answer recording, allow microphone prompt, stop recording. | Permission prompt appears; recording starts/stops; "Saving your voice..." and "Listening to your answer..." states are understandable; original transcript appears before progression. | Deferred | John / 2026-06-27 | Product/QA | iPhone not available. Must test before closeout or explicitly risk-accept. |
| UAT-05-02 | iOS Safari repeat recording | iPhone, iOS Safari version pending | Continue to improved sentence. Record repeat attempt, stop recording, wait for transcript. | Repeat transcript appears; flow continues only after repeat transcript is available; active recorder stays visible on 375px viewport. | Deferred | John / 2026-06-27 | Product/QA | iPhone not available. Must test before closeout or explicitly risk-accept. |
| UAT-05-03 | iOS Safari retry states | iPhone, iOS Safari version pending | Deny microphone once or force upload/transcription failure if available, then retry. | Denied/failed state uses child-friendly copy and allows retry without technical error strings. | Deferred | John / 2026-06-27 | Product/QA | iPhone not available. Must test before closeout or explicitly risk-accept. |
| UAT-05-04 | Android Chrome microphone prompt and original answer recording | Android phone, Chrome version not recorded | Open assigned mission over HTTPS or localhost. Start original answer recording, allow microphone prompt, stop recording. | Permission prompt appears; recording starts/stops; "Saving your voice..." and "Listening to your answer..." states are understandable; original transcript appears before progression. | Pass | John / 2026-06-27 | Product/QA | Android Chrome recording and transcription passed. |
| UAT-05-05 | Android Chrome repeat recording | Android phone, Chrome version not recorded | Continue to improved sentence. Record repeat attempt, stop recording, wait for transcript. | Repeat transcript appears; flow continues only after repeat transcript is available; active recorder stays visible on 375px viewport. | Pass | John / 2026-06-27 | Product/QA | Android Chrome repeat recording, transcription, and flow progression passed. |
| UAT-05-06 | Android Chrome retry states | Android phone, Chrome version not recorded | Deny microphone once or force upload/transcription failure if available, then retry. | Denied/failed state uses child-friendly copy and allows retry without technical error strings. | Pass | John + executor / 2026-06-27 | Product/QA | Retry behavior passed on Android Chrome. Gap closure changed denied copy to "Ask a grown-up to turn on the mic, then record again." and verified with `npx tsc --noEmit` plus source scan. |
| UAT-05-07 | Upload/transcription failure state | Android Chrome or controlled failure path | Force a failed upload or failed transcription response during original or repeat recording. | Student stays on the recorder; copy says "We could not save that recording. Try again." or "We could not hear that clearly. Record again."; no fake transcript is shown. | Pass | John / 2026-06-27 | Product/QA | Android Chrome failure/retry flow passed. |
| UAT-05-08 | Teacher transcript-first evidence page | Desktop browser with teacher login | Open `/teacher/evidence/[attemptId]` for the tested attempt from the teacher class UI. | Student name, mission title, attempt status/submitted time, and transcripts are visible before any native audio controls. | Pass | John + executor / 2026-06-27 | Product/QA | Gap closure added `Review evidence` links on teacher-owned class pages and verified navigation with `npx playwright test tests/e2e/teacher-audio-evidence.spec.ts`. Transcript-first source assertions still pass. |
| UAT-05-09 | Teacher on-demand audio playback and no autoplay | Desktop browser with teacher login | On the teacher evidence page, confirm no `<audio controls>` is visible initially. Click "Load audio" for original and repeat clips. | "Preparing audio..." appears while loading; native audio controls appear only after click; audio does not autoplay; object keys are not displayed. | Pending | John / 2026-06-27 | Product/QA | No longer blocked by discoverability. Automated Playwright no-autoplay/on-demand coverage passes; keep pending until a logged-in desktop playback check is completed or explicitly risk-accepted. |

## Summary

total: 9
passed: 6
issues: 0
pending: 1
deferred: 3
blocked: 1

## Risk Acceptance

No risks have been accepted.

- iOS Safari checks are deferred because an iPhone was not available.
- The teacher evidence navigation gap was fixed in gap closure plan 05-05, but Phase 05 closeout still blocks on the deferred iOS Safari rows and the remaining logged-in desktop playback check.

## Observations

- Android Chrome passed 4/4 tested student voice checks: recording, transcription, retry/failure behavior, and flow progression.
- The app accepting any spoken language is expected in Phase 05. Language validation belongs to Phase 06 AI evaluation and is not a Phase 05 defect.

## Gaps

- truth: "Teachers can discover and open attempt evidence from the teacher UI"
  status: fixed
  reason: "Teacher-owned class pages now show `Review evidence` links for assignment-student rows with a latest attempt id. Playwright coverage clicks the teacher UI link and observes a request to `/teacher/evidence/[attemptId]`."
  severity: major
  test: UAT-05-08
  root_cause: "Phase 05 added the evidence route and playback service, but did not add an entry point from an existing teacher workflow such as mission detail, assignment/class review, or a submitted-attempt list."
  artifacts:
    - path: "src/app/teacher/evidence/[attemptId]/page.tsx"
      issue: "Route exists but is unreachable from teacher navigation."
    - path: "src/app/teacher/missions/[id]/page.tsx"
      issue: "Likely teacher-facing location to surface submitted attempt evidence links, pending implementation review."
    - path: "src/app/teacher/classes/[id]/page.tsx"
      issue: "Alternative teacher-facing location to surface per-student assignment/attempt evidence links, pending implementation review."
  fix_plan:
    - "Done in 05-05: class pages list submitted speaking evidence for the owned class."
    - "Done in 05-05: links show only when `latest_attempt_id` exists and use `Review evidence` as the affordance."
    - "Done in 05-05: Playwright covers clicking a teacher UI evidence link without manually typing the URL."

- truth: "Microphone-denied and retry copy is child-friendly"
  status: fixed
  reason: "Microphone-denied copy now says `Ask a grown-up to turn on the mic, then record again.`"
  severity: cosmetic
  test: UAT-05-06
  artifacts:
    - path: "src/components/student/VoiceRecorderControl.tsx"
      issue: "Permission-denied state copy should be simplified for elementary ESL students."
  fix_plan:
    - "Done in 05-05: replaced technical permission-blocked copy with short child-friendly wording."
    - "Done in 05-05: verified the denied copy does not contain browser-internal wording."

## Automated Evidence Already Available

| Check | Command | Status |
|-------|---------|--------|
| Teacher evidence service | `npx vitest run tests/server/audio-evidence.test.ts` | Pass in executor environment |
| Teacher evidence source/browser contract | `npx playwright test tests/e2e/teacher-audio-evidence.spec.ts` | Pass in 05-05 executor environment; includes teacher UI navigation click coverage |
| TypeScript compile | `npx tsc --noEmit` | Pass in executor environment |

## Closeout Rule

Phase 05 remains blocked until:

- iOS Safari checks are passed or explicitly risk-accepted,
- logged-in desktop teacher playback is checked manually or explicitly risk-accepted,
- every required manual row has device/browser version, tester, date, status, and notes.
