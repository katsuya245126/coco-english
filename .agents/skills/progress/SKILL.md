---
name: progress
description: Use when the user asks where a feature or project stands, what is complete, what remains, what is blocked, or what to do next.
---

# Progress

This skill is read-only. Do not edit files, update status, stage changes, commit, or start implementation. Do not propose writes or status updates; the next action must be a read-only inspection or verification step.

## Inspect

1. Read root `TASK.md` when present.
2. Inspect `git status --short --branch`, recent relevant commits, and a targeted diff summary.
3. Inspect code or test files only when needed to check a claimed milestone. Do not run tests unless the user also asks for verification.
4. Read `PROJECT.md` for stable context.
5. If no lightweight task exists during migration, optionally read `.planning/STATE.md` and `.planning/ROADMAP.md`; label them `Legacy source` and lower confidence.

Code, tests, and Git outrank status prose. Call out contradictions.

## Report

Return these fields in this order:

1. **Feature** and **stage**: discovery, planning, awaiting approval, implementation, verification, review, blocked, or complete.
2. **Completed**.
3. **In progress**.
4. **Remaining**.
5. **Blockers/risks**.
6. **Git state**.
7. **Verification**: include only recorded or observed evidence.
8. **Context**: report exposed usage or say to run Claude `/context` or Codex `/status`; never estimate it.
9. **Next action**: exactly one concrete action.
10. **Recommendation**: platform, model, effort, one reason, and escalation condition from `docs/ai/model-routing.md`.

Show a percentage only when an explicit checklist makes it calculable. Prefer `3/8 checks complete` to subjective estimates. If evidence is missing or contradictory, state confidence as low and explain why.

Default to the active feature. Give a project-wide view only when the user requests it. If no active task exists, say so and recommend starting one through `task-workflow`.
