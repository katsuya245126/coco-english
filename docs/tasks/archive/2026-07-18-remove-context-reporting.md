# Remove Context Reporting from Workflow Skills

**Status:** Complete
**Stage:** Complete

## Goal

Remove unhelpful context-usage reporting from the shared `task-workflow` and `progress` skill contracts.

## Scope

- Update the two canonical global skill files.
- Preserve all unrelated workflow behavior and repository changes.
- Verify Claude's symlinked skill paths inherit the change.

## Non-goals

- Application behavior changes.
- Conditional or replacement context reporting.
- Changes to model routing or context-compaction guidance.

## Done checks

- [x] `task-workflow` no longer requires a context action or `/context`/`/status` reminder.
- [x] `progress` no longer includes a `Context` report field.
- [x] Remaining `progress` fields are correctly ordered and numbered.
- [x] Canonical and Claude discovery skill paths pass structural validation.
- [x] Unrelated changes remain untouched.

## Verification evidence

- The pre-edit search found exactly one obsolete report-contract reference in each canonical skill.
- The post-edit search found no `context action`, `/context`, `/status`, `Context` field, or `exposed usage` references across the two canonical and two Claude discovery paths.
- Offline Ruby structural validation equivalent to `quick_validate.py` passed for all four skill paths.
- Both Claude skill directories remain symlinks to `../../.agents/skills/<skill>`.
- `git diff --check` passed after implementation.
- `npm test -- --run` passed after implementation: 81 test files passed; 713 tests passed and 4 were skipped.

## Current position

Context reporting has been removed from both canonical workflow contracts. Claude inherits the changes through its existing symlinks.

## Next action

Start the next Coco English feature through `task-workflow` when needed.
