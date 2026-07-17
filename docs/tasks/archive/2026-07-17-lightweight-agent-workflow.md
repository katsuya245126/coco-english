# Lightweight Agent Workflow Rollout

**Status:** Complete
**Stage:** Complete

## Goal

Install and validate the approved lightweight workflow for Codex and Claude Code while preserving GSD as backup.

## Context

The approved design is `docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md`. The executable plan is `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md`.

## Constraints

- Preserve unrelated working-tree changes.
- Do not modify `.planning/` or global GSD skills.
- Validate each canonical skill before activating it.
- Keep Claude and Codex behavior sourced from the same canonical procedures.

## Non-goals

- Changing Coco English application behavior.
- Cleaning up historical GSD records.
- Installing the workflow globally for every project.

## Done when

- [x] Root project context is concise and current.
- [x] `task-workflow` passes baseline, structural, and behavior checks.
- [x] `progress` passes baseline, structural, read-only, and behavior checks.
- [x] Claude Code has project-local `/task-workflow` and `/progress` discovery wrappers. Live discovery is a manual verification because the local CLI is not logged in.
- [x] Codex has project-local `$task-workflow` and `$progress` canonical skills. Live discovery is a manual verification because the isolated CLI cannot initialize its state database.
- [x] Mandatory GSD enforcement is removed from active instructions.
- [x] `.planning/` and unrelated work remain unchanged.

## Plan and checklist

Follow `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md` task by task.

## Decisions

- `.agents/skills/` is canonical; `.claude/skills/` contains thin discovery wrappers.
- Model routing is dated, on-demand guidance rather than always-on instruction.
- GSD remains installed and available only when explicitly requested.
- `task-workflow` RED baseline: missing behaviors 1, 3, 4, and 5. Exact baseline wording: “I’d pause the deletion implementation long enough to define the minimum safe boundary: which accounts, who can delete them, whether deletion is reversible, and what data must be retained or anonymized. Bulk student deletion is irreversible and directly affects privacy, so ‘permissions later’ is not a safe assumption. I’d tell the user: ‘I can implement this quickly, but I need to include basic authorization, explicit selection/confirmation, audit logging, and a clear handling policy for associated recordings and class data. Otherwise any user could accidentally or improperly erase student records. I’ll keep the scope tight and avoid unrelated changes.’”
- `progress` RED baseline: missing behaviors 5 and 6. Exact baseline wording: “Status: implementation appears in progress, not complete. Evidence: uncommitted implementation files remain; the most recent test failed; only 3 of 8 checklist items are complete. No context-usage figure is available. Next: review the failed test, fix and rerun it, complete or explicitly defer the remaining checklist items, then commit the verified implementation.” It omitted model, effort, reason, and escalation condition, and proposed fixes, checklist changes, and a commit while reporting.

## Verification

- Both canonical skills passed structural validation and recorded behavior scenarios.
- Both Claude wrappers passed structural validation. Claude Code discovery smoke tests are ⚠️ manual because Claude Code reported `Not logged in · Please run /login`.
- `progress` produced no working-tree changes in its recorded behavior test; the Task 5 CLI attempts also left the working tree unchanged.
- Codex discovery smoke tests are ⚠️ manual because the sandboxed CLI could not initialize `~/.codex/state_5.sqlite`, and an unsandboxed retry was denied by policy.
- `.planning/` and unrelated working-tree changes remained untouched.

Manual discovery commands from the repository root:

```text
$progress
$task-workflow What should happen after this workflow rollout is verified?
/progress
/task-workflow What should happen after this workflow rollout is verified?
```

## Current position

The lightweight workflow is active and GSD remains optional backup.

## Next step

Create a fresh root `TASK.md` through `task-workflow` for the next Coco English feature.
