# Coco English Agent Instructions

## Start here

- Consult `PROJECT.md` when product or architecture context matters; a mechanical edit needs only the affected file and applicable instructions.
- Check root `TASK.md` when starting or resuming feature work, or when edits may overlap an active task.
- Treat code, tests, and Git as stronger evidence than status prose.
- Preserve unrelated working-tree changes.

## Workflow

- Use the project `task-workflow` skill for normal or consequential development; use read-only `progress` for feature status. Tiny maintenance with no product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect needs no task file or workflow tour.
- Consequential work requires a concrete plan and user approval before implementation. Preserve the global rule requiring explicit approval for the exact external action and target.
- For normal or consequential work, briefly establish outcome, scope, non-goals, assumptions, done checks, and verification evidence. Choose the reading and execution needed to meet those checks; consult [workflow phases](docs/agents/workflow-phases.md) when routing is unclear.
- Carry authorized work through implementation, relevant verification, inspection, and fixes caused by the change. Resolve routine choices from evidence. Ask only when a missing fact materially changes scope, behavior, safety, ownership, or acceptance. A first draft is not completion; stop when the agreed checks pass or a concrete blocker needs the user.
- Follow explicit user instructions over skill guidance. Invoke named skills yourself; if a skill requires a pause, link its `SKILL.md`, quote the rule, and explain why it applies. Advisory guidance creates no extra approval gate.
- Keep one active `TASK.md` per checkout. On takeover, confirm it matches branch and working tree; preserve unrelated work and pause only overlapping ownership conflicts. Keep completed/paused history local in ignored `docs/local/`, or in issues/PRs when authorized; stable documentation belongs in Git.
- Answer side questions while continuing the active task unless the user cancels or replaces it. Report result, evidence, and remaining blockers concisely.

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

For documentation-only changes, check the diff, referenced paths, and instruction consistency; application tests are unnecessary unless executable behavior or an explicit requirement is affected. Do not add tests that merely mirror prose or trivial implementation details.

For deterministic student feedback screenshots, start the app on `http://localhost:3000`, provide `FEEDBACK_STATE_CLASS_CODE`, `FEEDBACK_STATE_STUDENT_NAME`, and `FEEDBACK_STATE_PIN`, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

## Usage efficiency

- Give subagents compact, task-specific prompts and the minimum history they need. Inherit full conversation history only when the task cannot be summarized safely.
- Reuse an existing subagent for follow-up work instead of spawning a replacement for the same scope.
- Run the narrowest relevant checks during implementation. For application-code changes, run the full unit suite once on the final diff; repeat or broaden verification only for relevant changes, failures, unresolved concerns, or explicit requirements. Creating a commit alone does not invalidate checks of identical file contents.
- Identify verification evidence by the checked commit and working-tree state. Repeat checks on an unchanged verified commit only for new concerns or an explicit skill requirement.
- Before formal review, check the final diff against the issue acceptance criteria and repository standards. Start formal parallel reviewers after that preflight so they normally review one final diff.
- After formal Standards + Spec review, rerun affected tests and typecheck for accepted fixes; do not rerun review subagents for small localized changes unless behavior or scope materially changes or the prior review missed relevant files. Use a targeted manual check instead.
- Use `npm run test:agent` for full unit verification unless diagnosing a failure. Prefer non-interactive compact reporters and bounded tool output.
- Prefer targeted `rg`, file lists, and line ranges over dumping entire large files, diffs, or test logs.
- Usage efficiency never reduces security, authorization, privacy, data-loss prevention, accessibility, or explicitly requested verification.

## Local planning artifacts

- `docs/superpowers/specs/` and `docs/superpowers/plans/` are local-only; never commit them.

## Legacy planning records

The former GSD workflow has been retired in favor of the lightweight `task-workflow` and `progress` skills (see "Workflow" above). Its `.planning/` history is not an active source of truth. Do not recreate GSD state, hooks, or `.planning/`; use the issue tracker or ignored local task notes for historical context.
