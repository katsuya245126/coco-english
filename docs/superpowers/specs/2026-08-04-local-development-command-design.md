# Local Development Command Design

## Goal

Replace the multi-command local startup sequence with:

```bash
npm run dev:local
```

The command must never start Coco against a hosted Supabase URL.

## Design

Add `scripts/dev-local.sh` and expose it through the `dev:local` package
script.

The shell script will:

1. run `npx supabase start`;
2. read `npx supabase status -o env`;
3. refuse to continue unless `API_URL` uses `localhost` or `127.0.0.1`;
4. require the generated publishable and secret keys;
5. map those local values to Coco's existing Supabase environment names;
6. set the synthetic local PIN pepper; and
7. replace itself with `npm run dev`.

Docker Desktop remains a prerequisite. If Docker or Supabase cannot start, the
script exits with the existing CLI error. Azure and other provider settings
continue to come from `.env.local`; the script overrides only the database
settings and local PIN pepper.

No dependency, database migration, production setting, or application runtime
behavior changes.

## Safety

- Hosted Supabase URLs fail closed before Next.js starts.
- The script does not print keys.
- It does not edit `.env.local`.
- It does not copy production data.
- `Control+C` stops Next.js normally because the script uses `exec`.

## Verification

- Validate the shell syntax.
- Run `npm run dev:local` with local Supabase and confirm Next.js becomes ready
  on `http://localhost:3000`.
- Confirm the startup output identifies the local URL.
- Run lint and a package JSON parse check.
