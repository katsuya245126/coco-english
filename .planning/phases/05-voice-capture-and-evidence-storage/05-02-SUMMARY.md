---
phase: 05-voice-capture-and-evidence-storage
plan: 02
subsystem: storage
tags: [supabase-storage, audio-upload, next-route, student-access, vitest, playwright]
requires:
  - phase: 05-01-browser-recorder-foundation
    provides: browser recorder UI and per-turn voice clip callbacks
provides:
  - private student-audio Supabase Storage bucket migration
  - unlock-gated student audio upload route
  - ownership-checked audio metadata persistence service
  - recorder upload wiring for original and repeat clips
affects: [phase-05, phase-05-03-transcription, phase-05-04-teacher-playback]
tech-stack:
  added: []
  patterns:
    - service-role Storage writes require app-level student ownership checks
    - student upload routes return clip status only, never public object URLs
key-files:
  created:
    - supabase/migrations/202606270001_student_audio_storage.sql
    - src/server/student-access/audio-upload.ts
    - src/app/student/missions/[assignmentStudentId]/audio/route.ts
    - tests/e2e/student-audio.spec.ts
  modified:
    - src/lib/db/types.ts
    - src/components/student/MissionFlowShell.tsx
    - tests/server/audio-upload.test.ts
    - .env.example
key-decisions:
  - "05-02: Store student audio in the private student-audio bucket; no public Storage URLs are returned to students."
  - "05-02: Upload service verifies assignment_students.id and student_id before any Storage or audio_clips write."
  - "05-02: Supabase db push was run successfully and remote storage.buckets reports student-audio public=false."
patterns-established:
  - "Audio upload metadata uses pending_upload before Storage upload, uploaded after success, and failed after retryable upload failure."
  - "MissionFlowShell treats recorder upload failure as a rejected onRecorded promise so VoiceRecorderControl keeps the same step active with retry copy."
requirements-completed: [FLOW-03, AUDIO-01, AUDIO-02, AUDIO-03, AUDIO-05, PILOT-02]
duration: 10min
completed: 2026-06-27
status: complete
---

# Phase 05 Plan 02: Private Audio Storage and Metadata Summary

**Private Supabase student-audio storage with unlock-gated per-turn clip upload and retryable recorder failure handling**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-27T06:26:39Z
- **Completed:** 2026-06-27T06:36:25Z
- **Tasks:** 4
- **Files modified:** 8

## Accomplishments

- Added the idempotent private `student-audio` Storage bucket migration and pushed it to the linked Supabase project.
- Added typed `attempts`, `attempt_turns`, and `audio_clips` table entries used by the Phase 5 upload path.
- Implemented `uploadAttemptAudioClip` with student ownership checks, attempt ownership checks, pending/uploaded/failed metadata transitions, and private Storage upload.
- Added a `POST /student/missions/[assignmentStudentId]/audio` route that reads the student unlock cookie, validates multipart FormData, and returns no public URL.
- Wired original and repeat recorder blobs from `MissionFlowShell` into the upload route, preserving retry behavior on upload failure.

## Task Commits

1. **Task 1 RED: Storage/type test scaffold** - `e326b454` (`test`)
2. **Task 1 GREEN: Storage migration and DB types** - `84bdaecb` (`feat`)
3. **Task 3: Ownership-checked upload service and route** - `cfbd6468` (`feat`)
4. **Task 4: Recorder upload wiring and Playwright coverage** - `dee680bc` (`feat`)

Task 2 was a manual/authenticated remote operation with no code delta: `supabase db push` applied `202606270001_student_audio_storage.sql`.

## Files Created/Modified

- `supabase/migrations/202606270001_student_audio_storage.sql` - Creates or updates the private `student-audio` Storage bucket with `public=false`.
- `src/lib/db/types.ts` - Adds typed `attempts`, `attempt_turns`, and `audio_clips` table definitions.
- `src/server/student-access/audio-upload.ts` - Owns student audio upload validation, ownership checks, metadata writes, and private Storage upload.
- `src/app/student/missions/[assignmentStudentId]/audio/route.ts` - Student multipart upload route gated by `readStudentUnlock`.
- `src/components/student/MissionFlowShell.tsx` - Posts original and repeat recording `FormData` to the audio route.
- `tests/server/audio-upload.test.ts` - Covers bucket migration, DB type entries, ownership filtering, processing statuses, retryable upload failure, and no-public-URL route posture.
- `tests/e2e/student-audio.spec.ts` - Covers upload wiring and retry copy through the Playwright target.
- `.env.example` - Documents `STUDENT_AUDIO_BUCKET=student-audio`.

## Decisions Made

- Private Storage is the only student audio storage mode for this plan; students receive clip ids/status, not object keys or public URLs.
- Upload object keys are server-generated from assignment student id, attempt id, turn order, clip kind, and audio clip id.
- Upload failure is retryable: the row is marked `processing_status='failed'`, and the recorder remains on the same step with `We could not save that recording. Try again.`

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- `supabase db query` initially targeted the local database and failed because local Postgres was not running. Reran with `--linked` to verify the remote project bucket state.
- The first Playwright run failed in the sandbox because Next could not bind port 3000 (`EPERM`). Reran the same target command with local-server escalation; it passed.

## Verification

- `npx vitest run tests/server/audio-upload.test.ts` - passed, 7 tests.
- `npx tsc --noEmit` - passed.
- `npx playwright test tests/e2e/student-audio.spec.ts` - passed, 2 tests.
- `supabase db push` - succeeded and applied `202606270001_student_audio_storage.sql`.
- `supabase db query --linked --output json "select id, public from storage.buckets where id = 'student-audio';"` - returned `{"id":"student-audio","public":false}`.

## Known Stubs

None. Transcript writing remains intentionally deferred to 05-03; this plan stores audio references and metadata only.

## Authentication Gates

None. The Supabase CLI was already authenticated and the linked project accepted the migration push.

## Next Phase Readiness

05-03 can consume uploaded `audio_clips` rows and write transcripts into `attempt_turns.original_transcript` and `attempt_turns.repeat_transcript`. Teacher signed playback remains deferred to 05-04.

## Self-Check: PASSED

- Found `.planning/phases/05-voice-capture-and-evidence-storage/05-02-SUMMARY.md`.
- Found created files: `supabase/migrations/202606270001_student_audio_storage.sql`, `src/server/student-access/audio-upload.ts`, `src/app/student/missions/[assignmentStudentId]/audio/route.ts`, and `tests/e2e/student-audio.spec.ts`.
- Found task commits: `e326b454`, `84bdaecb`, `cfbd6468`, and `dee680bc`.

---
*Phase: 05-voice-capture-and-evidence-storage*
*Completed: 2026-06-27*
