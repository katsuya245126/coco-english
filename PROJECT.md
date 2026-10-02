# Coco English

## Product

Coco English is a teacher-linked AI speaking-homework app for elementary-level ESL learners. Teachers assign short missions based on classroom target English. Students complete them by speaking with Coco, a bounded supportive classmate character. Teachers must be able to verify useful practice through transcripts and available per-turn audio.

## Architecture

- Supabase Postgres, Auth, Storage, and row-level security.
- Teacher email/password authentication.
- Student class-code, name, and PIN access.
- Short browser-recorded audio clips stored per turn.
- OpenAI integrations behind server-owned adapters with Zod validation.
- Server-owned, auditable assignment and attempt state transitions.
- Mission snapshots prevent later edits changing assigned homework.
- Low-confidence or malformed AI results route to teacher review.
- Coco is a tone layer, not an open-ended autonomous chat agent.
- Teacher audio review uses short per-turn clips and signed playback URLs generated on demand; stored audio is not public.
- Missions are either preset (authored turns, each with an optional private teacher-uploaded picture) or conversation (authored opening question, bounded generated follow-ups). The two paths evaluate differently; see `AGENTS.md` and `CONTEXT.md`.
- Azure Speech scores pronunciation per audio clip. Students get pronunciation practice; teachers get a per-student pronunciation profile. See `docs/features/pronunciation-practice.md` and `docs/azure-speech-data-use.md`.
- Paid provider calls are bounded by server-side request budgets (`docs/adr/0005-bound-paid-provider-work.md`).
- Deployed on Vercel with daily crons in `vercel.json` (mark missed homework, purge audio, reset the demo). Merging to `main` applies Supabase migrations to production through a GitHub Action.

## Public Demo

A separate Vercel deployment (`coco-english-demo.vercel.app`) lets visitors try the student side without an account. The production landing page links to it.

- The gate is `demoClassId()` in `src/server/demo/demo-config.ts`: `DEMO_MODE=true` and a valid `DEMO_CLASS_ID` are both required. Every demo-only path returns 404 or does nothing without it.
- `POST /demo/start` creates a throwaway guest student in the demo class and signs them in with the normal student session cookie.
- Starts are limited per network, and the whole demo class shares a cap of 600 paid calls per rolling 24 hours; past the cap the landing page shows a resting screen.
- Teacher surfaces are closed in middleware on the demo deployment.
- The nightly `/api/cron/demo-reset` deletes demo students and their audio; the seeded teacher, class, missions, and assignments stay (`scripts/seed-demo.ts`).
- Vercel Analytics renders only when the gate is on, so real classroom pages stay untracked.

## Product Constraints

- Protect student data and preserve ownership checks.
- Keep audio access server-authorized and signed on demand for teacher review.
- Keep teacher review transcript-first and audio-available.
- Prefer vertical MVP changes over broad speculative layers.
- Do not add school SSO, LMS sync, parent accounts, scoring, leaderboards, large character casts, or long-form free chat without an explicit product decision.
- Recheck model names, prices, legal requirements, and browser audio support before paid classroom pilots.

## Verification

Run the app locally with `npm run local` (local Supabase, `http://localhost:3200`); bare `npm run dev` uses whatever database `.env.local` points at.

For deterministic student feedback screenshots, start the app on `http://localhost:3000` (or set `FEEDBACK_STATE_BASE_URL`), provide the three `FEEDBACK_STATE_*` variables without committing reusable access values, and run `npm run test:student-feedback-states`. See `docs/testing/student-feedback-states.md`.

The demo has its own E2E suite: `npm run test:e2e:demo`.

## Active Work

Read root `TASK.md` when it exists. Keep completed or paused task notes in GitHub issues/PRs or ignored `docs/local/`; stable architecture decisions may live in `docs/adr/`.
