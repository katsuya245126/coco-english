# Phase 5: Voice Capture and Evidence Storage - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning
**Source:** Plan-phase inline context from roadmap, Phase 4 artifacts, and STATE.md

<domain>
## Phase Boundary

Phase 5 replaces Phase 4's typed-text stand-in with short per-turn voice capture. Students record original answers and repeat attempts, the app uploads private short clips, stores clip metadata in `audio_clips`, transcribes the clips into the same `attempt_turns.original_transcript` and `attempt_turns.repeat_transcript` fields Phase 4 already uses, and exposes teacher-only on-demand playback through signed URLs.

This phase builds on the completed Phase 4 guided mission loop. It must keep the Phase 4 state machine, completion rules, snapshot-only mission execution, static Coco buddy, and placeholder evaluation boundary intact. Real AI turn evaluation remains Phase 6; Phase 5 only performs transcription and evidence storage.

This phase should NOT build:
- AI scoring, meaning evaluation, target-pattern evaluation, confidence routing, or generated improved sentences. Those are Phase 6.
- Teacher review buckets, class-level review dashboard, manual override workflows, or overdue missed-status jobs. Those are Phase 7.
- Long-session recording, public audio URLs, or always-on/live voice agent behavior.
</domain>

<decisions>
## Implementation Decisions

### Voice Capture Contract
- D-01: Use short per-turn browser recordings with `MediaRecorder`, not full-session recording.
- D-02: Record two clip kinds: `original_answer` and `repeat_attempt`, matching the existing `audio_clip_kind` enum.
- D-03: Store transcript text in the existing `attempt_turns.original_transcript` and `attempt_turns.repeat_transcript` columns so Phase 4 completion logic continues to work.
- D-04: Keep completion gated on transcript presence plus `repeat_accepted`, never on audio upload alone and never on `evaluation`.
- D-05: The student UI must show clear states for unsupported microphone, permission denied, recording, uploading, retryable upload/transcription failure, and successful transcript confirmation.

### Storage And Privacy
- D-06: Use a private Supabase Storage bucket for student audio; never expose public object URLs.
- D-07: Upload through server-owned code that reads the short-lived student unlock cookie and verifies `assignment_students.student_id = unlock.studentId` before storing an object or metadata.
- D-08: Object keys must be scoped by assignment, attempt, turn, and clip kind; object keys are internal and never treated as authorization.
- D-09: Keep 30-day retention fields already present on `audio_clips`; Phase 7 will build deletion/retention operations.

### Transcription
- D-10: Add a server-side transcription adapter behind an internal interface. The adapter writes transcripts and `audio_clips.processing_status`, and tests stub the adapter.
- D-11: Transcription failure is retryable and must not create a fake transcript. The student sees a simple retry state.
- D-12: Configure the transcription model through env, with a conservative default documented in `.env.example`; do not expose API keys to the browser.

### Teacher Playback
- D-13: Teacher playback is transcript-first and on-demand. Do not make audio autoplay or default-open in review surfaces.
- D-14: Teacher playback uses a teacher-authenticated server action or route that verifies teacher ownership, then returns a short-lived signed URL.
- D-15: Phase 5 may create a narrow attempt evidence page for audio playback. Phase 7 will later link this into review buckets and dashboards.

### Device Verification
- D-16: Mobile microphone and recording support cannot be considered fully verified by headless tests. Phase 5 must carry an explicit manual device check for iOS Safari and Android Chrome on HTTPS or localhost.
</decisions>

<canonical_refs>
## Canonical References

### Project Planning
- `.planning/PROJECT.md` - core value, transcript-first teacher review, short per-turn audio privacy constraint.
- `.planning/REQUIREMENTS.md` - Phase 5 requirements: `FLOW-03`, `AUDIO-01` through `AUDIO-05`, `REV-05`, `PILOT-02`.
- `.planning/ROADMAP.md` - Phase 5 goal, dependency on Phase 4, and later Phase 6/7 boundaries.
- `.planning/STATE.md` - current blocker: mobile browser microphone and recording support needs device verification.

### Prior Phase Contracts
- `.planning/phases/04-guided-student-attempt-loop/04-CONTEXT.md` - Phase 4 typed-text stand-in, state machine, completion gate, and Phase 5 swap point.
- `.planning/phases/04-guided-student-attempt-loop/04-VERIFICATION.md` - verified Phase 4 implementation and files to extend.
- `.planning/phases/04-guided-student-attempt-loop/04-UI-SPEC.md` - student mission flow style, one-card-per-step, copy tone, and mobile constraints.
- `.planning/phases/01-data-privacy-and-workflow-foundation/01-VERIFICATION.md` - `audio_clips` metadata, 30-day retention fields, and no full-session recording table.

### Existing Code
- `src/components/student/MissionFlowShell.tsx` - client step machine to extend from typed submit to voice submit.
- `src/components/student/StepBuddyQuestion.tsx` - original-answer step to replace with recorder control.
- `src/components/student/StepImprovedRepeat.tsx` - repeat step to replace with recorder control.
- `src/server/student-access/mission-flow.ts` - ownership-checked service functions; completion must continue to use transcript fields.
- `src/app/student/missions/[assignmentStudentId]/actions.ts` - server-action surface behind unlock cookie.
- `src/lib/db/types.ts` - currently missing table type entries for `attempts`, `attempt_turns`, and `audio_clips`; Phase 5 should fill the touched types.
- `supabase/migrations/202606250001_foundation_schema.sql` - existing attempts, attempt_turns, audio_clips schema.
- `supabase/migrations/202606250002_teacher_auth_rls.sql` - teacher ownership helpers for attempts/audio clips.

### External References
- MDN `MediaDevices.getUserMedia()` - secure-context and permission behavior.
- MDN `MediaRecorder` - browser recording API.
- Supabase Storage JavaScript docs - upload and signed URL flows.
- OpenAI speech-to-text docs - current transcription API and model options.
</canonical_refs>

<specifics>
## Specific Ideas

- Start with browser capability and UI states before storage so unsupported/permission-denied cases are not an afterthought.
- Upload one clip at a time after each stop-recording event; keep clips short and bounded by per-turn UI.
- Use a server route for FormData upload rather than passing blobs through generic action payloads.
- The server should insert or update one `audio_clips` row per `attempt_turn_id + clip_kind` and update transcript fields only after transcription succeeds.
- Teacher playback should read from `audio_clips.object_key`, generate a signed URL on demand, and render an `<audio controls>` element only after the teacher asks to play.
</specifics>

<deferred>
## Deferred Ideas

- AI evaluation and confidence handling are Phase 6.
- Teacher review dashboard buckets, filters, manual status overrides, overdue missed transitions, and retention deletion UI are Phase 7.
- Offline recording queue, waveform visualization, pronunciation scores, and live conversational voice are out of v1 scope.
</deferred>

---

*Phase: 05-voice-capture-and-evidence-storage*
*Context gathered: 2026-06-27*
