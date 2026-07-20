# Task: Evaluator correction leakage guard (phone-UAT item 2)

**Status:** Active — design approved, spec written, planning next
**Started:** 2026-07-20
**Branch:** main (clean at start; HEAD 9ce45f19)

## Goal

In conversation mode, the turn evaluator's "Try this" correction leaked the
prompt's literal example and appended Coco's mission question
("I don't play soccer. What games do you like to play?"). Stop both: no
imitable literal example in the prompt, and a deterministic guard so a
correction containing the mission question is never shown or spoken.

Evidence record (do not duplicate): `docs/tasks/2026-07-20-phone-uat-followups.md#2-try-this-suggestion-leaks-the-evaluator-prompts-example-and-appends-cocos-question`

## Approved design (user, 2026-07-20)

Spec: `docs/superpowers/specs/2026-07-20-evaluator-correction-leakage-design.md`

- **Policy: reject → retry.** Extend `guardParrotedConversationCorrection` in
  `src/domain/ai/turn-evaluation.ts`: if the normalized improved sentence
  contains the normalized full mission question as a whole-word phrase,
  downgrade to the existing `retry_original` / `parroted_correction` decision.
  Conversation-only; preset behavior unchanged.
- **Prompt:** rewrite the incomplete-fragment rule in
  `src/server/ai/turn-evaluator.ts` `conversationInstructions` without an
  imitable literal answer; restate single-declarative-answer/no-question rule;
  forbid copying instruction examples into `improvedSentence`.
- **Non-goals:** relevance scoring, minimal-effort answers (item 6), topic
  drift (item 1), stripping/rewriting model output.

## Constraints

- TDD: reproduce the appended-question leak RED before changing guard/prompt.
- Fake clients and unit/source-string tests only; never call the paid evaluator.
- Preserve preset/conversation split.
- No push/merge/deploy without approval. No git remote is configured.
- Do not touch `.claude/worktrees/dynamic-dialogue-pagination` (protected, port-3200).

## Done checks

- [ ] RED test: appended-question correction shape → `retry_original`/`parroted_correction`
- [ ] Guard extended; legit question-back answers ("I like Valorant. What about you?") not flagged
- [ ] Prompt rewritten; source-string tests pin new rules and absence of literal example
- [ ] Existing parrot-guard + orchestration tests green
- [ ] Full `npm test -- --run`, `npm run typecheck`, `npm run lint`

## Progress

- [x] Task brief + design approval (reject → retry) via brainstorming
- [x] Spec written
- [ ] Spec user review
- [ ] Implementation plan (writing-plans)
- [ ] TDD implementation
- [ ] Code review + verification
