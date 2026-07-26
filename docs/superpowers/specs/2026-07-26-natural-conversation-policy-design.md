# Natural Conversation Policy Hardening Design

**Date:** 2026-07-26
**Status:** Approved design; written specification awaiting review

## Purpose

Coco should help an elementary learner express the learner's own meaning. It
must not replace a valid preference with the authored example, turn an
interrupted recording into a target-sentence drill, expand a short answer with
unnecessary or invented context, or mechanically mirror a learner's whole
response before asking the next question.

This design hardens the boundary between:

1. facts the application can enforce deterministically;
2. language judgments that still require the evaluator;
3. generated text that must be validated before a learner sees or hears it.

Prompt instructions remain useful guidance, but they are not the sole safety
boundary.

## Evidence

The supplied report is:

`scripts/output/inspect-attempts-2026-07-26T10-12-41-317Z.txt`

Read-only inspection of the named remote rows established the following.

### Open preset answer changed to the authored choice

Attempt `e5f3edc2-ebe0-4737-94e0-e370dfeb88ed`, turn 1:

- frozen `answerShape`: `open`;
- Coco: `Which ice cream do you think is the best: vanilla, strawberry, or chocolate?`;
- authored frame hint: `I think _______ is the best`;
- original: `I think chocolate ice cream is the best.`;
- stored correction: `I think vanilla ice cream is the best.`;
- repeat: `I think vanilla ice cream is the best.`.

The answer-shape feature reached the frozen assignment snapshot, yet the model
still ignored its open-answer instruction. The recent no-op correction guard
does not cover this case because the unsafe correction differs from the
original. A prompt-only answer-shape branch is therefore insufficient.

### Interrupted or low-information recording treated as correction

The same attempt, turn 2:

- original transcript: `I`;
- original clip: 6,548 ms and 30,460 bytes;
- repeat clip: 6,543 ms and 179,209 bytes;
- stored correction: the full authored vanilla/chocolate sentence.

The similar nominal durations but very different byte sizes are consistent
with a low-information or interrupted recording, but do not prove its physical
cause. The product decision does not depend on that diagnosis: `I` is a
syntactically dangling utterance for this question, so the learner should retry
the recording rather than repeat invented content.

### Dynamic corrections add unnecessary or unsupported content

Attempt `3bb791bc-9fde-4806-a0d8-61c1268df580` used conversation mode with
`requireCompleteSentenceAnswers: true`.

- `My family.` became
  `I am going to swim with my family in the valley.`. A complete-sentence
  recast was required, but `I will swim with my family.` was sufficient.
- `I like to play Jenga.` became
  `I like to play Jenga when we swim together.`. The original was already a
  complete, relevant answer; the change was embellishment rather than repair.
- `On the side.` became
  `I like to play Jenga on the side of the pool.`. The conversation concerned
  a valley, and `pool` appeared in neither the learner's response nor the
  active question.

### Dynamic follow-up mechanically mirrors a list

After the learner's corrected activity list, Coco said:

`Eating watermelon, swimming, and eating chicken sounds delicious and fun! Who will you swim with in the valley?`

The follow-up did select swimming to explore, which is directionally correct.
The problem is the acknowledgement: it restates every activity and appends two
generic adjectives. The generator is currently told to acknowledge the latest
response specifically, which encourages this pattern.

### Stored evidence is incomplete

The raw rows exposed details hidden by the report:

- three failed original uploads on dynamic turn 4;
- one failed repeat upload on dynamic turn 1;
- the final closing used a canned fallback after `question_format` rejection;
- no repeat row contained the recently introduced nested
  `originalEvaluation`.

The last point means these attempts were processed by a runtime that did not
write the current nested shape, or another persistence defect remains. The
rows do not store a server release or evaluator policy identifier, so the two
possibilities cannot be distinguished.

## Product rules

### P1. Preserve learner meaning

An authored target example is scaffolding, not replacement content, on an
`open` turn. If the learner selects chocolate, every accepted correction must
still express chocolate.

### P2. Recording recovery is not language correction

A syntactically dangling recording is retried on the same question. It does
not display or speak a target sentence, consume the turn, generate Coco's next
line, or count as a correction attempt.

### P3. Complete-sentence policy remains teacher-owned

For dynamic conversation:

- when `requireCompleteSentenceAnswers` is `false`, a meaningful fragment is
  accepted;
- when it is `true`, the learner receives the shortest grounded complete
  recast and repeats it once.

This design does not silently weaken or remove the mission setting.

### P4. Corrections repair; they do not embellish

An improved sentence may add grammar required to express the learner's meaning.
It may not add optional setting, time, activity, preference, or world-knowledge
details. A complete relevant sentence must not require repetition merely
because the evaluator can make it longer.

### P5. Coco reacts lightly and explores one detail

A follow-up may use a short generic social reaction or mention one detail from
the latest answer. It must not summarize a multi-item answer, repeat most of
the learner's sentence, or stack generic adjectives such as
`delicious and fun`. Its question should explore one selected detail or make a
gentle nearby transition.

## Chosen architecture

Use a hybrid policy layer:

- deterministic fast paths and guards for provable cases;
- one structured evaluator call for genuine language judgment;
- one conditional repair call only when a deterministic validator rejects the
  first result;
- structured Coco reply parts plus deterministic reply validation;
- richer read-only inspection and persisted runtime provenance.

This preserves the existing server-owned upload and conversation orchestration
instead of introducing a new autonomous agent or provider-side conversation
state.

## Rejected alternatives

### Prompt-only tuning

This is the smallest code change, but the exact open-choice instruction has
already failed after being added to the prompt. It provides no enforceable
guarantee that chocolate remains chocolate.

### A second reviewer on every evaluator and generator call

A second model could catch more nuanced cases, but it nearly doubles normal
latency and cost while remaining probabilistic. This design uses a second call
only after deterministic policy rejection.

### Accept every short fragment

This would make conversation feel easier but override the explicit
`requireCompleteSentenceAnswers` mission setting. The approved policy retains
that setting and makes its recasts minimal.

## Component 1: Incomplete-recording policy

Create a pure incomplete-utterance detector separate from the existing
minimal-effort detector.

The first version is deliberately conservative. It recognizes only normalized
utterances that cannot stand as an answer in the current product, including:

- `i`;
- a bare article: `a`, `an`, `the`;
- a bare connector: `and`, `but`, `because`;
- a bare infinitive marker: `to`.

An exact normalized match to the authored target example always wins before
this detector. This prevents a legitimate fixed drill whose target is a single
letter or word from being trapped.

The guard runs after transcription and exact-target resolution but before:

- pronunciation scoring;
- original-turn AI evaluation;
- conversation history construction;
- Coco reply generation;
- correction TTS warming.

It stores:

```ts
{
  outcome: "retry_original",
  retryReason: "incomplete_recording",
  requireRepeat: false
}
```

The student feedback uses neutral recording-recovery copy:

`It sounds like the recording stopped early. Try recording your answer again.`

No target example or suggested answer is rendered or spoken.

## Component 2: Deterministic open-frame acceptance

For preset turns with `answerShape: "open"`, derive an optional frame matcher
from `hintLadder.tier1`.

A usable frame:

- contains at least one underscore run;
- contains at least three literal lexical tokens after removing instructional
  prefixes such as `Try using:`;
- compiles to a fully anchored, case- and punctuation-insensitive matcher;
- treats each underscore run as one or more learner-supplied lexical tokens.

For example:

```text
I think _______ is the best
```

matches:

```text
I think chocolate ice cream is the best.
```

When a valid open frame matches, the original is accepted without calling the
evaluator. The slot content remains learner-owned.

If no safe frame can be derived or the transcript does not match, evaluation
continues normally.

## Component 3: Typed correction intent

Extend original-turn structured evaluation with:

```ts
correctionReason:
  | "none"
  | "fragment_completion"
  | "grammar"
  | "vocabulary";
```

The existing severity remains authoritative for live flow:

- `none`: accept;
- `minor`: accept and store an optional recast;
- `material`: require a repeat;
- low confidence, ambiguity, invalid schema, or unsafe correction: teacher
  review.

The reason makes correction validation specific:

- a fragment completion may add sentence structure but no new fact;
- grammar and vocabulary corrections may replace erroneous language but must
  preserve learner-owned answer anchors;
- `none` must have no improved sentence.

## Component 4: Improved-sentence policy validator

Run a pure validator on every non-null `improvedSentence` before it is stored,
shown, spoken, or used for conversation grounding.

It composes the existing no-op and parroted-question guards with these new
checks.

### Open-choice preservation

When an open question contains an explicit list of alternatives, detect the
alternative spoken by the learner. The correction must retain that alternative
and must not introduce a different listed alternative.

Thus:

- original contains `chocolate`;
- correction contains `vanilla`;
- validator returns `open_choice_changed`.

The unsafe correction never reaches the learner.

### Pure embellishment

Treat a correction as embellishment when:

- the original has at least four lexical tokens;
- the original does not end in an article, connector, auxiliary, or
  preposition;
- the original's normalized lexical sequence appears unchanged at the start of
  the correction;
- the correction only appends more material.

`I like to play Jenga.` therefore remains accepted instead of becoming
`I like to play Jenga when we swim together.`

This guard is conservative; uncertain cases remain evaluator-owned.

### Minimal fragment completion

A `fragment_completion` must:

- be one declarative clause with no question;
- contain the learner's content words;
- use only language grounded in the original transcript and active question;
- contain no more than five lexical tokens beyond the original fragment;
- not copy the mission-wide target pattern merely to make the answer longer.

The token budget admits:

- `My family.` → `I will swim with my family.`;
- `School.` → `I play soccer at school.`;
- `On the side.` → `I like to play it on the side.`;

while rejecting:

- `My family.` → `I'm going to swim with my family in the valley.`;
- `On the side.` → `I like to play Jenga on the side of the pool.`

The provider receives these same limits in its instructions, but the validator
is the enforcement boundary.

### Conditional repair and failure

If the first evaluator result violates correction policy:

1. call the evaluator once more with the exact violation and the same owned
   turn input;
2. validate the repaired result through the same policy;
3. if it remains invalid, store `teacher_review`, require no repeat, and let
   the learner continue.

An untrusted correction is never patched by string substitution and never
shown to the learner.

## Component 5: Structured Coco follow-ups

Replace the opaque generated `{ line }` payload with:

```ts
{
  reaction: string | null;
  focus: string | null;
  question: string | null;
}
```

For a follow-up:

- `question` is required;
- `reaction` is optional and contains at most one short sentence;
- `focus`, when present, is one learner-owned detail from the latest response;
- the final rendered line is the punctuated reaction followed by the question.

For a closing:

- `question` and `focus` are null;
- `reaction` contains the specific acknowledgement and friendly goodbye;
- existing closing fallback semantics remain unchanged.

### Reply validation

Preserve the existing:

- exactly-one-question rule;
- run-on rejection;
- topic-drift rejection;
- vague-echo rejection;
- history-known-fact rule;
- active-activity rule;
- output moderation and one regeneration attempt.

Add:

- `multi_detail_echo`: a reaction repeats two or more distinct content details
  from the latest response;
- `response_summary`: a reaction reuses most of the latest response's content
  words;
- `stacked_generic_reaction`: a `sounds` reaction joins multiple generic
  adjectives, such as `delicious and fun`;
- `focus_mismatch`: the question does not connect to the declared focus or a
  permitted nearby transition.

The provider receives the exact rejection reason on its one correction retry.
If the second candidate remains invalid, the existing response-state-aware
fallback path runs.

### Example

Input:

`I will eat watermelon, swim, and eat chicken.`

Valid:

`Nice plans! Who will you swim with?`

Invalid:

`Eating watermelon, swimming, and eating chicken sounds delicious and fun! Who will you swim with?`

The valid line reacts without replaying the list and selects swimming as the
single detail to expand.

## Component 6: Evaluation provenance

Keep provenance inside the existing evaluation JSON; no migration is required.

Every newly stored original evaluation includes:

```ts
{
  policyVersion: "natural-conversation-v1",
  evaluationModel: "<resolved model>",
  runtimeVersion: "<VERCEL_GIT_COMMIT_SHA or local-dev>"
}
```

Repeat evaluations retain those fields under the existing nested
`originalEvaluation`.

The transcriber should return its resolved model and available numeric
confidence summary to the upload orchestration so the original evaluation can
record them without logging student text.

This evidence identifies which policy/runtime processed a future attempt. It
does not claim to identify whether the learner manually stopped recording,
the browser stopped, or the microphone failed.

## Component 7: Attempt inspection

Extend `scripts/inspect-attempts.mjs` without exposing object keys or public
audio URLs.

At assignment level, print:

- conversation mode;
- scene premise when present;
- target pattern;
- `requireCompleteSentenceAnswers`;
- each preset turn's `answerShape`.

At turn level, print:

- `improved_sentence` independently of evaluation JSON;
- original and repeat evaluation blocks;
- policy, evaluator model, transcription model/confidence, and runtime version
  when recorded;
- moderation or canned-fallback event;
- `created_at` and `updated_at`.

For every audio clip, including failed duplicates, print:

- clip kind;
- processing status;
- duration;
- byte size;
- MIME type;
- timestamps;
- pronunciation summary when present.

If a repeat evaluation lacks `originalEvaluation`, print:

`original evaluation unavailable (legacy row or stale runtime)`

The script remains a read-only service-role maintenance tool and continues to
exclude storage object keys and reusable student access values.

## Data flow

```text
recording
  -> transcribe
  -> exact authored target?
     -> yes: accept
  -> incomplete utterance?
     -> yes: store retry_original/incomplete_recording and stop
  -> open authored frame match?
     -> yes: accept learner's original wording
  -> evaluate original turn
  -> validate improved sentence
     -> valid: map severity to accept/recast/repeat
     -> invalid: one constrained evaluator repair
        -> valid: map repaired result
        -> invalid: teacher review, no repeat
  -> for accepted dynamic turn, build owned history
  -> generate structured Coco reply
  -> validate reaction/focus/question
     -> valid: moderate, persist, warm TTS
     -> invalid: one reply repair, then existing safe fallback
```

Preset and conversation modes continue to share upload, transcription,
evaluation persistence, audio evidence, and teacher-review ownership checks.
Only their already-distinct evaluation policies differ.

## Error handling

- Missing/failed transcription remains a recording retry.
- Incomplete utterance is a named recording retry, not a correction.
- Invalid evaluator schema remains teacher review.
- Unsafe first correction receives one repair; unsafe repair becomes teacher
  review with no repeat.
- Failed generation/schema/policy/moderation retains the current bounded
  regeneration and fallback behavior.
- Provenance absence on historical rows is displayed as unavailable, never
  inferred.
- Inspection query failures fail the script rather than printing a partial
  report as complete.

## Security and privacy

- All service-role reads and mutations remain behind existing owned
  assignment/attempt checks in runtime paths.
- Student text remains structured provider input and is not concatenated into
  system instructions.
- No audio object key, signed URL, student PIN, or reusable access value is
  added to reports or logs.
- Numeric confidence and model/runtime identifiers may be logged or stored;
  student transcript content stays out of logs.
- Existing RLS, mission snapshots, per-turn audio storage, signed playback,
  moderation, and teacher-review routing remain unchanged.

## Testing strategy

### Pure domain tests

- incomplete utterance positive and negative cases, including exact-target
  precedence;
- open-frame compilation and chocolate match;
- open-choice preservation;
- pure-embellishment detection;
- fragment length/grounding limits;
- structured reaction/focus/question parsing and assembly;
- multi-detail echo, response summary, stacked adjective, focus mismatch, and
  all existing reply-policy reasons.

### Server adapter tests

- open-frame match bypasses paid evaluation;
- incomplete recording bypasses evaluation, pronunciation scoring,
  generation, and TTS;
- first unsafe correction invokes one constrained repair;
- second unsafe correction routes to teacher review with no repeat;
- original provenance survives the repeat write;
- structured reply repair receives the exact rejection reason;
- existing moderation and fallback paths remain intact.

### Flow and UI contract tests

- incomplete-recording feedback uses neutral retry copy and no target sentence;
- retry returns to the same question;
- complete-sentence on/off behavior remains snapshot-owned;
- conversation advances only after an accepted/reviewed original or accepted
  repeat;
- resume and Homework Review read the preserved evaluation shapes.

### Inspection tests

Use deterministic formatting fixtures to prove:

- mission settings and answer shape are printed;
- `improved_sentence` is printed;
- failed and successful audio clips are both shown;
- nested original evaluation and provenance are shown;
- missing original evaluation emits the explicit warning;
- moderation/fallback events are visible;
- object keys and reusable access values are absent.

### Live localhost UAT

With explicit approval for paid provider calls and the chosen local/remote
data environment, replay:

1. chocolate open-frame answer: accepted without repeat;
2. dangling `I`: same-question recording retry with no target;
3. multi-activity answer: brief reaction and one-detail follow-up;
4. `My family.`: shortest complete recast;
5. `I like to play Jenga.`: accepted;
6. `On the side.`: no invented pool;
7. inspect the resulting attempt and confirm complete evidence/provenance.

Any screenshots or recordings are labeled as localhost application evidence.
No production mutation, deployment, or remote migration is implied.

## Rollout and verification

Implementation proceeds test-first in independently reviewable tasks:

1. inspection and provenance;
2. incomplete-recording recovery;
3. open-frame acceptance and meaning-preservation guards;
4. minimal conversation recasts and embellishment rejection;
5. structured follow-up generation and validation;
6. integration, full verification, and explicitly approved live UAT.

Run the narrowest focused tests after each task. Before completion, run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

Deployment, push, merge, paid live calls, and any remote data mutation each
remain separate external actions requiring explicit approval.
