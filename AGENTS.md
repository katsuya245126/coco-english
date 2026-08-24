# Coco English Agent Instructions

## Start here

- Read `PROJECT.md` for stable product and architecture context.
- Read root `TASK.md` when it exists for the one active feature.
- Treat code, tests, and Git as stronger evidence than status prose.
- Preserve unrelated working-tree changes.

## Workflow

- Use the lightweight `task-workflow` and `progress` skills as the operational entrypoints for normal or consequential building, fixing, planning, or investigation.
- Use the globally installed read-only `progress` skill when asked for feature status or the next action.
- Tiny obvious maintenance may proceed without `TASK.md` when it has no product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect.
- Require user plan approval for consequential work defined by `task-workflow`.
- Keep one active `TASK.md` per checkout or worktree; keep completed or paused task notes in GitHub issues/PRs or ignored `docs/local/` rather than requiring archive files in the repository.
- Commit stable product, architecture, security, and operational documentation; keep implementation plans and task-history notes local.
- On worktree creation or takeover, verify that `TASK.md` matches the current branch and working tree. Replace, pause, or explicitly mark an inherited unrelated task inactive before reporting progress.
- Reuse discovered specialist skills for brainstorming, planning, debugging, test-first implementation, review, verification, and handoff.

### Workflow phases for Codex

For each normal or consequential task, read `PROJECT.md`, the active `TASK.md`, and Git status; state the desired outcome, scope, non-goals, assumptions, done checks, and verification evidence before editing. Classify the work, preserve unrelated changes, and never skip the plan-approval gate for consequential work.

Route the work by phase:

| Phase | Action |
| --- | --- |
| Idea or decisions unsettled | Interview until the decision is clear; record resolved terms in `CONTEXT.md` and relevant `docs/adr/` files. |
| Design needs runnable proof | Build the smallest throwaway prototype, keep the findings, and remove the prototype when done. |
| Settled multi-session build | Record the spec and checks in `TASK.md`; create independent GitHub issues using `docs/agents/issue-tracker.md`, then work blockers-first. |
| One behavior to build | Write the smallest failing test, implement the minimal change, run the narrowest check, and review the diff. |
| Broken, flaky, or regressed behavior | Reproduce and minimize it, add a regression check, instrument only as needed, then fix the root cause. |
| Incoming request not created by this repo's planning flow | Triage it, verify the evidence, and apply the labels in `docs/agents/triage-labels.md`. |
| Effort too large or unclear for one session | Write a decision map in `TASK.md`, identify blockers, and return to a settled spec before implementation. |
| Diff, branch, or PR review | Check both the requested behavior and project standards; run proportionate verification before reporting findings. |

Use available specialist skills for these phases when present; otherwise perform the same work directly with the repository's files, tests, Git, and `gh` CLI. This routing is advisory and never replaces the repository's ownership, safety, verification, or plan-approval rules.

## Safety and scope

- Keep server-owned assignment and attempt state transitions auditable.
- Every service-role query or mutation involving teachers, students, assignments, attempts, or audio must independently prove ownership server-side. UI reachability and caller-supplied IDs are never authorization.
- Preserve mission snapshots, ownership checks, RLS, and per-turn audio storage.
- Generate signed audio playback URLs on demand for teacher review; never expose stored audio through public URLs.
- Keep teacher review transcript-first and Coco bounded rather than open-ended.
- When changing mission evaluation, progression, hints, TTS, or Coco generation, preserve the preset/conversation split. Conversation mode accepts relevant valid English, applies meaning-preserving corrections, skips preset success and transition narration, grounds follow-ups in owned attempt history, and never falls back to the original target-pattern hint. Preset behavior remains unchanged unless explicitly requested.
- Never commit reusable student access values or secrets.
- A private local class-reset maintenance tool may exist at `.superpowers/private-tools/reset-class-assignments/`. When asked to use it, read its local `AGENTS.md` and `README.md` first. Never stage, commit, push, publish, or copy its contents into tracked files. Applying its database migration, running a real preview, and executing a reset each require separate approval naming the exact environment and action.

## Verification

Run the narrowest relevant tests first, then typecheck, lint, and build in proportion to risk. Never claim an unrun check passed.

For deterministic student feedback screenshots, start the app on `http://localhost:3000`, provide `FEEDBACK_STATE_CLASS_CODE`, `FEEDBACK_STATE_STUDENT_NAME`, and `FEEDBACK_STATE_PIN`, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

## Usage efficiency

- Give subagents compact, task-specific prompts and the minimum history they need. Inherit full conversation history only when the task cannot be summarized safely.
- Reuse an existing subagent for follow-up work instead of spawning a replacement for the same scope.
- Run the narrowest relevant checks during implementation. Run the full unit suite once for the final commit state; rerun it only after the commit, working tree, environment, or relevant dependencies change.
- Verification evidence is identified by the checked commit and clean working tree. Do not rerun an unchanged verified commit solely to create a PR or repeat a status report unless an invoked skill explicitly requires it.
- Before formal review, check the final diff against the issue acceptance criteria and repository standards. Start formal parallel reviewers after that preflight so they normally review one final diff.
- Use `npm run test:agent` for full unit verification unless diagnosing a failure. Prefer non-interactive compact reporters and bounded tool output.
- Prefer targeted `rg`, file lists, and line ranges over dumping entire large files, diffs, or test logs.
- Usage efficiency never reduces security, authorization, privacy, data-loss prevention, accessibility, or explicitly requested verification.

## Local planning artifacts

- `docs/superpowers/specs/` and `docs/superpowers/plans/` are local-only; never commit them.

## Legacy planning records

The former GSD workflow has been retired in favor of the lightweight `task-workflow` and `progress` skills (see "Workflow" above). Its `.planning/` history is not an active source of truth. Do not recreate GSD state, hooks, or `.planning/`; use the issue tracker or local notes for any historical context.
