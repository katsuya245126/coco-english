# Coco English Agent Instructions

## Start here

- Read `PROJECT.md` for stable product and architecture context.
- Read root `TASK.md` when it exists for the one active feature.
- Treat code, tests, and Git as stronger evidence than status prose.
- Preserve unrelated working-tree changes.

## Workflow

- Use the lightweight `task-workflow` and `progress` skills as the operational entrypoints for normal or consequential building, fixing, planning, or investigation.
- Use the globally installed read-only `progress` skill when asked for feature status or the next action.
- Tiny obvious maintenance may proceed without `TASK.md` when it has no product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect.
- Require user plan approval for consequential work defined by `task-workflow`.
- Keep one active `TASK.md` per checkout or worktree; archive completed or paused tasks under `docs/tasks/archive/`.
- On worktree creation or takeover, verify that `TASK.md` matches the current branch and working tree. Replace, pause, or explicitly mark an inherited unrelated task inactive before reporting progress.
- Reuse discovered specialist skills for brainstorming, planning, debugging, test-first implementation, review, verification, and handoff.

## Safety and scope

- Keep server-owned assignment and attempt state transitions auditable.
- Every service-role query or mutation involving teachers, students, assignments, attempts, or audio must independently prove ownership server-side. UI reachability and caller-supplied IDs are never authorization.
- Preserve mission snapshots, ownership checks, RLS, and per-turn audio storage.
- Generate signed audio playback URLs on demand for teacher review; never expose stored audio through public URLs.
- Keep teacher review transcript-first and Coco bounded rather than open-ended.
- When changing mission evaluation, progression, hints, TTS, or Coco generation, preserve the preset/conversation split. Conversation mode accepts relevant valid English, applies meaning-preserving corrections, skips preset success and transition narration, grounds follow-ups in owned attempt history, and never falls back to the original target-pattern hint. Preset behavior remains unchanged unless explicitly requested.
- Never commit reusable student access values or secrets.
- A private local class-reset maintenance tool may exist at `.superpowers/private-tools/reset-class-assignments/`. When asked to use it, read its local `AGENTS.md` and `README.md` first. Never stage, commit, push, publish, or copy its contents into tracked files. Applying its database migration, running a real preview, and executing a reset each require separate approval naming the exact environment and action.

## Verification

Run the narrowest relevant tests first, then typecheck, lint, and build in proportion to risk. Never claim an unrun check passed.

For deterministic student feedback screenshots, start the app on `http://localhost:3000`, provide `FEEDBACK_STATE_CLASS_CODE`, `FEEDBACK_STATE_STUDENT_NAME`, and `FEEDBACK_STATE_PIN`, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

## Legacy planning records

The former GSD workflow has been retired in favor of the lightweight `task-workflow` and `progress` skills (see "Workflow" above). Its `.planning/` history has been archived out of the working tree to a tarball under `docs/tasks/archive/` and is not an active source of truth. Do not recreate GSD state, hooks, or `.planning/`; if you need historical context, extract the archived tarball for a one-off lookup only.
