---
phase: 06-ai-mission-and-turn-intelligence
reviewed: 2026-06-29T23:58:21Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/app/student/missions/[assignmentStudentId]/audio/route.ts
  - src/app/teacher/evidence/[attemptId]/page.tsx
  - src/app/teacher/missions/actions.ts
  - src/components/student/MissionFlowShell.tsx
  - src/components/student/StepAiEvaluationFeedback.tsx
  - src/components/student/styles.ts
  - src/components/teacher/MissionDraftPanel.tsx
  - src/components/teacher/MissionForm.tsx
  - src/domain/ai/mission-generation.ts
  - src/domain/ai/turn-evaluation.ts
  - src/domain/flow/completion.ts
  - src/server/ai/mission-generator.ts
  - src/server/ai/turn-evaluator.ts
  - src/server/student-access/audio-upload.ts
  - src/server/student-access/mission-flow.ts
  - src/server/teacher/audio-evidence.ts
  - tests/domain/mission-generation.test.ts
  - tests/domain/turn-evaluation.test.ts
  - tests/e2e/student-ai-evaluation.spec.ts
  - tests/e2e/teacher-ai-mission-draft.spec.ts
  - tests/e2e/teacher-audio-evidence.spec.ts
  - tests/server/ai-mission-generator.test.ts
  - tests/server/audio-evidence.test.ts
  - tests/server/audio-upload.test.ts
  - tests/server/student-mission-flow.test.ts
  - tests/server/turn-evaluator.test.ts
findings:
  critical: 4
  warning: 4
  info: 0
  total: 8
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-06-29T23:58:21Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Reviewed the Phase 6 AI mission generation, turn evaluation, audio upload, student flow, teacher evidence, and associated tests. The main risks are in service-role mutation paths: several student mission-flow writes trust caller-supplied attempt IDs after only checking assignment ownership, audio uploads can mutate closed attempts, and concurrent starts can create duplicate attempts. These violate the project constraints that workflow state is app-owned and auditable.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: [BLOCKER] Student mission-flow writes are not scoped to the owned attempt

**File:** `src/server/student-access/mission-flow.ts:323`

**Issue:** `recordAnswer`, `recordRepeat`, `recordHintReveal`, and `completeAttempt` only verify that `assignmentStudentId` belongs to the unlocked student, then use the caller-supplied `attemptId` directly in `attempt_turns` and `attempts` mutations. Because these functions use the service-role client, a student who obtains or guesses another attempt UUID can write transcripts, update hint state, or mark that other attempt complete while linking it to their own assignment. The audio upload path already performs the missing `attempts.assignment_student_id` check; the mission-flow action path does not.

**Fix:** Before any turn or attempt mutation, load the attempt with both IDs and reject when it is not owned by the same assignment:

```ts
const { data: attempt, error: attemptError } = await supabase
  .from("attempts")
  .select("id, assignment_student_id, status")
  .eq("id", input.attemptId)
  .eq("assignment_student_id", input.assignmentStudentId)
  .maybeSingle();

if (attemptError) return { ok: false, error: "db_error" };
if (!attempt) return { ok: false, error: "not_found" };
```

Apply that guard in `recordAnswer`, `recordRepeat`, `recordHintReveal`, and `completeAttempt`, and keep all subsequent `attempt_turns` queries scoped to the verified attempt.

### CR-02: [BLOCKER] Audio uploads can mutate completed or review-routed attempts

**File:** `src/server/student-access/audio-upload.ts:289`

**Issue:** `uploadAttemptAudioClip` checks assignment ownership and attempt ownership, but it does not check `assignment_students.status` or `attempts.status` before inserting audio clips and upserting turn transcripts/evaluations. A student session can POST directly to the audio route after an assignment is `completed` or `teacher_review` and overwrite evidence on a closed attempt. That breaks the audit trail teachers rely on.

**Fix:** Select and enforce mutable statuses before creating `attempt_turns` or `audio_clips`:

```ts
.select("id, student_id, status, assignments(mission_snapshot)")
// ...
.select("id, assignment_student_id, status")

if (assignmentStudent.status !== "started" || attempt.status !== "in_progress") {
  return { ok: false, error: "not_found", retryable: false };
}
```

Also add regression tests that completed and teacher-review assignments cannot upload more audio.

### CR-03: [BLOCKER] Concurrent starts can create duplicate in-progress attempts

**File:** `src/server/student-access/mission-flow.ts:237`

**Issue:** `startOrResumeAttempt` inserts a new attempt before the conditional `assignment_students` update, then ignores whether that update actually transitioned the row. Two parallel requests can both observe `assigned`, both insert `attempts`, and both return different attempt IDs even though only one can be written to `latest_attempt_id`. This violates the “never creates a second attempt” contract and makes resume/audit state ambiguous.

**Fix:** Move start into a single transactional database operation or RPC that conditionally claims the assignment and creates the attempt atomically. At minimum, check the conditional update result and do not return the newly inserted attempt when the assignment was already claimed; instead reload and resume the authoritative `latest_attempt_id`.

### CR-04: [BLOCKER] Audio upload has no server-side byte or duration limit before paid/storage work

**File:** `src/app/student/missions/[assignmentStudentId]/audio/route.ts:29`

**Issue:** The route only rejects empty blobs, and `uploadAttemptAudioClip` only requires `byteSize > 0` and a client-provided MIME type starting with `audio/`. A student session can submit very large blobs or bogus “audio/*” content, causing server memory pressure, storage writes, and transcription attempts. Phase 6 treats paid AI calls and student audio handling as critical boundaries, so these limits must be enforced server-side.

**Fix:** Add explicit max-byte and max-duration gates in the route/service before storage or transcription, and validate against the actual `file.type` plus an allowlist:

```ts
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_MS = 90_000;
const ALLOWED_AUDIO_MIME_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]);
```

Reject files over the cap, durations over the cap, or MIME types outside the allowlist with `invalid_audio`.

## Warnings

### WR-01: [WARNING] Out-of-snapshot turn orders can create ghost evidence rows

**File:** `src/server/student-access/audio-upload.ts:317`

**Issue:** The upload service accepts any positive `turnOrder`, upserts an `attempt_turns` row, then only later tries to find the matching mission snapshot turn. A crafted request for turn 999 creates audio and turn evidence outside the assigned mission. Completion ignores it, but teacher evidence will still query and render all attempt turns.

**Fix:** Parse the mission snapshot and reject before the initial `attempt_turns.upsert` when `turnOrder` is not one of the snapshot turns or exceeds `requiredTurns`.

### WR-02: [WARNING] Completion returns success even when completion writes fail

**File:** `src/server/student-access/mission-flow.ts:518`

**Issue:** `completeAttempt` ignores errors from the assignment status update, audit event insert, and attempt completion update. It can return `{ ok: true }` even when the assignment was not marked completed, the audit event failed, or the attempt was not stamped complete.

**Fix:** Capture and check every write result:

```ts
const { data: updated, error: updateError } = await supabase...
if (updateError) return { ok: false, error: "db_error" };
```

Do the same for `assignment_status_events.insert` and `attempts.update`.

### WR-03: [WARNING] Final teacher-review outcomes proceed into a completion path that cannot pass

**File:** `src/components/student/MissionFlowShell.tsx:474`

**Issue:** For original `teacherReview` feedback, `onContinue` is `finishAcceptedOriginal`. On the final turn that calls `completeMissionAction`, but `isAttemptComplete` only accepts `accepted_original` or accepted repeat rows, not `teacher_review` rows. The student sees “Continue mission”, then can hit a generic failure instead of a review-submitted state.

**Fix:** Branch `teacherReview` and `repeatReview` separately from accepted outcomes. Show a terminal “teacher will review” state, or skip `completeMissionAction` and route to an explicit review-pending screen/status that matches `assignment_students.status = "teacher_review"`.

### WR-04: [WARNING] Playwright “e2e” tests do not exercise runtime behavior

**File:** `tests/e2e/student-ai-evaluation.spec.ts:4`

**Issue:** The submitted Playwright specs mostly read source files and assert strings/import absences. They will pass if the app fails to render, server actions throw at runtime, the upload route returns the wrong response shape, or teacher evidence playback is broken. That reduces confidence in Phase 6’s user-facing workflows.

**Fix:** Add at least one real browser-path test for each Phase 6 workflow: generate/use a mission draft, upload mocked audio through the student UI/API boundary, and load teacher evidence with mocked signed-audio behavior. Keep source-contract assertions as unit tests if they are still useful.

---

_Reviewed: 2026-06-29T23:58:21Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
