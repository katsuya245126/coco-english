# Student Feedback State Check

Use this check when you want screenshots of every student recording feedback state.

## Prerequisites

- Start the app yourself on `http://localhost:3000`.
- Keep `.env.local` populated with Supabase service-role access.
- Provide test student access through environment variables:
  - `FEEDBACK_STATE_CLASS_CODE`
  - `FEEDBACK_STATE_STUDENT_NAME`
  - `FEEDBACK_STATE_PIN`

## Run

```bash
npm run test:student-feedback-states
```

Do not commit reusable class access values. If needed, pass them inline for a
single local run:

```bash
FEEDBACK_STATE_CLASS_CODE=... FEEDBACK_STATE_STUDENT_NAME=... FEEDBACK_STATE_PIN=... npm run test:student-feedback-states
```

The script:

- creates temporary assignments for the test student,
- opens each assignment in Playwright,
- stubs recorder upload responses so every feedback state is deterministic,
- stubs Coco TTS with a silent audio data URL,
- saves screenshots under `test-results/manual-feedback-states-<timestamp>/`,
- deletes the temporary assignments after the screenshots are saved.

## States Captured

- green accepted original
- light-blue improved sentence
- green accepted repeat
- amber retry original
- amber couldn't-hear recorder error
- amber teacher review
- amber repeat retry

The script does not start or stop the dev server.
