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
| UAT-05-06 | Android Chrome retry states | Android phone, Chrome version not recorded | Deny microphone once or force upload/transcription failure if available, then retry. | Denied/failed state uses child-friendly copy and allows retry without technical error strings. | Pass with issue | John / 2026-06-27 | Product/QA | Retry behavior works, but microphone-denied copy is too technical for kids. Tracked as cosmetic gap below. |
| UAT-05-07 | Upload/transcription failure state | Android Chrome or controlled failure path | Force a failed upload or failed transcription response during original or repeat recording. | Student stays on the recorder; copy says "We could not save that recording. Try again." or "We could not hear that clearly. Record again."; no fake transcript is shown. | Pass | John / 2026-06-27 | Product/QA | Android Chrome failure/retry flow passed. |
| UAT-05-08 | Teacher transcript-first evidence page | Desktop browser with teacher login | Open `/teacher/evidence/[attemptId]` for the tested attempt. | Student name, mission title, attempt status/submitted time, and transcripts are visible before any native audio controls. | Issue | John / 2026-06-27 | Product/QA | Direct route exists, but no teacher UI links to it. Teachers cannot discover evidence pages. Major gap below. |
| UAT-05-09 | Teacher on-demand audio playback and no autoplay | Desktop browser with teacher login | On the teacher evidence page, confirm no `<audio controls>` is visible initially. Click "Load audio" for original and repeat clips. | "Preparing audio..." appears while loading; native audio controls appear only after click; audio does not autoplay; object keys are not displayed. | Pending | John / 2026-06-27 | Product/QA | Blocked behind teacher evidence discoverability gap; verify again after navigation link is added. |

## Summary

total: 9
passed: 4
issues: 2
pending: 1
deferred: 3
blocked: 1

## Risk Acceptance

No risks have been accepted.

- iOS Safari checks are deferred because an iPhone was not available.
- The teacher evidence navigation gap is not risk-accepted; it blocks Phase 05 closeout because teachers cannot find the evidence page from the product UI.

## Observations

- Android Chrome passed 4/4 tested student voice checks: recording, transcription, retry/failure behavior, and flow progression.
- The app accepting any spoken language is expected in Phase 05. Language validation belongs to Phase 06 AI evaluation and is not a Phase 05 defect.

## Gaps

- truth: "Teachers can discover and open attempt evidence from the teacher UI"
  status: failed
  reason: "User reported that `/teacher/evidence/[attemptId]` exists, but there is no navigation or link from the teacher UI. Teachers cannot find evidence pages without manually knowing an attempt URL."
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
    - "Add a teacher-owned attempt/evidence entry point from an existing teacher page where submitted homework is already contextual."
    - "Show transcript/evidence links only for attempts that exist and belong to the teacher's classes."
    - "Use clear link text such as `Review evidence` or `View speaking evidence`; do not expose raw attempt ids as the teacher-facing affordance."
    - "Add coverage that a teacher can navigate from the teacher UI to `/teacher/evidence/[attemptId]` without manually typing the URL."

- truth: "Microphone-denied and retry copy is child-friendly"
  status: failed
  reason: "User reported that microphone-denied copy is too technical for kids. Retry behavior works, but the wording needs to be simpler."
  severity: cosmetic
  test: UAT-05-06
  artifacts:
    - path: "src/components/student/VoiceRecorderControl.tsx"
      issue: "Permission-denied state copy should be simplified for elementary ESL students."
  fix_plan:
    - "Replace technical microphone-denied copy with short child-friendly wording."
    - "Keep actionable retry guidance for students and teachers without mentioning browser internals."

## Automated Evidence Already Available

| Check | Command | Status |
|-------|---------|--------|
| Teacher evidence service | `npx vitest run tests/server/audio-evidence.test.ts` | Pass in executor environment |
| Teacher evidence source/browser contract | `npx playwright test tests/e2e/teacher-audio-evidence.spec.ts` | Pass in executor environment |
| TypeScript compile | `npx tsc --noEmit` | Pass in executor environment |

## Closeout Rule

Phase 05 remains blocked until:

- the teacher evidence navigation gap is fixed and re-tested,
- iOS Safari checks are passed or explicitly risk-accepted,
- the microphone-denied copy issue is fixed or explicitly accepted as cosmetic,
- every required manual row has device/browser version, tester, date, status, and notes.
