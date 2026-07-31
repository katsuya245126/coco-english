# Stop charging teacher authoring saves against the AI budget

**Status:** Complete

## Result

Mission creation and updates no longer consume the `teacher_provider` budget.
Premise generation, opener generation, assignment TTS warm-up, and pronunciation
reprocessing remain budgeted.

## Verification

- Red: the focused action test failed for create and update while each still
  called the budget gate.
- Green: `npm test -- --run tests/server/teacher-provider-budget-actions.test.ts tests/server/request-budget.test.ts` — 23 passed.
- `npm run typecheck` — passed.
- `git diff --check` — passed.
