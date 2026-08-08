# Claude Code

Follow `AGENTS.md`, `PROJECT.md`, and the active `TASK.md`.

Global personal skills:

- `/task-workflow` starts, resumes, or routes development work.
- `/progress` reports read-only feature status and the next action.

Claude may trigger either skill automatically from its description. Detailed, subscription-aware model guidance lives in `docs/ai/model-routing.md` and should be loaded only when recommending a model. That dated note supersedes older local setup notes when current model names or benchmark guidance differ.

When handing work off, state the exact checkout or worktree, branch, dirty files, completed verification, next step, recommended model/tool, and exact command. Verify the handoff narrative against Git and repository instructions. Do not merge merely to simplify a handoff; integration requires its own approval and readiness checks.

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues (`gh` CLI) in `katsuya245126/coco-english`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
