# Handoff — coco-english, 2026-07-24

Next session: **continue where we left off.**

## Where things stand

The Korean-proper-noun work is **done, measured, and committed**. What remains
is a merge decision and a separate untouched piece of work.

- Checkout: `/Users/john/Desktop/my-portfolio/projects/coco-english`
- Branch: `fix/korean-proper-noun-transcripts` (HEAD `2fcb0ffe`), **unmerged**
- `main` is at `129c9c4f`; the branch is 2 commits ahead
- No git remote configured (local-only repo)
- Dirty: `.gitignore` only — pre-existing, unrelated, deliberately uncommitted
- Verified at HEAD: **1015 tests pass** (96 files), `tsc --noEmit` clean,
  eslint clean on all touched files

Full technical detail lives in
[`docs/tasks/2026-07-24-korean-proper-noun-handoff.md`](docs/tasks/2026-07-24-korean-proper-noun-handoff.md)
— design decisions, all four probe results, and what shipped. Read that before
touching the classifier. The two commit messages (`git show 40b8fcab`,
`git show 2fcb0ffe`) carry the rationale for each change; don't re-derive it.

## What the next session can pick up

Three independent options, roughly in the order I'd suggest.

### 1. Merge the branch to `main`

It's green and measured. The project's tool-handoff convention (see memory
`coco-english-tool-handoff-branch-hygiene`) is to merge to `main` and delete
merged branches before switching tools — this branch is currently the
exception. **Merging needs the user's approval; it is not implied by "continue."**

### 2. Re-probe the transcription half — MEASURED 2026-07-24, gap closed

`TRANSCRIPTION_PROMPT` changed to ask for Hangul instead of romanized letters.
Probe 1's "3 of 6 code-switched samples returned Hangul" was measured under the
*old* prompt. Re-measured with `probe-prompt-compare.mjs` (both prompts, same
cached audio, 3 runs each to separate a real shift from sampling noise):

| sample | spoken | OLD | NEW |
|---|---|---|---|
| gojedo | 거제도 | 1/3 | 3/3 |
| kimbap | 김밥 | 0/3 | 3/3 |
| friend | 민준 | 0/3 | 0/3 |
| school | 서울초등학교 | 2/3 | 3/3 |

**Code-switched totals: 2/12 old → 9/12 new**, the intended direction. Controls
unchanged (korean-only 3/3 both, english-only 0/3 both), so the prompt did not
make the model Hangul-happy in general.

One sample never retains: **민준 (a person's name) transcribes as "Minjun" /
"Min-jun" under both prompts, 0/6.** Place names and dish names retain; a
personal name does not. This is not a defect — "Minjun" is a faithful rendering
of what the child said, and the NAME/VOCABULARY classifier accepts it. Worth
knowing because it means the Hangul path is not the only path a proper noun
takes, and any future test asserting "code-switched ⇒ Hangul span present"
would be wrong for personal names.

The new probe imports `TRANSCRIPTION_PROMPT` from source instead of hardcoding
it — the old `probe-codeswitch.mjs` hardcoded the prompt at line 39 and silently
went stale when the prompt changed. Prefer the new one.

Probes live in `~/Desktop/coco-probes-2026-07-24/`, must be copied to the repo
root to run (relative imports resolve against the script, not cwd), and
**deleted afterward** — checked-in tests never call the paid API, a convention
stated in the `src/server/audio/transcription.ts` header.

Still unmeasured: no end-to-end run on real device audio (all of the above is
synthetic TTS).

### 3. The unnatural-Coco half — untouched, larger

The other half of the original 2026-07-23 report, never started:

- Coco echoing a student's vague word back ("What kind of **something** are
  you going to eat?"). A prompt rule exists in
  `src/domain/ai/conversation-generation.ts` ("Treat vague replies such as
  'anything'…") with **no deterministic backstop**.
- Coco inventing details on `review_pending` turns ("Playing soccer on the
  weekend" after an unintelligible answer).

Proposed approach: promote both from prompt text to validators beside the
existing `staysOnActiveTopic` / `topic_drift` check in
`src/server/ai/conversation-generator.ts`. This is a proposal, not a decision
the user has ratified.

### Small loose end

`romanizeHangul` (the whole-text rewriter in
`src/domain/audio/hangul-romanization.ts:134`) has **no production caller** —
`detectHangulSpans` replaced it on the transcript path. Verified 2026-07-24:
production imports only `detectHangulSpans` and `isEntirelyNonEnglish`
(`src/server/audio/transcription.ts:10-11`). It is kept deliberately, with a
NOTE at line 129 explaining why: it renders Korean text as romanized *without*
touching stored evidence, which a future non-transcript caller may want. Its 21
tests pass. Not a cleanup item unless the user decides otherwise.

## Traps that cost time this session

**`TRANSCRIPTION_PROMPT` is also the input to `detectNoSpeech`.** It is the
reference string for the silent-recording guard. Changing it silently weakens
that guard; a pinned assertion in `tests/server/transcription.test.ts`
("rejects a prompt echo…") catches it. The constant now carries a NOTE. If you
edit the prompt, update that literal in the same edit.

**The classifier unit test pins strings, not accuracy.** The test "pins the
classifier rules a live probe proved load-bearing" asserts that certain
instruction substrings are present. A reworded prompt could keep every pinned
substring and still regress. **Re-run the probe after any classifier-prompt
edit** — the unit suite will not catch a behavioural regression.

**Two classifier rules are load-bearing; dropping either costs 2 points.**
Measured, not guessed:
1. NAME/VOCABULARY must be framed as *"does this word name one particular
   thing, or is it the ordinary word for a whole category?"* Listing
   categories instead ("a place, a person, a school") makes 초등학교 and 선생님
   match as instances and get wrongly accepted.
2. Geographic suffixes (도/강/산/시) stay part of the place name, and a
   name-plus-institution compound is never split. Without this, 제주도 goes
   unstable and 서울초등학교 splits — the same failure that sank the discarded
   decompose approach at 13/16.

**Two approaches are already measured and rejected — do not retry:** dropping
the `language: "en"` pin (거제도 → "Jeju Island", a wrong fact is worse than a
missing one), and decompose-then-derive classification (13/16).

## Probe archive

`~/Desktop/coco-probes-2026-07-24/` — `probe-classify.mjs`,
`probe-classify2.mjs`, `probe-codeswitch.mjs`, `verify-e2e.mjs`, and
`probe-inevaluator.mjs` (new this session; the version that produced 16/16).
Kept out of the repo because they call the paid API. They read
`OPENAI_API_KEY` from `.env.local`; do not copy key values anywhere.

Note: `verify-e2e.mjs` is **stale** — it reads `transcription.romanizedSpans`
(line 70) and passes `romanizedSpans:` to the evaluator (line 80). The
transcription adapter now returns `koreanSpans` (spans of `{hangul, romanized}`,
not bare strings), so both call sites need updating before the script will run.
The `romanizedSpans` name still exists on `romanizeHangul`'s return type in the
domain module — it is the *transcription* field that changed, not that.

## Suggested skills

- **`superpowers:systematic-debugging`** — if picking up the unnatural-Coco
  work. It starts as a "why is the model doing this" investigation, which is
  exactly the shape that skill is for.
- **`superpowers:brainstorming`** — before implementing the unnatural-Coco
  validators. The prompt-rule-to-validator approach is my proposal, not a
  ratified decision; the user has overturned an approach of mine before on
  this exact task, and it was the right call.
- **`superpowers:test-driven-development`** or **`tdd`** — this repo is
  strongly test-first (1015 tests). Both the domain module and the evaluator
  changes this session went test-first and it caught real mistakes.
- **`superpowers:finishing-a-development-branch`** — if merging option 1.
- **`/progress`** — read-only feature status if the user wants orientation
  before choosing.

Skip `/task-workflow` unless the user asks for it; this work is not tracked as
a GSD phase.

## Working notes about the user

- Direct and willing to overturn a wrong approach — they rejected
  romanize-in-place after I had already built it, and were right. Surface
  design implications rather than quietly implementing.
- Wants concerns stated once, plainly, then the work delivered. "Okay go
  ahead" means proceed with judgment, not check back in at each step.
- Prefers measured claims over confident ones. The 15/16 → 14/16 →
  16/16 sequence this session only happened because the figure was re-checked
  instead of assumed to carry over.
- Do not start dev servers without tearing them down before yielding — the
  user runs their own on port 3000 (memory:
  `coco-english-stop-server-before-turn`).
