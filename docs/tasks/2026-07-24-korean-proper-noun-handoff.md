# Handoff — Korean proper nouns in student transcripts

Date: 2026-07-24
Author: Claude (Opus 4.8) session, continued from 2026-07-23

## Checkout / branch / state

- Checkout: `/Users/john/Desktop/my-portfolio/projects/coco-english` (no worktree)
- Branch: `main`
- HEAD: `129c9c4f chore: gitignore personal DB-management scripts and migration`
- Remote: **none configured** (local-only repo)
- Working tree: **dirty, uncommitted** — see below

```
 M .gitignore                                     (pre-existing, unrelated)
 M src/server/ai/turn-evaluator.ts
 M src/server/audio/transcription.ts
 M src/server/student-access/audio-upload.ts
 M src/server/student-access/audio-upload.test.ts
 M tests/server/audio-upload.test.ts
 M tests/server/transcription.test.ts
 M tests/server/turn-evaluator.test.ts
?? src/domain/audio/hangul-romanization.ts
?? tests/domain/hangul-romanization.test.ts
```

## Verification completed

- `npx vitest run` → **1006 passed, 4 skipped, 96 files, 0 failing**
- `npx tsc --noEmit` → clean
- `npx eslint` on all touched source files → clean
- Live end-to-end run against the real OpenAI API (transcription → evaluation)

## The problem

A Korean learner naming a place, friend, or dish in Korean inside an English
sentence had that word **silently deleted** from the transcript.

`normalizeEnglishTranscript` stripped Hangul outright, so
"I'm going to 거제도 this summer vacation" was stored as
**"I'm going to this summer vacation."** — fluent, grammatical, and missing
the answer, with nothing downstream able to detect the damage. Suspected
cause of at least one `teacher_review` turn in the 2026-07-23 attempt logs.

## Empirical findings (probes, real API)

Scripts + generated audio archived at `~/Desktop/coco-probes-2026-07-24/`.
They call the paid API and are deliberately **not** in the repo, which holds
the convention that checked-in tests never do (`transcription.ts` header).

**Probe 1 — transcription, 6 code-switched samples.**
3 of 6 returned Hangul even with `language: "en"` pinned. Critically,
**removing the pin made 거제도 transcribe as "Jeju Island"** — a real but
wrong place. Silent substitution of a wrong fact is worse than deletion.
=> **Keep `language: "en"`. This is settled; do not revisit.**

**Probe 2 — allow/teach classifier, 16 words x 3 runs. 15/16 correct,
zero instability.** Every word returned the same verdict all three runs.
Only miss: 서울초등학교 classified `allow` (englishForm
"Seoul Elementary School") where the user expected `teach`.

**Probe 3 — attempted refinement (decompose, derive in code). 13/16, worse.**
Dragged geographic suffixes (도 island, 강 river) into the common-noun
bucket; broke 한강 and 제주도 and made 거제도 flap between runs. **Discarded.**

## Decisions locked with the user

1. **Keep `language: "en"`** (Probe 1).
2. **Transcript stores what the student actually said, Hangul intact.**
   The user rejected romanize-in-place: writing
   "My school is Seoul Chojeong Elementary School." into `original_transcript`
   claims the child said English they never said, fabricating the evidence
   record a teacher reads, and erases the learning opportunity by making the
   evaluator return `correct`.
3. **Option B1** — the evaluator classifies each Hangul span:
   - `allow` (proper noun, no English equivalent) → accept as correct
   - `teach` (ordinary vocabulary) → `needs_correction`, English in
     `improvedSentence`, student repeats
   User accepts the known 1/16 miss: 서울초등학교 passes as a name.
4. Fully-Korean answers keep being rejected → retry (guard from `f50ed045`).

## Current code state — REWORKED TO DECISIONS 2 + 3 (2026-07-24)

The romanize-in-place code has been replaced. What is on disk now implements
the approved design. **1014 tests pass, tsc clean, eslint clean.**

What shipped:
- `detectHangulSpans(text): HangulSpan[]` — new in
  `src/domain/audio/hangul-romanization.ts`. Reports `{hangul, romanized}`
  per distinct run **without modifying the text**. Deduplicates repeats.
- `normalizeEnglishTranscript` no longer rewrites Hangul. Returns
  `{text, koreanSpans}` with the transcript verbatim.
- `TRANSCRIPTION_PROMPT` now asks for Hangul ("write it in Hangul exactly as
  spoken") instead of romanized letters. Pinned `detectNoSpeech` assertion
  updated in the same edit — see the gotcha below.
- `turn-evaluator.ts` takes `koreanSpans` and instructs a NAME/VOCABULARY
  classification: NAME → judge only surrounding grammar, accept the Korean;
  VOCABULARY → `needs_correction` + `material` + English `improvedSentence`.
  Both scripts go to the model (Hangul to match the transcript, romanization
  so it can be read aloud). Folded into the existing call — no extra
  round-trip on turns where a child is already struggling.
- The blanket "treat non-English transcripts as non_english" instruction is
  **swapped out** when spans are present; otherwise a valid code-switched
  answer would be discarded via `retry_original`. Pinned by a test.
- `audio-upload.ts` writes the Hangul-preserving transcript to
  `original_transcript` and passes `koreanSpans` through.

Schema note: `originalTurnEvaluationSchema` was left unchanged. The existing
`outcome` / `correctionSeverity` / `improvedSentence` contract already routes
both verdicts correctly, so per-span output would have forced every existing
fixture to grow a field for no behavioural gain.

Dead code flagged, not removed: `romanizeHangul` (the whole-text rewriter)
now has **no production caller** — `detectHangulSpans` replaced it.
`romanizeHangulRun` is still live underneath it. Left in place with a NOTE;
deleting it is a call for the next session.

## Not yet done

- **No live-API re-verification of the classifier.** Probe 2 measured 15/16
  on the allow/teach prompt in isolation; the reworked prompt is folded into
  the real evaluator call and has only been verified against fake clients.
  Re-run a probe against the real API before trusting the 15/16 figure.
- The 서울초등학교 → `allow` miss is expected to persist (user accepted it).

## Gotcha discovered

`TRANSCRIPTION_PROMPT` is **also** the input to `detectNoSpeech`, which
catches the transcriber hallucinating the prompt back on a silent recording.
Editing that string silently broke the no-speech guard mid-session; a pinned
test caught it. **If you change the prompt, update the `expectedPrompt`
literal in `tests/server/transcription.test.ts` ("rejects a prompt echo…") in
the same edit.** The constant now carries a NOTE saying so; the 2026-07-24
rework changed the prompt and updated both together.

## Still open (not started)

The other half of the original 2026-07-23 report: **unnatural Coco lines.**
- "What kind of **something** are you going to eat?" — echoes the vague word
  the student used. There is a prompt rule against this at
  `conversation-generation.ts` ("Treat vague replies such as 'anything'…")
  with **no deterministic backstop**.
- Coco inventing details on `review_pending` turns ("Playing soccer on the
  weekend" after an unintelligible answer).
Proposed: promote both from prompt text to validators beside the existing
`staysOnActiveTopic` / `topic_drift` check.
