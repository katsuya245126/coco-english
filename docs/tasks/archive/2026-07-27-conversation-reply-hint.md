# Conversation Reply Hint

Status: Complete

## Goal

Add a hidden, one-frame reply hint for free-talking conversation questions. The lower recorder-area hint shows a dynamically generated answer frame for the exact Coco question on screen, separate from Coco speech-bubble translation hints.

## Scope

- Conversation-mode student question UI only.
- One simple frame, hidden by default, revealed by `Show hint` and hidden by `Hide hint`.
- Revealed card label is `Try:`.
- Frames keep learner-owned answer content blank.

## Non-Goals

- No schema changes.
- No teacher authoring UI changes.
- No multi-level hint ladder for conversation mode.
- No change to preset mission hint behavior.
- No change to Coco speech-bubble translation hint behavior.

## Completed

- [x] Added failing domain tests for generating blanked reply frames from Coco questions.
- [x] Added failing UI/source tests for conversation lower hint copy and separation from preset hints.
- [x] Implemented the minimal frame generator and render path.
- [x] Ran focused tests, typecheck, and lint.

## Verification

- `npm test -- --run tests/domain/reply-hint-frame.test.ts src/domain/mission/student-question-state.test.ts tests/domain/tts-ui-source.test.ts` passed.
- `npm run typecheck` passed.
- `npm run lint` exited 0 with one unrelated pre-existing warning in `scripts/check-student-feedback-states.mjs`.

## Policy Refactor

- Replaced prompt-by-prompt reply frame fixes with a policy-based frame builder.
- Broad `what` object questions now drop optional context so frames stay short.
- `who`, `where`, and `when` questions preserve enough context for the blank to answer the WH function.
- Unsupported or low-confidence prompts return `null`, hiding the lower reply hint rather than showing a misleading scaffold.
