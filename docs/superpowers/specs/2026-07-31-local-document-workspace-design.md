# Local Documentation Workspace Design

**Status:** Approved in conversation; pending written-spec review

## Goal

Keep durable project documentation visible to Git while preventing temporary
agent notes and handoffs from repeatedly cluttering the working tree.

## Convention

- Keep `docs/` tracked for product specifications, approved designs and plans,
  testing guides, and archived task records.
- Reserve `docs/local/` for temporary handoffs, session notes, scan output, and
  agent scratch work.
- Ignore `docs/local/` in Git.
- Do not move durable records into `docs/local/` merely to hide changes.

## Current Cleanup

- Move `docs/tasks/2026-07-28-audio-retry-and-transition-step-handoff.md` to
  `docs/local/`.
- Keep `docs/english-speaking-practice-app-spec.md`,
  `docs/superpowers/plans/2026-07-31-student-access-security-remediation.md`,
  and `docs/tasks/archive/2026-07-31-conversation-feedback-repair.md` tracked.
- Keep the deletion of the stale root `.continue-here.md`.

## Verification

- `git check-ignore docs/local/<file>` identifies the new ignore rule.
- Git status shows no temporary local documentation.
- Durable documentation remains visible for review and commit.

## Non-goals

- Ignoring all of `docs/`.
- Reorganizing existing tracked documentation unrelated to the current cleanup.
- Changing application code, dependencies, or runtime behavior.
