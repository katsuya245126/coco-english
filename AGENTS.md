# Coco English Agent Instructions

## Start here

- Consult `PROJECT.md` when product or architecture context matters; a mechanical edit needs only the affected file and applicable instructions.
- Check root `TASK.md` when starting or resuming feature work, or when edits may overlap an active task. Creating, taking over, or closing a `TASK.md`: follow the Task state section of [workflow phases](docs/agents/workflow-phases.md).
- Treat code, tests, and Git as stronger evidence than status prose.

## Workflow

- Use the project `task-workflow` skill for normal or consequential development; use read-only `progress` for feature status. Tiny maintenance with no product, architecture, security, privacy, student-data, migration, deployment, billing, or cross-system effect needs no task file or workflow tour.
- Consequential work requires a concrete plan and user approval before implementation.
- For normal or consequential work, briefly establish outcome, scope, non-goals, assumptions, done checks, and verification evidence. Choose the reading and execution needed to meet those checks; consult [workflow phases](docs/agents/workflow-phases.md) when routing is unclear.
- Ask only when a missing fact materially changes scope, behavior, safety, ownership, or acceptance. A first draft is not completion; stop when the agreed checks pass or a concrete blocker needs the user.
- Invoke named skills yourself; if a skill requires a pause, link its `SKILL.md`, quote the rule, and explain why it applies. Advisory guidance creates no extra approval gate.
- Answer side questions while continuing the active task unless the user cancels or replaces it.
- Subagent dispatch: follow the Subagents section of [workflow phases](docs/agents/workflow-phases.md).

## Safety and scope

- Keep server-owned assignment and attempt state transitions auditable.
- Every service-role query or mutation involving teachers, students, assignments, attempts, or audio must independently prove ownership server-side. UI reachability and caller-supplied IDs are never authorization.
- Preserve mission snapshots, ownership checks, RLS, and per-turn audio storage.
- Serve stored audio to teacher review only through signed playback URLs generated on demand; stored audio is never public.
- Keep teacher review transcript-first and Coco bounded rather than open-ended.
- Mission evaluation, progression, hints, TTS, or Coco generation changes: read [mission modes](docs/agents/mission-modes.md) first (preset/conversation split rules).
- Keep reusable student access values and secrets out of Git.
- `.superpowers/private-tools/` stays local: never stage, commit, or copy its contents into tracked files. Reset tool use: read [private reset tool](docs/agents/private-reset-tool.md) first (approval gates).
- `docs/superpowers/specs/` and `docs/superpowers/plans/` are local-only; keep them out of commits.
- GSD and `.planning/` are retired history; active state lives in `TASK.md`, `PROJECT.md`, and GitHub issues.

## Verification

Run the narrowest relevant tests first, then typecheck, lint, and build in proportion to risk. Prefer E2E verification on the final diff; run the full unit suite (`npm run test:agent`, unless diagnosing a failure) only when relevant to the change or explicitly required. Repeat or broaden verification only for relevant changes, failures, unresolved concerns, or explicit requirements; a commit alone does not invalidate checks of identical file contents. Efficiency never reduces security, authorization, privacy, data-loss prevention, accessibility, or explicitly requested verification.

For documentation-only changes, check the diff, referenced paths, and instruction consistency; application tests are unnecessary unless executable behavior or an explicit requirement is affected.

- Tautological tests and change-detector tests are harmful: test observable behavior, not prose, implementation details, or the mere presence of a change.
- Add a regression test for a bug fix only when it closes a genuine gap in behavior testing. Write the test before the fix; never write unit tests after writing code.
- Prefer E2E tests as the sole testing mechanism for complex features. End E2E tests with a verifiable, repeatable artifact.
- If isolated testing is necessary, first enumerate the ways the system could fail, then write the test and code.
