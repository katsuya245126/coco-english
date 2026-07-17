# Lightweight Agent Workflow Rollout

**Status:** Verification
**Stage:** Verification; live discovery and behavior matrix pending

## Goal

Install and validate the approved lightweight workflow for Codex and Claude Code while preserving GSD as the operational fallback until live verification passes.

## Context

The approved design is `docs/superpowers/specs/2026-07-17-lightweight-agent-workflow-design.md`. The executable plan is `docs/superpowers/plans/2026-07-17-lightweight-agent-workflow.md`.

## Constraints

- Preserve unrelated working-tree changes.
- Do not modify `.planning/` or global GSD skills.
- Validate each canonical skill before activating it.
- Keep Claude and Codex behavior sourced from the same canonical procedures.
- Until the manual matrix below passes, use GSD as the mandatory operational entrypoint for normal or consequential work; explicit `$task-workflow`, `$progress`, `/task-workflow`, and `/progress` remain available for validation.

## Non-goals

- Changing Coco English application behavior.
- Cleaning up historical GSD records.
- Installing the workflow globally for every project.

## Completed implementation checklist

- [x] Root project context is concise and current.
- [x] Task 1 established the stable context and dated routing reference.
- [x] Task 2 established and structurally/behaviorally validated the canonical global `task-workflow` skill and Claude discovery link.
- [x] Task 3 established and structurally/read-only validated the canonical global `progress` skill and Claude discovery link.
- [x] Task 4 installed the cross-platform global skills and retained GSD as the verification fallback.
- [x] Task 5 recorded structural, behavior, test, and preservation evidence without changing `.planning/` or application files.
- [x] Signed audio playback and subscription-aware model-routing guidance are present in active project instructions.

## Manual-pending verification matrix

- [ ] Claude Code discovers and invokes `/task-workflow` and `/progress`.
- [ ] Codex discovers and invokes `$task-workflow` and `$progress`.
- [ ] Natural-language build, fix, investigate, and plan requests auto-trigger the relevant skill in each tool without a repeated setup prompt.
- [ ] `task-workflow` handles tiny, normal, and consequential requests with the intended approval boundary.
- [ ] `progress` reports an active task, a completed task, no task, and deliberately inconsistent task/Git evidence without writing.
- [ ] Model recommendations include platform, model, effort, reason, and escalation condition; context guidance never invents usage.
- [ ] Subagent guidance prevents recursion and overlapping edits in a live run.

## Verification evidence

- Structural validators for both canonical global skills and the Claude global links passed.
- Recorded behavior fixtures passed, `git diff --check` passed, and `npm test -- --run` passed (81 files; 713 passed, 4 skipped).
- Claude Code discovery is manual-pending because the local CLI reported `Not logged in · Please run /login`.
- Codex discovery is manual-pending because the sandboxed CLI could not initialize `~/.codex/state_5.sqlite`, and an unsandboxed retry was denied by policy.
- `.planning/` and unrelated working-tree changes remain untouched.

## Current position

Implementation is complete. The rollout remains in verification until the manual discovery and behavior matrix passes; GSD is the operational fallback for normal or consequential work during this gate.

## Next action

Run the manual discovery and behavior matrix from a fresh authenticated Claude Code and Codex session, using `$progress`, `$task-workflow`, `/progress`, and `/task-workflow`, then record each unchecked result above.
