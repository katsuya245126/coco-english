# English Speaking Practice

Teacher-linked AI speaking homework app for elementary ESL learners.

## Current App

- The root route `/` links teachers to `/auth/login` and students to `/join`.
- Teachers use the authenticated workspace at `/teacher`.
- Students enter their class code, name, and PIN at `/join`.

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

Then open `http://localhost:3000/` and choose the teacher or student entrypoint.

## Remote Dev Database Alternative

Set `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` for a migrated Supabase project, then run:

```bash
npm run dev
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:schema
npm run test:e2e
npm run build
```
