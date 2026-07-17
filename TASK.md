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

## Verification

Not run yet.

## Current position

Implementation plan approved; Task 1 in progress.

## Next step

Create and validate the shared context files.
