# Claude Code

Follow `AGENTS.md`, `PROJECT.md`, and the active `TASK.md`.

Global personal skills:

- `/task-workflow` starts, resumes, or routes development work.
- `/progress` reports read-only feature status and the next action.

Claude may trigger either skill automatically from its description. Detailed, subscription-aware model guidance lives in `docs/ai/model-routing.md` and should be loaded only when recommending a model. That dated note supersedes older local setup notes when current model names or benchmark guidance differ.

Use `/context` to inspect context, `/compact` to continue the same task with a smaller history, and `/clear` before unrelated work. Around 70%, finish the current milestone and compact or hand off. Never guess context usage.

Until the active workflow rollout's manual verification matrix passes, use the GSD entrypoints for normal or consequential work; explicit `/task-workflow` and `/progress` commands remain available to validate the replacement. After the matrix passes, GSD becomes optional backup and is used only when explicitly requested.

When handing work off, state the next step, recommended model/tool, and exact command; preserve branch hygiene by merging to `main`, syncing state files when GSD was explicitly used, and running relevant tests before switching tools.
