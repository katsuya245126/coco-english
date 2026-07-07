---
phase: 10-mascot-vn-style
plan: 02
subsystem: student-audio
tags: [web-audio, mascot, server-actions, student-flow]
requires:
  - phase: 08-coco-voice-tts
    provides: Existing CocoSpeechAudio playback and replay path
provides:
  - Optional amplitude and playing-state callback seam from CocoSpeechAudio
  - Cached Web Audio source/analyser graph that keeps audio routed to destination
affects: [phase-10-mascot-stage, student-mission-flow]
tech-stack:
  added: []
  patterns: [additive Web Audio tap, WeakMap media-source cache]
key-files:
  created: []
  modified:
    - src/components/student/CocoSpeechAudio.tsx
    - src/components/student/StepAiEvaluationFeedback.tsx
    - src/components/student/MissionFlowShell.tsx
    - tests/server/student-mission-flow.test.ts
    - scripts/check-student-feedback-states.mjs
key-decisions:
  - "CocoSpeechAudio remains the owner of the per-step audio element; mascot data crosses via optional callbacks."
  - "The Web Audio graph always connects the media source to destination so Coco's voice remains audible."
patterns-established:
  - "Use optional callback props for shell-level mascot signal bridging instead of lifting audio ownership."
requirements-completed: [MASCOT-02]
duration: 8min
completed: 2026-07-05
status: complete
---

# Phase 10 Plan 02 Summary

**CocoSpeechAudio exposes real playback amplitude and playing state without regressing voice playback**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-05T07:45:37Z
- **Completed:** 2026-07-05T08:14:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added optional `onAmplitudeFrame(level)` and `onPlayingChange(playing)` props to `CocoSpeechAudio`.
- Added lazy Web Audio setup with a `WeakMap` media-source cache and analyser cache.
- Kept the existing audio source connected to `AudioContext.destination` to preserve audible playback.
- Ran the manual audio checkpoint: approved by user after autoplay/replay/step-advance audio checks.
- Simplified needs-correction feedback for elementary ESL students: "You said:", "Try this:", and "Practice", with no pronunciation stars on off-target original answers.
- Added a reusable student feedback state screenshot checker for the saved test class account, and used it to review accepted, improved, retry, couldn't-hear, teacher-review, and repeat-retry states.
- Polished checkpoint feedback: accepted original keeps a record-again escape hatch, needs-correction uses a blue mic "Try again" action, accepted repeats no longer show "Record again", original retry copy is neutral, and amber error/retry messages are shorter for children.

## Task Commits

Changes are not committed yet in this Codex checkpoint.

## Files Created/Modified

- `src/components/student/CocoSpeechAudio.tsx` - Adds analyser callback seam and playing-state notifications.
- `src/components/student/StepAiEvaluationFeedback.tsx` - Checkpoint-driven UX fix: needs-correction feedback now shows only one forward action unless a forced retry is required.
- `src/components/student/MissionFlowShell.tsx` - Shortens the retryable transcription failure copy.
- `src/components/student/styles.ts` - Uses light blue for improved-sentence cards and amber for retry/error review panels.
- `tests/server/student-mission-flow.test.ts` - Source contract for the needs-correction single-action behavior.
- `scripts/check-student-feedback-states.mjs` and `docs/testing/student-feedback-states.md` - Reusable deterministic screenshot strategy for all feedback states.

## Decisions Made

- Kept the analyser change additive and optional so existing `CocoSpeechAudio` call sites continue to compile unchanged.
- Preserved the existing replay/autoplay/error state updates and only added callback calls alongside them.

## Deviations from Plan

### Auto-fixed Issues

**1. Checkpoint UX finding — duplicate needs-correction actions**
- **Found during:** Task 2 manual checkpoint.
- **Issue:** On the needs-correction feedback page, both "Record again" and "Continue practice" routed to the improved-sentence recorder.
- **Fix:** Ordinary needs-correction feedback now shows one forward action; forced retry still shows a single record-again action.
- **Files modified:** `src/components/student/StepAiEvaluationFeedback.tsx`, `tests/server/student-mission-flow.test.ts`
- **Verification:** `npx vitest run tests/server/student-mission-flow.test.ts`, `npx tsc --noEmit`, `npx vitest run`.

**2. Product feedback decision — color/copy simplification**
- **Found during:** Post-checkpoint product review.
- **Issue:** Needs-correction feedback showed pronunciation stars and longer copy, which mixed pronunciation quality with whether the answer addressed the prompt.
- **Fix:** Needs-correction now uses short ESL-friendly copy and no stars; colors are green accepted, light blue improved sentence, amber retry/could-not-hear/teacher-check.
- **Files modified:** `src/components/student/StepAiEvaluationFeedback.tsx`, `src/components/student/styles.ts`, source/e2e tests.
- **Verification:** `npx vitest run`, `npx playwright test tests/e2e/student-ai-evaluation.spec.ts --reporter=list`.

**3. Product feedback decision — post-screenshot polish**
- **Found during:** Deterministic feedback-state screenshot review with the saved test student.
- **Issue:** The needs-correction CTA needed to read like a recording action, accepted repeats still offered "Record again", original retry copy was too specifically "English", and amber error/retry messages were too long for young ESL students.
- **Fix:** Needs-correction uses a filled blue mic "Try again" button; accepted original keeps record-again as an escape hatch; accepted repeat removes record-again; original retry says "Try again."; couldn't-hear says "I didn't hear you. Try again."; repeat retry says "Try again."; recorder error retry is now a filled blue mic button.
- **Files modified:** `src/components/student/StepAiEvaluationFeedback.tsx`, `src/components/student/VoiceRecorderControl.tsx`, `src/components/student/MissionFlowShell.tsx`, source/e2e tests.
- **Verification:** `npx tsc --noEmit`; `npx vitest run tests/server/student-mission-flow.test.ts`; `npx playwright test tests/e2e/student-ai-evaluation.spec.ts tests/e2e/student-audio.spec.ts --reporter=list`.

---

**Total deviations:** 3 checkpoint/product-review UX fixes.
**Impact on plan:** No scope expansion to audio architecture; this removes ambiguous controls and makes feedback colors/copy match the learner-facing product decision.

## Issues Encountered

- TypeScript required `Uint8Array<ArrayBuffer>` for the analyser frequency buffer; fixed without changing behavior.

## User Setup Required

None.

## Next Phase Readiness

Plan 03 can consume `onAmplitudeFrame`, `onPlayingChange`, and the pure domain helpers from Plan 01 to build the persistent mascot stage.

## Self-Check: PASSED

- `npx vitest run tests/server/student-mission-flow.test.ts` - passed, 12 tests.
- `npx tsc --noEmit` - passed.
- `npx vitest run` - passed, 428 passed / 4 skipped.
- Manual checkpoint approved by user: Coco voice remained audible on autoplay/replay/step advance and no Web Audio already-connected errors were reported.

---
*Phase: 10-mascot-vn-style*
*Completed: 2026-07-05*
