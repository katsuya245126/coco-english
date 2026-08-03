# Pronunciation Practice — Open Questions and Handoff

Status: Paused
Date: 2026-08-04
Branch: `main` (24 commits ahead of `origin/main`, nothing pushed)

## Production status

Production is untouched by all of this work. `origin/main` is at `14f70542`
(2026-07-31), which predates every pronunciation change described here. Every
session ran against local Supabase only. No push, no deploy, no production
database mutation.

This means production is unaffected — not that production has been health
checked. Nobody ran a production smoke test today, and the local Azure and
Supabase credentials used here are not the production ones.

## What is working locally

- Word audio generates and plays. Codex wired the Azure TTS warm step; five
  rows now exist in `tts_audio_cache` with voice `en-US-AvaNeural`,
  character `pronunciation-word-v1`, provider `azure_speech`.
- Recording, transcription, and scoring all succeed end to end. Five clips
  recorded successfully at 16:43–16:44 UTC on 2026-08-03.
- The single-verdict result redesign is implemented, with 17 passing component
  tests. Full suite: 129 files, 1,564 passed, 10 skipped. Typecheck and build
  clean. Local pronunciation E2E gate passes.

## Question 1 — Transcripts come back in Korean script

The highest-value open question.

Stored transcripts for the word "face" read `페이스`, `스래쉬`, `플라시`, `스`.
Only one try in the whole table came back as English ("fan").

Consequences:

- The different-word check compares transcript to expected word. `페이스` never
  equals `face`, so that check cannot fire as designed and is effectively dead.
- Scoring is unaffected, because Azure pronunciation assessment scores against
  the reference text independently of the transcript. This is why tries still
  produce plausible star bands.
- Evidence for teachers shows Korean transcripts for English words.

Example row showing the disagreement: word accuracy 84, star band 3, outcome
`target_weak`, transcript `페이스`.

To determine:

- Is the transcription request missing an English language hint or locale?
- Is this specific to a Korean speaker's accent, or does the recognizer default
  to a non-English language?
- Should the different-word check tolerate non-Latin transcripts rather than
  treating them as a different word?
- Does teacher-facing evidence need the raw transcript at all if it is
  unreliable?

Start at `src/server/student-access/pronunciation-upload.ts` around the
`transcribeAudioFile` call, and the transcript normalization in
`normalizeEnglishTranscript` / `hasEnglishTranscript`.

## Question 2 — Silent failures made a five-minute bug take four rounds

Two separate places swallow diagnostic information.

`src/server/audio/pronunciation-scorer.ts:173` returns `missing_api_key` with
no log line at all. A missing or stale Azure key — the single most likely
misconfiguration — produces zero server-side evidence. Contrast line 213, which
does log on provider failure.

`src/components/student/PronunciationPracticeShell.tsx:329` collapses ten
distinct upload failures into one sentence: "We could not save that word. Try
again." The ten are `not_found`, `invalid_audio`, `out_of_order`,
`word_finished`, `upload_failed`, `transcription_failed`, `unclear_transcript`,
`scoring_failed`, `db_error`, `rate_limited`. A student and a developer see the
same text whether the cause is a dead API key, a rate limit, or a database
fault.

To decide:

- Log `missing_api_key` at error level, matching the provider-failed path.
- What should a nine-year-old see for each class of failure? Probably three
  buckets: try again now, wait a moment, tell your teacher.
- Should the client distinguish 404 (audio never generated) from 502 (provider
  down) for the word-audio button?

## Question 3 — Word audio has no generation guarantee

`signPronunciationWordAudioFromSnapshot` only reads cache and signs; it never
generates. If nothing ran the warm step, the snapshot references audio that
does not exist and the student gets a permanently disabled button.

This was the original "Play word is broken" bug. Codex fixed the missing files
but the structural question is open.

To decide:

- Where in teacher assignment creation should `warmPronunciationWordAudio` run?
  Synchronously at creation (slower create, guaranteed audio) or backgrounded
  (fast create, races the student)?
- What happens to assignments created while Azure is down?
- Should an assignment be creatable at all if its audio cannot be generated?
- The content hash covers voice, locale, format, characterId, word and phones.
  Editing a word's CMU phones after assigning orphans the old audio. Is
  backfill or reaping needed?

Codex has already been consulted on this and may have produced answers worth
retrieving before redoing the analysis.

## Question 4 — Client swallows word-audio failures

`src/components/student/PronunciationPracticeShell.tsx:242-253` discards every
word-audio fetch error through `.catch(() => undefined)` and an `response.ok`
ternary. The button then renders disabled with no message and no retry. Related
to Question 2 but a distinct code path.

## Question 5 — Redesign never visually confirmed

The single-verdict redesign (Option A: one verdict, stars demoted to a labelled
"whole word" detail) is implemented and unit tested, but has never been seen
rendering in a browser.

An earlier note in `TASK.md` claimed both variants were confirmed in situ. That
claim was false and has been corrected: what was screenshotted was verdict
markup injected into the page with JavaScript, not the `TryVerdict` component.
The contrast figures recorded there describe intended design values, measured
against injected markup, not confirmed component output.

Recording now works, so a real try can be recorded and the actual component
screenshotted. Still to confirm:

- A recorded try renders exactly one verdict card.
- The reserved zone holds `min-height: 84px` so the screen does not reflow.
- Both the celebrate and encourage variants look right at 375x812 and desktop.

## Environment notes that cost time today

- Next.js reads `.env.local` only at startup. Hot reload does not pick up
  environment changes. After any credential edit, restart `npm run local`. This
  was the actual cause of the 502 on recording: the server process still held
  pre-Codex Azure config.
- `npm run build` and the Playwright E2E run both contend with `npm run local`
  over port 3000 and the `.next` directory. Running them killed the dev server
  mid-session. Stop the dev server first, or accept the interruption.
- The E2E run leaves `supabase_imgproxy` and `supabase_pooler` stopped, and
  resets assignment state. Re-run `npx supabase start` afterwards.
- The E2E gate silently reports "1 skipped" — which reads like a pass — unless
  run with the full env-var form from `docs/testing/pronunciation-practice.md`.
- Local Supabase psql access is via
  `docker exec supabase_db_english-speaking-practice psql -U postgres -d postgres`.
  There is no host psql.
- `scripts/dev-local.sh` and its `npm run local` alias are local-only and must
  not be committed or pushed.

## Suggested order for the next session

1. Question 1, the Korean transcripts. Largest product impact, and it silently
   disables a designed behavior.
2. Question 2, the silent failures. Small change, and it would have turned this
   entire session into one log line.
3. Question 5, the visual confirmation. Cheap now that recording works, and it
   closes an outstanding verification gap.
4. Questions 3 and 4, the word-audio generation guarantee.

## Exact starting state

- Checkout: `/Users/john/Documents/my-portfolio/projects/coco-english`
- Branch: `main`, 24 commits ahead of `origin/main`, nothing pushed
- Working tree: dirty, 18 modified files plus 3 untracked docs. Preserve all of
  it; nothing here is meant to be reset.
- Local student login: join code `LOCALF`, name `john`, local test PIN. The PIN
  hash is pepper-dependent and was set for `coco-local-pronunciation-manual`,
  the pepper used by `scripts/dev-local.sh`.
- Mission: `F Sound Practice`, assignment_student
  `26e8c65c-6e0f-462e-b62a-0c65b5ea3895`, words face/fan/fish/five/food.

Start the app with:

```bash
npm run local
```

## Verification already done

Run on 2026-08-04 against the current working tree:

- `npm run typecheck` — clean
- `npm test -- --run` — 129 files, 1,564 passed, 10 skipped
- `npm run build` — passed, ffmpeg traced
- Local pronunciation E2E gate — 1 passed in 24.2s
- `npm run lint` — source clean; 89 errors all in untracked
  `.worktrees/dev-local/.next/` generated output

Also verified by direct experiment against the real failing clip: the
`finalizeStreamingWavHeader` change in `src/server/audio/audio-transcode.ts`
produces a well-formed WAV (declared sizes match actual bytes exactly) at
16 kHz mono 16-bit PCM, and that clip scores 80 accuracy / 3 stars against live
Azure. That change was suspected as the cause of the recording failure and was
ruled out by measurement.
