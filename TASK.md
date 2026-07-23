# Evaluation and follow-up quality

**Status:** Implementation in progress (Tasks 1-5 of 8 complete)
**Classification:** Consequential
**Started:** 2026-07-23

## Desired outcome

Improve dynamic-conversation evaluation and Coco follow-ups so elementary
learners advance after minor, meaning-preserving recasts, repeat material
corrections, and always receive a safe, relevant, answerable next prompt.

The learner's actual transcript must remain auditable separately from any
naturalized wording used to ground later Coco replies.

## Scope

- Classify conversation corrections by error type:
  - function-word-only slips with meaning and word classes intact are minor;
  - missing or incorrect structures and word-class/category errors are
    material.
- Store minor recasts as `accepted_original` with an optional
  `improvedSentence`; do not require repetition.
- Keep material errors on the existing correction-and-repeat path.
- Repair deterministic run-on detection and regeneration.
- Remove the blanket either/or rejection while keeping exactly-one-question
  and topic-drift validation independent.
- Replace unusable follow-up fallbacks and reduce avoidable fallback
  selection.
- Preserve the current static Final Coco closing fallback and closing flow.

## Acceptance examples

- `I'm going to library` is accepted as a minor missing-article slip. An
  optional natural model such as `I'm going to the library.` does not require
  repetition.
- `I want read cartoon` is material, is corrected to
  `I want to read cartoons.`, and requires repetition.
- `I will go to the exercise` is material because `exercise` is used as the
  wrong destination-noun category, is corrected to `I will exercise.`, and
  requires repetition.
- `I hear you! Let's keep going.` is never selected as a follow-up because it
  gives the learner no answerable prompt.
- After `I will eat sushi.`, a generic line such as
  `Nice! What happens next?` is not an adequate substitute for a relevant
  reaction and question.

## Current-state evidence

- `decideOriginalTurnOutcome` maps any `correctionNeeded` result to
  `needs_correction`.
- The `accepted_original` decision currently permits no
  `improvedSentence`.
- `attempt_turns.original_transcript` and `improved_sentence` are separate,
  and reconstructed conversation history currently prefers the improved
  sentence.
- `topic_drift` validation is incorrectly gated by
  `!allowEitherOrQuestion`.
- Run-on detection accepts a comma before a question starter even though the
  generation contract requires sentence-ending punctuation.
- Follow-up degradation uses a context-free, turn-order-selected static
  library containing both rejected UAT lines.

## Constraints and non-goals

- Dynamic conversation mode only unless a test proves a shared pure contract
  must change; preset behavior must remain unchanged.
- Preserve teacher-review auditability, owned history reconstruction,
  assignment and attempt ownership checks, RLS assumptions, mission
  snapshots, per-turn audio, signed playback, and completed re-entry.
- Preserve the completed Final Coco closing behavior and its static fallback
  exactly.
- No database migration unless the approved design proves the existing
  transcript/improved-sentence columns are insufficient.
- No runtime implementation until the written specification and then the
  test-first implementation plan receive separate explicit approval.
- No push, merge, deploy, publish, or Supabase mutation without separate
  explicit approval for the exact action and environment.

## Affected surfaces

- Original-turn evaluation schema, prompt, decision mapping, and guards.
- Stored evaluation and student feedback/resume mapping.
- Owned conversation-history construction.
- Generated-line deterministic validation and correction retry.
- Follow-up fallback selection and moderation/generation orchestration.
- Focused domain, server, flow, and regression tests.

## Student review presentation decision

- Do not interrupt a dynamic conversation to show an accepted minor recast.
- Add an end-of-mission **Homework Review** in a text-message layout.
- Show Coco's icon and name above left-aligned Coco bubbles.
- Show the student's initial and name above right-aligned student bubbles.
- Preserve and display the learner's actual replies.
- For an accepted minor recast, show the naturalized sentence after the
  conversation and mark only the changed words in red.
- For an answer that required repetition, show both the original reply and the
  accepted repeat. Place a compact red `!` to the left of the original bubble
  and green `✓ Good job!` beneath the accepted repeat.
- For an answer accepted without correction, show green `✓ Good job!`.
- Use no correction label such as `Small fix`, `Practice fix`, `Next time`,
  `Not yet`, or `Retry`.
- Dynamic mission completion flow is:
  Final Coco goodbye → **Finish mission** → **Homework Review** →
  **Back to homework**.
- The existing preset mission **Mission complete!** screen remains unchanged.
- The selected planning mockup is the inline-alert text-message variant created
  during brainstorming. It is synthetic planning evidence, not an application
  screenshot.

## Evaluator architecture decision

- Extend the structured conversation evaluation with an explicit three-way
  correction severity: no correction, minor correction, or material
  correction.
- No correction is accepted normally.
- A minor correction is stored as `accepted_original` with an optional
  `improvedSentence`; it never requires repetition.
- A material correction uses the existing correction-and-repeat path.
- The boundary is based on error type, not character or token distance.
- Keep the learner's exact transcript in `original_transcript`; use the
  optional naturalized wording for later conversation grounding and Homework
  Review.
- Reuse the existing `improved_sentence` column and evaluation JSON unless
  specification review finds contrary code evidence; no database migration is
  currently expected.

## Observable done checks

- Dedicated design specification is written, self-reviewed, and explicitly
  approved.
- A separate test-first implementation plan is written, self-reviewed, and
  explicitly approved before runtime changes.
- Later implementation proves all concrete acceptance examples with focused
  tests.
- Regression evidence proves preset evaluation, teacher-review flow, closing
  generation/fallback/UI, history ownership, and student completion behavior
  remain intact.
- Proportionate typecheck, lint, full tests, and build are run before Task 2 is
  reported complete; before build, confirm no dev server is sharing this
  checkout's `.next`.

## Planning sequence

1. Reconcile the agreed product rules with current evaluator, history,
   moderation, and fallback contracts.
2. Record the approved student-presentation decision.
3. Compare design approaches and select the smallest sufficient architecture.
4. Write and self-review the dedicated design specification.
5. Obtain explicit written-spec approval. ✅ Approved by the user's request to
   write the implementation plan on 2026-07-23.
6. Write and self-review a test-first implementation plan and obtain explicit
   plan approval.

## Current position

The dedicated design specification is approved at
`docs/superpowers/specs/2026-07-23-evaluation-follow-up-quality-design.md`.
The test-first implementation plan is approved at
`docs/superpowers/plans/2026-07-23-evaluation-follow-up-homework-review.md`
(planning commit `bf4d38fa`). Runtime implementation is underway on `main`,
task-by-task with TDD, per that plan.

Completed:

- **Task 1** (prior session): Added the explicit three-way conversation
  correction severity (`none | minor | material`) to `decideOriginalTurnOutcome`.
- **Task 2** (commit `c3948938`): Minor recasts persist as `accepted_original`
  with an optional `improvedSentence` and no live repeat. While implementing,
  found and fixed a genuine contradiction between Task 1's `validCombination`
  `?`-rejection and the pre-existing parrot-guard regression test (UAT
  2026-07-16); resolved per explicit user choice by reordering so the parrot
  guard's `isParrotedMissionQuestion` check exempts that one case, via a new
  shared helper in `src/domain/ai/turn-evaluation.ts`. Full suite (134 tests
  at the time) passed after the fix.
- **Task 3** (commit `9e003805`): Repaired the deterministic follow-up line
  policy in `src/domain/ai/conversation-generation.ts` and
  `src/server/ai/conversation-generator.ts` — either-or questions are no
  longer blanket-rejected; they're accepted when relevant to the active
  topic and rejected only via the same `topic_drift` check used for any
  other reply. Run-on detection no longer treats a comma as an acceptable
  boundary before a question starter. Removed the vagueness-gated
  `allowEitherOrQuestion` coupling and its `VAGUE_OR_STUCK_*` server-adapter
  constants entirely. `either_or_question` remains in the
  `GeneratedCocoReplyLineViolation` union only so historical stored
  moderation events stay type-readable; the validator never produces it now.
  Rewrote ~10 existing server-adapter tests whose fixtures assumed the old
  vagueness-gated either-or model once each fixture line was re-checked
  against the new validator (several either-or lines that used to be
  rejected are now correctly accepted as relevant); added the plan's two
  required new tests (comma-run-on regeneration, single-call relevant
  either-or). Full regression suite: 91 files, 958 passed, 4 skipped.
  `npx tsc --noEmit` clean.
- **Task 4** (commit `0fde89bb`): Replaced the turn-order-rotated
  `selectFallbackLine`/`CANNED_FALLBACK_LINES` mechanism in
  `src/domain/conversation/fallback-lines.ts` with response-state-aware
  selection: `FollowUpFallbackKind = "meaningful" | "vague_or_stuck" |
  "uncertain"`, `classifyFollowUpFallbackKind`, `selectFollowUpFallbackLine`.
  Both rejected UAT lines (`I hear you! Let's keep going.`,
  `Nice! What happens next?`) are gone. `selectClosingFallbackLine`/
  `CANNED_CLOSING_FALLBACK_LINE` preserved byte-for-byte. Wired
  `src/server/student-access/audio-upload.ts`'s `fallbackLineForContext`
  (now `(context, inputUsable)`) through all 5 `runConversationTurn`
  call sites: `inputUsable: false` only on flagged/unavailable student
  input, `true` on every provider/schema/policy/output-moderation failure
  path (already-moderated input remains usable there); closing calls are
  unaffected by the flag. Added the plan's 4 required
  `fallback-lines.test.ts` tests plus 5 new orchestration tests in
  `audio-upload.test.ts` covering meaningful/vague/review-pending
  generation failure, unsafe input, and final-turn closing failure: all
  33 pre-existing `audio-upload.test.ts` tests only asserted
  `moderationEvent`/truthiness or the static closing string, so none
  needed edits. Full regression suite: 91 files, 969 passed, 4 skipped.
  `npx tsc --noEmit` clean.
- **Task 5** (commit `0fc16dae`): Extended
  `src/server/student-access/student-history.ts`'s owned recap model for
  dynamic missions. New `StudentRecapAttempt` (transcript/audio/pronunciation)
  is built separately for each turn's original and repeat clips/scores, so
  each attempt only ever surfaces its own matching evidence. Added
  `StudentRecapReviewState = "accepted" | "accepted_minor" |
  "repeat_accepted" | "neutral"`, derived by a pure `reviewStateFor` helper
  from `repeat_accepted`/`improved_sentence`/`evaluation.outcome`/
  `evaluation.correctionSeverity`; teacher-review turns resolve to `neutral`
  with no review reason exposed in the returned recap. `StudentMissionRecap`
  gained `conversationMode`, `characterId`, and `finalCocoLine`. For dynamic
  (`conversationMode: true`) missions, each row's displayed Coco prompt is
  chained forward from the previous row's non-empty `coco_line`, starting at
  `snapshot.turns[0].prompt`; the last row's `coco_line` becomes
  `finalCocoLine`. Preset missions keep the authored `turnOrder -> prompt`
  map unchanged and `finalCocoLine: null`. The initial ownership lookup now
  throws on a genuine Supabase error instead of silently treating it as "not
  found"; a clean-but-empty lookup still returns `null`. Legacy `transcript`/
  `audio`/`pronunciation` fields are preserved unchanged for the existing
  preset `StudentMissionRecap.tsx`/history page, which were read and confirmed
  to use only those legacy fields — no changes needed there; Task 7 will wire
  dynamic missions to the new Homework Review component instead. Added the
  plan's dynamic-recap tests (severity/repeat-state mapping with separated
  original/repeat evidence, neutral teacher-review turn with no leaked review
  reason) to `tests/server/student-history.test.ts`: 6/6 passing (4
  pre-existing preset tests unchanged). Full regression suite: 91 files, 971
  passed, 4 skipped. `npx tsc --noEmit` clean across the whole repo.

## Next step

Task 6: build the dynamic text-message Homework Review
(`src/domain/student/homework-review.ts` +test,
`src/components/student/HomeworkReview.tsx` +.module.css +test). Not
started.
