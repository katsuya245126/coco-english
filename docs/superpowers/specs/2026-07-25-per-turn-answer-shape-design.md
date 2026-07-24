# Per-Turn Answer Shape: Target Sentence as Scaffolding, Not a Yardstick

**Date:** 2026-07-25
**Status:** Design approved, pending spec review

## Problem

Preset mission turns treat the authored `targetExample` as an answer key. For
questions that have no single correct answer — opinions, preferences, "which do
you like best?" — this coerces the child into a false statement.

Observed (Test class, attempt `038f325a`, 2026-07-24T15:32 UTC ≈ 2026-07-25
00:32 KST):

- Coco: "Which ice cream do you think is the best: vanilla, strawberry, or
  chocolate?" Target example: `I think vanilla ice cream is the best.`
- Child answered `I think chocolate ice cream is the best.` — correct English,
  used the taught frame, chose an option the question offered.
- System marked it `needs_correction`, showed the frame hint, and made the child
  **repeat the vanilla example**. The child, who picked chocolate, was made to
  say she likes vanilla.

### Why prompt-patching has failed

`turn-evaluator.ts` accumulated ~15 lines of `presetInstructions` (incl. a
literal vanilla/chocolate worked example, committed in `b9a165cb` at
2026-07-24 14:43 KST) trying to teach one prompt to behave two ways. The
coercing attempt above ran *hours after* that commit shipped. The strongest
possible prompt patch — the exact case, spelled out — did not hold.

Root cause: `preset` mode conflates two turn kinds — **fixed-answer** turns
(there is a right answer) and **open/opinion** turns (there is not) — and hands
both the same `targetExample` as if it were an answer key. The evaluator is
forced to re-derive "is this an opinion question?" from prompt text on *every
attempt*, and gets it wrong even when handed the answer.

## Principle

A turn's answer-shape is a property of the turn, decided **once at authoring
time** and stored in the data — not re-guessed by the evaluator on every
attempt. For open turns the target sentence is **scaffolding** (a frame the
child sees when stuck), never a match target.

## Design (Approach A)

### 1. Data model

Add one field to each mission turn:

```
answerShape: "fixed" | "open"   // default "open"
```

- Defined in `src/domain/mission/schemas.ts`; threaded through snapshot and
  serialization types (`mission-turn-serialization.ts`, `student-question-state.ts`).
- **Defaulted, not required.** No blocking migration. Any turn predating this
  feature, or left unset, is treated as `open` (lenient — never coerces).

### 2. Save-time classifier

When a mission is saved, one **batched** AI call classifies every turn from its
question + target example.

- **`open`** — no single correct answer: opinion, preference, favourite,
  "which do you like / think is best", personal facts, or a choice among options
  the question itself offers.
- **`fixed`** — a genuine correct answer being drilled ("How do you say hello?",
  "What's the past tense of go?").
- **On any uncertainty → `open`.**

Details:

- New `classifyTurnAnswerShape` server module (`src/server/mission/`), following
  the `turn-evaluator.ts` adapter pattern: server-only, test-injectable fake
  client, no paid calls in tests.
- Runs in the mission save path (`src/server/mission/mission-service.ts`).
- **Failure handling:** call fails or returns junk → every turn saves as `open`.
  A save is never blocked by classification failing.
- Placed at save-time (a natural pause), not lazily on first attempt, to keep any
  LLM latency off the child's speaking path.
- **Backfill:** out of scope for v1; the `open` default covers legacy missions.
  A one-off backfill can be run later if legacy fixed-answer turns prove too
  lenient in practice.

### 3. Evaluator branch

`buildOriginalPrompt` in `src/server/ai/turn-evaluator.ts` reads `answerShape`:

- **`fixed`** → today's `presetInstructions`, **minus** the accreted opinion
  band-aids (current lines ~107–114). Those exist only to make one prompt behave
  two ways; once data carries the distinction they are dead weight and are
  deleted. A fixed turn has a right answer, so matching the target is correct.

- **`open`** → new `openPresetInstructions`:
  - The target example is **scaffolding, not an answer key.** The child's
    choice / preference / opinion is always correct — never replace it with the
    example's choice.
  - Enforce the **frame**, not the content. Relevant + valid English + uses the
    taught pattern → `correct`. Relevant but skips the frame (e.g. "Chocolate.")
    → `needs_correction` with an `improvedSentence` that re-slots **the child's
    own choice** into the frame ("I think chocolate is the best"), never the
    example's choice.
  - Correct genuine English errors (grammar/structure) normally, preserving the
    child's meaning.
  - The frame comes from the hint-tier data that already stores
    `I think _______ is the best`.

`EvaluateOriginalTurnInput` gains `answerShape`; the mission flow passes it
through from the snapshot. Downstream is unchanged — the repeat step already
compares against the evaluator's `improvedSentence`
(`buildRepeatPrompt`), so an `open` correction naturally asks the child to say
*their* answer in the frame, not the example.

**Key property:** replaying the vanilla/chocolate attempt, turn 1 yields
`correct` (relevant + valid English + used "I think ___ is the best") — accepted
outright, no repeat, no coercion.

### Rejected alternatives

- **Teacher toggle at authoring** — rejected: user does not want to push
  classification effort onto teachers.
- **Route `open` through existing conversation mode** — rejected: conversation
  mode explicitly *never* requires the frame; open turns *do* require it, so this
  fights the mode's core assumption.
- **Deterministic frame-matcher (no LLM at eval)** — deferred: robustly matching
  child speech to a frame is its own rabbit hole and the LLM is still needed for
  the English-quality check. Noted as a possible future hardening backstop, out
  of scope for v1.

## Testing

- **Domain (no API):** schema accepts/defaults `answerShape`; serialization
  round-trips it; vanilla/chocolate transcript through the `open` prompt-builder
  produces the right instruction payload.
- **Evaluator (fake client):** `open` + differing choice → `correct`, no repeat;
  `open` + bare "Chocolate." → `needs_correction` re-slotting the child's choice,
  never the example's; `fixed` → unchanged; uncertain/missing → `open`.
- **Classifier (fake client):** ice-cream question → `open`; "How do you say
  hello?" → `fixed`; failure/junk → `open`.
- **Regression guard:** an explicit test that the `chocolate → made to say
  vanilla` scenario now passes (this scenario has silently failed twice).

## Rollout

Field defaults `open`, so shipping is safe with no migration and no backfill.
Existing missions get lenient behavior immediately; newly-saved missions get
classified. Final acceptance is ear-verifiable by the user on a real device;
the exact turns to check will be flagged in a UAT note.
