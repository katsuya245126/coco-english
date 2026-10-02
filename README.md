# Coco English

Teacher-linked AI speaking homework app for elementary ESL learners. See `PROJECT.md` for product and architecture context.

## Current App

- The root route `/` links teachers to `/auth/login` and students to `/join`, with a link to the public demo.
- Teachers use the authenticated workspace at `/teacher`.
- Students enter their class code, name, and PIN at `/join`.
- On the demo deployment (`DEMO_MODE=true` plus `DEMO_CLASS_ID`), `/` is a "Try the demo" entry and teacher surfaces are closed.

## Local Full-Stack Run

```bash
npm install
cp .env.example .env.local
npm run local
```

`npm run local` starts local Supabase, points the app at it (it refuses to start against a non-local database), and serves `http://localhost:3200/`. It supplies the Supabase URL and keys itself; fill the rest of `.env.local`:

- `STUDENT_ACCESS_SECRET` (`openssl rand -hex 32`)
- `OPENAI_API_KEY` for evaluation, transcription, hints, and TTS
- `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` for pronunciation scoring

Run `supabase db reset` to reapply migrations from scratch and `npm run local:seed-teacher` to create a local teacher account.

## Remote Dev Database Alternative

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, and a generated server-only `STUDENT_ACCESS_SECRET` for a migrated Supabase project in `.env.local`, then run:

```bash
npm run dev
```

This serves `http://localhost:3000/` against the remote database.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:schema
npm run test:e2e
npm run test:e2e:demo
npm run build
```
