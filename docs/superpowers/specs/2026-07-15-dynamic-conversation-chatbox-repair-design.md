# Dynamic Conversation and Chatbox Repair Design

**Date:** 2026-07-15
**Status:** Approved
**Phase:** 11 — Coco Chat

## Problem

Conversation-mode missions currently reuse too much preset-mission behavior.
The observed failure was:

1. Coco asked, “How often do you play soccer?”
2. The student answered, “I don’t play soccer.”
3. The evaluator rejected the valid answer and used Coco’s question pattern as
   the improved sentence.
4. The student was required to repeat “How often do you play soccer?”
5. The client showed “Good job! Ready for the next one?”
6. The next generated prompt changed from soccer to reading books.

This happens because the authored chat opener is evaluated like a preset turn,
the target pattern is treated as a required answer shape, dynamic and preset
turns share the same transition state, and the generation prompt prioritizes
repeating the target pattern over conversational continuity.

The existing VN dialogue box also places the `Coco` label and TTS control inside
the box. The selected visual direction keeps the mascot sprite stage but moves
both controls into folder-style tabs on the box edge.

## Goals

- Make conversation-mode missions conversation-first rather than exact-phrase
  practice.
- Accept relevant, grammatically valid English even when it does not use the
  configured target pattern or agrees with Coco’s premise.
- Require a spoken corrected version when the student’s English is incorrect.
- Continue from the student’s intended meaning and current topic.
- Remove preset-mission transition language from dynamic conversation.
- Keep preset mission evaluation and progression unchanged.
- Preserve the VN mascot sprite stage while moving the speaker label and TTS
  control into matched folder-style tabs.

## Non-Goals

- No translation hint implementation.
- No hint button relocation.
- No hint-heart or token economy.
- No new scoring, leaderboard, or reward system.
- No mission schema or database migration unless implementation proves an
  existing persisted field cannot represent the approved behavior.
- No changes to moderation, audio retention, teacher transcript evidence,
  server-owned turn caps, or preset mission semantics.

## Conversation Policy

Conversation mode uses a mode-specific evaluation policy:

| Student response | Result | Next action |
|---|---|---|
| Relevant and grammatically valid English | Accept | Continue directly to Coco’s contextual follow-up |
| Relevant meaning with incorrect English | Correct | Show a meaning-preserving improved sentence and require a spoken repeat |
| Unclear or non-English | Retry or review | Keep current safety/review handling |

The target pattern remains useful context for scene creation, opener generation,
and Coco’s language modeling. It is not a required answer template in free
dynamic conversation. “I don’t play soccer” is therefore a valid answer to
“How often do you play soccer?” An incorrect response such as “I no play
soccer” should produce “I don’t play soccer” as the improved sentence.

The correction must preserve the student’s intended meaning. It must never use
Coco’s question, the configured target pattern, or a teacher-authored example as
the sentence the student is required to repeat unless that sentence genuinely
expresses the student’s answer.

Preset missions retain their existing target-pattern and target-example policy.

## Server Data Flow

1. Transcribe and moderate the student answer using the existing upload path.
2. Pass explicit conversation-mode context into original-turn evaluation.
3. Apply the conversation policy above without the preset exact-target shortcut
   or opener-as-answer bias.
4. Persist the original transcript, evaluation, and any improved sentence using
   the existing auditable turn row.
5. Generate Coco’s next line from the real previous Coco line and current
   student transcript.
6. Require the generated line to acknowledge or react to the student’s meaning
   before asking a related follow-up.
7. Keep the same subject unless the student changes it or the conversation is
   naturally winding down. Reusing the grammar pattern must not justify an
   unrelated subject change.
8. Moderate and persist the generated `coco_line` through the existing fallback
   path.

When correction is required, the generated line remains pending while the
student speaks the corrected version. After an accepted repeat, the client uses
that same persisted line as the next prompt. Refresh/resume during correction
must restore the pending line rather than generating or substituting a new one.

## Student Flow

### Accepted answer

`question → Coco thinking → next dynamic question`

The generated Coco line becomes the next prompt directly. The dynamic branch
does not show the preset `aiFeedback` success card or `transition` step.

### Corrected answer

`question → Coco thinking → correction → spoken repeat → next dynamic question`

The correction screen shows the meaning-preserving improved sentence. An
accepted repeat advances directly to the pending Coco line. It does not show
“Good repeat,” “Good job,” “Ready for the next one,” or a `Next turn` button.

### Final required turn

The existing server-owned completion rules remain authoritative. The client may
show the existing mission completion surface after the final accepted original
or accepted repeat; it must not create another recordable turn beyond the
authorized count.

Pronunciation results continue to be scored and persisted. Dynamic conversation
must not replace a valid semantic answer with the target pattern because of a
pronunciation result. Existing teacher evidence and completion recap remain the
durable pronunciation surfaces.

## Generator Continuity

The generation contract must distinguish soft lesson context from hard
conversation constraints:

- `targetPattern`: optional steering/modeling context, not a mandatory next-line
  template.
- `previousCocoLine`: the question or statement being answered.
- `studentTranscript`: the meaning Coco must acknowledge.
- `scenePremise`: broad boundary for the conversation.
- `turnOrder`, `windDown`, and `hardCap`: unchanged server-owned bounds.

The prompt must explicitly reject a follow-up that merely swaps in a new noun or
activity to reuse the same target pattern. For the soccer example, suitable
follow-ups include “Oh, what do you like to do instead?” and “I see. Do you play
another sport?” An unrelated books-at-recess question is invalid continuity.

## VN Chatbox

The existing `MascotStage` remains the owner of sprite expression, stage
geometry, dialogue, and TTS playback state.

- Keep the current VN sprite, backdrop, crop, expression changes, and speaking
  pulse unchanged.
- Move the `Coco` speaker label into a blue folder-style tab protruding from the
  dialogue box’s top-left edge.
- Move the existing `CocoSpeechAudio` button into a matching top-right tab.
- Keep the TTS control’s existing 44×44 target, speaker icon, loading, playing,
  error, disabled, replay, and accessible-label behavior.
- Use the current student design tokens: `#2563EB` accent, existing pale-blue
  secondary surface, 6–8px radii, 14–16px labels, visible focus treatment, and
  current mobile width constraints.
- Place dialogue text below both tabs with enough top padding that labels and
  controls never overlap content.
- Apply the chatbox treatment anywhere `MascotStage` renders, including preset
  missions; do not fork separate dynamic and preset mascot components.

## Failure Handling

- Provider/schema failure keeps the existing teacher-review or canned-fallback
  posture.
- Unsafe student input and unsafe generated output keep current moderation
  behavior.
- Missing pending Coco line fails closed; the client must not advance to an
  authored or invented prompt.
- TTS failure remains text-first and non-blocking.
- No paid provider calls run in automated tests; evaluator and generator tests
  use injected fake clients.

## Testing

Automated regressions must prove:

1. A dynamic opener question plus “I don’t play soccer” is accepted.
2. The same answer is not compared against or corrected to Coco’s question.
3. “I no play soccer” produces a meaning-preserving correction and required
   repeat.
4. Accepted dynamic originals advance directly to the returned/persisted
   `coco_line` without the static transition.
5. Accepted dynamic repeats advance directly to the pending `coco_line`.
6. Refresh during correction restores the pending line.
7. Generator instructions prioritize acknowledgment and topic continuity over
   target-pattern repetition.
8. Preset evaluator, repeat loop, and transition behavior remain unchanged.
9. `MascotStage` retains the sprite and moves label/TTS into matched tabs without
   changing TTS state behavior or accessible naming.
10. Typecheck, focused tests, lint, and the deterministic student feedback-state
    test remain green.

Manual verification repeats the reported soccer scenario and confirms the next
question stays on the student’s answer rather than changing to an unrelated
activity.

## Deferred Hint Backlog

Future discussion will cover:

- Sentence translation versus word-level translation.
- A top-edge Hint tab beside the Coco and TTS tabs.
- Whether hints use three hearts/tokens per mission, a soft budget with emergency
  help, or no scarcity mechanic.
- Consistent behavior across dynamic and preset homework.
- Translation language ownership, generation, teacher review, persistence,
  accessibility, and teacher-visible hint-use evidence.

These items are intentionally excluded from this repair.

## Success Criteria

- Valid free-talk answers are accepted based on relevance and correct English,
  not exact target-pattern usage.
- Incorrect English still results in a spoken corrected version.
- Dynamic conversation advances through contextual Coco lines with no generic
  mission transition.
- The soccer scenario no longer parrots the question or jumps to books.
- Preset missions behave exactly as before.
- VN mascot chatboxes use the approved matched-tab treatment without regressing
  TTS or sprite behavior.
