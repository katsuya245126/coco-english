# Phase 09 Pronunciation Feedback Design

**Date:** 2026-07-02
**Status:** Design decision saved; implementation not started

## Problem

The first pronunciation-scoring implementation compared every original answer
against the teacher's example answer. That is too rigid for free-response
missions.

Example:

- Teacher example: `I'm fine. How about you?`
- Student answer: `I'm good. And you?`

Both can be valid answers, but exact-reference pronunciation scoring can
penalize the student for saying a different valid sentence.

The retry/practice sentence also cannot be chosen independently from the weak
sound. If the student tried to say `fine` but Azure/transcription heard `pine`,
showing a model sentence like `I'm good` would remove the `F` sound the student
needs to practice.

## Decision

Pronunciation feedback must use a coherent **practice sentence**. The practice
sentence is the sentence the student is asked to repeat, the sentence Azure
pronunciation scoring should use as the reference, and the sentence that must
contain the selected focus word/sound.

Meaning correction and pronunciation practice are separate:

- Meaning/target-pattern evaluation decides whether the answer is acceptable
  English for the mission.
- Pronunciation feedback decides what the student should practice saying again.

The teacher's example answer is not the default pronunciation reference for a
valid alternate original answer.

## Student Feedback Rules

Pronunciation feedback appears immediately after each recording while the
attempt is fresh.

Student-facing feedback should stay small:

- show what the app heard;
- show one practice word when useful;
- show one focus sound when useful;
- show the full practice sentence to record again;
- make it clear that retry means saying the whole sentence/answer, not only the
  problem word.

Example:

```text
We heard:
I'm fine. And you?

Practice:
fine

Focus sound:
F

Try the whole sentence again:
I'm fine, and you?
```

## Practice Sentence Selection

Use this priority when selecting the practice sentence:

1. If the original answer is acceptable and pronunciation is the only concern,
   use a lightly cleaned version of what the student appears to have said.
2. If the app can confidently infer the intended word from the mission/example
   and the weakness is pronunciation, preserve that intended word.
   - Heard/transcribed: `I'm pine.`
   - Expected/intended: `I'm fine.`
   - Practice sentence: `I'm fine.`
3. If grammar or target-pattern correction is needed, use an improved sentence
   that preserves the student's valid content words whenever possible.
4. If the candidate practice sentence does not contain the selected weak sound,
   choose a different focus sound from that sentence or omit the sound hint.
5. If the app cannot confidently choose a coherent practice sentence, avoid
   specific sound feedback and use a generic retry prompt or teacher review.

Invariant:

> The focus word/sound must exist inside the practice sentence shown to the
> student.

## Scoring Reference Rules

Original answer:

- If the student's answer is valid but differs from the example answer, score
  pronunciation against the practice sentence derived from the student's answer,
  not against the teacher example.
- If the answer needs correction, score the subsequent repeat against the
  improved/practice sentence shown to the student.

Repeat attempt:

- Score against the exact practice sentence the student was asked to repeat.
- Do not substitute a different valid model answer if that would remove the
  focus word/sound.

## Repeated Sound Mistakes

Store phoneme-level data for every scored recording so the teacher side can
later derive recurring sound patterns by student or class.

Student-facing repeated-sound feedback should remain constrained:

- one focus sound;
- one main practice word;
- optionally one related word with the same weak sound;
- no tables, raw scores, or long lists.

Teacher-facing analytics can later summarize repeated patterns such as:

- a student often needs help with `/f/`;
- a class commonly struggles with `/r/` and `/l/`;
- a mission produced many weak `/th/` sounds.

## Non-Goals For This Decision

- No implementation yet.
- No hard submission block based only on pronunciation score until calibration
  is complete.
- No raw Azure score display to students.
- No requirement to store raw Azure JSON unless a separate debug-data retention
  decision is made.
