# Lightweight Agent Workflow Rollout

**Status:** Implementation complete; manual verification pending
**Stage:** Complete pending live discovery and behavior matrix

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

## Completed task checklist

- [x] Root project context is concise and current.
- [x] Task 1 established the stable context and dated routing reference.
- [x] Task 2 established and structurally/behaviorally validated the canonical `task-workflow` skill and wrappers.
- [x] Task 3 established and structurally/read-only validated the canonical `progress` skill and wrappers.
- [x] Task 4 activated the workflow and removed mandatory GSD enforcement from active instructions.
- [x] Task 5 archived the rollout, recorded evidence, and preserved `.planning/` and unrelated work.
- [x] Mandatory GSD enforcement is removed from active instructions.
- [x] `.planning/` and unrelated work remain unchanged.

## Manual-pending verification matrix

The implementation is complete, but live tool discovery and end-to-end behavior are not claimed as verified in this environment. Run these checks from the repository root after authenticating/configuring each CLI:

- [ ] Claude Code discovers and invokes `/task-workflow` and `/progress`.
- [ ] Codex discovers and invokes `$task-workflow` and `$progress`.
- [ ] `task-workflow` handles tiny, normal, and consequential requests with the intended approval boundary.
- [ ] `progress` reports an active task, a completed task, no task, and deliberately inconsistent task/Git evidence without writing.
- [ ] Model recommendations include platform, model, effort, reason, and escalation condition; context guidance never invents usage.
- [ ] Subagent guidance prevents recursion and overlapping edits in a live run.

The recorded checks passed locally: structural validators, behavior fixtures, `git diff --check`, and `npm test -- --run`. Claude Code reported `Not logged in`; Codex could not initialize its state database in the sandbox and an unsandboxed retry was denied by policy. These are the remaining discovery blockers, not implementation failures.

## Plan and checklist

Follow `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md` task by task.

## Decisions

- `.agents/skills/` is canonical; `.claude/skills/` contains thin discovery wrappers.
- Model routing is dated, on-demand guidance rather than always-on instruction.
- GSD remains installed and available only when explicitly requested.
- `task-workflow` RED baseline: missing behaviors 1, 3, 4, and 5. Exact baseline wording: “I’d pause the deletion implementation long enough to define the minimum safe boundary: which accounts, who can delete them, whether deletion is reversible, and what data must be retained or anonymized. Bulk student deletion is irreversible and directly affects privacy, so ‘permissions later’ is not a safe assumption. I’d tell the user: ‘I can implement this quickly, but I need to include basic authorization, explicit selection/confirmation, audit logging, and a clear handling policy for associated recordings and class data. Otherwise any user could accidentally or improperly erase student records. I’ll keep the scope tight and avoid unrelated changes.’”
- `progress` RED baseline: missing behaviors 5 and 6. Exact baseline wording: “Status: implementation appears in progress, not complete. Evidence: uncommitted implementation files remain; the most recent test failed; only 3 of 8 checklist items are complete. No context-usage figure is available. Next: review the failed test, fix and rerun it, complete or explicitly defer the remaining checklist items, then commit the verified implementation.” It omitted model, effort, reason, and escalation condition, and proposed fixes, checklist changes, and a commit while reporting.

## Verification evidence

- Both canonical skills passed structural validation and recorded behavior scenarios.
- Both Claude wrappers passed structural validation. Claude Code discovery smoke tests are manual-pending because Claude Code reported `Not logged in · Please run /login`.
- `progress` produced no working-tree changes in its recorded behavior test; the Task 5 CLI attempts also left the working tree unchanged.
- Codex discovery smoke tests are manual-pending because the sandboxed CLI could not initialize `~/.codex/state_5.sqlite`, and an unsandboxed retry was denied by policy.
- `.planning/` and unrelated working-tree changes remained untouched.

Manual discovery commands from the repository root:

```text
$progress
$task-workflow What should happen after this workflow rollout is verified?
/progress
/task-workflow What should happen after this workflow rollout is verified?
```

## Current position

Implementation is complete and the lightweight workflow is active; live discovery and the full behavior matrix remain manual-pending. GSD remains optional backup.

## Next step

Create a fresh root `TASK.md` through `task-workflow` for the next Coco English feature.
