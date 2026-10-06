# Private class-reset tool

A private local class-reset maintenance tool may exist at `.superpowers/private-tools/reset-class-assignments/` (ignored by Git).

## Before use

Read the tool's local `AGENTS.md` and `README.md`.

## Guardrails

- Keep its contents local: never stage, commit, push, publish, or copy them into tracked files.
- Each of these needs its own user approval naming the exact environment and action:
  - applying its database migration,
  - running a real preview,
  - executing a reset.
