# Human-readable UAT menu labels and Exit

**Status:** Planned; awaiting execution choice

## Goal

Make `npm run uat` identify worktrees by purpose and provide a successful Exit option that never starts preflight or a server.

## Scope

- Resolve labels from `TASK.md`, latest commit subject, or cleaned branch/directory names.
- Keep `Main` first and put `Exit` last.
- Preserve branch, path, commit, and URL provenance after checkout selection.
- Test label fallbacks, duplicate handling, Exit, and unchanged launch behavior.

## Non-goals

- Manual label configuration.
- Worktree management from the launcher.
- Port, ngrok, application, or `npm run dev` changes.

## Done checks

- [x] Design approved and committed.
- [x] Test-first implementation plan written.
- [ ] Focused tests pass.
- [ ] Full tests, typecheck, and lint pass.
- [ ] Interactive Exit and checkout smoke checks pass.
- [ ] Task is archived and the inherited main task brief is restored before integration.

## Current position

The design and implementation plan are ready. Next: choose an execution approach.
