# Coco turn-evaluation strictness — design (2026-07-25)

## Problem

A student attempt dump
(`scripts/output/inspect-attempts-2026-07-25T05-32-26-620Z.txt`) showed Coco
demanding re-records that the student had not earned. Two defects underlie it.

### A. No-op corrections force pointless re-records

Attempt `103fa68e-66d3-4a1b-bfbf-ad0f89139359`, turn 2:

```
original: "I want to read many cartoons."
improved: "I want to read many cartoons."
```

The evaluator returned an `improvedSentence` byte-identical to the student's
transcript and still required a repeat. The student re-recorded the same words
and was accepted (`repeatCloseEnough: true`). The original was called
material-defective and the identical repeat was called close enough; both
cannot be true.

`decideOriginalTurnOutcome` already routes leniently — in conversation mode only
`correctionSeverity === "material"` forces a repeat, and `minor` returns
`accepted_original`. So this originates in the provider's judgment, not a code
branch. There is precedent for deterministic backstops against provider output
that ignores prompt rules (`guardParrotedConversationCorrection`,
`guardNonsensicalMinimalEffortCorrection`), but no guard covers a vacuous
correction.

### B. The evaluation that caused a repeat is destroyed

`audio-upload.ts:1214` writes the repeat result with a plain
`.update({ evaluation: toJson(decision) })` against the same `attempt_turns`
row. The repeat evaluation replaces the original one wholesale.

Consequently every turn ending in a repeat permanently loses
`correctionSeverity`, `meaningUnderstood`, and `targetPatternAttempted` — the
turns most worth debugging are the ones stripped of their evidence. A read-only
probe of the attempt above confirmed turns 2 and 3 retain only
`accepted_repeat` fields.

This is a diagnosability defect in its own right, and it is why the prior
session's plan ("confirm severity against stored rows") was not achievable.

## Scope

**In:** A and B.

**Out (deferred by the user, 2026-07-25):** Korean proper-noun handling
(`I like 키라` → `non_english`), Coco romanizing the name and closing a flagged
session, preset targets authored as fixed opinions
(`I think vanilla ice cream is the best.`), and the inconsistent
`targetPatternAttempted` flag on turn 4.

**Explicitly not fixed here:** turn 3's bare plural-`s`
(`adventure cartoon` → `adventure cartoons`) forcing a re-record. It is real
over-strictness, but the severity that produced it is already overwritten, so
any rubric change would be tuning against a guess. Fix B makes the next
occurrence diagnosable; the rubric decision is taken then, with data.

## Component 1 — no-op correction guard

Add `guardNoOpCorrection` to `src/domain/ai/turn-evaluation.ts`, applied in the
existing guard chain in `applyOriginalTurnEvaluation`.

Rule: when the decision is `needs_correction` and `improvedSentence` normalizes
equal to the student's transcript, the correction is vacuous. Downgrade to:

```ts
{ kind: "accepted_original", requireRepeat: false,
  improvedSentence: null, reinforcement: "positive" }
```

Comparison uses the existing `normalizeForParrotComparison`, so case, curly
apostrophes, and punctuation do not produce false negatives. The transcript is
already carried on `OriginalTurnGuardContext`.

Applies to **both** preset and conversation mode — the defect is not
mode-specific.

**Decision (user-approved):** downgrade to `accepted_original` rather than
routing to `teacher_review`. The student's sentence was correct; there is
nothing for a teacher to adjudicate, and flagging would fill the review queue
with non-problems.

## Component 2 — preserve the original evaluation

Change the repeat write to nest rather than replace:

```ts
evaluation: toJson({ ...decision, originalEvaluation: <original evaluation JSON> })
```

**No migration required** — `evaluation` is already a JSON column, so this is a
shape change inside the value. This matters: migration `202607250001` is
currently local-only, and stacking a second pending migration would compound
that risk.

Backward compatible: repeat fields stay at the top level where every current
reader expects them. Rows written before this change simply lack the
`originalEvaluation` key.

`scripts/inspect-attempts.mjs` gains a branch to print the nested original
evaluation when present.

## Testing

Extend `tests/domain/turn-evaluation.test.ts`:

- identical correction → accepted, no repeat required
- case/punctuation-only difference → still treated as a no-op
- genuine correction (`cartoon` → `cartoons`) → passes through unchanged
  (guards against the fix swallowing real corrections)

Extend `tests/.../audio-upload.test.ts`: the original evaluation survives a
repeat write and is readable under `originalEvaluation`.

## Verification

1. Unit tests pass.
2. Live chat run reproducing a no-op correction on the user's existing dev
   server (port 3000 — do not start a competing server; see memory
   `coco-english-stop-server-before-turn`).
3. Re-run `inspect-attempts.mjs` and confirm the nested original evaluation
   appears for a repeat turn.

## Notes

- Test students `test` / `ali` / `minju` are the developer's manual-testing
  personas; the sample dump is test data, which is appropriate for this
  analysis.
- Migration `202607250001` remains local-only and must be applied to remote
  before any deploy.
