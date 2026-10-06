# Coco English Agent Instructions

## Guardrails

- Keep secrets and reusable student access values out of Git.
- Keep `.superpowers/private-tools/` and `docs/superpowers/` local: never stage, commit, push, publish, or copy their contents into tracked files.
- Consequential work (any product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect) needs a concrete plan and user approval before implementation.

## Pointers

- **Product or architecture context:** `PROJECT.md`.
- **Writing or reviewing code, tests, migrations, or queries:** `CODING_STANDARDS.md`, the ownership, data-integrity, audio, and testing rules.
- **Changing mission evaluation, progression, hints, TTS, or Coco generation:** [mission modes](docs/agents/mission-modes.md), the preset/conversation split.
- **Development work, `TASK.md`, verification scope, or subagents:** [workflow phases](docs/agents/workflow-phases.md), the routing table and conduct rules.
- **Reset tool use:** [private reset tool](docs/agents/private-reset-tool.md), its approval gates.
