# Worktree-aware UAT launcher

**Status:** Implementation approved

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

- [ ] Pure discovery and selection tests pass.
- [ ] Runtime preflight and CLI tests pass.
- [ ] `npm run uat` can serve a selected worktree and `main` on port 3200.
- [ ] Typecheck, lint, and proportionate project tests pass.

## Current Position

Executing Task 1 of `docs/superpowers/plans/2026-07-19-worktree-uat-launcher.md`.
