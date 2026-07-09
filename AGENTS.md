# AGENTS.md

<!-- GSD:project-start source:PROJECT.md -->
## Project

This is a teacher-linked AI speaking homework app for elementary-level ESL learners. Teachers assign short speaking missions based on the target English taught in class, and students complete those missions after class by speaking with a recurring supportive classmate character.

Core value: students must complete useful spoken English practice outside class, and teachers must be able to verify that it happened.

Current planning source: `.planning/PROJECT.md`.
Current roadmap source: `.planning/ROADMAP.md`.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

Research recommends a TypeScript web app using:

- Next.js App Router, React, and TypeScript.
- Vercel for hosting.
- Supabase Postgres, Auth, Storage, and RLS.
- Teacher email/password auth through Supabase Auth.
- Custom class-code/name/PIN student access.
- Browser `MediaRecorder`/`getUserMedia` for short per-turn audio clips.
- OpenAI APIs behind server-side adapters for mission generation, transcription, and structured turn evaluation.
- Zod for schema validation.
- Vitest and Playwright for unit and end-to-end verification.

Treat current AI model names, costs, and browser audio support as version-sensitive. Recheck before paid classroom pilots.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions are not yet established because implementation has not started.

Until code exists:

- Keep changes tied to the active GSD phase.
- Prefer vertical MVP slices over broad technical layers.
- Keep teacher review transcript-first and audio-available.
- Keep AI outputs structured, validated, and routed through server-owned workflow state.
- Avoid adding v1 scope for school SSO, LMS sync, parent accounts, scoring, leaderboards, large character casts, or long-form free chat.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:research/ARCHITECTURE.md -->
## Architecture

The source of truth is the normalized classroom workflow: teacher, class, student, mission snapshot, assignment, per-student assignment state, attempt, turn, audio metadata, transcript, and review decision.

Architecture principles:

- Assignment and attempt statuses are server-owned and auditable.
- Mission assignment snapshots prevent later edits from changing existing homework unexpectedly.
- Audio is stored as short per-turn clips, not full-session recordings.
- Signed audio playback should be generated on demand for teacher review.
- AI helps generate and evaluate, but app code owns status transitions.
- Low-confidence or malformed AI results route to teacher review.
- The buddy character is a bounded tone layer, not an open-ended chat agent.

Current roadmap has 7 phases, starting with data/privacy foundation and ending with teacher review plus pilot readiness.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project-local skills are defined yet.
<!-- GSD:skills-end -->

## Testing

For deterministic screenshots of all student feedback states, use
`npm run test:student-feedback-states` after the user starts the app on
`http://localhost:3000`. Provide the test class access through
`FEEDBACK_STATE_CLASS_CODE`, `FEEDBACK_STATE_STUDENT_NAME`, and
`FEEDBACK_STATE_PIN`; do not commit reusable class access values. See
`docs/testing/student-feedback-states.md`.

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before making file-changing implementation edits, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `$gsd-discuss-phase 1` to gather context for Phase 1.
- `$gsd-plan-phase 1` to create the Phase 1 implementation plan.
- `$gsd-execute-phase 1` to execute a planned phase.
- `$gsd-quick` for small docs or maintenance tasks.
- `$gsd-debug` for investigation and bug fixing.

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

**If you are Codex (or any agent without access to the `$gsd-*` Claude Code skills):** you cannot invoke slash-commands like `$gsd-execute-phase`, but you must still keep the GSD state files truthful, by hand, in the same commit as your work:

- `.planning/STATE.md` — update the YAML header (`current_phase`, `current_phase_name`, `status`, `stopped_at`, `last_updated`, `last_activity`, `last_activity_desc`) AND the prose "Current Position" section to match. These two must never disagree — if you only edit one, you've created the exact drift this note exists to prevent.
- `.planning/ROADMAP.md` — flip `[ ]` to `[x]` for any phase you completed.
- Do this in the same commit as the feature work, not a followup — a change without a STATE.md update looks, to the next agent, like it never happened.

Before starting work, run `git status` / `git branch -v` and confirm you're on the branch with the latest merged state — GSD state files are normal tracked files, so if the prior tool worked on an unmerged branch, checking out a different branch will show you stale STATE.md/ROADMAP.md even though newer work exists elsewhere. Ask the user which branch to use if unsure, and merge finished work to `main` before ending your session rather than leaving it on a feature branch.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `$gsd-profile-user` to generate a developer profile.
> This section is managed by GSD profile tooling; do not edit manually.
<!-- GSD:profile-end -->
