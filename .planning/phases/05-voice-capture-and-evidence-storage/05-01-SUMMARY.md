---
phase: 05-voice-capture-and-evidence-storage
plan: 01
subsystem: student-ui
tags: [react, mediarecorder, audio, vitest, typescript]
requires:
  - phase: 04-guided-student-attempt-loop
    provides: "Student mission step machine, transcript-based completion helpers, and typed answer/repeat placeholders"
provides:
  - "Pure browser recorder helpers with MIME candidate selection and a 20 second cap"
  - "Reusable student voice recorder control with permission, unsupported, recording, retry, processing, and success states"
  - "Student mission question and repeat steps wired to voice recording callbacks"
affects: [phase-05-audio-upload, phase-05-transcription, student-mission-flow]
tech-stack:
  added: []
  patterns:
    - "Browser recording capability is isolated in src/domain/audio/recorder.ts"
    - "Recorder UI uses inline student style tokens and child-friendly copy"
    - "Voice callbacks pass Blob plus metadata without creating fake transcripts"
key-files:
  created:
    - src/domain/audio/recorder.ts
    - src/components/student/VoiceRecorderControl.tsx
    - tests/domain/audio-recorder.test.ts
  modified:
    - src/components/student/MissionFlowShell.tsx
    - src/components/student/StepBuddyQuestion.tsx
    - src/components/student/StepImprovedRepeat.tsx
    - src/components/student/styles.ts
    - tests/schema/mission-assign-rpc-schema.test.ts
key-decisions:
  - "05-01 keeps upload and transcription out of scope; voice callbacks carry Blob metadata and do not invent transcript text."
  - "Recorder capability checks are runtime-based using getUserMedia, MediaRecorder, and MIME support probing."
patterns-established:
  - "Recorder controls expose child-friendly permission, unsupported, recording, processing, retry, and success copy with aria-live/alert semantics."
  - "Short per-turn clips are bounded client-side by MAX_RECORDING_MS = 20000 before future upload/transcription wiring."
requirements-completed: [FLOW-03, AUDIO-01, AUDIO-02, AUDIO-03, PILOT-02]
duration: 9min
completed: 2026-06-27
status: complete
---

# Phase 05 Plan 01: Browser Recorder Foundation Summary

**Browser MediaRecorder foundation with child-friendly student recorder UI and voice callbacks for original and repeat mission steps**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-27T06:13:29Z
- **Completed:** 2026-06-27T06:22:09Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added pure audio recorder helpers for MIME preference, browser-default fallback, runtime capability detection, and a 20 second per-turn cap.
- Added a reusable `VoiceRecorderControl` client component with permission, unsupported, recording, processing, retry, and success states using real buttons and accessible live/error regions.
- Replaced Phase 4 typed original-answer and repeat inputs with voice recorder controls while preserving the question -> repeat -> transition/complete step order.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Audio recorder helper tests** - `2bddc024` (test)
2. **Task 1 GREEN: Audio recorder domain helpers** - `5fd79676` (feat)
3. **Task 2: Reusable VoiceRecorderControl with permission and retry states** - `a490cd0a` (feat)
4. **Task 3: Swap original/repeat text inputs for recorder placeholders** - `68d3cc2e` (feat)

_Note: Task 1 followed TDD with separate RED and GREEN commits._

## Files Created/Modified

- `src/domain/audio/recorder.ts` - Pure recorder constants, MIME candidate selection, and browser recorder capability detection.
- `tests/domain/audio-recorder.test.ts` - Unit coverage for MIME preference, default fallback, duration cap, and unsupported scopes.
- `src/components/student/VoiceRecorderControl.tsx` - Reusable client recorder UI for original and repeat clips.
- `src/components/student/styles.ts` - Recorder panel style tokens for neutral, recording, processing, success, and error states.
- `src/components/student/StepBuddyQuestion.tsx` - Original answer text input replaced with `VoiceRecorderControl`.
- `src/components/student/StepImprovedRepeat.tsx` - Repeat text input replaced with `VoiceRecorderControl`; transcript display remains optional until transcription is wired.
- `src/components/student/MissionFlowShell.tsx` - Voice-recording callback handlers advance the existing step sequence without fake transcripts.
- `tests/schema/mission-assign-rpc-schema.test.ts` - Removed an unnecessary regex dotAll flag that blocked the required TypeScript check under the existing ES2017 target.

## Decisions Made

- Upload/transcription remain explicit Plan 02/03 work. This plan passes `{ blob, mimeType, durationMs }` through typed callbacks and does not write placeholder transcript text.
- The shell starts/ensures an attempt around voice callbacks, then advances local UI state. Server transcript persistence and final completion persistence remain tied to later upload/transcription integration.
- Browser capability detection stays isolated from React and server code so future storage/transcription work can reuse the same domain helper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed an unnecessary regex dotAll flag that blocked typecheck**
- **Found during:** Task 2 (Reusable VoiceRecorderControl with permission and retry states)
- **Issue:** `npx tsc --noEmit` failed on `tests/schema/mission-assign-rpc-schema.test.ts` because the test used a regex `s` flag while `tsconfig.json` targets ES2017.
- **Fix:** Removed the unnecessary `s` flag; the existing `[^)]*` expression already spans newlines for the tested SQL shape.
- **Files modified:** `tests/schema/mission-assign-rpc-schema.test.ts`
- **Verification:** `npx tsc --noEmit` exited 0 after the fix.
- **Committed in:** `a490cd0a`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was limited to an existing test compatibility issue that blocked the required Task 2 and Task 3 typecheck gates. No product scope was added.

## Issues Encountered

- `npx tsc --noEmit` initially failed on a pre-existing ES2017 regex compatibility issue. Resolved under the Rule 3 deviation above.

## Verification

- `npx vitest run tests/domain/audio-recorder.test.ts` - PASS, 4 tests passed.
- `npx tsc --noEmit` - PASS, exit 0.

## Known Stubs

None. Upload, storage, transcription, and signed playback are intentionally out of scope for this plan and remain scheduled for later Phase 5 plans. This plan does not add fake transcript data.

## Threat Flags

None. The new browser microphone surface is covered by the plan threat model and mitigated with explicit button-press recording, runtime feature detection, permission/unsupported states, and the 20 second recording cap.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 05-02 storage/upload wiring. The recorder UI now supplies short per-turn `Blob` objects and metadata; Plan 02 can connect those callbacks to a student-owned upload route and `audio_clips` metadata persistence.

## Self-Check: PASSED

- Created files exist: `src/domain/audio/recorder.ts`, `src/components/student/VoiceRecorderControl.tsx`, `tests/domain/audio-recorder.test.ts`.
- Task commits exist: `2bddc024`, `5fd79676`, `a490cd0a`, `68d3cc2e`.
- Required verification commands passed after implementation.

---
*Phase: 05-voice-capture-and-evidence-storage*
*Completed: 2026-06-27*
