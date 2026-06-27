# Phase 05: Voice Capture and Evidence Storage - Research

**Researched:** 2026-06-27
**Question:** What needs to be known to plan voice recording, upload, transcription, metadata storage, and teacher playback for Phase 5?

## Summary

Phase 5 should be implemented as a narrow voice evidence pipeline over the existing Phase 4 mission flow:

1. Browser recorder UI captures short clips for the original answer and repeat attempt.
2. A server-owned upload route validates the student unlock cookie and assignment ownership, stores the clip in private Supabase Storage, and upserts `audio_clips` metadata.
3. A server-side transcription adapter transcribes the clip and writes the transcript into the existing `attempt_turns` transcript fields.
4. Existing Phase 4 completion logic continues to use transcript presence plus `repeat_accepted`, not raw audio or AI evaluation.
5. Teacher playback is generated on demand through signed URLs after teacher ownership is verified.

## Current Code Findings

### Existing Strengths

- `attempts`, `attempt_turns`, and `audio_clips` tables already exist in `supabase/migrations/202606250001_foundation_schema.sql`.
- `audio_clips` already has `attempt_turn_id`, `clip_kind`, `object_key`, `mime_type`, `duration_ms`, `byte_size`, `processing_status`, `audio_expires_at`, `deleted_at`, and `deleted_reason`.
- Phase 4 already writes transcripts and completion state through `src/server/student-access/mission-flow.ts`.
- Phase 4's completion helper intentionally ignores `evaluation`, which keeps Phase 5 transcription independent from Phase 6 AI scoring.
- Teacher RLS helpers already include `is_attempt_turn_owner(...)`, and `audio_clips` has teacher ownership policies.

### Gaps To Plan

- `src/lib/db/types.ts` has enum entries for audio, but it does not define typed `attempts`, `attempt_turns`, or `audio_clips` tables.
- There is no private Storage bucket, Storage upload path, or signed URL playback path.
- There is no browser recorder component, MIME support detection, permission UI, or upload retry state.
- There is no transcription adapter or env configuration for OpenAI.
- There is no teacher attempt evidence page or on-demand audio player.

## External Research

### Browser Recording

- MDN documents `MediaDevices.getUserMedia()` as the browser API for requesting microphone input and notes it is available only in secure contexts. It can reject for denied permissions or leave the promise unresolved if the user ignores the prompt. Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN documents `MediaRecorder` as the API for recording media streams into blobs. Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Can I Use reports `MediaRecorder` support in modern mobile browsers, including iOS Safari 14.5+ and modern Android Chrome. Source: https://caniuse.com/mediarecorder

Planning implication: use runtime feature detection (`navigator.mediaDevices?.getUserMedia`, `window.MediaRecorder`, `MediaRecorder.isTypeSupported`) and carry manual iOS Safari/Android Chrome verification. Do not claim device support from unit/e2e alone.

### Supabase Storage

- Supabase JS supports uploading files to a bucket and creating signed URLs for private object playback. Sources: https://supabase.com/docs/reference/javascript/storage-from-upload and https://supabase.com/docs/reference/javascript/storage-from-createsignedurl

Planning implication: keep the bucket private, upload from server-owned code using the service-role client, and generate short-lived signed URLs only after teacher ownership is checked.

### Transcription

- OpenAI's speech-to-text docs describe transcribing audio via the audio transcription API with current transcription models such as `gpt-4o-transcribe` and `gpt-4o-mini-transcribe`. Source: https://platform.openai.com/docs/guides/speech-to-text

Planning implication: add a server-only transcription adapter with an env-configured model. Tests must stub the adapter; no automated test should call the paid external API.

## Architecture Recommendations

### Browser

- Add `src/domain/audio/recorder.ts` for MIME selection and duration limits.
- Add `src/components/student/VoiceRecorderControl.tsx` as a reusable control for both answer and repeat steps.
- Prefer MIME candidates in order:
  - `audio/webm;codecs=opus`
  - `audio/webm`
  - `audio/mp4`
  - fallback to browser default when no candidate is supported.
- Limit recording length per clip. Suggested MVP cap: 20 seconds per answer/repeat with visible countdown.

### Student Server Surface

- Add `src/app/student/missions/[assignmentStudentId]/audio/route.ts` accepting `multipart/form-data`.
- The route must call `readStudentUnlock()`, validate assignment ownership through `assignment_students.student_id`, validate `attemptId`, `turnOrder`, and `clipKind`, then store audio.
- Keep route error copy generic for children: permission/help text in the component, not detailed server internals.

### Storage

- Add a migration for private bucket setup. Proposed bucket id: `student-audio`.
- Object key pattern:
  `student-audio/{assignmentStudentId}/{attemptId}/{turnOrder}/{clipKind}-{audioClipId}.{ext}`
- Do not add public Storage policies. Server-role upload and signed teacher playback are enough for v1.

### Data Writes

- For each successful upload:
  - Ensure the `attempt_turns` row exists for the attempt and turn.
  - Upsert or insert an `audio_clips` row with `clip_kind`, `object_key`, `mime_type`, `duration_ms`, `byte_size`, `processing_status='uploaded'`.
  - Run transcription; if successful, update `processing_status='transcribed'` and update the proper transcript column on `attempt_turns`.
  - If transcription fails, set `processing_status='failed'` and return a retryable error; do not invent a transcript.

### Completion

- Original answer recording should return the transcript and then let the UI advance to the improved-sentence repeat step.
- Repeat recording should return the transcript and set `repeat_accepted=true` through the existing service logic.
- Final completion still calls `completeMissionAction`; it should pass only after transcription populated the repeat transcript.

### Teacher Playback

- Add `src/server/teacher/audio-evidence.ts` for teacher-owned attempt detail reads and signed playback URLs.
- Add `src/app/teacher/evidence/[attemptId]/page.tsx` as a narrow transcript-first attempt evidence page.
- Add `src/components/teacher/AudioClipPlayer.tsx` with a "Load audio" button that calls a server action for a signed URL and then renders `<audio controls>`.

## Validation Architecture

| Requirement | Behavior | Test Type | Command/File |
|-------------|----------|-----------|--------------|
| FLOW-03 | Student answers each mission turn by voice | e2e/manual | Playwright fake media plus real-device UAT |
| AUDIO-01 | Original answer clips are recorded and uploaded | unit + route | `tests/domain/audio-recorder.test.ts`, `tests/server/audio-upload.test.ts` |
| AUDIO-02 | Repeat clips are recorded and uploaded | unit + route | `tests/server/audio-upload.test.ts` |
| AUDIO-03 | Permission, recording, upload retry, failure states are clear | component/e2e/manual | `tests/e2e/student-audio.spec.ts`, UAT |
| AUDIO-04 | Original and repeat clips are transcribed | unit with stub | `tests/server/transcription.test.ts` |
| AUDIO-05 | Transcript, audio reference, metadata, processing status stored per turn | route/integration | `tests/server/audio-upload.test.ts` |
| REV-05 | Teacher can play short clips on demand | server + e2e | `tests/server/audio-evidence.test.ts`, `tests/e2e/teacher-audio-evidence.spec.ts` |
| PILOT-02 | Mic permission and recording failure handling exists | manual device | iOS Safari + Android Chrome checklist |

## Risks And Pitfalls

1. **Permission prompt limbo:** `getUserMedia()` may neither resolve nor reject if the prompt is ignored. UI needs a waiting state and a cancel/back path.
2. **MIME mismatch:** Browsers differ on supported recording MIME types. Always feature-detect and store the actual MIME type.
3. **Fake transcript risk:** Do not complete a turn when transcription fails. Show retry and preserve audio status as failed.
4. **Service-role overreach:** Upload and signed URL code bypasses RLS. Every path must verify student or teacher ownership before storage access.
5. **Audio-first teacher UX:** Teachers must see transcripts first. Audio should load only after an explicit play/load action.
6. **Schema false positive:** A bucket/migration change needs `supabase db push`; TypeScript checks will not prove the remote bucket exists.
7. **Paid API in tests:** Transcription tests must use dependency injection/stubs and never call OpenAI.

## Suggested Plan Shape

- Plan 05-01: browser recorder foundation and student UI states.
- Plan 05-02: private storage bucket, upload route, audio metadata persistence, schema push.
- Plan 05-03: transcription adapter and integration into answer/repeat flow.
- Plan 05-04: teacher on-demand playback plus real-device UAT checklist.
