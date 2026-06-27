---
phase: 05-voice-capture-and-evidence-storage
plan: 03
subsystem: audio
tags: [openai, transcription, student-flow, audio-evidence, playwright, vitest]
requires:
  - phase: 05-voice-capture-and-evidence-storage
    provides: private student audio storage and upload metadata from 05-02
provides:
  - server-only OpenAI transcription adapter with injectable tests
  - upload processing that writes transcript fields only after transcription success
  - student mission flow gating on returned transcripts before progression and completion
affects: [phase-05, phase-06-ai-evaluation, teacher-review, audio-evidence]
tech-stack:
  added: [openai]
  patterns:
    - server-only adapter with injectable external API client
    - retryable failed transcription status without fabricated transcript evidence
key-files:
  created:
    - src/server/audio/transcription.ts
    - tests/server/transcription.test.ts
  modified:
    - package.json
    - package-lock.json
    - .env.example
    - src/server/student-access/audio-upload.ts
    - src/app/student/missions/[assignmentStudentId]/audio/route.ts
    - src/components/student/MissionFlowShell.tsx
    - src/components/student/VoiceRecorderControl.tsx
    - tests/server/audio-upload.test.ts
    - tests/e2e/student-audio.spec.ts
key-decisions:
  - "05-03: OpenAI transcription is isolated in src/server/audio/transcription.ts and tests inject fake clients; no automated test calls the paid API."
  - "05-03: Uploaded clips only return success after a transcript is present and audio_clips.processing_status is transcribed."
  - "05-03: Failed or empty transcription marks audio_clips.processing_status as failed and keeps students on the same recorder with retry copy."
patterns-established:
  - "External transcription adapters accept dependency injection for test stubs and API-key failure paths."
  - "Student mission progression consumes returned transcript text rather than assuming an uploaded clip is sufficient evidence."
requirements-completed: [FLOW-03, AUDIO-04, AUDIO-05, AUDIO-03]
duration: 11min
completed: 2026-06-27
status: complete
---

# Phase 05 Plan 03: Transcription Pipeline Summary

**OpenAI-backed server transcription with stubbed tests, transcript-only progression, and retryable failed-audio evidence handling**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-27T06:47:47Z
- **Completed:** 2026-06-27T06:58:15Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added the official `openai` dependency and server-only transcription env examples.
- Created `transcribeAudioFile` with injectable client support covering success, missing key, empty transcript, and provider failure without network calls.
- Extended audio upload processing to transcribe clips, write `original_transcript` or `repeat_transcript`, set `repeat_accepted` for repeats, and mark processing as `transcribed` only after success.
- Preserved evidence integrity by marking transcription failures as `failed` and returning retryable student flow errors without writing transcript fields.
- Updated the student flow to require returned transcripts before moving from answer to repeat, from repeat to transition, and into mission completion.

## Task Commits

1. **Task 1 RED: Server-only transcription adapter tests** - `7ae3b123` (`test`)
2. **Task 1 GREEN: Server-only transcription adapter with stubs** - `9db5c5ec` (`feat`)
3. **Task 2: Transcribe upload results and write attempt_turn transcript fields** - `45d85a25` (`feat`)
4. **Task 3: Student flow waits for transcript before progression** - `f1280acc` (`feat`)

## Files Created/Modified

- `package.json` / `package-lock.json` - Adds the official `openai` package installed after the human-action checkpoint.
- `.env.example` - Documents `OPENAI_API_KEY` and `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`.
- `src/server/audio/transcription.ts` - Server-side transcription adapter with dependency injection and normalized failure results.
- `src/server/student-access/audio-upload.ts` - Upload service now transcribes stored clips, writes transcript fields, and updates processing status.
- `src/app/student/missions/[assignmentStudentId]/audio/route.ts` - Returns transcript text on success and preserves retryable transcription failure errors for the client.
- `src/components/student/MissionFlowShell.tsx` - Requires returned transcript text before progressing and calls `completeMissionAction` only after repeat transcript success.
- `src/components/student/VoiceRecorderControl.tsx` - Shows transcription-pending and retry copy in the recorder state.
- `tests/server/transcription.test.ts` - Stubbed adapter tests with no network calls.
- `tests/server/audio-upload.test.ts` - Upload/transcription persistence tests for original, repeat, and failure paths.
- `tests/e2e/student-audio.spec.ts` - Structural Playwright checks for transcript-gated UI flow and route response behavior.

## Decisions Made

- OpenAI API access stays isolated to `src/server/audio/transcription.ts`; upload and UI tests use fake clients or source checks.
- The route returns transcript text as part of the audio upload response so the client can gate progression on actual evidence.
- The final repeat path invokes `completeMissionAction` only after the server returns a repeat transcript.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Passed transcript/error details through the upload route**
- **Found during:** Task 3 (Student flow waits for transcript before progression)
- **Issue:** The plan listed UI files for Task 3, but the existing route response only returned audio clip metadata. The client could not gate progression on transcript text or show transcription-specific retry copy without route passthrough.
- **Fix:** Added `transcript: result.transcript` to the success response and preserved `transcription_failed_retryable` errors.
- **Files modified:** `src/app/student/missions/[assignmentStudentId]/audio/route.ts`
- **Verification:** `npx playwright test tests/e2e/student-audio.spec.ts`
- **Committed in:** `f1280acc`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for the planned transcript-gated UI behavior. No scope expansion beyond the upload response contract.

## Issues Encountered

- The previous executor stopped at a human-action checkpoint because installing `openai` required network access. The orchestrator completed `npm install openai`; the package files were included in Task 1 GREEN commit `9db5c5ec`.
- The first sandboxed Playwright run could not bind the local web server (`listen EPERM 0.0.0.0:3000`). The same command passed with approved escalation.

## Verification

- `npx vitest run tests/server/transcription.test.ts` - passed
- `npx vitest run tests/server/audio-upload.test.ts tests/server/transcription.test.ts` - passed
- `npx playwright test tests/e2e/student-audio.spec.ts` - passed with local-server escalation
- `npx tsc --noEmit` - passed
- `npx vitest run tests/server/transcription.test.ts tests/server/audio-upload.test.ts` - passed

## Known Stubs

None. The existing `placeholder-v1` evaluation remains the intentional Phase 4/6 swap marker and does not fabricate transcripts.

## Threat Flags

None. The new OpenAI API boundary and transcript storage boundary were already covered by the plan threat model; mitigations were implemented.

## Authentication Gates

None during execution. The prior package-install checkpoint was resolved before this continuation began.

## User Setup Required

Before real transcription outside tests, set `OPENAI_API_KEY` in the server environment. `OPENAI_TRANSCRIPTION_MODEL` defaults to `gpt-4o-mini-transcribe` via `.env.example`.

## Next Phase Readiness

Plan 05-04 can build teacher playback on top of private audio object keys, transcript fields, and `audio_clips.processing_status`. Remaining Phase 5 risk is manual mobile microphone/browser verification on target devices.

## Self-Check: PASSED

- Key files exist: `src/server/audio/transcription.ts`, `tests/server/transcription.test.ts`, `src/server/student-access/audio-upload.ts`, `src/components/student/MissionFlowShell.tsx`, `tests/e2e/student-audio.spec.ts`, and this summary.
- Task commits exist: `7ae3b123`, `9db5c5ec`, `45d85a25`, `f1280acc`.

---
*Phase: 05-voice-capture-and-evidence-storage*
*Completed: 2026-06-27*
