# Deepen Teacher Assignment and Attempt Lifecycle Operations

**Status:** Complete
**Completed:** 2026-08-12
**Classification:** Consequential architecture and security work
**Branch:** `codex/teacher-assignment-attempt-lifecycle`
**Specification:** GitHub issue #30
**Implementation tickets:** GitHub issues #31 and #32
**Implementation base:** `8f86a9c9b80edd00feef3f4025ed0e60dd061205`

## Outcome

Teacher callers now express lifecycle intent through two deep mutation
interfaces without owning Supabase access, ownership joins, latest-attempt
selection, transition guards, persistence ordering, or database error mapping:

- `changeAttemptReview(...)` handles mark viewed, mark reviewed, and reopen review.
- `changeAssignedHomework(...)` handles request retry, dismiss, and undo dismissal.

The module independently validates identifiers and actions. Service-role RPCs
independently prove teacher ownership. Missing and cross-teacher targets share
the `not_found` result, invalid requests return `not_allowed`, and storage
failures return `failed`.

## Architecture context

This completes candidate 3 in `docs/improve-codebase-architecture.md`. The
canonical product term is **Assigned homework**: one student's obligation
created by an assignment, containing zero or more homework attempts. The term
is recorded in `CONTEXT.md`.

The approved implementation plans are:

- `docs/superpowers/plans/2026-08-12-atomic-teacher-attempt-review.md`
- `docs/superpowers/plans/2026-08-12-unify-teacher-assigned-homework.md`

## Implementation record

- `f87c52ca` — add atomic teacher attempt-review RPCs.
- `26cb8a95` — deepen teacher attempt-review operations.
- `f2717127` — route attempt review through one interface.
- `eae2a86b` — validate teacher attempt-review identifiers.
- `29821979` — deepen assigned-homework operations.
- `03867471` — cover no-attempt assigned-homework undo.
- `9f530ab9` — route assigned homework through one interface.
- `00ec1ad4` — map rejected assigned-homework RPC calls to `failed`.

## Verification

- Ticket #31 focused lifecycle suite: 7 files, 48 tests passed; local integration
  ran with zero skips; local database lint, typecheck, filtered lint, and build
  passed; full suite passed.
- Ticket #32 focused lifecycle suite: 12 files, 91 tests passed; both local
  integration files ran with zero skips; local database lint, typecheck,
  filtered lint, build, and `git diff --check` passed; full suite passed.
- Final code review: no documented-standard violations; two non-blocking
  duplication smells; no specification, scope, or completeness findings.
- Branch-finishing rerun: 122 test files passed, with 1,531 tests passed and 17
  environment-gated skips.

The repository-wide lint command also inspected ignored/generated `.ua`,
`.worktrees`, and `supabase/.temp` content and failed there. Filtered source
lint passed with one pre-existing warning in
`scripts/check-student-feedback-states.mjs`.

## Closure

The owner accepted both tickets. GitHub issues #30, #31, and #32 were closed
with explicit approval on 2026-08-12. No remote migration, deployment, push,
pull request, or merge was performed during implementation.
