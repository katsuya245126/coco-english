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

- RED: `npm test -- --run tests/scripts/uat-worktree-runtime.test.ts` failed with
  `Cannot find module '../../scripts/uat-worktree.mjs'` before the runtime file existed.
- GREEN: `npm test -- --run tests/scripts/uat-worktree-lib.test.ts tests/scripts/uat-worktree-runtime.test.ts`
  → 2 files passed, 11 tests passed.
- `npm run typecheck` → same pre-existing TS7016 "implicit any" diagnostic on the
  `.mjs` import that Task 1's lib test already carries (verified against commit
  92ca76c8 baseline); no new typecheck errors introduced.
- `npm run lint` → 3 problems (2 errors, 1 warning), identical to the Task 1
  baseline: the two errors are the mandated `@ts-ignore` pattern in
  `uat-worktree-lib.test.ts` and `uat-worktree-runtime.test.ts` (brief requires
  `@ts-ignore` verbatim); the one warning is pre-existing in
  `scripts/check-student-feedback-states.mjs`, unrelated to this task.
- `npm test -- --run` (full suite) → 84 files passed, 733 tests passed, 4 skipped
  (737 total), matching the repository's existing skip count.
- Local launcher smoke check: with ports 3000 and 3200 confirmed free beforehand,
  ran `node scripts/uat-worktree.mjs` piped with a selection.
  - Selection `main` (repository root, `/Users/john/Desktop/my-portfolio/projects/coco-english`):
    printed `Branch: main`, `Checkout: /Users/john/Desktop/my-portfolio/projects/coco-english`,
    `Commit: 8f1f5c1`, `UAT URL: http://localhost:3200`; `next dev -p 3200` started;
    `curl http://localhost:3200/` returned `HTTP_STATUS:200`; server then stopped.
  - Selection `worktree-dynamic-dialogue-pagination`
    (`/Users/john/Desktop/my-portfolio/projects/coco-english/.claude/worktrees/dynamic-dialogue-pagination`):
    printed matching branch/path/commit (`b55f6ac`) and UAT URL; `next dev -p 3200`
    started (with a cosmetic Next.js multi-lockfile workspace-root warning, unrelated
    to this change); `curl http://localhost:3200/` returned `HTTP_STATUS:200`; server
    then stopped.
  - Port 3200 confirmed free after each run; no other worktree, branch, or process
    was created, removed, or modified. ngrok was not running and was not touched.

## Current Position

Implemented, verified, and ready for integration.
