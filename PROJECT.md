# Coco English

## Product

Coco English is a teacher-linked AI speaking-homework app for elementary-level ESL learners. Teachers assign short missions based on classroom target English. Students complete them by speaking with Coco, a bounded supportive classmate character. Teachers must be able to verify useful practice through transcripts and available per-turn audio.

## Architecture

- Next.js App Router, React, and TypeScript.
- Supabase Postgres, Auth, Storage, and row-level security.
- Teacher email/password authentication.
- Student class-code, name, and PIN access.
- Short browser-recorded audio clips stored per turn.
- OpenAI integrations behind server-owned adapters with Zod validation.
- Server-owned, auditable assignment and attempt state transitions.
- Mission snapshots prevent later edits changing assigned homework.
- Low-confidence or malformed AI results route to teacher review.
- Coco is a tone layer, not an open-ended autonomous chat agent.

## Product Constraints

- Protect student data and preserve ownership checks.
- Keep teacher review transcript-first and audio-available.
- Prefer vertical MVP changes over broad speculative layers.
- Do not add school SSO, LMS sync, parent accounts, scoring, leaderboards, large character casts, or long-form free chat without an explicit product decision.
- Recheck model names, prices, legal requirements, and browser audio support before paid classroom pilots.

## Verification

Use the narrowest relevant checks first, then proportionate broader checks:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

For deterministic student feedback screenshots, start the app on `http://localhost:3000`, provide the three `FEEDBACK_STATE_*` variables without committing reusable access values, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

## Active Work

Read root `TASK.md` when it exists. Completed or paused task briefs live in `docs/tasks/archive/`. `.planning/` is a legacy GSD backup and is not an active source of truth.
