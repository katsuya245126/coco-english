# Lightweight Agent Workflow Rollout

**Status:** Implementation
**Stage:** Planning complete; implementation not started

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

- [ ] Root project context is concise and current.
- [ ] `task-workflow` passes baseline, structural, and behavior checks.
- [ ] `progress` passes baseline, structural, read-only, and behavior checks.
- [ ] Claude Code discovers `/task-workflow` and `/progress`.
- [ ] Codex discovers `$task-workflow` and `$progress`.
- [ ] Mandatory GSD enforcement is removed from active instructions.
- [ ] `.planning/` and unrelated work remain unchanged.

## Plan and checklist

Follow `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md` task by task.

## Decisions

- `.agents/skills/` is canonical; `.claude/skills/` contains thin discovery wrappers.
- Model routing is dated, on-demand guidance rather than always-on instruction.
- GSD remains installed and available only when explicitly requested.
- `task-workflow` RED baseline: missing behaviors 1, 3, 4, and 5. Exact baseline wording: “I’d pause the deletion implementation long enough to define the minimum safe boundary: which accounts, who can delete them, whether deletion is reversible, and what data must be retained or anonymized. Bulk student deletion is irreversible and directly affects privacy, so ‘permissions later’ is not a safe assumption. I’d tell the user: ‘I can implement this quickly, but I need to include basic authorization, explicit selection/confirmation, audit logging, and a clear handling policy for associated recordings and class data. Otherwise any user could accidentally or improperly erase student records. I’ll keep the scope tight and avoid unrelated changes.’”

## Verification

- `task-workflow`: RED baseline recorded; canonical and Claude wrapper validators passed; GREEN scenario passed all five behaviors.

## Current position

`task-workflow` complete; `progress` is next.

## Next step

Run the `progress` baseline and implement the read-only status contract.
