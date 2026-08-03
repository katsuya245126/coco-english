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
npm test -- --run
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

Run it only against a disposable non-production environment after separate
approval naming that exact environment. The approved pronunciation migration
must already be applied there; this test never applies migrations.

The test creates a teacher, class, and student; creates an F practice through
the teacher UI; starts the student flow; reloads after the first valid try to
verify resume; completes all five words; and opens the teacher evidence. It
seeds private test audio rows and removes them during cleanup.

Azure transcription/scoring and OpenAI feedback TTS are browser route doubles.
The five teacher word-audio cache rows are seeded so assignment creation is
cache-first and does not call Azure TTS. No paid provider is called by the
test.

Do not use the end-to-end test as production evidence. It is synthetic test
data and must remain environment-gated.
