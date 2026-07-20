# Phone UAT follow-ups — 2026-07-20

Findings from the user's phone UAT of the sentence-aware pagination branch
(`worktree-dynamic-dialogue-pagination`, session of 2026-07-20, ~10:27–10:50 KST,
via the ngrok tunnel to the port-3200 dev server). The pagination feature itself
**passed** UAT; the vertical-Korean hint bubble was fixed on the branch
(commit `c6f6eced`). Everything below is **out of that branch's scope** and needs
its own task. Evidence screenshots are in `/Users/john/Downloads/` (filenames below).

Each item: evidence → likely cause → recommended solution. None of these are
started; treat each as an independent backlog task.

## Ship-today priority order

Keep the original item numbers below stable because handoffs, screenshots, and
task records already reference them. Execute in this order:

1. **Item 3 — silence guard:** prevent fabricated prompt echoes from reaching
   evaluation or consuming practice. Design and implementation plan approved;
   implementation is next.
2. **Item 2 — evaluator correction leakage:** remove the imitable literal
   example and add a deterministic guard against corrections containing Coco's
   question.
3. **Item 6 — minimal-effort answers:** make `yes`, `no`, and `I don't know`
   retry without consuming a turn.
4. **Item 1 — topic drift and run-on replies:** strengthen output validation or
   regeneration because the existing topic-continuity prompt rules did not hold
   during phone UAT.
5. **Item 4 — intermittent repeat voice:** time-box log/reproduction diagnosis;
   promote it to a ship blocker if it is systematic.
6. **Item 5 — phrase granularity and orphan punctuation:** post-core-flow
   polish unless it blocks comprehension.
7. **Item 7 — in-chat thinking state:** defer until after the core speaking
   loop is trustworthy.

**Ship-today cut line:** complete items 3, 2, 6, and 1; verify item 4 is not a
systemic failure; defer items 5 and 7 if time is tight.

---

## 1. Coco's dynamic reply pivots off-topic (swimming → games)

- **Evidence:** User answered "with my friend" to "Who do you swim with?" and Coco
  replied "Your friend is fun to swim with what games do you play together?" —
  an abrupt topic switch to games mid-conversation. (User report; no screenshot.)
- **Not a pagination bug.** Confirmed with the user: this is the *content* of the
  generated reply, not a page jump. `CocoDialogueBox` has no auto page-advance.
- **Likely cause:** the dynamic-turn / follow-up generator drifting from the
  current topic — either free-associating ("play with friend" → "play games") or
  steering toward other mission target vocabulary. Also note the run-on
  punctuation ("swim with what games…"), which reads badly and degrades pagination
  quality (sentence-aware pages depend on sentence punctuation).
- **Recommended solution:** tighten the dynamic-turn prompt: the follow-up
  question must stay on the current answer's topic unless the mission script
  moves on; require complete, correctly punctuated sentences. Add a couple of
  source-string tests pinning the prompt rules, and eyeball a few generations.

## 2. "Try this" suggestion leaks the evaluator prompt's example and appends Coco's question

- **Evidence:** `Screenshot_20260720_103302_Chrome.jpg`. Mission question "What
  games do you like to play?", student transcript "The bells are ringing."
  (mis-transcription of "Valorant"), and the correction shown was
  "I don't play soccer. What games do you like to play?"
- **Likely cause:** `src/server/ai/turn-evaluator.ts` — the suggested sentence
  "I don't play soccer." is *verbatim the example inside the prompt* (line ~110:
  "…for example 'I don't play soccer.'…"), and the model appended the
  missionQuestion despite line ~108 explicitly forbidding it. Classic
  example-leakage under an off-topic transcript.
- **Recommended solution:** rework the prompt: move the fragment-expansion
  example out of imitable position (or make it schema-described rather than a
  literal sentence), restate that improvedSentence must be a single declarative
  student answer with no question appended, and add an output guard that strips
  or rejects an improvedSentence containing the missionQuestion. Cover with
  evaluator unit tests.

## 3. Silent recording → Whisper echoes its own prompt as the transcript

- **Evidence:** `Screenshot_20260720_104829_Chrome.jpg`,
  `Screenshot_20260720_105047_Chrome.jpg`. User recorded silence; "You said:"
  shows "Context: The student is a Korean ESL learner speaking English.
  Transcribe only the English words spoken." The downstream "Try this: I brush
  my teeth every day." is the evaluator doing its fallback on garbage input.
- **Likely cause:** `src/server/audio/transcription.ts:108` passes that text as
  the Whisper `prompt`; on silent/near-silent audio Whisper is known to
  hallucinate the prompt back as the transcript.
- **Recommended solution:** detect and reject no-speech results before
  evaluation: (a) discard transcripts with high similarity to the prompt string,
  (b) use response metadata (e.g. `no_speech_prob`/segments if available) or a
  minimum-duration/energy check, and (c) show a friendly "I couldn't hear you —
  try again!" state that does **not** consume a turn. Unit-test the guard.

## 4. Repeat voice intermittently "Voice unavailable"

- **Evidence:** `Screenshot_20260720_102908_Chrome.jpg`. The Say card's speaker
  control shows the muted icon + "Voice unavailable".
- **Likely cause:** unknown — intermittent TTS generation/fetch failure
  (provider error, timeout, or cache miss path). Needs server-log correlation at
  the timestamp (~10:29 KST 2026-07-20).
- **Recommended solution:** investigate dev-server logs for the TTS route around
  failures, add structured logging on the failure path if it's silent, then
  decide: retry button, automatic single retry, or longer timeout.

## 5. Phrase-selection granularity + orphaned trailing "?"

- **Evidence:** `Screenshot_20260720_104445_Chrome.jpg` ("How often do you
  [ride your bike outside] ?"), `Screenshot_20260720_104346_Chrome.jpg` ("[What
  do you like to do outside] ?" with the "?" orphaned on its own line).
- **User's preference:** several smaller chunks — e.g. "how often" + "ride your
  bike" + "outside" — instead of one long chunk; up to 3 phrases is already
  allowed but the model picks one big one. The orphaned "?" happens because the
  phrase renders as an `inline-block` button; when the phrase is nearly the whole
  sentence the button wraps as a block and trailing punctuation lands alone.
- **Likely cause:** prompt in `src/server/ai/translation-hint-generator.ts`
  (~line 96): "Return zero to three useful semantic meaning units… prefer
  contextual chunks…" — nothing biases toward multiple shorter chunks or caps
  chunk length. Button style: `mascotPhraseButtonStyle` in
  `src/components/student/styles.ts` (~line 408).
- **Recommended solution:** prompt tuning — prefer 2–3 short chunks (≈2–4 words)
  over one long chunk; never select a span covering the whole sentence minus
  punctuation. Note the cached hints table (`translation_hint_cache`) will serve
  old selections until entries expire/are invalidated — decide whether to bump
  the cache key. For the orphan "?", shorter chunks mostly dissolve it; if not,
  consider `display: inline` on the phrase button so it line-breaks naturally.

## 6. One-word answers should not consume a turn

- **Evidence:** user report — students can answer "yes / no / I don't know" and
  finish homework without producing sentences.
- **Product decision (user-stated):** minimal-effort answers should at minimum
  not consume a turn; prompt the student to try a full sentence instead.
- **Likely place:** the turn-evaluation / turn-consumption flow
  (`src/server/ai/turn-evaluator.ts` and the mission-flow step that decrements
  turns). Needs a small design first: what counts as minimal effort (word count?
  target-pattern presence?), what the retry UX says, and whether teachers see it.
- **Related:** the worktree-cleanup notes (2026-07-20) mention an unmerged local
  WIP branch with a **moderation gate** — review it before building; it may
  overlap or conflict.

## 7. Show "Coco is thinking…" inside the chat box

- **Evidence:** user request during UAT.
- **Context:** a thinking/loading treatment exists from the fluid-mission-hints
  work (see `docs/superpowers/plans/2026-07-16-fluid-mission-hints-thinking-replies.md`)
  but the thinking line does not appear in the chatbox itself.
- **Recommended solution:** while awaiting the dynamic reply, render a
  "Coco is thinking…" line (or animated ellipsis) inside `CocoDialogueBox`
  instead of/in addition to wherever it shows today. Small UI task; respect the
  child-ESL copy register.
