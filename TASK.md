# Evaluation and follow-up quality

**Status:** Awaiting specification approval
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
5. Obtain explicit written-spec approval.
6. Only then write and self-review a test-first implementation plan and obtain
   explicit plan approval.

## Current position

The dedicated design specification has been written and self-reviewed at
`docs/superpowers/specs/2026-07-23-evaluation-follow-up-quality-design.md`.
Runtime implementation has not started.

## Next step

Obtain explicit written-spec approval before writing the separate test-first
implementation plan.
