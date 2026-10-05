# Workflow phases

Read this table when routing development work. Repository ownership, permission, and verification rules still apply.

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

## Review and verification evidence

- Identify verification evidence by the checked commit and working-tree state. Repeat checks on an unchanged verified commit only for new concerns or an explicit skill requirement.
- Before formal review, check the final diff against the issue acceptance criteria and repository standards. Start formal parallel reviewers after that preflight so they normally review one final diff.
- After formal Standards + Spec review, rerun affected tests and typecheck for accepted fixes; do not rerun review subagents for small localized changes unless behavior or scope materially changes or the prior review missed relevant files. Use a targeted manual check instead.
