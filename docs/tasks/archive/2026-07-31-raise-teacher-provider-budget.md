# Raise Teacher Provider Budget

**Status:** Complete

**Class:** Consequential — provider-cost exposure

## Decision

The owner approved raising the shared `teacher_provider` budget from 10 to 50
requests per 10-minute fixed window on 2026-07-31.

## Result

- Changed only `teacher_provider.requestLimit` from 10 to 50.
- Preserved `student_audio` 24/600s, `student_helper` 60/600s, and
  `evaluator_warmup` 1/90s.
- Added a focused regression proving the RPC receives
  `p_request_limit: 50` and `p_window_seconds: 600`.
- Updated the design, implementation plan, and completed feature record.
- No push, deployment, remote migration, production mutation, or paid-provider
  call occurred.

## TDD evidence

- Red: the new teacher-quota regression failed because the RPC received 10.
- Green: the same regression passed after the one-line runtime change to 50.

## Verification

- Focused quota and teacher-action tests: 33 passed.
- Full Vitest: 114 files, 1,468 passed, 10 skipped.
- Typecheck: passed.
- Lint: 0 errors and one unrelated pre-existing warning at
  `scripts/check-student-feedback-states.mjs:435`.
- Build and ffmpeg postbuild: passed.
- `git diff --check`: passed.

## Follow-up

Observe real teacher authoring behavior after release before changing or
splitting the shared bucket again.
