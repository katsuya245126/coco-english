# Final Coco closing for dynamic conversation missions

**Status:** Approved

## Problem

Dynamic conversation missions generate a follow-up after every accepted
original answer using the fixed eight-turn hard cap. They do not treat the
mission's configured `requiredTurns` as the conversational ending.

In the observed five-turn UAT attempt, the server generated, moderated,
persisted, and warmed TTS for a sixth-question-style line after the fifth
answer. The client then completed the assignment and discarded that line. The
learner therefore moved directly from their own last answer to the generic
mission-complete screen, without Coco acknowledging the answer or saying
goodbye.

## Desired experience

After the last required answer is accepted, Coco responds specifically to what
the learner said, closes the conversation briefly, and says goodbye without
asking another question. The closing text is displayed and spoken. The learner
then presses **Finish mission** to reveal the existing completion screen.

Example shape, not fixed copy:

> Sushi sounds delicious! Thanks for talking with me. See you next time!

## Chosen design

### 1. Derive follow-up versus closing from the mission length

The server already owns `turnOrder`, `requiredTurns`, the scene premise, and
conversation history. It will derive a closing turn when
`turnOrder >= requiredTurns`. No client flag will decide whether the model may
close, and no new database field is required.

For turns before the final required turn, generation remains a follow-up: Coco
acknowledges the latest answer and asks exactly one relevant question. On the
final required turn, generation becomes a closing: Coco acknowledges the latest
answer, adds a short goodbye, and asks no question.

The fixed hard cap remains an independent safety ceiling. Because conversation
missions permit at most eight required turns and
`canGenerateNextDynamicTurn(8)` currently succeeds, the guard will not
short-circuit an eight-turn mission's closing. Tests will lock this boundary.

Prompt metadata such as `turnsRemaining`, `windDown`, and the deterministic
`expectsQuestion` policy will use `requiredTurns` for conversational semantics.
The hard cap remains present only as the absolute ceiling.

### 2. Validate and degrade according to line role

The existing generated-line schema can remain `{ line: string }`; the server
knows the expected role from the owned input. Closing validation requires:

- no question marks;
- terminal sentence punctuation; and
- non-empty structured output.

The generation instructions require the closing to react to the latest student
response and end with brief, child-friendly farewell language. Normal output
moderation remains unchanged.

If provider, schema, policy, or moderation processing cannot produce a safe
closing, the server persists a separate static closing fallback:

> That was fun! Thanks for talking with me. See you next time!

The closing fallback is non-interpolated, contains no student text, makes no AI
call, and asks no question. Follow-up fallback repair belongs to the separate
evaluation-and-follow-up task and is not changed here.

### 3. Persist and speak the final line through existing boundaries

The accepted final answer follows the existing server path:

1. Transcribe and evaluate the learner's answer.
2. Generate or select the closing line.
3. Moderate it where applicable.
4. Persist it as the final turn's `attempt_turns.coco_line` with the existing
   moderation event.
5. Warm its TTS cache through the existing bounded Coco voice path.
6. Return the closing line to the client.

The student browser continues to send only a `coco_dynamic_line` descriptor and
the final `turnOrder` to the TTS route. The route resolves the actual persisted
text through the owned assignment and latest attempt. No arbitrary text, audio
key, or content hash crosses the client boundary.

This task does not change the current `currentStudentResponse` choice between
the learner transcript and `improvedSentence`. That contract belongs to the
separate evaluation-and-follow-up task.

### 4. Add a closing step before the existing completion step

Conversation-mode client flow gains one bounded `closing` step. When the final
accepted original or accepted repeat resolves:

1. Require a non-empty returned closing line.
2. Call the existing server-owned completion action.
3. If completion succeeds, show the closing step rather than the completion
   step.
4. Display the closing in Coco's persistent dialogue area and request its audio
   with `coco_dynamic_line` plus the final turn order.
5. Show a **Finish mission** button in the step card.
6. On button press, switch locally to the existing `complete` step.

Recording completion before presenting the closing preserves the learner's
finished work if the browser closes on that screen. The button controls the
learner-facing reveal of the completion screen; it is not a second state
mutation and cannot double-submit the attempt.

Teacher-review endings remain unchanged. A final answer routed to teacher
review still shows the existing review-pending experience rather than a
successful conversational goodbye.

### 5. Re-entry and failure behavior

The existing mission-page guard redirects assignments with completed status to
student home before mounting a recorder. Therefore refreshing or reopening
after server completion cannot resume into a phantom sixth question. This
existing behavior will be covered by regression evidence rather than replaced
with a new completed-mission route.

Failure behavior remains bounded:

- Missing closing line: do not complete or advance; show the existing
  conversation-submission recovery message.
- Completion mutation failure: remain on the current feedback state, show the
  existing error, and allow the learner to retry the continuation.
- TTS route/provider/storage failure: keep the closing text and Finish button
  usable; the speaker control alone shows its existing unavailable state.
- Closing fallback: persist and show the static safe farewell, preserving the
  same TTS descriptor path.

## Data flow

```text
final accepted answer
  -> owned upload/evaluation service
  -> closing-mode generation or static closing fallback
  -> moderation + attempt_turns.coco_line persistence + TTS warmup
  -> completion RPC
  -> client closing step (text + bounded TTS descriptor)
  -> Finish mission button
  -> existing completion step
```

## Affected surfaces

- Conversation generation input/prompt construction and line-policy tests.
- Conversation orchestration and closing fallback selection.
- Accepted-conversation-turn resolution.
- `MissionFlowShell` state and dialogue mapping.
- A small closing step card or equivalently isolated closing UI component.
- Student mission-flow, TTS, completion, and resume regression tests.

## Verification strategy

Implementation will be test-first. The plan must cover at least:

1. A turn before `requiredTurns` still expects exactly one follow-up question.
2. The final required turn expects a no-question closing even when
   `requiredTurns` is below eight.
3. An eight-turn mission still generates its closing rather than being blocked
   by the hard cap.
4. A valid generated closing acknowledges the response contract and is
   returned/persisted as the final turn's Coco line.
5. Provider, schema, policy, and moderation failures select the no-question
   closing fallback on the final turn.
6. The final accepted original and final accepted repeat both complete the
   server attempt and enter the closing step.
7. The closing step renders the returned text, uses the final-turn
   `coco_dynamic_line` descriptor, and waits for **Finish mission**.
8. Pressing **Finish mission** reveals the existing completion screen without a
   second completion mutation.
9. TTS failure does not hide the closing or disable finishing.
10. Completed assignments cannot reopen the recorder or a phantom next turn.
11. Preset mission behavior and teacher-review endings remain unchanged.

Focused tests run first. Broader typecheck, lint, and build verification are
proportional release checks. Before running `npm run build`, confirm that the
user is not running `npm run dev` in this checkout, because both commands share
the `.next` directory.

## Non-goals

- No elementary correction-threshold or accepted-recast changes.
- No actual-versus-natural conversation-history changes.
- No `run_on_question`, either/or, topic-drift, or follow-up fallback changes.
- No evidence-history or per-clip evaluation schema redesign.
- No database migration.
- No preset-mode completion-flow change.
- No push, deployment, or Supabase mutation without separate approval.
