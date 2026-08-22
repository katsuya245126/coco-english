# Contextual Unclear-Response Recovery Design

## Problem

Conversation mode can re-ask a question that already failed, and unreliable
transcription can send an understandable answer to teacher review before the
child gets a simple chance to repeat it.

## Product behavior

An unclear answer starts a bounded recovery sequence on the same logical turn:

1. **Original answer unclear:** use the static line
   `Hmm... can you say it again?` without generation or moderation calls.
2. **Recovery answer 1 unclear:** ask a new question about the same mission
   topic using a different what/who/when/where/why/how angle. Never repeat a
   previously asked question. Validate generated pivots deterministically and
   use a mission-topic-seeded deterministic pivot if generation fails.
3. **Recovery answer 2 unclear:** generate no further recovery question. Persist
   teacher-review evidence and continue the conversation using only earlier
   understood details.

The original attempt plus two recovery attempts is the complete ambiguity
budget. Recovery questions never increase the displayed or persisted turn
order.

Example:

> Coco: What do you like to do after school?
> Student: I play soccer.
> Coco: Who do you like to play soccer with?
> Student: [unclear]

Recovery 1:

> Coco: Hmm... can you say it again?

If that answer is also unclear, recovery 2 can branch from the earlier confirmed
detail:

> Coco: You said you play soccer after school. Where do you play soccer?

## Generation contract

Extend the existing conversation-generation input with an explicit recovery
purpose. Do not create a second provider adapter or a separate chat-history
format. The first retry is static; generation is used only for the second
recovery.

For the generated second recovery:

- Send the existing bounded, server-built conversation history.
- Replace unclear student responses with the existing withheld-response marker.
- Never guess, restate, or summarize withheld text.
- Produce exactly one short, elementary-level question.
- Stay grounded in the teacher-authored mission topic or an earlier understood
  student detail.
- Run the generated line through the existing output parsing, policy, moderation,
  and one-repair boundary.

The recovery must use a different question word from the failed question and
must not repeat anything already asked. Normal accepted-answer generation keeps
its current open-WH policy.

## Server flow and persistence

The upload orchestration remains the owner of evaluation, generation,
moderation, and persistence:

1. Before evaluation or deterministic exact-target acceptance, a transcript
   below the confidence gate gets a free static say-it-again retry. Track these
   retries separately from the ambiguity budget; after the bounded gate budget
   is exhausted, continue through normal evaluation.
2. Evaluate the recording against the active server-owned question.
3. When the first conversation result is `retry_original` with
   `retryReason: "unclear_meaning"`, select the static say-it-again line. On the
   second unclear result, generate and validate the topic W-pivot.
4. Persist the recovery line, ambiguity count, and raw ambiguity history as one
   state transition on the current attempt-turn row.
5. Return the recovery question to the client as learner-facing retry state.
6. On the next upload for that turn, prefer the current row's persisted recovery
   question over the authored or previous-turn question for evaluation and
   reply-hint framing.
7. When an answer becomes understandable, normal generation replaces the
   current row's temporary recovery line with the next-turn Coco line.

No migration is required: `attempt_turns.coco_line` already stores Coco's line
for the row, and `attempt_turns.evaluation` already stores ambiguity count and
history. Existing ownership checks and the service-role write boundary remain
unchanged.

## Client and resume behavior

For `retryUnclearMeaning`, the client retains the current turn index, sets the
returned recovery question as the active dynamic prompt, and returns to the
question/recording step. Coco shows and speaks the recovery question through the
existing dynamic-line TTS path.

On resume, a pending unclear retry uses the current row's persisted Coco line as
the active prompt. Normal in-progress conversation turns continue to derive
their prompt from the previous completed row. The distinction is determined
from the persisted evaluation outcome, not from client input.

## Failure handling

Recovery generation remains bounded to the existing generation attempt and
repair policy. If parsing, policy, moderation, or the provider fails, the server
uses the deterministic mission-topic pivot. It must not repeat a failed question
or expose an error message to the child.

A third unclear response produces teacher review, not another recovery. Normal
teacher-review continuation may generate the next conversation question with
the unclear response withheld; it does not count as a recovery and does not
reuse unclear text.

## Verification

Deterministic tests use injected evaluator, generator, and moderation results;
they make no paid AI calls. Coverage must prove:

- recovery 1 uses the static say-it-again line with no generation call and stays
  on the same turn;
- recovery 2 changes the question angle, stays on the mission topic, never
  repeats an asked question, and stays on the same turn;
- unclear transcripts never appear as usable prompt facts;
- a third unclear response routes to teacher review without recovery generation;
- provider, schema, policy, and moderation failures use the deterministic
  topic-seeded pivot;
- retry and resume render the persisted recovery prompt and use it for the next
  evaluation;
- accepted conversation turns, closing turns, and all preset behavior keep
  their existing paths.

Run focused domain/server/client tests first, followed by typecheck,
changed-file lint, the full unit suite, build, and `git diff --check`.
