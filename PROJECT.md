# Coco English

## Product

Coco English is a teacher-linked AI speaking-homework app for elementary-level ESL learners. Teachers assign short missions based on classroom target English. Students complete them by speaking with Coco, a bounded supportive classmate character. Teachers must be able to verify useful practice through transcripts and available per-turn audio.

## Architecture

- Supabase Postgres, Auth, Storage, and row-level security.
- Teacher email/password authentication.
- Student class-code, name, and PIN access.
- Short browser-recorded audio clips stored per turn.
- OpenAI integrations behind server-owned adapters with Zod validation.
- Low-confidence or malformed AI results route to teacher review.
- Code invariants (ownership, state transitions, mission snapshots, audio access, review shape, tests): `CODING_STANDARDS.md`.
- Missions are either preset (authored turns, each with an optional private teacher-uploaded picture) or conversation (authored opening question, bounded generated follow-ups). The two paths evaluate differently; see `docs/agents/mission-modes.md` and `GLOSSARY.md`.
- Azure Speech scores pronunciation per audio clip. Students get pronunciation practice; teachers get a per-student pronunciation profile. See `docs/features/pronunciation-practice.md` for practice homework, `docs/features/mission-pronunciation-scoring.md` for per-turn mission scoring, and `docs/azure-speech-data-use.md`.
- New components style with CSS Modules (`*.module.css`); existing inline `style` objects stay until their file is otherwise changed.
- Paid provider calls are bounded by server-side request budgets (`docs/adr/0005-bound-paid-provider-work.md`).
- Deployed on Vercel with daily crons in `vercel.json` (mark missed homework, purge audio, reset the demo). Merging to `main` applies Supabase migrations to production through a GitHub Action. Logs and CLI notes: `docs/operations/vercel.md`.

## Public Demo

A separate Vercel deployment (`coco-english-demo.vercel.app`) lets visitors try the student side without an account. The production landing page links to it.

- The gate is `demoClassId()` in `src/server/demo/demo-config.ts`: `DEMO_MODE=true` and a valid `DEMO_CLASS_ID` are both required. Every demo-only path returns 404 or does nothing without it.
- `POST /demo/start` creates a throwaway guest student in the demo class and signs them in with the normal student session cookie.
- Starts are limited per network, and the whole demo class shares a cap of 600 paid calls per rolling 24 hours; past the cap the landing page shows a resting screen.
- Teacher surfaces are closed in middleware on the demo deployment.
- The nightly `/api/cron/demo-reset` deletes demo students and their audio; the seeded teacher, class, missions, and assignments stay (`scripts/seed-demo.ts`).
- Vercel Analytics renders only when the gate is on, so real classroom pages stay untracked.

## Product Constraints

- Prefer vertical MVP changes over broad speculative layers.
- Do not add school SSO, LMS sync, parent accounts, scoring, leaderboards, large character casts, or long-form free chat without an explicit product decision.
- Recheck model names, prices, legal requirements, and browser audio support before paid classroom pilots.

## Verification

Run the app locally with `npm run local` (local Supabase, `http://localhost:3200`); bare `npm run dev` uses whatever database `.env.local` points at.

Local Supabase runs in Docker, so start Docker before `npm run local` or any `*:local` test script. After a `supabase db reset`, seed classes and students with `scripts/local/README.md` (gitignored). `psql` is not installed; query the local database with `docker exec supabase_db_english-speaking-practice psql -U postgres`.

For deterministic student feedback screenshots, run `npm run local` and set `FEEDBACK_STATE_BASE_URL=http://localhost:3200`, provide the three `FEEDBACK_STATE_*` variables without committing reusable access values, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

The demo has its own E2E suite: `npm run test:e2e:demo`.

## Active Work

Read root `TASK.md` when it exists. Keep completed or paused task notes in GitHub issues/PRs or ignored `docs/local/`; stable architecture decisions may live in `docs/adr/`.
