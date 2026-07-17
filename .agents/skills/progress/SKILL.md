---
name: progress
description: Use when the user asks where a feature or project stands, what is complete, what remains, what is blocked, or what to do next.
---

# Progress

This skill is strictly read-only. Do not edit files, update status, stage changes, commit, invoke another skill, or start implementation. You may recommend a user-run next action (including `$task-workflow`), but progress itself must not modify repository state.

## Inspect

1. Read root `TASK.md` when present.
2. Inspect `git --no-optional-locks status --short --branch`, recent relevant commits, and a targeted diff summary. If the platform lacks that flag, prefix Git commands with `GIT_OPTIONAL_LOCKS=0`.
3. Inspect code or test files only when needed to check a claimed milestone. Do not run tests unless the user also asks for verification.
4. Read `PROJECT.md` for stable context.
5. If no lightweight task exists during migration, optionally read `.planning/STATE.md` and `.planning/ROADMAP.md`; label them `Legacy source` and lower confidence.

Code, tests, and Git outrank status prose. Call out contradictions.

All inspection commands must be read-only. Do not run `git add`, `git commit`, `git checkout`, `git switch`, `git restore`, `git clean`, commands that update refs, or commands that write the index. Do not use a status command without `--no-optional-locks` (or `GIT_OPTIONAL_LOCKS=0`).

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

Default to the active feature. Give a project-wide view only when the user requests it. If no active task exists, say no task is tracked and ask which feature should be tracked next. The single next-action recommendation may be to invoke `$task-workflow` for that feature, but do not create or modify `TASK.md` or invoke `task-workflow` yourself.
