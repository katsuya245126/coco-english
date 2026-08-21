# Contextual Unclear-Response Recovery Design

## Problem

Conversation mode currently turns the first unclear answer into a generic
“try one more time” experience. The student hears the same active question
again, even when a simpler form or an earlier confirmed topic would be easier
to answer. A generic canned follow-up cannot solve this because it has no access
to the question or the owned conversation history.

## Product behavior

An unclear answer starts a bounded recovery sequence on the same logical turn:

1. **Original answer unclear:** generate recovery question 1 by simplifying the
   active question. Prefer one concrete choice or a short who/where/what form.
2. **Recovery answer 1 unclear:** generate recovery question 2 by ignoring both
   unclear answers, stepping back to the most recent earlier understood context,
   and asking one concrete related question. If no earlier student answer is
   usable, branch from Coco's saved opening question.
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

> Coco: Do you play soccer with your friends or your family?

If that answer is also unclear, recovery 2 can branch from the earlier confirmed
detail:

> Coco: You said you play soccer after school. Where do you play soccer?

## Generation contract

Extend the existing conversation-generation input with an explicit recovery
purpose and recovery number (`1 | 2`). Do not create a second provider adapter
or a separate chat-history format.

For both recovery numbers:

- Send the existing bounded, server-built conversation history.
- Replace unclear student responses with the existing withheld-response marker.
- Never guess, restate, or summarize withheld text.
- Produce exactly one short, elementary-level question.
- Stay grounded in a server-owned Coco question or an earlier understood student
  detail.
- Run the generated line through the existing output parsing, policy, moderation,
  and one-repair boundary.

Recovery 1 may use a concrete yes/no or two-choice question because its purpose
is to reduce answer difficulty. Recovery 2 must select an earlier understood
exchange, or the saved opener when none exists, before asking a new concrete
question. Normal accepted-answer generation keeps its current open-WH policy.

## Server flow and persistence

The upload orchestration remains the owner of evaluation, generation,
moderation, and persistence:

1. Evaluate the recording against the active server-owned question.
2. When the conversation result is `retry_original` with
   `retryReason: "unclear_meaning"` and the ambiguity count is below two, build
   and generate the corresponding recovery question.
3. Persist the recovery question on the current attempt-turn row as its Coco
   line, alongside the existing ambiguity count and raw ambiguity history.
4. Return the recovery question to the client as learner-facing retry state.
5. On the next upload for that turn, prefer the current row's persisted recovery
   question over the authored or previous-turn question for evaluation and
   reply-hint framing.
6. When an answer becomes understandable, normal generation replaces the
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
re-asks the selected server-owned question. It must not select a context-free
topic or expose an error message to the child.

A third unclear response produces teacher review, not another recovery. Normal
teacher-review continuation may generate the next conversation question with
the unclear response withheld; it does not count as a recovery and does not
reuse unclear text.

## Verification

Deterministic tests use injected evaluator, generator, and moderation results;
they make no paid AI calls. Coverage must prove:

- recovery 1 receives the active question and stays on the same turn;
- recovery 2 receives only earlier understood grounding and stays on the same
  turn;
- unclear transcripts never appear as usable prompt facts;
- a third unclear response routes to teacher review without recovery generation;
- provider, schema, policy, and moderation failures re-ask an owned question;
- retry and resume render the persisted recovery prompt and use it for the next
  evaluation;
- accepted conversation turns, closing turns, and all preset behavior keep
  their existing paths.

Run focused domain/server/client tests first, followed by typecheck,
changed-file lint, the full unit suite, build, and `git diff --check`.
