# Learner-Safe Hangul Transcript Interpretation

Status: Complete
Branch: main
Base SHA: ebd762516b1e35d4f063881d3babf7ea373841c8
Plan: docs/superpowers/plans/2026-07-29-learner-safe-hangul-transcripts.md

## Goal

Keep provider transcripts verbatim as teacher/audit evidence while preventing
likely accented English loanwords written in Hangul from appearing as Hangul in
student feedback or homework review.

## Approved Product Behavior

- A Hangul span confidently interpreted as accented English is shown to the
  learner as its English reading.
- A proper name remains exactly as spoken.
- If any span is genuine Korean vocabulary or cannot be classified safely, hide
  the whole learner-facing “You said” transcript. Let the existing correction
  or retry feedback teach the next action.
- Never replace or overwrite `original_transcript` or `repeat_transcript`.
- Teacher evidence keeps the raw transcript and may additionally show the
  learner-safe interpretation and interpretation metadata.
- Hangul-script accented English may receive pronunciation practice based on
  pronunciation assessment against the interpreted English reading; Hangul
  script alone is not proof of poor pronunciation.

## Scope

- Structured original/repeat evaluator metadata for Hangul-span interpretation.
- A deterministic server/domain boundary that derives learner-safe transcript
  text from raw evidence plus validated metadata.
- Live student feedback, resume feedback, and completed homework review.
- Teacher evidence rendering of raw and interpreted forms.
- Pronunciation reference selection for confirmed accented-English Hangul.
- Focused regression tests and proportionate repository verification.

## Non-Goals

- No rewriting of stored raw transcripts.
- No hardcoded loanword dictionary.
- No translation of Korean vocabulary into a learner transcript.
- No change to conversation-mode correction rules beyond transcript display.
- No public audio URLs, ownership/RLS changes, deployment, push, production
  mutation, or live paid-provider UAT.

## Observable Done Checks

- `바닐라 아이스크림 is tastier than 초콜릿 아이스크림.` can be stored raw while
  student surfaces show `vanilla ice cream is tastier than chocolate ice cream.`
- `I like 축구.` remains raw in evidence, hides the learner “You said” line, and
  retains the existing English correction path.
- `I'm going to 거제도.` may still show `거제도` as the proper name.
- Missing, malformed, incomplete, or uncertain interpretation metadata never
  leaks raw Hangul to a student surface.
- Original-answer pronunciation scoring uses the interpreted English reading
  only when accented-English classification is validated.
- Teacher evidence shows the raw transcript regardless of learner display.
- Focused tests, typecheck, lint, and build are run; live OpenAI UAT remains a
  separately approved action.

## Verification Record

Executed test-first on `main` from base `ebd76251`. Implementation commits:

| Task | Commit | Description |
| --- | --- | --- |
| 1 | `a518800b` | derive learner-safe Hangul transcripts |
| 2 | `bf380a13` | classify Hangul transcript spans |
| 3 | `a809b41b` | separate student transcript display from evidence |
| 4 | `46c59e4c` | render safe transcripts in student feedback |
| 5 | `a3ee8483` | use safe transcripts in homework review |
| 6 | `52603e2e` | show transcript interpretations in teacher evidence |

### Focused suite

`transcript-interpretation`, `hangul-romanization`, `turn-evaluation`,
`original-evaluation-contract`, `turn-evaluator`, `audio-upload`,
`mission-flow`, `student-mission-flow`, `student-history`, `student-history-ui`,
`HomeworkReview`, `HomeworkReviewAttempt`, `StudentMissionRecap`,
`audio-evidence`:

**315 passed, 1 failed (316 total).** The single failure is
`tests/server/student-history-ui.test.ts > styles the back-to-past-missions
control as a solid primary arrow button`, which expects `recap-back-btn:hover`
in the recap page source. It is pre-existing and unrelated — confirmed failing
identically on a stashed clean tree — and was deliberately not fixed, since
doing so would mean editing unrelated UI code.

Playwright `tests/e2e/teacher-audio-evidence.spec.ts`: **6 passed.** These are
source-contract assertions over page source, not live browser UAT.

### Static verification

- `npm run typecheck` — exit 0, clean.
- `npm run lint` — exit 0. One pre-existing warning, unrelated to this work and
  not fixed: `scripts/check-student-feedback-states.mjs:435:10 'label' is
  defined but never used`. Confirmed present on a stashed clean tree.
- `npm run build` — exit 0, including the `assert-ffmpeg-traced` postbuild check.

### Broader suite

`npx vitest run` — **1418 passed, 4 skipped, 1 failed (1423 total)**, the single
failure being the same pre-existing `student-history-ui` case above. No failure
touched transcript, evaluation, pronunciation, student flow, history, or teacher
evidence.

### Raw-transcript wiring audit

`rg -n "original_transcript|repeat_transcript|result\.transcript|payload\.transcript"`
across `src/app/student`, `src/components/student`, `src/server/student-access`,
and `src/domain/flow` found raw fields only in server persistence, flow-control
decisions, evaluator/model inputs, and arguments to `buildLearnerTranscript`.
No student API response or React component renders raw persisted Hangul. Three
sites were individually checked and are correct as-is:

- `conversation-history.ts:69` — raw text feeds the model, not a student surface.
- `audio-upload.ts:1559` — raw original transcript feeds the repeat evaluator.
- `student/missions/[assignmentStudentId]/page.tsx:126-139` — raw rows feed
  `nextUnfinishedTurnOrder`; only `cocoLine` reaches the client.

### Three-state evidence

Produced from **deterministic in-repo fixtures**, not live provider output and
not a browser session. No screenshots were taken; no server was started.

| State | Teacher raw evidence | Learner-facing |
| --- | --- | --- |
| loanword | `I like 바닐라 ice cream.` | `I like vanilla ice cream.` |
| Korean vocabulary | `I like 축구.` | `null` (hidden; correction still shown) |
| proper name | `I ate 삼겹살 with 민주.` | `I ate 삼겹살 with 민주.` |

### Not run

Live OpenAI/Azure UAT was **not run** and remains a separately approved action.
Nothing was pushed, deployed, or published; Supabase and production were not
mutated. No migration was required — the interpretation metadata is additive
within the existing evaluation JSON and `AI_EVALUATION_VERSION` stays
`ai-eval-v1`.

### Implementation notes

- `HomeworkReview.tsx` renders the improved sentence as a word-level diff
  against the original transcript, which the plan did not anticipate. With the
  transcript withheld there is no safe diff basis, so the improved sentence is
  passed as its own baseline: the correction still renders in full, merely
  unhighlighted, rather than being hidden or falsely marked entirely changed.
- Task 3's `SKIP_PRONUNCIATION_SCORING` sentinel was replaced by a plain
  `if (scoringPromise !== null)` guard, so a deliberately unscored Hangul answer
  never reaches the scoring-failure log.

## Current Position

Complete. All seven plan tasks executed, verified, and committed locally on
`main`.

## Next Step

Optional live UAT of the three states against real provider output, which
requires separate approval.
