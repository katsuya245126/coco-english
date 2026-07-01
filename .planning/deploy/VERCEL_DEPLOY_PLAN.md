# Vercel Deployment Plan

Generated: 2026-07-01
Status: ready for execution

## Summary

Deploy Coco English to Vercel so students can use a stable HTTPS URL without the teacher laptop, local `npm start`, or ngrok staying online.

Use the current `HEAD` of branch `chore/reconcile-phase5-phase6-tracking`, not the older `v1.0` tag. The latest readiness commit is:

```text
c9dc548e fix: harden production readiness gates
```

## Current Repo State

- The app is a Next.js App Router project.
- `package.json` has `build`, `start`, `lint`, `typecheck`, and test scripts.
- `package.json` declares Node `>=20.19.0`.
- `vercel.json` already defines daily cron routes:
  - `/api/cron/mark-missed` at `0 2 * * *`
  - `/api/cron/purge-audio` at `0 3 * * *`
- No Vercel link file exists yet:
  - no `.vercel/project.json`
  - no `.vercel/repo.json`
- No git remote was configured when this plan was written, so the fastest path is direct Vercel CLI deployment.
- Supabase local metadata points at project `coco-english-dev`.
- The private Supabase Storage bucket expected by the app is `student-audio`.

## Required Environment Variables

Set these in Vercel for both Preview and Production unless intentionally using separate preview data:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STUDENT_AUDIO_BUCKET=student-audio
OPENAI_API_KEY
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
PIN_HASH_PEPPER
CRON_SECRET
```

Do not expose server-only values with a `NEXT_PUBLIC_` prefix:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `PIN_HASH_PEPPER`
- `CRON_SECRET`

## Deployment Steps

1. Confirm the local repo is clean:

   ```bash
   git status --short --branch
   ```

2. Run local release gates:

   ```bash
   npm run lint
   npm run typecheck
   npm run build
   ```

3. Install or authenticate the Vercel CLI:

   ```bash
   npm install -g vercel
   vercel login
   ```

   Token alternative: export `VERCEL_TOKEN` in the shell. Do not pass tokens through CLI flags.

4. Link the repo to a Vercel project:

   ```bash
   vercel link
   ```

   Because this repo currently has no git remote, use standard linking and create/select a project such as `coco-english`.

5. Add environment variables in Vercel.

   Use the Vercel dashboard or `vercel env add`. Add all variables listed in the "Required Environment Variables" section for Preview and Production.

6. Deploy a preview:

   ```bash
   vercel deploy -y --no-wait
   ```

7. Inspect the preview deployment:

   ```bash
   vercel inspect <preview-url>
   ```

8. Configure Supabase Auth URLs.

   In Supabase Dashboard -> Authentication -> URL Configuration:

   - Set Site URL to the final production Vercel origin.
   - Add redirect allow-list entries:

     ```text
     https://<preview-domain>/auth/callback
     https://<production-domain>/auth/callback
     ```

9. Smoke test the preview:

   - `/` loads the Coco English front door.
   - `/auth/login` allows teacher login.
   - `/join` loads for students.
   - A real phone can allow microphone access and submit a short recording over HTTPS.
   - A teacher can open the evidence page for a submitted attempt.
   - Cron routes are protected:

     ```bash
     curl -i https://<preview-domain>/api/cron/mark-missed
     curl -i -H "Authorization: Bearer <CRON_SECRET>" https://<preview-domain>/api/cron/mark-missed
     ```

     Expected: first call returns `401`; second call returns `200`.

10. Promote to production after preview passes:

    ```bash
    vercel deploy --prod -y --no-wait
    ```

11. Final class URLs:

    ```text
    Student: https://<production-domain>/join
    Teacher: https://<production-domain>/auth/login
    ```

## Acceptance Criteria

- Vercel production deployment is reachable over HTTPS.
- Student `/join` works from a phone without ngrok.
- Teacher login works from the Vercel production domain.
- Student microphone recording works on the actual class device/browser.
- Audio upload/transcription completes for a real student attempt.
- Teacher evidence page shows transcript first and loads audio on demand.
- Cron endpoints reject unauthenticated requests and accept the configured `CRON_SECRET`.
- No laptop, ngrok process, or local `npm start` process is required after deployment.

## Follow-Up Improvement

After today's pilot, add a GitHub remote and connect Vercel to that repository. Future deployments should then happen from git pushes instead of direct CLI deploys.
