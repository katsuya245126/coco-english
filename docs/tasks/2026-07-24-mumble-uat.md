# UAT — unintelligible answer ("mumble") on a conversation turn

**Date written:** 2026-07-24
**Covers:** commits `8c1015ac` (withhold unusable transcript), `aed28ca9`
(reworded uncertain fallback), `67fc8f32` (vague-echo backstop), and the
transcription prompt change measured in `6715bb4d`.

## Why this UAT exists

Everything above is verified by tests and code-reading only. No part of it has
been exercised by a real child on a real device. The original defect — Coco
stating an invented detail back to a student — came from real usage, and the
mechanism that produced it was prompt instructions failing to do what they
said. The fix relies on a *different* set of prompt instructions taking over.
That substitution is exactly what a green test suite cannot prove.

One session of deliberate mumbling exercises the withholding fix, the fallback
line, and the degrade path together.

## What triggers the path

`responseHandling` becomes `review_pending` when `decideOriginalTurnOutcome`
returns `teacher_review` (`src/domain/ai/turn-evaluation.ts:137-142`), which
fires on any of:

- `outcome === "teacher_review"` — meaning unrecoverable without inventing
- `confidence === "low"`
- `englishLanguage === "uncertain"`
- any non-null `reviewReason` (`low_confidence`, `ambiguous`, `failed_schema`,
  `provider_failed`)

A deliberate mumble should land on the first or second. Note the evaluator is
instructed to route *understandable* fragments away from `teacher_review`
(`src/server/ai/turn-evaluator.ts:156`), so a clear one-word answer like
"School." will NOT trigger this path — it becomes `needs_correction` instead.
The mumble has to be genuinely unintelligible.

## Setup

- Real phone, real microphone. Not the simulator, not desktop Chrome.
- A conversation-mode assignment (not preset) with `requiredTurns >= 4`, so
  there is room for a mid-conversation turn before the closing.
- Use a test class/student — per project convention, keep real student data
  out of experiments.

## Cases

### Case 1 — mumble on a MIDDLE turn (the common case)

1. Answer turn 1 clearly and normally. Something with a concrete detail, e.g.
   "I play soccer with my friend."
2. On turn 2, mumble deliberately. Not silence, not a whisper — a genuine
   unintelligible vocalisation of roughly sentence length. Silence takes a
   different path (`no_speech`).
3. Read Coco's next line.

**Pass:**
- Coco does NOT state any concrete detail about what you just said.
- Specifically: no invented activity, place, person, day, or time.
- Coco either asks about the earlier clear answer (soccer, the friend) or asks
  a neutral question about the scene.

**Fail:**
- Coco asserts anything about the mumbled turn as fact — the original defect
  ("Playing soccer on the weekend sounds fun!" after an unintelligible clip).
- Coco says something that reads as an error message or mentions failure,
  retrying, or not understanding *as a system state* rather than as Coco.

### Case 2 — mumble on TURN 1 (the hardest case)

1. Mumble on the very first turn, before any clear answer exists.
2. Read Coco's line.

This is the hardest case because masking the only turn leaves zero usable
student content, so the "ask one short neutral question grounded in
scenePremise" instruction carries the entire load alone.

**Pass:** Coco asks a neutral, answerable question tied to the scene.
**Fail:** Coco invents a detail, or produces something unanswerable or
disorienting for a child with nothing to go on.

### Case 3 — the fallback line's register (child-facing copy)

The fallback shows on degrade paths (provider failure, flagged input), which a
mumble alone may not trigger. If you do see it, judge the wording:

> Hmm... Can you say it again?

**Pass:** reads as Coco being friendly, and a child knows what to do next.
**Fail:** reads as an error, or a young ESL learner would not know what is
being asked.

### Case 4 — regression check, code-switching still works

Not part of the mumble path, but it shares the transcription prompt changed
this session. Say an English sentence containing one Korean proper noun, e.g.
"I'm going to 거제도 this summer vacation."

**Pass:** the transcript keeps the Korean word, and Coco treats it as a name —
does not correct it, does not call it a mistake.
**Fail:** the name is stripped, "corrected", or the turn is rejected.

Measured expectation: place names and dish names retain Hangul (9/12 on
synthetic audio). A **personal name** may come back romanized ("Minjun") under
either prompt — that is faithful and accepted by the classifier, not a defect.

## Recording results

For each case, note the exact Coco line verbatim. If a case fails, the line
itself is the evidence — capture it before retrying, because the generation is
non-deterministic and the same input may pass on a second attempt.

Worth running each case twice for that reason. A single pass is weak evidence
either way.

## Known unmeasured

Frequency. We never established how often `review_pending` actually fires in
production, so this UAT proves the behaviour is correct when it happens, not
that it happens rarely (or often) enough to matter.
