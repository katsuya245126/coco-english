# Evaluator correction leakage guard — design

**Date:** 2026-07-20
**Status:** Approved by user (policy: reject → retry)
**Evidence:** `docs/tasks/2026-07-20-phone-uat-followups.md#2-try-this-suggestion-leaks-the-evaluator-prompts-example-and-appends-cocos-question`

## Problem

During phone UAT (2026-07-20), a conversation-mode mission with the question
"What games do you like to play?" and an off-topic mis-transcription
("The bells are ringing.") produced the correction
"I don't play soccer. What games do you like to play?" — verbatim the literal
example inside `conversationInstructions` in `src/server/ai/turn-evaluator.ts`,
with the mission question appended despite an explicit prompt prohibition.

The existing deterministic backstop
(`guardParrotedConversationCorrection` in `src/domain/ai/turn-evaluation.ts`)
catches a correction equal to the normalized mission question, or a
question-shaped correction contained by a multi-sentence opener. It does not
catch a declarative answer followed by the full mission question, because that
combined sentence is neither equal to nor contained by the question.

## Decision

**Reject → retry** (chosen over stripping the appended question, and over a
prompt-only fix): a leaked correction is never partially salvaged, because the
declarative remainder may itself be prompt-example leakage. The student simply
re-records via the existing `retry_original` / `parroted_correction` path; the
leaked sentence is never shown or spoken.

## Changes

### 1. Domain guard (`src/domain/ai/turn-evaluation.ts`)

Extend `guardParrotedConversationCorrection` with one additional trigger:
after `normalizeForParrotComparison` of both strings, flag when the improved
sentence **contains the full mission question as a whole-word phrase**
(e.g. `" ${improved} ".includes(" ${question} ")`). This subsumes the existing
equality check and covers suffix shapes like
"I don't play soccer. What games do you like to play?".

- Keep the existing opener-containment check for question-shaped corrections.
- On trigger, return the existing
  `{ kind: "retry_original", reason: "parroted_correction" }` decision —
  no new decision kinds, no orchestration or UI changes.
- Conversation mode only; preset decisions pass through untouched.
- False-positive safety: a legitimate child answer that asks a question back
  ("I like Valorant. What about you?") does not contain the full mission
  question and is not flagged.

### 2. Prompt rewrite (`src/server/ai/turn-evaluator.ts`)

In `conversationInstructions`:

- Rewrite the incomplete-fragment rule without an imitable literal answer:
  describe the expansion ("expand it into one short declarative sentence in
  the student's own words that answers missionQuestion") instead of giving a
  literal example sentence.
- Restate that `improvedSentence` must be a single declarative student answer
  with no question appended.
- Add: never copy an example sentence from these instructions into
  `improvedSentence` (the leaked sentence appears in multiple instruction
  lines).
- Other instruction lines keep their accept/correct examples; they are
  anchored to student input and load-bearing for evaluation quality.

### 3. Tests (TDD, fakes only — never call the paid evaluator)

- `tests/domain/turn-evaluation.test.ts` (parroted-correction section):
  - RED first: appended-question shape → `retry_original` /
    `parroted_correction`.
  - Question-back answer not containing the mission question → not flagged.
  - Existing equality/opener cases remain green.
- `tests/server/turn-evaluator.test.ts` (conversation prompt section):
  source-string tests pinning the new rules and asserting the imitable
  literal example is gone.
- `src/server/student-access/audio-upload.test.ts`: existing orchestration
  guard regression continues to cover the wiring; no new wiring is added.

## Amendment (post-review, 2026-07-20)

Code review found that in dynamic chat `missionQuestion` is Coco's previous
generated line (`audio-upload.ts`: `snapshotTurn?.prompt ?? previousCocoLine`),
which routinely has a lead-in sentence ("That's cool! What games do you like
to play?") — full-line containment would miss the leaked shape — and that very
short questions ("Why?") would false-positive on legitimate answers. The guard
therefore matches per question-shaped sentence segment of the mission
question, requires at least 3 normalized words for containment matching
(whole-string equality still covers shorter questions), and folds curly
apostrophes during normalization. Policy is unchanged: reject → retry.

## Non-goals

- General relevance scoring, minimal-effort answers (item 6), topic drift
  (item 1).
- Stripping or rewriting model output.
- Any preset-mode behavior change.

## Verification

Focused test files first, then `npm test -- --run`, `npm run typecheck`,
`npm run lint`.
