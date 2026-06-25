# English Speaking Practice

Teacher-linked AI speaking homework app for elementary ESL learners.

## Phase 1 Foundation Smoke

This slice proves the data, privacy, and workflow foundation:

- Next.js App Router + TypeScript scaffold.
- Supabase SQL migration for teacher, class, student, mission, assignment, per-student status, attempt, turn, audio metadata, and status audit tables.
- Server-owned assignment status rules.
- Internal smoke screen at `/` with one button that calls `POST /api/foundation`.
- Demo records are marked with `data_mode = 'demo'`.

## Local Full-Stack Run

```bash
npm install
supabase start
supabase db reset
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the local Supabase values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Then open `http://localhost:3000/`, click `Create foundation smoke record`, and confirm the UI shows a demo class, a foundation smoke assignment, `assigned`, and `data-mode: demo`.

## Remote Dev Database Alternative

Set `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` for a migrated Supabase project, then run:

```bash
npm run dev
npm run test:db:smoke
```

Without Supabase env vars, the live DB smoke test skips the insert/read path and the UI shows an internal setup state. Static schema and domain tests still run.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:schema
npm run test:db:smoke
npm run test:e2e
npm run build
```
