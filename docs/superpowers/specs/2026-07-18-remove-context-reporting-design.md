# Remove Context Reporting from Workflow Skills

**Status:** Approved for planning
**Date:** 2026-07-18

## Goal

Remove the repetitive context-usage output from the shared `task-workflow` and `progress` reporting contracts. Neither skill should tell users that usage is unavailable or suggest running Claude `/context` or Codex `/status`.

## Scope

- Remove `context action` and the `/context` and `/status` sentence from the `task-workflow` report contract.
- Remove the `Context` field from the ordered `progress` report contract.
- Renumber the remaining `progress` fields so `Next action` and `Recommendation` follow `Verification` directly.
- Edit only the canonical files under `~/.agents/skills/`. Claude's `~/.claude/skills/` symlinks inherit those edits automatically.

## Non-goals

- Changing inspection behavior, task classification, model routing, verification, or context-compaction guidance.
- Adding conditional context reporting or a replacement status field.
- Changing project application code.

## Verification

- Search all four canonical and Claude discovery paths and confirm no report-contract references to `Context`, `/context`, `/status`, `context action`, or exposed usage remain.
- Validate both canonical skills and both Claude discovery paths structurally.
- Confirm the Claude paths remain symlinks to the canonical skills.
