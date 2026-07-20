# Whisper silence guard

**Status:** Complete

## Goal

Prevent silent or effectively empty recordings from becoming prompt-echo transcripts that consume a student's turn. Reuse the existing child-friendly retry state and keep the turn available for another recording.

## Scope

- Detect strong transcription-prompt echoes and exact high-confidence silence hallucinations.
- Reject accidental recordings shorter than 500 ms before storage or transcription.
- Route detections through the existing `transcription_failed_retryable` response.
- Keep detection in a pure domain function with narrow server adapter hooks.

## Non-goals

- General answer relevance or one-word-answer policy.
- New client states, student-facing copy, API shapes, or database changes.
- Audio-energy analysis, provider/model changes, or the stale moderation-gate branch.
- Push, merge, deploy, publication, or production mutation.

## Constraints and decisions

- User approved the design, written spec, and implementation plan on 2026-07-20; authorization to start the existing plan recorded plan approval.
- Prompt overlap requires at least 5 transcript tokens and 70% coverage in both directions: transcript tokens by the prompt set and prompt unique words by the transcript.
- The reciprocal overlap condition was added after independent review reproduced a plausible false positive under one-way coverage.
- The short-tap cutoff is strictly less than 500 ms.
- The hallucination blocklist is normalized exact full-transcript matching only.
- No-speech never reaches evaluation, scoring, transcript persistence, conversation generation, or progression.
- Preserve the dirty main checkout and the protected port-3200 dynamic-dialogue worktree.
- Use unit/source-string tests only; never call the paid provider in tests.

## Done checks

- [x] Design and written spec approved by user.
- [x] Detailed implementation plan approved by user.
- [x] Isolated `codex/whisper-silence-guard` worktree created.
- [x] Clean baseline verified before implementation: 85 test files passed; 774 tests passed; 4 skipped.
- [x] Domain detector implemented test-first (`260a8586`).
- [x] Transcription adapter integrated test-first (`43a3b8d7`).
- [x] Short-tap upload pre-check implemented test-first (`34ca6b67`).
- [x] Independent review found no Critical issues; its Important false-positive finding was reproduced test-first and fixed with bidirectional overlap (`8700092d`).
- [x] Focused silence-guard gate passed after review fix: 3 files, 59 tests.
- [x] Full Vitest suite passed after review fix: 86 files, 794 passed, 4 skipped.
- [x] Typecheck passed after review fix.
- [x] Lint exited 0 after review fix with 0 errors and 1 pre-existing warning at `scripts/check-student-feedback-states.mjs:435` (`label` unused).
- [x] Scope and protected-worktree state verified; no client, API-shape, database, RLS, deployment, or production changes.
- [x] Task archived after completion.

## Red-green evidence

- Domain RED: the new test failed because the detector module did not exist; GREEN: 15 tests passed.
- Adapter RED: the real prompt echo returned `{ ok: true }`; GREEN: domain and adapter suites passed 24 tests.
- Upload RED: a 300 ms clip completed storage, transcription, evaluation, and scoring; GREEN: the three focused files passed 58 tests.
- Review RED: `The student is speaking English.` returned `prompt_echo`; GREEN: bidirectional coverage kept it valid and the focused gate passed 59 tests.

## Completion position

Implementation and automated verification are complete on `codex/whisper-silence-guard`. The independent re-review confirmed the false-positive fix and found no remaining Critical or Important code issues; its minor suggestion for additional conversation-mode orchestration assertions does not block readiness because the shared failure gate returns before all downstream branches. No push, merge, deploy, publish, production mutation, or worktree removal was performed. External integration still requires the user's explicit approval.
