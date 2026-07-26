# Dynamic Conversation Evaluation and Recovery Design

**Status:** Approved in chat on 2026-07-27
**Classification:** Consequential
**Evidence source:** Local read-only attempt export from 2026-07-26

## Goal

Make dynamic conversation feedback accurately distinguish:

1. an acceptable answer;
2. an understandable answer with a safe correction;
3. a genuinely unclear answer; and
4. an internal evaluator or reply-generation failure.

When the application can safely identify a language problem, the learner sees
the exact improved sentence and the established correction flow. When meaning
is genuinely unclear, the learner gets one explicit same-turn opportunity to
say the idea again. Internal failures never masquerade as a student mistake,
and no path can create a chain of context-free
`Hmm... Can you say it again?` questions.

## Source evidence and limits

The affected dynamic attempt in
`scripts/output/inspect-attempts-2026-07-26T14-50-06-564Z.txt` recorded:

- one accepted Turn 1 whose improved sentence was identical to the original
  while the evaluation still claimed a minor grammar correction;
- four later turns with `meaningUnderstood: true`, `confidence: high`, and
  `englishLanguage: english`, but also `teacher_review`,
  `reviewReason: ambiguous`, no correction, and no improved sentence;
- two generated reply failures with `focus_mismatch`;
- two persisted `Hmm... Can you say it again?` lines; and
- a final generic closing that did not acknowledge the latest food answer.

The export is localhost/runtime database evidence, not live production
application evidence. It retains the final policy violation name but not the
rejected structured reply parts, so the exact focus phrases that failed cannot
be reconstructed. The design repairs that evidence gap without claiming an
unseen candidate.

The inspector also mislabels evidence:

- `attempt_turns.coco_line` is the line generated after the row's learner
  answer, not the prompt that answer addressed; and
- a generated conversation turn has runtime answer shape `open`, although the
  report defaults a missing authored turn to `fixed`.

These reporting defects must be fixed with the behavior defects so later UAT
can be interpreted correctly.

## Selected approach

Use a contract-first hybrid:

- the model continues to interpret learner meaning and generate natural
  language;
- pure deterministic contracts reject internally contradictory evaluations,
  unsafe corrections, malformed replies, and ungrounded normal closings;
- one bounded evaluator repair call may correct the first invalid evaluation;
  and
- explicit application state owns ambiguity recovery and retry limits.

This is preferred over prompt-only tuning because prompts cannot enforce
cross-field consistency. It is preferred over a fully deterministic dialogue
state machine because meaning interpretation and natural follow-ups remain
model-suited, and replacing them would expand scope without addressing the
specific failing boundaries.

## Global constraints

- Conversation mode changes must not alter preset evaluation or progression.
- `targetPattern` remains soft lesson context in conversation mode.
- Corrections must preserve learner meaning and must pass the existing
  correction grounding policy.
- Mission snapshots, ownership checks, RLS, teacher review, per-turn audio,
  signed playback, and auditability remain intact.
- A retry must not create an unbounded loop or consume an extra authored
  conversation turn.
- No database migration or historical-attempt rewrite is required.
- No additional evaluator repair beyond one total repair call per submitted
  original recording.
- Paid-provider UAT, Supabase mutation, deployment, push, and publication
  remain separately approved actions.

## 1. Evaluation semantic contract

### 1.1 Coherent successful result

A no-correction result is coherent only when:

- `outcome` is `correct`;
- `meaningUnderstood` is `true`;
- `correctionNeeded` is `false`;
- `correctionSeverity` and `correctionReason` are `none`;
- `improvedSentence` and `reviewReason` are null; and
- language and confidence do not independently require review.

Conversation mode may accept a relevant answer without the target pattern.

### 1.2 Coherent correction result

A correction result is coherent only when:

- `outcome` is `needs_correction`;
- `meaningUnderstood` is `true`;
- `correctionNeeded` is `true`;
- severity is `minor` or `material`;
- reason is `fragment_completion`, `grammar`, or `vocabulary`;
- `improvedSentence` is one non-empty declarative answer;
- `reviewReason` is null; and
- the improved sentence passes the existing meaning-preservation and
  correction-policy validator.

Minor corrections remain accepted without live repetition. Material
corrections continue through the existing improved-sentence and repeat flow.

### 1.3 Coherent genuine ambiguity

A model result represents genuine ambiguity only when:

- `outcome` is `teacher_review`;
- `meaningUnderstood` is `false`;
- no correction or improved sentence is present;
- `reviewReason` is `ambiguous` or `low_confidence`; and
- the other confidence/language fields do not contradict that reason.

High confidence may mean the evaluator is confident that meaning is ambiguous,
but it may not coexist with `meaningUnderstood: true`.

### 1.4 Internal failure

Provider failure, structured-output failure, a contradictory result that still
fails after the one repair, and an unsafe correction that still fails after
the one repair are internal failure states. They route to teacher review and
do not ask the learner to correct or repeat language the application could not
safely establish.

They retain attributable evidence such as `failed_schema`,
`provider_failed`, or the final deterministic violation codes.

## 2. Unified normalization, validation, and repair

Every model evaluation follows this single pipeline:

```text
provider result
  -> canonicalize an identical correction
  -> validate cross-field semantic consistency
  -> validate the improved sentence when present
  -> valid: resolve application decision
  -> invalid: one constrained evaluator repair call
       -> canonicalize again
       -> run both validators again
       -> valid: resolve application decision
       -> invalid: internal teacher review
```

The repair prompt names the exact violation codes and reuses the same
server-owned evaluation input. It never receives a different mission,
question, transcript, or target.

There is one repair budget shared by semantic-contract and correction-policy
violations. A result cannot receive one semantic repair and then a second
grounding repair.

### Identical correction canonicalization

If the normalized improved sentence is identical to the normalized transcript,
the server canonicalizes the entire result before persistence:

```text
outcome: correct
correctionNeeded: false
correctionSeverity: none
correctionReason: none
improvedSentence: null
reviewReason: null
```

This applies to both minor and material provider labels. Provenance fields and
the original transcript remain unchanged. The learner is not asked to repeat,
the identical sentence is not shown as an improvement, and conversation
history uses the original transcript.

## 3. Bounded genuine-ambiguity recovery

### First coherent ambiguity on a turn

The first coherent ambiguity becomes an application-owned original retry:

```text
outcome: retry_original
retryReason: unclear_meaning
ambiguityRetries: 1
requireRepeat: false
```

The server:

- persists the transcript, evaluation provenance, and audio normally;
- does not flag the attempt for teacher review yet;
- does not generate or persist a next Coco line;
- does not consume the conversation turn; and
- returns the retry state to the mission flow.

The learner sees:

- `You said:` followed by the stored transcript;
- `Coco isn’t sure what you mean. Try saying the same idea again.`;
- the existing recording playback when available; and
- one `Try again` action.

The message does not claim a grammar error and does not show a fabricated
improved sentence.

### Second coherent ambiguity on the same turn

The retry count is read from the existing turn evaluation JSON. A second
coherent ambiguity on the same turn becomes terminal teacher review:

- no third ambiguity retry is offered;
- the first ambiguity transcript, evaluation provenance, and audio-clip ID are
  carried forward in an `ambiguityHistory` entry inside the existing
  evaluation JSON before the turn row is updated;
- the latest transcript and audio remain auditable;
- the attempt is flagged for teacher review through the existing owned
  server-side path; and
- conversation mode advances, preserving the existing no-trap contract.

The next reply is generated with `responseHandling: review_pending`, so the
unusable latest response is withheld and earlier usable history remains
available.

### Resume behavior

Reloading after the first ambiguity reconstructs the same
`retryUnclearMeaning` feedback state and preserves the one-retry budget.
Reloading after terminal teacher review follows the existing completed/reviewed
conversation behavior and cannot reopen an ambiguity loop.

## 4. Internal failure and fallback behavior

Internal evaluator failure never receives the learner-facing ambiguity retry.
The turn routes directly to teacher review because another recording cannot
repair a provider or contract failure.

`Hmm... Can you say it again?` is removed from the dynamic next-question
fallback library. New runtime behavior may not persist it as a generated next
turn. Historical rows remain unchanged and auditable.

Fallback selection remains state-aware:

- meaningful usable response: retain
  `Thanks for telling me! What do you like about that?`;
- vague or stuck response: retain
  `That's okay! Can you give me one example?`;
- withheld, unsafe, or internally uncertain response:
  `Thanks for trying! What else do you want to tell me?`;
- closing failure: retain the existing neutral closing
  `That was fun! Thanks for talking with me. See you next time!`.

The uncertain fallback is deliberately answerable, does not claim to
understand the rejected response, does not blame the learner for an internal
failure, and does not ask for a repeat after the application has already
advanced the turn.

## 5. Generated follow-up policy

The structured `focus` field is a generation aid and diagnostic value, not an
independent source of truth.

The deterministic policy continues to enforce:

- follow-up versus closing shape;
- exactly one follow-up question;
- correct sentence-ending punctuation;
- no run-on reaction/question;
- active-topic continuity;
- no vague-word echo;
- no multi-detail reaction;
- no response summary; and
- no stacked generic reaction.

It validates the actual question against the latest usable response and active
question. A lexical mismatch in the model's `focus` label alone cannot reject
an otherwise on-topic one-detail question. `focus_mismatch` remains readable
for historical moderation events but is no longer emitted as a live rejection
reason.

This preserves the safety value of rejecting actual topic drift while avoiding
false failures caused by labels such as `family meal`, `beach activities`, or
another harmless paraphrase.

## 6. Closing grounding

For a normal final response with usable content, a generated closing must:

- use reaction only, with no focus or question;
- satisfy the existing punctuation and child-safety rules; and
- acknowledge at least one related content detail from the latest response.

A generic closing that refers only to an earlier topic fails with a dedicated
closing-grounding violation and receives the existing one policy-correction
generation attempt.

If the corrected closing still fails, or if the final response is withheld for
review, the server uses the existing neutral closing fallback. It does not
invent a specific acknowledgement.

## 7. Diagnostic evidence

When both generated reply candidates fail deterministic policy, the stored
moderation event retains:

- the final violation codes;
- the final rejected structured `reaction`, `focus`, and `question`; and
- whether the rejected candidate was the initial or corrected candidate.

It does not duplicate the prompt, conversation history, join code, PIN, object
key, signed URL, or access credential. The structured candidate remains inside
the owned attempt evidence path and is subject to the same teacher/student
authorization boundaries as the rest of the turn.

The attempt inspector prints this evidence for authorized read-only diagnosis.

## 8. Attempt inspector semantics

For a dynamic attempt, the report derives and labels:

```text
prompt answered:
  turn 1 -> frozen opener
  turn N -> prior persisted turn's next Coco line

next Coco line:
  current persisted turn's coco_line
```

It never labels the current row's generated `coco_line` as the question that
the same row answered.

Policy display becomes:

- authored turn: print its frozen answer shape;
- generated dynamic turn: `open (runtime default)`;
- dynamic target: label the target pattern as soft lesson context rather than
  a required per-turn answer.

Legacy rows with missing linking lines are explicitly labeled unavailable
rather than silently attributed to the wrong turn.

## 9. Data and ownership

No migration is needed:

- ambiguity retry metadata lives in the existing evaluation JSON;
- the first ambiguity's transcript, evaluation provenance, and audio-clip ID
  are preserved in that JSON when a second original recording updates the turn
  row;
- rejected reply evidence lives in the existing moderation-event JSON;
- the latest original transcript and correction-repeat transcript remain in
  the existing turn fields;
- every audio clip remains separately stored and auditable; and
- mission snapshots remain frozen.

All service-role reads and writes continue to prove the student, assignment,
attempt, and turn relationship independently. UI reachability and
caller-supplied IDs remain insufficient authorization.

## 10. Verification strategy

### Pure domain tests

Cover:

- every coherent evaluation shape;
- contradictory high-confidence teacher review;
- no-op minor and material canonicalization;
- one shared repair budget;
- first and second ambiguity decisions;
- focus-label paraphrase accepted when the actual question is grounded;
- genuine question drift still rejected;
- normal grounded closing and ungrounded closing failure; and
- new fallback copy and removal of the old uncertain line.

### Server orchestration tests

Use the export's exact utterances:

- `I am going to the beach.`;
- `I will swimming and my family eat 삼겹살.`;
- `swimming and eat good food.`;
- `Swimming and eat delicious food.`; and
- `watermelon and shrimp and 삼겹살 BBQ.`

Prove:

- contradictory evaluation invokes one repair and becomes either a valid
  correction or attributable internal review;
- an identical minor correction persists as no correction;
- first ambiguity persists retry metadata without generating a reply;
- second ambiguity flags review and advances without a third retry;
- internal failure never uses the ambiguity retry;
- review-pending generation failure uses the new answerable fallback;
- a focus-label-only mismatch does not trigger canned fallback;
- an ungrounded normal closing is repaired or replaced neutrally;
- preset paths and provider-call counts remain unchanged; and
- ownership filters remain present on every affected service-role operation.

### Flow and UI tests

Prove:

- first ambiguity renders the transcript and explicit unclear-meaning copy;
- the retry stays on the same conversation turn;
- reloading restores that state and retry count;
- correction feedback still shows the improved sentence;
- accepted conversation answers still advance silently;
- terminal review cannot strand the learner; and
- no new-runtime visible or spoken fallback path emits the removed `Hmm...`
  line; historical stored rows are not rewritten.

### Inspector tests

Use a two-turn dynamic fixture to prove the opener/current/next line mapping,
runtime `open` labeling, soft-context target labeling, rejected structured
candidate evidence, and explicit legacy-unavailable output.

### Proportionate verification

Run focused tests first, then:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
node --test scripts/lib/attempt-report.test.mjs
node --check scripts/inspect-attempts.mjs
git diff --check
```

A real-provider localhost replay of the supplied utterances is valuable final
evidence but requires separate approval because it incurs paid calls and reads
or writes the named Supabase environment. Any resulting screenshot or export
must be labeled localhost application evidence.

## Acceptance criteria

- No understandable, high-confidence answer can persist as ambiguous teacher
  review without first failing the unified consistency/repair boundary.
- No identical sentence can persist as an improvement or correction.
- A safe material correction shows exactly what the learner should say and
  uses the existing repeat flow.
- A genuinely unclear answer receives exactly one explicit same-turn retry.
- A second ambiguity or internal failure cannot create another learner retry.
- New runtime behavior never persists
  `Hmm... Can you say it again?` as a dynamic next question.
- A focus-label paraphrase alone cannot cause `reply_policy_failed`.
- A normal closing acknowledges the latest usable answer or falls back
  neutrally.
- Attempt evidence distinguishes the prompt answered from the next Coco line
  and states the correct runtime answer policy.
- Preset behavior, ownership, storage, review, and safety contracts remain
  unchanged.
