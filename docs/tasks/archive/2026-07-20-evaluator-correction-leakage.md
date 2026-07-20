# Task: Evaluator correction leakage guard (phone-UAT item 2)

**Status:** Complete
**Started:** 2026-07-20
**Completed:** 2026-07-20
**Branch:** main (no remote; nothing pushed)

## Goal

In conversation mode, the turn evaluator's "Try this" correction leaked the
prompt's literal example and appended Coco's mission question
("I don't play soccer. What games do you like to play?"). Stop both: no
imitable literal example in the prompt, and a deterministic guard so a
correction containing the mission question is never shown or spoken.

Evidence record: `docs/tasks/2026-07-20-phone-uat-followups.md#2-try-this-suggestion-leaks-the-evaluator-prompts-example-and-appends-cocos-question`

## Outcome

Spec (with post-review amendment):
`docs/superpowers/specs/2026-07-20-evaluator-correction-leakage-design.md`
Plan: `docs/superpowers/plans/2026-07-20-evaluator-correction-leakage.md`

Commits (all on main):

- `7b008fcf` docs: design evaluator correction-leakage guard
- `6b927903` docs: plan evaluator correction-leakage guard
- `0c889c69` fix(ai): reject conversation corrections containing the mission question
- `e9702a8f` fix(ai): remove imitable fragment example and forbid appended questions in conversation prompt
- `10527985` fix(ai): match leaked corrections per Coco question sentence (code-review fixes)

Behavior (conversation mode only; preset unchanged; policy reject → retry):

- `guardParrotedConversationCorrection` now also downgrades a correction that
  contains any question-shaped sentence of the mission question (≥3 normalized
  words) as a whole-word phrase; whole-string equality covers shorter
  questions; curly apostrophes fold to straight during normalization.
- Conversation prompt: fragment-expansion rule no longer contains an imitable
  literal answer; new rule forbids appending questions or copying instruction
  examples into `improvedSentence`.

## Verification (commands actually run, 2026-07-20)

- `npx vitest run tests/domain/turn-evaluation.test.ts src/server/student-access/audio-upload.test.ts tests/server/turn-evaluator.test.ts` — 48 passed
- `npm test -- --run` — 801 passed, 4 skipped
- `npm run typecheck` — clean
- `npm run lint` — 0 errors; 1 pre-existing unrelated warning
  (`scripts/check-student-feedback-states.mjs:435`, unused `label`)

## Done checks

- [x] RED test: appended-question correction shape → `retry_original`/`parroted_correction`
- [x] Guard extended; legit question-back answers not flagged; short-question
      false positive ("Why?" in "That's why I like it.") pinned negative
- [x] Prompt rewritten; source-string tests pin new rules and absence of literal example
- [x] Existing parrot-guard + orchestration tests green
- [x] Full `npm test -- --run`, `npm run typecheck`, `npm run lint`

## Follow-up notes

- Next ship-critical item per the followups doc: item 6 (minimal-effort
  answers), then item 1 (topic drift), then time-boxed item 4 diagnosis.
- Prompt-layer effectiveness is only verifiable with live evaluator calls
  during the next phone UAT; the deterministic guard is the tested backstop.
