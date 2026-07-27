# Final Closing Translation Hint

**Status:** Complete
**Classification:** Normal
**Started:** 2026-07-27

## Desired Outcome

Show the Hint button for Coco's final conversation closing line, using the
same persisted `coco_dynamic_line` descriptor already used for closing TTS.

## Scope

- Student mission dialogue translation-line wiring.
- Static source tests around closing hint availability.

## Non-Goals

- No change to recording, completion, TTS, translation route authorization, or
  preset hint ladders.

## Plan

- [x] Add failing source tests for closing translation hints.
- [x] Pass a translation descriptor during `flow.step === "closing"`.
- [x] Run focused verification, typecheck, lint, build, and diff check.
- [x] Archive this task as complete.

## Verification

- `npm test -- tests/domain/tts-ui-source.test.ts tests/server/student-mission-flow.test.ts --run` passed.
- `npm test -- tests/domain/translation-hint.test.ts tests/server/translation-hint-generator.test.ts tests/server/translation-hint-cache.test.ts tests/server/translation-hint-route-source.test.ts --run` passed.
- `npm run typecheck` passed.
- `npm run lint` passed with the existing warning in
  `scripts/check-student-feedback-states.mjs:435`.
- `npm run build` passed.
- `git diff --check` passed.
