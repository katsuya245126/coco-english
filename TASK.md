# Reliable UAT worktree labels

**Status:** Implementation plan awaiting approval

## Goal

Make `npm run uat` identify descriptive worktrees from their branch purpose while using task or commit metadata only for generated and detached worktrees, so a restored inherited `TASK.md` cannot mislabel a completed feature.

## Scope

- Use cleaned descriptive branches as stable menu labels.
- Use a distinct non-main task, then latest commit, for generated or detached worktrees.
- Keep `Main` first and `Exit` last.
- Make the worktree comparator reflexive.
- Prove invalid input skips every preflight and launch dependency.

## Non-goals

- A manual label registry or general task-ownership schema.
- New duplicate-label collision handling.
- Worktree removal, renaming, unlocking, or cleanup.
- Changes to port 3200, ngrok, Next.js, or application behavior.

## Constraints

- Preserve Git porcelain parsing, checkout provenance, preflight, and launch behavior.
- Read only root `TASK.md`; never read environment-file contents or secrets.
- Preserve unrelated working-tree changes.
- Do not push, merge, deploy, publish, or modify production without explicit permission.

## Done Checks

- [x] Corrective design is approved and committed.
- [x] Test-first implementation plan is written.
- [ ] Implementation plan is approved.
- [ ] `codex/uat-menu-labels` renders as `UAT menu labels` despite an inherited main task.
- [ ] Generated and detached labels follow the approved fallback order.
- [ ] Comparator equality and invalid-selection preflight skipping have regression tests.
- [ ] Focused tests, full tests, typecheck, lint, Exit smoke, and checkout smoke pass.

## Plan

1. Correct pure worktree classification, cleanup, and sorting behavior.
2. Compare generated-worktree task ownership against main in the runtime.
3. Run whole-feature verification and record exact evidence.

## Current Position

The corrective design and implementation plan are written. Next: user selects an execution approach and approves implementation.
