# Pronunciation Practice Verification

## Local checks

Run the narrow feature suite first:

```bash
npx vitest run \
  tests/domain/pronunciation-practice.test.ts \
  tests/domain/pronunciation-word-bank.test.ts \
  tests/server/cmudict.test.ts \
  tests/server/pronunciation-word-audio.test.ts \
  tests/schema/pronunciation-practice-schema.test.ts \
  tests/server/pronunciation-teacher-service.test.ts \
  tests/server/pronunciation-flow.test.ts \
  tests/server/pronunciation-upload.test.ts \
  tests/server/pronunciation-evidence.test.ts \
  src/components/teacher/PronunciationPracticeForm.test.tsx \
  src/components/student/PronunciationPracticeShell.test.tsx
```

Then run the regression checks:

```bash
npm run test:agent
npm run typecheck
npm run lint
npm run build
```

The lint command may report the pre-existing unused `label` warning in
`scripts/check-student-feedback-states.mjs`; it must not introduce an error.

## End-to-end path

The Playwright path is gated so it cannot write to a database accidentally:

```bash
E2E_PRONUNCIATION=true npm run test:e2e -- tests/e2e/pronunciation-practice.spec.ts
```

Run it only against local Supabase. The test refuses hosted Supabase URLs, even
when `E2E_PRONUNCIATION=true`.

Start the local database:

```bash
npx supabase start
```

Load the generated local URL and new API keys. Then run the test:

```bash
eval "$(npx supabase status -o env)"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SECRET_KEY" \
PIN_HASH_PEPPER="coco-local-pronunciation-test" \
E2E_PRONUNCIATION=true \
npm run test:e2e -- tests/e2e/pronunciation-practice.spec.ts
```

Use `PUBLISHABLE_KEY` and `SECRET_KEY`. Current local Supabase versions can
reject the legacy `ANON_KEY` and `SERVICE_ROLE_KEY` values.

Run `npx supabase stop` when local database work is complete. Use
`npx supabase db reset --local` only when you want to delete and rebuild the
local database from the tracked migrations.

The test creates a teacher, class, and student; creates an F practice through
the teacher UI; starts the student flow; reloads after the first valid try to
verify resume; completes all five words; and opens the teacher evidence. It
seeds private test audio rows and removes them during cleanup.

The entire pronunciation upload endpoint, word playback endpoint, and feedback
TTS endpoint are browser route doubles. This browser test does not execute the
upload service or its provider adapters.
The five teacher word-audio cache rows are seeded so assignment creation is
cache-first and does not call Azure TTS. No paid provider is called by the
test.

Do not use the end-to-end test as production evidence. It is synthetic test
data and must remain environment-gated.

## Server and database seam

`tests/server/pronunciation-practice.integration.test.ts` exercises the actual
start, upload, resume, and completion services against local Supabase. It checks
cross-student rejection, private audio storage, persisted tries, and the final
teacher-review transition. Transcription and scoring are injected doubles.

With the local environment variables above loaded, run:

```bash
npx vitest run tests/server/pronunciation-practice.integration.test.ts --reporter=dot
```

The test skips without a localhost database URL and local keys. It creates and
cleans its own records; it does not reset the database. The browser test preserves
existing word-audio cache rows and removes only the rows it creates.
