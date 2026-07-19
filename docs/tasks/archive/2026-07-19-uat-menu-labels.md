# Human-readable UAT menu labels and Exit

**Status:** Needs correction

## Goal

Make `npm run uat` identify worktrees by purpose and provide a successful Exit option that never starts preflight or a server.

## Originally delivered

- Main sorts first and displays as `Main`, including when invoked from a linked worktree.
- Other labels prefer root `TASK.md` H1, latest commit subject, cleaned branch, then detached directory name.
- Case-insensitive duplicate labels receive directory-name disambiguators.
- Exit prints last, returns 0, and skips all preflight and launch work.
- Checkout selection still prints branch, path, commit, and the fixed port-3200 URL.

## Verification results (2026-07-19)

- Focused launcher tests: 2 files passed, 23 tests passed.
- Full suite: 84 files passed, 745 tests passed, 4 skipped.
- Typecheck: passed.
- Lint: zero errors; the pre-existing unused `label` warning remains.
- Interactive Exit: confirmation printed, exit code 0, and no server started.
- Interactive Main selection: returned HTTP 200 on port 3200 and stopped cleanly.
- Port 3200 was free after verification.

## Deviations from the plan

- Task 1's plan text contained a genuine internal contradiction: the `sortWorktrees` Step 3 code snippet applied the `repoRoot` tiebreaker unconditionally as a second-tier sort key, but the plan's own Step 1 test ("sorts main first even when the launcher root is another worktree") expected plain path order among non-main records even when one record's path equaled `repoRoot`. Escalated to the user; resolved as: `repoRoot` sorts first only when no `main` record exists at all, matching the design doc's prose ("the launcher root remains the first fallback" when no main branch is present). Implemented as an additional commit (`5bd14ac6`) with a new covering test for the no-main case.
- Removed an unused `repoRoot` const left dangling in `tests/scripts/uat-worktree-lib.test.ts` after Task 1's new tests stopped needing it, to keep lint at zero warnings introduced by this branch (`cdaf514a`).

## Current position

Independent live verification found an outcome-level defect: after closeout restored main's unrelated `TASK.md`, the `codex/uat-menu-labels` worktree rendered as `Dynamic dialogue pagination and open follow-ups [uat-menu-labels]`. The corrective hybrid branch-first design is approved; implementation and fresh verification remain before integration.
