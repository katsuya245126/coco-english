# Whisper silence guard

**Status:** Written spec approved; implementation plan awaiting user review

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

- User approved the design and defaults on 2026-07-20.
- Prompt overlap requires at least 70% of transcript tokens and at least 5 tokens.
- The short-tap cutoff is strictly less than 500 ms.
- The hallucination blocklist is normalized exact full-transcript matching only.
- No-speech never reaches evaluation, scoring, transcript persistence, conversation generation, or progression.
- Preserve the dirty main checkout and the protected port-3200 dynamic-dialogue worktree.
- Use unit/source-string tests only; never call the paid provider in tests.

## Done checks

- [x] Design approved by user.
- [x] Isolated `codex/whisper-silence-guard` worktree created.
- [x] Clean baseline verified: 85 test files passed; 774 tests passed; 4 skipped.
- [x] Design spec written and self-reviewed.
- [x] User approved the written design spec on 2026-07-20.
- [x] Detailed implementation plan written.
- [ ] User approves the detailed implementation plan.
- [ ] Domain, adapter, and orchestration tests fail for the intended reasons before implementation.
- [ ] Minimal implementation makes focused tests pass.
- [ ] Full Vitest, typecheck, and lint gates pass.
- [ ] Task archived after completion.

## Current position

The approved design is recorded in `docs/superpowers/specs/2026-07-20-whisper-silence-guard-design.md`. The implementation plan is recorded in `docs/superpowers/plans/2026-07-20-whisper-silence-guard.md`. Next: user reviews and approves the plan; do not implement before that approval.
