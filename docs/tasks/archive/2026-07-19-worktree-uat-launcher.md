# Worktree-aware UAT launcher

**Status:** Complete

## Goal

Add a reusable `npm run uat` command that lets the user select `main` or any Coco English worktree and serves it on port 3200 for a persistent ngrok phone-testing workflow.

## Scope

- Discover checkouts through Git worktree porcelain output.
- Require an explicit numbered selection.
- Print branch, path, commit, and UAT URL before launch.
- Refuse an occupied port or active Next.js development lock.
- Warn, without reading contents, when `.env.local` is absent.

## Non-goals

- Managing ngrok, Git branches, worktrees, caches, dependencies, secrets, or unrelated processes.
- Changing `npm run dev` or application behavior.

## Done Checks

- [x] Pure discovery and selection tests pass.
- [x] Runtime preflight and CLI tests pass.
- [x] `npm run uat` can serve a selected worktree and `main` on port 3200.
- [x] Typecheck, lint, and proportionate project tests pass.

## Verification results (2026-07-19)

- Entrypoint regression RED: the real CLI received `999\n` but exited with code 13
  before reporting the invalid selection.
- Entrypoint regression GREEN: `npm test -- --run tests/scripts/uat-worktree-runtime.test.ts`
  → 1 file passed, 9 tests passed. The prompt now remains open until the asynchronous
  launcher completes.
- Focused launcher tests: 2 files passed, 14 tests passed.
- `npm run typecheck` → passed.
- `npm run lint` → passed with zero errors and one pre-existing warning in
  `scripts/check-student-feedback-states.mjs`.
- `npm test -- --run` → 84 files passed, 736 tests passed, 4 skipped (740 total).
- Interactive smoke checks selected both the launcher worktree and `main`. Each
  printed the matching branch, checkout, commit, and UAT URL; started Next.js on
  port 3200; and returned HTTP 200 from `http://127.0.0.1:3200/`.
- Both development servers were stopped after verification and port 3200 was
  confirmed free. No other worktree, branch, ngrok process, or unrelated process
  was changed.

## Current Position

Implemented, verified, and ready for integration.
