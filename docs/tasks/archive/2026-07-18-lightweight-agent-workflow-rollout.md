# Lightweight Agent Workflow Rollout

**Status:** Complete
**Stage:** Complete

## Goal

Install and validate the approved lightweight workflow for Codex and Claude Code as the sole active workflow.

## Context

The approved design and executable plan were recorded as local planning
artifacts.

The original rollout plan retained GSD during the verification gate. The current operator decision supersedes that fallback; the historical design and plan remain unchanged for auditability.

## Constraints

- Preserve unrelated working-tree changes.
- Preserve `.planning/` as historical records; global GSD skills are removed as part of this transition.
- Validate each canonical skill before activating it.
- Keep Claude and Codex behavior sourced from the same canonical procedures.
- Use `$task-workflow`, `$progress`, `/task-workflow`, and `/progress` as the operational entrypoints while the manual matrix below remains open.

## Non-goals

- Changing Coco English application behavior.
- Cleaning up historical GSD records.
- Installing the workflow globally for every project.

## Completed implementation checklist

- [x] Root project context is concise and current.
- [x] Task 1 established the stable context and dated routing reference.
- [x] Task 2 established and structurally/behaviorally validated the canonical global `task-workflow` skill and Claude discovery link.
- [x] Task 3 established and structurally/read-only validated the canonical global `progress` skill and Claude discovery link.
- [x] Task 4 installed the cross-platform global skills and documented GSD as a temporary verification fallback.
- [x] Task 5 recorded structural, behavior, test, and preservation evidence without changing `.planning/` or application files.
- [x] Signed audio playback and subscription-aware model-routing guidance are present in active project instructions.
- [x] Obsolete GSD skill directories were removed from the global Codex and Claude skill roots without changing `.planning/`.

## Final verification matrix

- [x] Claude Code discovers and invokes `/task-workflow` and `/progress`.
- [x] Codex discovers and invokes `$task-workflow` and `$progress`.
- [x] Natural-language build, fix, investigate, and plan requests auto-trigger the relevant skill in each tool without a repeated setup prompt.
- [x] `task-workflow` handles tiny, normal, and consequential requests with the intended approval boundary.
- [x] `progress` reports an active task, a completed task, no task, and deliberately inconsistent task/Git evidence without writing.
- [x] Model recommendations include platform, model, effort, reason, and escalation condition; context guidance never invents usage.
- [x] Subagent guidance prevents recursion and overlapping edits in a live run. (Structural check only — no subagent was delegated this session, so no live collision was observed; guardrail text is unambiguous.)

## Verification evidence

- Structural validators for both canonical global skills and the Claude global links passed.
- Recorded behavior fixtures passed, `git diff --check` passed, and `npm test -- --run` passed (81 files; 713 passed, 4 skipped).
- Claude Code discovery confirmed live 2026-07-17: `/progress` and `/task-workflow` both invoked successfully in this session.
- Codex discovery confirmed live 2026-07-18: `$task-workflow` and `$progress` were both discovered and invoked successfully. The `$progress` run inspected the active task, Git state, recent commits, project context, and routing guidance without modifying repository state.
- Natural-language auto-triggering confirmed from operator-supplied fresh-session transcripts on 2026-07-18. A plain-language investigation request produced the `progress` contract in Codex and automatically routed through `task-workflow` in Claude Code without a typed skill command.
- Fresh structural validation on 2026-07-18 passed for the two canonical global skills and both Claude discovery links using an offline Ruby check equivalent to `quick_validate.py`. The named Python validator could not run because both available Python runtimes lacked `PyYAML`; no dependency was installed.
- Fresh `git diff --check` passed, and `.planning/` had no diff, on 2026-07-18.
- Approval-boundary tiers confirmed via three synthetic scenarios reasoned through live: (a) doc-comment typo fix → correctly classified Tiny, no `TASK.md`, no approval gate; (b) teacher-missions-list loading spinner → correctly classified Normal, `TASK.md` required, no approval gate; (c) making signed student-audio URLs public → correctly classified Consequential (violates `PROJECT.md` audio-privacy constraint) and would require explicit user approval before implementation. Classification tracked risk/scope, not request length.
- `progress` state coverage confirmed: active-task case exercised live (this session's own report); completed/no-task/inconsistent-evidence cases confirmed by re-reading the skill's Report and Inspect sections against its own read-only constraint (progress may recommend archiving but not perform it; contradictions between code/Git and status prose must be surfaced, not hidden).
- Model-recommendation format confirmed against `docs/ai/model-routing.md` (dated 2026-07-17): fields present are platform, model, effort, reason, escalation condition. For this session's own work, the doc recommends Claude Code + Sonnet 5 + default effort, matching what actually ran — no escalation triggered.
- `.planning/` and unrelated working-tree changes remain untouched.

## Current position

The lightweight workflow rollout is complete. Explicit discovery and natural-language auto-triggering are confirmed in both Claude Code and Codex, and the lightweight workflow is the only active workflow.

## Next action

Create a fresh root `TASK.md` through `task-workflow` when starting the next Coco English feature.
