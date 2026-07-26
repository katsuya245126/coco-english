# Natural Conversation Policy Hardening

**Status:** Implementation in progress; Tasks 1–6 complete
**Classification:** Consequential
**Started:** 2026-07-26

## Desired outcome

Make Coco respond to elementary learners naturally without coercing their
meaning, treating interrupted recordings as language errors, over-expanding
short answers, or mechanically restating everything the learner said.

## Scope

- Preset open-answer evaluation:
  - accept a valid answer that fills the authored frame with the learner's own
    choice;
  - deterministically prevent a correction from replacing that choice with the
    target example's choice.
- Original-recording recovery:
  - recognize a small, conservative set of syntactically dangling transcripts;
  - ask the learner to record the same answer again without showing the target
    sentence or consuming the turn.
- Dynamic-conversation correction:
  - preserve the complete-sentence mission setting;
  - when enabled, recast a meaningful fragment into the shortest grounded
    complete sentence;
  - accept meaningful fragments when the setting is disabled;
  - reject embellishment and unsupported details.
- Dynamic Coco follow-ups:
  - react briefly without summarizing the learner's whole response;
  - select at most one detail to explore;
  - preserve the existing one-question, topic, history, moderation, closing,
    and fallback boundaries.
- Attempt inspection:
  - expose frozen mission policy, stored correction data, original evaluation
    evidence, every audio-clip status, and moderation/fallback events;
  - record evaluator policy/model/runtime provenance in new evaluation JSON
    without changing the database schema.

## Non-goals

- No change to teacher/student ownership checks, RLS, mission snapshots,
  assignment or attempt state transitions, signed audio access, or audio
  retention.
- No scoring, pronunciation, hint-ladder, teacher-review UI, Homework Review
  layout, or character-art changes.
- No replacement of the configured transcription, evaluation, conversation,
  TTS, moderation, or pronunciation providers.
- No database migration or historical-row backfill.
- No attempt to infer the physical cause of an interrupted recording from
  duration or byte size alone.
- No push, merge, deploy, publish, production mutation, or Supabase mutation.

## Approved decisions

- Use the hybrid design in
  `docs/superpowers/specs/2026-07-26-natural-conversation-policy-design.md`.
- Do not rely on prompt instructions as the only protection against
  meaning-changing corrections.
- When complete-sentence practice is enabled, `"My family."` receives the
  shortest grounded recast, such as `"I will swim with my family."`.
- When complete-sentence practice is disabled, the same meaningful fragment is
  accepted.
- A syntactically dangling recording such as `"I"` retries the original
  question and never routes to target-sentence repetition.
- A generated follow-up may use a short generic reaction or mention one detail;
  it must not restate a multi-item answer or stack generic adjectives.
- An invalid model correction receives one constrained repair attempt. If the
  repair is still unsafe, the turn routes to teacher review without requiring
  the learner to repeat the unsafe sentence.

## Observable done checks

- `"I think chocolate ice cream is the best."` is accepted on the supplied open
  turn without an evaluator call, correction, hint, or repeat.
- A genuinely malformed chocolate answer may be corrected, but every correction
  retains chocolate rather than substituting vanilla.
- `"I"` produces an incomplete-recording retry on the same question, with no
  target sentence, correction TTS, next Coco line, or turn consumption.
- `"My family."` becomes no more than `"I will swim with my family."` when
  complete sentences are required and is accepted unchanged when they are not.
- `"I like to play Jenga."` is accepted rather than expanded and repeated.
- A correction for `"On the side."` cannot introduce `"pool"` or other
  unsupported content.
- A follow-up to a multi-activity answer reacts briefly and explores one detail
  without restating the whole list.
- Existing conversation history, topic-drift, exactly-one-question,
  moderation, closing, fallback, ownership, repeat, and teacher-review
  contracts remain intact.
- A repeat row retains its original evaluation; the inspection script shows it
  or explicitly labels legacy/stale-runtime evidence as unavailable.
- The inspection report shows mission mode/settings, `improved_sentence`, all
  clip statuses and sizes, failed clips, moderation/fallback events, and
  evaluator provenance.
- Focused tests, the full test suite, typecheck, lint, and build pass.
- A real-provider localhost UAT replays the supplied preset and dynamic
  examples; its evidence is labeled localhost application evidence.

## Planning checklist

- [x] Inspect the supplied export, raw attempt rows, frozen mission snapshots,
      recent fixes, evaluator flow, generator flow, and inspection script.
- [x] Compare prompt-only, hybrid, and two-pass designs.
- [x] Obtain user approval for the hybrid design.
- [x] Write and self-review the dedicated design specification.
- [x] Obtain user review of the written specification.
- [x] Write and self-review the detailed test-first implementation plan.
- [x] Obtain implementation-plan approval before runtime changes.
- [x] Complete Task 1 deterministic answer-intake policies and focused tests.
- [x] Complete Task 2 typed correction policy and focused tests.
- [x] Complete Task 3 evaluator/transcription provenance and focused tests.
- [x] Complete Task 4 upload orchestration and focused tests.
- [x] Complete Task 5 same-question recording-recovery feedback and focused tests.
- [x] Complete Task 6 structured one-detail Coco replies and focused tests.

## Current position

The behavior design and its written specification were approved in chat on
2026-07-26. The detailed test-first implementation plan is at
`docs/superpowers/plans/2026-07-26-natural-conversation-policy.md`. Tasks 1–6
are implemented in commits `3b447286`, `ad7e643a`, `45461b96`, `45cdae82`,
`6edb614a`, and the current Task 6 commit, with 111 Task 6 focused tests
passing. The remaining work covers attempt inspection and verification.

The unrelated pre-existing working-tree modification at
`.superpowers/sdd/task-1-report.md` remains untouched.

## Next step

Continue with Task 7 using the approved inline execution plan. Do not begin
paid-provider UAT without explicit approval.
