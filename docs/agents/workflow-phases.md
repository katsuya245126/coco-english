# Workflow phases

Read this when routing development work, managing `TASK.md`, scoping verification, or dispatching subagents. Approval guardrails in `AGENTS.md` and code rules in `CODING_STANDARDS.md` still apply.

| Phase | Action |
| --- | --- |
| Idea or decisions unsettled | Interview until the decision is clear; record settled terms in `GLOSSARY.md` and relevant `docs/adr/` files. |
| Design needs runnable proof | Build the smallest throwaway prototype, keep the findings, and remove the prototype when done. |
| Settled multi-session build | Record the spec and checks in `TASK.md`; create independent GitHub issues using `docs/agents/issue-tracker.md`, then work blockers-first. |
| One behavior to build | Write the smallest failing test, implement the minimal change, run the narrowest check, and review the diff. |
| Broken, flaky, or regressed behavior | Reproduce and minimize it, add a regression check, instrument only as needed, then fix the root cause. |
| Incoming request not created by this repo's planning flow | Triage it, verify the evidence, and apply the labels in `docs/agents/triage-labels.md`. |
| Effort too large or unclear for one session | Write a decision map in `TASK.md`, identify blockers, and return to a settled spec before implementation. |
| Diff, branch, or PR review | Check both the requested behavior and project standards; run proportionate verification before reporting findings. |

For status or the next action, use the available read-only `progress` skill. If a specialist is unavailable, perform the equivalent workflow directly.

## Conduct

- Tiny maintenance (none of the consequential effects listed in `AGENTS.md`) needs no task file or workflow tour. Other work runs through the `task-workflow` skill.
- For normal or consequential work, briefly establish outcome, scope, non-goals, assumptions, done checks, and verification evidence, then choose the reading and execution needed to meet those checks.
- Treat code, tests, and Git as stronger evidence than status prose.
- Ask only when a missing fact materially changes scope, behavior, safety, ownership, or acceptance. A first draft is not completion; stop when the agreed checks pass or a concrete blocker needs the user.
- Invoke named skills yourself; if a skill requires a pause, link its `SKILL.md`, quote the rule, and explain why it applies. Advisory guidance creates no extra approval gate.
- Answer side questions while continuing the active task unless the user cancels or replaces it.

## Verification

- Run the narrowest relevant tests first, then typecheck, lint, and build in proportion to risk. Prefer E2E verification on the final diff; run the full unit suite (`npm run test:agent`, unless diagnosing a failure) only when relevant to the change or explicitly required.
- Documentation-only changes: check the diff, referenced paths, and instruction consistency; application tests are unnecessary unless executable behavior or an explicit requirement is affected.
- Identify verification evidence by the checked commit and working-tree state. Repeat or broaden checks only for relevant changes, failures, unresolved concerns, or explicit requirements; a commit alone does not invalidate checks of identical file contents.
- Efficiency never reduces security, authorization, privacy, data-loss prevention, accessibility, or explicitly requested verification.
- Before formal review, check the final diff against the issue acceptance criteria and `CODING_STANDARDS.md`. Start formal parallel reviewers after that preflight so they normally review one final diff.
- After formal Standards + Spec review, rerun affected tests and typecheck for accepted fixes; do not rerun review subagents for small localized changes unless behavior or scope materially changes or the prior review missed relevant files. Use a targeted manual check instead.

## Task state

- Check root `TASK.md` when starting or resuming feature work, or when edits may overlap an active task.
- Keep one active `TASK.md` per checkout.
- On takeover, confirm it matches the branch and working tree; preserve unrelated work and pause only for overlapping ownership conflicts.
- Keep completed or paused history local in ignored `docs/local/`, or in issues/PRs when authorized; stable documentation belongs in Git.

## Subagents

- Give subagents compact, task-specific prompts and the minimum history they need. Inherit full conversation history only when the task cannot be summarized safely.
- Send follow-up work for the same scope to the existing subagent rather than spawning a replacement.
