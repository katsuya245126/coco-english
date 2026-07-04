---
phase: 09-pronunciation-scoring
plan: 06
subsystem: student-ui
tags: [pronunciation-scoring, student-facing, azure-speech, react]

# Dependency graph
requires:
  - phase: 09-pronunciation-scoring (plan 03)
    provides: scorePronunciation adapter + scoreToStarBand domain mapping
  - phase: 09-pronunciation-scoring (plan 04)
    provides: live pronunciation_scores rows written inline on scored turn upload
  - phase: 09-pronunciation-scoring (plan 05)
    provides: D-04 calibration gate cleared (accuracy-led 60/40 band blend, operator-approved thresholds)
provides:
  - Student-facing pronunciation star band (PRON-04), completing the phase's full pipeline-to-UI slice
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "starBand crosses the server/client boundary as a 1/2/3 band only; the raw 0-100 numeric never leaves the server (asserted by tests + a negative grep on the audio route)"
    - "PronunciationStars mirrors the existing Transcript sub-component shape: returns null on missing data instead of rendering a placeholder (D-03 graceful absence)"

key-files:
  created: []
  modified:
    - src/server/student-access/audio-upload.ts
    - src/app/student/missions/[assignmentStudentId]/audio/route.ts
    - src/components/student/MissionFlowShell.tsx
    - src/components/student/StepAiEvaluationFeedback.tsx
    - tests/server/audio-upload.test.ts

key-decisions:
  - "starBand is captured from the 09-04 best-effort scoring block and added to the upload success result and route JSON; scoring failure still returns { ok: true, starBand: null } so core feedback is never blocked (T-09-09)."
  - "PronunciationStars renders only in the acceptedOriginal/needsCorrection/repeatAccepted success-path branches; retry/error/teacher-review/checking branches never show stars (T-09-15/T-09-16)."
  - "Micro-copy is sourced from STAR_BAND_COPY, never hardcoded, keeping the 1-star case encouraging ('Keep practicing!') and never a failure-styled element."

patterns-established:
  - "This is the last plan in the phase's dependency chain (09-03 -> 09-04 -> 09-05 -> 09-06); student UI only ships after the calibration gate, never before."

requirements-completed: [PRON-04]

# Metrics
completed: 2026-07-03
status: complete
---

# Phase 9 Plan 6: Student-facing pronunciation stars Summary

**Students now see an always-3-slot, encouragement-only star band inline on the existing per-turn feedback step, threaded from the Azure-derived score through the upload response and mission flow — with the raw numeric score never leaving the server and no element rendered at all when scoring was unavailable.**

## Accomplishments

- `uploadAttemptAudioClip` captures `score.starBand` from the 09-04 best-effort scoring block and returns it on the success result (`starBand: null` on any scoring/DB failure); no raw `accuracyScore`/`pronunciationScore` numeric is included.
- The audio upload route JSON echoes `starBand` alongside the existing `transcript`/`evaluation` fields — band only.
- `MissionFlowShell` threads `starBand` through `UploadVoiceClipPayload`, the `OriginalFeedback`/`RepeatFeedback` flow-state unions, and both `StepAiEvaluationFeedback` render sites.
- `StepAiEvaluationFeedback` gained a `PronunciationStars` sub-component: null when `starBand` is absent (D-03 graceful absence — never a zero-star or failure placeholder), otherwise 3 star glyphs (filled count = band, amber `#F59E0B` filled / `#D1D5DB` unfilled) with `STAR_BAND_COPY` micro-copy, rendered only in success-path outcomes.
- Manually verified in a live run through the student mission flow: stars render inline with the correct filled count and encouraging copy, a 1-star result stays calm/amber (never a red-X/failure state), no raw numeric appears in the UI or the audio-upload network response body, and turns without a score show no star element at all.

## Follow-up work done alongside this plan

While exercising the student flow during checkpoint verification, several additional issues were found and fixed in the same session (not part of the original 09-06 task list, but shipped before checkpoint sign-off):

- **Original-answer words-to-practice could be empty on the first try** (`.planning/debug/resolved/original-practice-words-empty.md`): original free-form answers were scored against `snapshotTurn.targetExample` while practice-word highlighting filtered against the transcript, so a valid answer that diverged from the target sentence could produce no overlap. Fixed by scoring original answers against the transcript itself (repeat attempts still score against the improved sentence).
- **Teacher-review retry offered an upload the server would always reject** (`.planning/debug/resolved/teacher-review-retry-upload-fails.md`): `MissionFlowShell` still passed a retry handler into `StepAiEvaluationFeedback` for `teacherReview`/`repeatReview` outcomes, letting a student record again into a call that always failed with `audio_upload_failed`. Fixed by passing `undefined` for `onRetry` on those two outcomes only.
- **Korean transcription output rejected** (commits `f50ed045`, `44a6bb01`): transcription and audio upload now reject Korean-language transcript output rather than accepting it as valid English speaking evidence.
- **Mission deletion added to teacher mission list** (`src/components/teacher/MissionList.tsx`, `src/app/teacher/missions/actions.ts`): teachers can delete a mission with zero assignments, with a confirm dialog and error surfacing.
- **Minor login-page nav fix**: added a "Back to role choice" link on the login page.

These are tracked here for visibility since they landed in the same commits as the 09-06 work, but are outside PRON-04's scope — future phase/backlog planning should account for them as already shipped rather than re-planning them.

## Verification

- `npm test` — 42 files / 378 passed, 4 skipped.
- `npm run typecheck` — clean.
- Manual mission-flow run confirmed the checkpoint criteria (encouraging stars, no raw score, graceful absence).

## Next Phase Readiness

- PRON-04 complete. Phase 09 (pronunciation-scoring) is now fully shipped end-to-end: schema (09-02) → scoring adapter (09-03) → inline pipeline wiring (09-04) → teacher diagnostic panel + calibration gate (09-05) → student-facing stars (09-06).
- No open blockers for Phase 09. Next roadmap phase per `.planning/ROADMAP.md` is Phase 10 (coco-mascot), which depends on Phase 08 (voice) — already complete.

---
*Phase: 09-pronunciation-scoring*
*Completed: 2026-07-03*
