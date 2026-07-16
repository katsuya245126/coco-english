# Natural Conversation History and Attached Chatbox Controls Design

**Date:** 2026-07-16  
**Scope:** Phase 11 dynamic-conversation UAT follow-up  
**Status:** Approved design; pending written-spec review

## Problem

Two UAT problems remain after contextual translation hints were introduced.

First, the dialogue controls consume the top portion of Coco's white message box. The `Coco` name, `Hint` button, replay control, and visible `Translation unavailable` retry control compete with the sentence the learner needs to read.

Second, a generated follow-up can ask for information the conversation has already established. For example:

> Coco: Where do you talk with Minju?  
> Student: In the classroom.  
> Coco: That's good! Who do you talk with in class?

The last question is grammatical and topically related, but it is not a coherent conversational move because Coco already named Minju.

## Goals

- Make the chatbox read like a visual-novel dialogue box whose message area contains only Coco's words.
- Keep the Coco name, contextual Hint action, and replay action easy to find without adding controls.
- Remove the visible standalone translation-error control.
- Ground every dynamic reply in the current attempt's short conversation history.
- Require Coco to acknowledge the latest answer and ask for genuinely new information.
- Preserve preset-mission behavior and the existing server-owned workflow state.

## Non-Goals

- Adding skip, auto-play, save, load, menu, or other visual-novel controls.
- Adding provider-side conversation state or `previous_response_id` chaining.
- Adding a second AI quality-review request for every turn.
- Changing correction, required-repeat, moderation, TTS, completion, or preset hint-ladder behavior.
- Adding a database table or migration for conversation history.

## Visual Source of Truth

The approved chatbox reference is the latest visual-companion mockup:

`/Users/john/Desktop/my-portfolio/projects/coco-english/.claude/worktrees/phase11-dynamic-conversation-repair/.superpowers/brainstorm/10900-1784134612/content/dialogue-controls-layout-v7.html`

Implementation must reference that file directly while translating the mockup into the existing `CocoDialogueBox` and shared style tokens. The mockup's relevant details are normative:

- The Coco nameplate is attached at the upper-left.
- Hint and replay form one grouped control attached at the upper-right.
- Both groups overlap the chatbox by exactly the chatbox border width.
- Their lower border strip is transparent, allowing the chatbox's top border to appear as the single shared lower edge.
- There is no visible gap and no doubled border between either group and the chatbox.
- The message area contains only Coco's dialogue and optional inline translated phrase treatments.

The mockup is a layout reference, not a request to replace the existing Coco artwork, stage dimensions, colors, typography tokens, or responsive framing.

## Approved Chatbox Behavior

### Layout

`CocoDialogueBox` will use a positioned wrapper around the white message box. The nameplate and action group sit outside the message's content flow and attach to the top border. The message must no longer reserve a 52px internal row for controls.

The nameplate remains a non-interactive label. The action group contains exactly two visible actions:

1. `Hint`
2. Replay

The replay action continues to render the existing TTS control and keeps its current playback, loading, and retry behavior. Hint retains its existing on-demand translation behavior and inline Korean phrase bubbles.

On phone widths, the nameplate and two-action group must not collide, wrap, or reduce the readable message width. Existing Coco stage and sprite geometry remain unchanged.

### Translation failure

Translation failure must not render a third visible control or place `Translation unavailable` inside the message box. The same Hint button remains in the same position and retries the request on its next activation.

The visible label remains `Hint` so the layout does not jump. Its accessible label and title become `Retry hint` while the translation state is failed. Loading remains exposed with `aria-busy`. English dialogue, recording, and replay remain usable in every translation state.

## Approved Conversation Behavior

Every generated Coco reply must be grounded in the ordered exchanges from the current attempt, not only the immediately preceding student transcript.

An exchange contains:

```ts
type ConversationExchange = {
  turnOrder: number;
  cocoLine: string;
  studentResponse: string;
};
```

The first exchange uses the immutable conversation-mode opener from the assignment's mission snapshot. Each later exchange uses the preceding `attempt_turn.coco_line` as the question the student answered. The response uses the meaning-preserving corrected sentence when one exists; otherwise it uses the original transcript. Rows are restricted to the owned current attempt and ordered by `turn_order`.

The generation input will carry one bounded `conversationHistory` array containing all exchanges through the current answer. Because a mission is capped at eight turns, this payload remains small. The existing scene premise, soft target-pattern context, turn count, hard cap, and wind-down fields remain available.

The app continues to rebuild this complete structured payload for every request. It does not create provider-side memory, a chat-history string blob, or another persistence model.

## Generation Rules

The domain prompt builder and server system message must express the same rules:

- Treat every detail in `conversationHistory` as established context.
- Acknowledge or react specifically to the latest student response.
- Ask exactly one short, easy follow-up whose answer is not already present or directly implied by the history.
- Continue the current subject while there is a natural unanswered detail.
- Do not mechanically rotate through `who`, `what`, `where`, `when`, `why`, or `how` when that produces a redundant question.
- Do not ask the student to repeat a person, place, activity, preference, or other fact Coco already knows.
- When the current subject has no natural follow-up, transition gently to a nearby part of the scene.
- Keep the existing young-learner vocabulary, one-question, word-limit, safety, target-pattern, wind-down, and hard-cap rules.

For the reported UAT exchange, a valid result is:

> Oh, in the classroom! What do you and Minju talk about?

`Who do you talk with in class?` is explicitly invalid because `Minju` is already known.

## Server Data Flow

1. Validate student, assignment, latest attempt, mission snapshot, and turn ownership as today.
2. Load prior `attempt_turns` for the current attempt in ascending turn order.
3. Reconstruct the question answered by each row from the snapshot opener or preceding persisted `coco_line`.
4. Resolve each prior student response to `improved_sentence ?? original_transcript`. Append the current exchange from the in-memory evaluation result, using its meaning-preserving corrected sentence when present and the original transcript otherwise.
5. Validate the bounded ordered history before calling the provider.
6. Pass the structured history as data in the user payload; never concatenate student text into system instructions.
7. Generate, moderate, persist, and warm TTS through the existing pipeline.

A database/history lookup error is a retryable server error. Missing required links in the history fail closed rather than generating from partial or cross-attempt context. Provider and moderation failures keep the current canned-fallback behavior.

## Security and Privacy

- History is loaded only from the already-authorized current attempt.
- Restarted or older attempts cannot contribute rows.
- Student text remains provider input data, not executable system instructions.
- Existing moderation order remains unchanged: the newest student response is moderated before generation, and generated Coco output is moderated before persistence.
- No student name, class code, PIN, audio key, or unrelated assignment data enters the conversation payload.

## Verification

### Conversation tests

- Domain schema accepts one through eight ordered exchanges and rejects empty, oversized, blank, duplicate-order, or out-of-order history.
- Prompt-builder tests assert the entire ordered history is supplied and contains the no-known-answer/no-mechanical-question-rotation rules.
- Server adapter tests assert the structured history is rebuilt per request with no `previous_response_id` or provider conversation state.
- Audio orchestration tests prove only rows from the current attempt are used, the snapshot opener anchors turn one, persisted Coco lines anchor later turns, and corrected sentences replace incorrect originals in later history.
- A regression fixture covers `Minju` plus `in the classroom` and asserts that the prompt declares `Who do you talk with in class?` invalid because its answer is already known.
- Existing moderation, canned fallback, correction/repeat, refresh/resume, hard-cap, and preset-mission tests continue to pass.

### Chatbox tests

- The message area no longer contains the nameplate, Hint control, replay control, or translation-error retry control in its content flow.
- Source/style assertions cover the shared 2px overlap and transparent lower border treatment from the approved v7 HTML reference.
- The action group exposes exactly Hint and replay.
- Translation failure keeps visible `Hint`, exposes `Retry hint` accessibly, and retries through the same control.
- Phone-width rendering verifies no control collision and no regression to Coco's stage or sprite placement.

### Manual UAT

- Compare phone and desktop chatboxes against `dialogue-controls-layout-v7.html`.
- Confirm the nameplate and action group share one border with the chatbox: no gap and no thick/doubled line.
- Trigger a translation failure and confirm no `Translation unavailable` button appears in the bubble; tapping Hint retries.
- Run the Minju/classroom exchange and confirm Coco acknowledges the classroom and asks for new information.
- Complete one preset mission to confirm its authored prompts and hint ladder are unchanged.
