# Coco English Agent Instructions

## Start here

- Read `PROJECT.md` for stable product and architecture context.
- Read root `TASK.md` when it exists for the one active feature.
- Treat code, tests, and Git as stronger evidence than status prose.
- Preserve unrelated working-tree changes.

## Workflow

- Use the project-local `task-workflow` skill for normal or consequential building, fixing, planning, or investigation.
- Use the read-only `progress` skill when asked for feature status or the next action.
- Tiny obvious maintenance may proceed without `TASK.md` when it has no product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect.
- Require user plan approval for consequential work defined by `task-workflow`.
- Keep one active `TASK.md`; archive completed or paused tasks under `docs/tasks/archive/`.
- Reuse discovered specialist skills for brainstorming, planning, debugging, test-first implementation, review, verification, and handoff.

## Safety and scope

- Keep server-owned assignment and attempt state transitions auditable.
- Preserve mission snapshots, ownership checks, RLS, and per-turn audio storage.
- Keep teacher review transcript-first and Coco bounded rather than open-ended.
- Never commit reusable student access values or secrets.

## Verification

Run the narrowest relevant tests first, then typecheck, lint, and build in proportion to risk. Never claim an unrun check passed.

For deterministic student feedback screenshots, start the app on `http://localhost:3000`, provide `FEEDBACK_STATE_CLASS_CODE`, `FEEDBACK_STATE_STUDENT_NAME`, and `FEEDBACK_STATE_PIN`, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

## Legacy GSD

`.planning/` and installed GSD skills remain available as backup. Do not read or update them by default. Use GSD only when the user explicitly requests it.
