# Natural Conversation Policy Hardening

**Status:** Complete — partial localhost paid UAT accepted; no snapshot backfill required
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

- Use the approved hybrid natural-conversation policy design.
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
- [x] Complete Task 7 read-only attempt inspection evidence and safety tests.
- [x] Complete Task 8 focused tests, full suite, typecheck, lint, build, and
      observable-policy audit.
- [x] Add regressions for the reproduced correction, open-answer, upload, and
      structured-reply policy gaps.
- [x] Repair the reproduced policy boundaries without weakening the approved
      learner-meaning, teacher-review, or one-detail contracts.
- [x] Re-run focused and full verification before reconsidering paid-provider
      localhost UAT.

## Current position

The behavior design and its written specification were approved in chat on
2026-07-26. The detailed test-first implementation plan was approved before
execution. Tasks 1–7 are implemented in commits `3b447286`, `ad7e643a`,
`45461b96`, `45cdae82`,
`6edb614a`, `3150a25e`, and `ac8a4b5c`. Task 8 verification is complete:

- Focused natural-conversation suite: 346 tests passed across 13 Vitest files;
  attempt-report formatter: 2 Node tests passed.
- Full suite: 1,127 tests passed, 4 skipped across 101 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed with one pre-existing warning at
  `scripts/check-student-feedback-states.mjs:435` (`label` unused).
- `npm run build`: passed.
- Observable-policy audit: passed for the supplied chocolate, incomplete
  recording, family, Jenga, unsupported-detail, structured-reply, provenance,
  and legacy-evidence cases.

A subsequent review reproduced uncovered boundary cases despite those green
checks: correction grounding depended on the model's reason label, a small
finite-verb list rejected ordinary recasts, no-colon choice lists could change
the learner's answer, open-frame acceptance could bypass Hangul evaluation,
parroted corrections skipped the repair pass, and reply-level topic checks
could both miss drift and reject one-detail reactions. The existing approved
design already specifies the required behavior, and the user authorized this
test-first repair pass.

The review repair pass is implemented and freshly verified:

- Focused natural-conversation suite: 372 tests passed across 13 Vitest files;
  attempt-report formatter: 2 Node tests passed.
- Full suite: 1,153 tests passed, 4 skipped across 101 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed with the same pre-existing warning at
  `scripts/check-student-feedback-states.mjs:435` (`label` unused).
- `npm run build`: passed.
- `node --check scripts/inspect-attempts.mjs`, the local join-code source scan,
  and `git diff --check`: passed.

The final deterministic audit also covers question-grounded answer replacement,
unprovable near-spelling substitutions, regular inflections, named subjects,
copular fragments, and WH-question list parsing. Uncertain vocabulary changes
fail closed into the existing repair/teacher-review path rather than changing a
learner-owned answer.

The full suite's runtime socket tests required the approved escalated local
execution because the sandbox returned `EPERM` while binding a local port.

Task 7's public-safe formatter and tests are committed in `ac8a4b5c`. The
database inspection entrypoint remains ignored and local-only under the
repository's explicit rule for one-off production DB management scripts; it
was not force-added.

The unrelated pre-existing working-tree modification at
`.superpowers/sdd/task-1-report.md` remains untouched.

## Approved attempt-inspector formatter follow-up (2026-07-26)

The user approved a narrowly scoped local fix to the read-only attempt
inspector formatter. No paid-provider call, Supabase read/write, fixture change,
deployment, migration, cleanup, or broader implementation change is approved.

Root-cause reproduction: `pronunciation_scores.audio_clip_id` is unique, so the
nested Supabase relation is returned as one object (or `null`).
`formatAudioClip` treated that relation as an iterable array and threw
`object is not iterable` before printing the first turn.

- [x] Add and observe a failing formatter regression test using the real
      to-one pronunciation-score shape.
- [x] Normalize the to-one relation at the formatter boundary while preserving
      compatibility with the existing array fixture.
- [x] Run the focused formatter tests, syntax check, and diff check.

Fresh verification: `node --test scripts/lib/attempt-report.test.mjs` passed
3/3 tests; `node --check` passed for both the formatter and inspector entrypoint;
`git diff --check` passed. After separate exact-target approval, the inspector
was rerun read-only against three follow-up UAT assignments and completed
without the formatter error.

## Next step

No further product or data action is required. This archived task is included
with the local integration commit. Push, deployment, and cleanup remain
separate actions and are not authorized.

## Live localhost paid UAT (2026-07-26)

**Environment:** Supabase project `pcxxhfjnkjkjnpdtdqtp`; evidence source is
**localhost application evidence** from the current uncommitted `main`
checkout. No deployment, migration, reset, cleanup, provider/config change, or
unapproved implementation fix was performed.

- [x] Case 1 — preset open choice: **PASS**. The submitted transcript was
  `I think chocolate ice cream is the best.` The application accepted the
  original without repeat. Field-level attempt evidence recorded
  `outcome: accepted_original`, `correctionReason: none`, `requireRepeat: false`,
  `evaluationSource: deterministic`, `policyVersion: natural-conversation-v1`,
  transcription model `gpt-4o-mini-transcribe`, and runtime `local-dev`.
- [ ] Case 2 — interrupted recording: **SKIPPED FOR THIS REPLAY**. The prior
  off-script submission was `I chocolate` and the provider transcript was
  `아이 초콜렛`, not the required single-word `I`; the application routed the
  turn to teacher review with `needs_review_reason: failed_schema` and stored no
  repeat transcript. That evidence is retained, but it is not a result for the
  exact case 2 replay.
- [x] Case 3 — dynamic multi-activity follow-up: **PASS**. After
  `I will eat watermelon, swim, and eat chicken.`, Coco asked one brief
  follow-up about where the learner likes to eat watermelon. It did not restate
  the full list. The original turn was accepted with model evaluation.
- [x] Case 4 — dynamic family recast: **PASS**. A fresh tailored fixture asked
  `Who will you swim with?`. `My family.` became exactly
  `I will swim with my family.`, required one repeat, and stored
  `needs_correction` / `fragment_completion` followed by `accepted_repeat`.
  Both clips were transcribed and retained nested original evaluation evidence.
- [ ] Case 5 — complete Jenga answer: **NOT ESTABLISHED / OFF-SCRIPT**. The
  first recording was stored in a mixed English/Hangul form and routed to
  teacher review without an improved sentence or repeat. A dedicated retry was
  stored with incorrect word order, received the grounded correction
  `I like to play Jenga.`, and accepted that repeat. Neither original provider
  transcript matched the exact case input, so acceptance unchanged is unproven.
- [x] Case 6 — grounding guard: **PASS**. With the exact active question
  `Do you like to play it in the water or on the side?`, `On the side.` became
  exactly `I like to play it on the side.` and the repeat was accepted. The
  correction introduced no pool, Jenga, or other unsupported fact.
- [x] Case 7 — inspection: **PASS**. The repaired standard read-only inspector
  completed for the three follow-up assignments. It printed frozen mission
  settings, original/repeat transcripts, improved sentences, outcomes/reasons,
  nested original evaluation, policy/model/transcription/runtime provenance,
  moderation/fallback events, pronunciation summaries, and every clip's status,
  duration, size, MIME type, and timestamps. A source scan found no object keys,
  join codes, PINs, signed URLs, or reusable access values in the reports.

The redacted evidence artifact is local-only at
`scripts/output/coco-natural-conversation-paid-uat-2026-07-26-redacted.md`.

## Historical assignment compatibility and backfill decision

No assignment or attempt backfill is required:

- the hardening is enforced by current upload/evaluation/generation runtime
  code whenever a learner makes a new attempt, including against an assignment
  created before this change;
- `missionSnapshotSchema` supplies backward-compatible defaults for fields used
  by the policy (`conversationMode: false`,
  `requireCompleteSentenceAnswers: true`, and turn
  `answerShape: "open"`), and the existing upload test fixture intentionally
  exercises the older snapshot shape without those explicit fields;
- completed attempt evaluations remain historical evidence and must not be
  silently re-evaluated or rewritten;
- changing stored mission snapshots would violate the product contract that
  assigned homework remains frozen.

Therefore no Supabase preview or mutation was performed. Previously assigned
missions receive the new safeguards on their next attempt through the deployed
runtime; completed historical attempts remain unchanged and auditable.
The screenshot shown in the task thread was **localhost application evidence**
and was not persisted as a separate file.

The isolated UAT fixtures were created through the normal teacher UI in the
existing test class: the original preset and multi-activity missions plus three
minimal follow-up dynamic missions for cases 4–6. Each was assigned once. The
resulting missions, assignments, attempts, and audio remain remote and were not
deleted or reset. The user accepted this partial UAT result; no exact replay of
cases 2 or 5 is required.
