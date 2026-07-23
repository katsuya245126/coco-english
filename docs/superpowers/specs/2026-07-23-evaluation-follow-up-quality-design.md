# Evaluation, Follow-up Quality, and Homework Review

**Date:** 2026-07-23
**Status:** Approved — implementation plan requested 2026-07-23

## Goal

Improve dynamic conversation missions in three connected ways:

1. Accept small, meaning-preserving English fixes without making the learner
   repeat.
2. Keep Coco's generated follow-ups relevant, grammatical, and answerable.
3. Show a read-only **Homework Review** after the final Coco goodbye so the
   learner can see the conversation, corrections, and successful retries.

Preset mission evaluation and completion remain unchanged.

## Current behavior and root causes

### Evaluation

The conversation evaluator currently returns `correct` or
`needs_correction`, and the domain decision maps any result with
`correctionNeeded: true` to the repeat path. The accepted-original decision
also forces `improvedSentence` to `null`.

Consequently, the system cannot represent:

> This answer is understandable and accepted, but there is a small natural
> improvement worth remembering.

The database already stores `original_transcript` and `improved_sentence`
separately. Conversation history already prefers `improved_sentence` when it
exists. The missing boundary is therefore in evaluation and decision mapping,
not storage.

### Generated follow-ups

The generated-line validator currently:

- rejects either/or questions after any response not classified as vague or
  stuck;
- checks topic drift only when that either/or rejection is active; and
- treats a comma before a question starter as sufficient separation, even
  though the prompt requires sentence-ending punctuation.

This can reject useful choice questions, accidentally skip topic-drift
validation, and allow run-on replies.

When generation, policy, or moderation fails, the follow-up fallback rotates
through context-free lines. The library includes a line with no question and a
generic `What happens next?` line that is not a relevant response to many
concrete learner answers.

### Completion presentation

Task 1 already completes the attempt on the server, then shows the final
generated Coco goodbye in Coco's persistent dialogue area on the mission page.
The goodbye text is visible. Its bounded TTS control attempts autoplay and
remains available for replay if autoplay is blocked. The learner then presses
**Finish mission**.

Dynamic missions currently move from **Finish mission** to the generic
**Mission complete!** step. Completed missions also have an owned read-only
history route, but its dynamic prompts are incomplete because it reads authored
snapshot turns while dynamic snapshots retain only the opener.

## Product decisions

### Minor versus material corrections

Conversation evaluation uses three explicit correction severities:

- `none`
- `minor`
- `material`

The boundary is based on error type, never character distance or edit count.

A correction is **minor** only when:

- the learner's intended meaning is clear and relevant;
- the content words and their word classes/categories are intact;
- the required clause and verb structure is intact; and
- the repair is confined to a local function-word detail, such as the missing
  article in `I'm going to library`.

A correction is **material** when any of these apply:

- required clause or verb structure is missing or incorrect;
- a word is used as the wrong class or semantic category;
- content must be invented or replaced to make the answer valid;
- the answer is incomplete under the mission's snapshotted
  `requireCompleteSentenceAnswers` policy; or
- the repair changes more than a local meaning-preserving function-word detail.

Structural role takes precedence over surface word type. For example, the
missing infinitive structure in `I want read cartoon` is material even though
the corrected sentence adds the short word `to`.

Required examples:

| Learner transcript | Severity | Result |
|---|---|---|
| `I'm going to library` | Minor | Accept as `accepted_original`; optionally store `I'm going to the library.`; no repeat |
| `I want read cartoon` | Material | Correct to `I want to read cartoons.` and require repeat |
| `I will go to the exercise` | Material | Correct to `I will exercise.` and require repeat |
| `School.` when complete sentences are required | Material | Produce a meaning-preserving full answer and require repeat |
| Relevant fragment when complete sentences are not required | None | Accept directly under the existing mission policy |

### During-conversation presentation

A minor correction behaves like a normal accepted original answer during the
mission:

- no correction card;
- no improved-sentence TTS;
- no repeat step; and
- no interruption to the dynamic conversation.

The optional naturalized sentence is used to ground Coco's next reply and is
shown later in Homework Review.

Material corrections retain the existing correction-and-repeat flow.

### Dynamic completion presentation

The final Coco closing created in Task 1 remains unchanged:

```text
final accepted answer
  -> server completes attempt
  -> same mission page shows Coco's visible/spoken goodbye
  -> learner presses Finish mission
  -> Homework Review
  -> Back to homework
```

Preset missions retain the existing **Mission complete!** screen and do not
gain Homework Review in this task.

## Selected architecture

### 1. Explicit evaluator severity

Extend the structured original-turn evaluation with
`correctionSeverity: "none" | "minor" | "material"`.

The evaluator instructions define the error-type boundary and include all
required acceptance examples. The mission-owned complete-sentence setting
continues to apply before severity is resolved.

The domain decision validates consistent combinations:

- `none`: accepted original, no improved sentence required, no repeat;
- `minor`: accepted original, non-empty meaning-preserving
  `improvedSentence`, no repeat;
- `material`: non-empty meaning-preserving `improvedSentence`, repeat required.

`correctionNeeded` remains derivable for stored compatibility:

- `false` for `none`;
- `true` for `minor` and `material`.

It no longer independently decides whether repetition is required.
`requireRepeat` is true only for `material`.

An inconsistent provider result—for example, `minor` without an improved
sentence, or `material` with a question-shaped correction—fails the evaluation
contract and follows the existing teacher-review path. The server never invents
a correction to repair malformed provider output.

Preset evaluation does not use the new conversation severity behavior.

### 2. Existing storage, separate actual and naturalized wording

No database migration is required.

For every original answer:

- `attempt_turns.original_transcript` remains the learner's actual transcript;
- `attempt_turns.improved_sentence` stores the naturalized wording when the
  evaluator returns a valid minor or material correction; and
- the evaluation JSON stores the resolved severity, outcome, and
  `requireRepeat`.

For a minor correction, the stored outcome remains `accepted_original` and
`requireRepeat` remains false.

For a material correction, the existing repeat fields continue to record the
learner's retry and whether it was accepted.

Owned conversation-history reconstruction continues to use:

```text
improved_sentence when present
otherwise original_transcript
```

This gives Coco natural grounding while preserving the learner's real words
for teacher evidence and Homework Review.

### 3. Follow-up generation and deterministic policy

Prompt guidance continues to prefer an open question after a meaningful
answer, but either/or questions are no longer blanket-rejected.

A choice question may pass when it:

- contains exactly one question;
- is grammatically complete;
- stays on the active topic; and
- gives relevant, child-friendly choices.

Deterministic validation remains responsible for:

- exactly one `?` ending a follow-up;
- no `?` and valid terminal punctuation for a closing;
- reaction/question sentence separation; and
- topic continuity.

Topic-drift validation runs for every follow-up independently of whether the
line contains `or` and independently of whether the learner was vague or
stuck.

Run-on detection requires sentence-ending punctuation between a reaction and a
new question clause. A comma alone does not satisfy the boundary. A rejected
run-on receives the existing single policy-correction generation attempt with
the specific run-on reason.

The current single correction attempt remains the limit. This task does not add
an unbounded retry loop or extra provider calls.

### 4. Follow-up fallback behavior

The static final-closing fallback remains exactly:

> That was fun! Thanks for talking with me. See you next time!

It stays on its separate closing branch and is not part of the follow-up
library.

Every follow-up fallback must:

- acknowledge or safely redirect;
- end with exactly one answerable question;
- avoid interpolation of raw learner text;
- avoid the original target-pattern hint;
- remain short and elementary-level; and
- be valid for the response state that selects it.

The follow-up selector uses bounded server-known context:

- **Meaningful safe response:**
  `Thanks for telling me! What do you like about that?`
- **Vague or stuck response:**
  `That's okay! Can you give me one example?`
- **Unsafe, unavailable, or internally uncertain response:**
  `Let's try that question another way. Can you tell me one small detail?`

The selector is based on the same owned latest-response state already used for
generation policy. It does not interpolate student text and does not make a
provider call.

Avoidable fallback selection is reduced by:

- removing the blanket either/or veto;
- keeping topic drift independent;
- repairing run-ons through the one bounded correction attempt; and
- strengthening the prompt to react to the actual answer before asking a
  relevant question.

Moderation-event cause codes remain attributable. Historical events containing
`either_or_question` remain readable even though new output no longer uses that
as a blanket rejection reason.

### 5. Owned Homework Review data

Use the existing completed-mission history boundary rather than trusting
client-held conversation state.

After **Finish mission**, a dynamic mission navigates to its owned completed
history route. The route already proves:

- the unlock belongs to the student;
- the assignment belongs to that student;
- the assignment and latest attempt are terminal;
- the attempt is the assignment's latest attempt; and
- the assignment is not canceled.

Extend the recap query and mapping for dynamic missions to include:

- `conversationMode` from the mission snapshot;
- `original_transcript`;
- `improved_sentence`;
- `repeat_transcript`;
- `repeat_accepted`;
- stored evaluation/severity;
- each persisted `coco_line`;
- existing audio availability; and
- existing pronunciation feedback.

Build the displayed conversation from persisted owned rows:

- turn 1 Coco prompt is the snapshotted opener;
- turn N Coco prompt is turn N-1's persisted `coco_line`;
- each learner bubble displays the actual original or repeat transcript
  appropriate to that review state; and
- the final turn's persisted `coco_line` is appended as Coco's goodbye.

This replaces the current generic dynamic recap prompt without changing
provider state or introducing a conversation-history blob.

### 6. Homework Review UI

Dynamic completed missions render **Homework Review** as a vertically scrolling
text-message conversation. There is no subheading.

The selected presentation is:

- Coco messages align left with Coco's real character icon and `Coco` above the
  bubble.
- Learner messages align right with a circular first-letter avatar and the
  student's display name above the bubble.
- Long text wraps inside the bubble; the page scrolls normally and has no
  internal message-window scrollbar.
- **Back to homework** returns to the student home screen.

Per evaluation state:

- **Accepted with no correction:** show the actual learner bubble and green
  `✓ Good job!` beneath it.
- **Accepted minor correction:** show the actual learner bubble, then the
  naturalized sentence with only added or replaced words marked in red. Do not
  show a correction label and do not imply that another recording is required.
- **Material correction with accepted repeat:** show the original learner
  bubble with a compact red circled `!` immediately to its left; show the
  accepted repeat as a second learner bubble; show green `✓ Good job!` beneath
  the accepted repeat.
- **Internally reviewed turn:** preserve the actual transcript and audio but do
  not display teacher-review wording or claim correctness. If a repeat was
  requested, show both available learner attempts without a green success
  label unless the stored repeat was accepted.

The circled `!` is status text, not a button. It has hidden accessible wording
such as `This answer needed another try.` Color and icon shape are never the
only screen-reader signal.

Minor-correction highlighting uses a small pure word-level diff between the
actual and naturalized sentences. It marks additions and replacements in the
naturalized sentence. If a safe diff cannot be produced, the whole naturalized
sentence is shown in the correction color rather than hiding the improvement.

The current completed-history audio replay and pronunciation information remain
available with the corresponding learner bubble. Audio URLs remain signed on
demand; no public object URL is introduced.

The existing preset completed-history presentation and preset mission
completion screen remain unchanged.

## Failure behavior

- Evaluation provider/schema failure remains teacher review and never
  fabricates a severity or correction.
- An invalid severity/improved-sentence combination remains teacher review.
- Conversation-line provider, schema, policy, or moderation failure selects
  the bounded follow-up fallback and persists the attributable event.
- A failed closing generation or moderation check continues to select the
  existing static final-closing fallback.
- A failed TTS load never hides the visible final goodbye or blocks
  **Finish mission**.
- Completion remains server-owned and occurs before the closing screen, so
  navigation or review-rendering failure cannot lose completed work.
- If Homework Review cannot load after completion, show a bounded completed
  state with **Back to homework**; do not reopen recording or change terminal
  status.
- Missing optional audio or pronunciation evidence degrades only that evidence
  control, not the transcript or review.

## Security and invariants

- UI reachability and route parameters are never authorization.
- Every Homework Review service-role read proves student, assignment, latest
  attempt, terminal status, and cancellation state independently.
- Teacher evidence retains the actual transcript, stored correction, repeat,
  review reason, and signed audio.
- Mission snapshots remain the immutable assignment contract.
- Per-turn audio storage, retention, pronunciation evidence, and signed
  playback remain unchanged.
- Internal teacher-review status and reasons remain hidden from learners.
- Conversation mode never falls back to the original target-pattern hint.
- Preset evaluation, authored turns, repeat flow, and completion remain
  unchanged.
- The final Coco closing semantics and static fallback remain unchanged.

## Verification strategy

Implementation will be test-first. The implementation plan must cover at least:

### Evaluation

1. Minor article omission produces `accepted_original`, a stored
   `improvedSentence`, and no repeat.
2. Missing infinitive/verb structure produces a material correction and repeat.
3. Word-class/category misuse produces a material correction and repeat.
4. `School.` follows the complete-sentence mission setting on and off.
5. Invalid severity/output combinations route to teacher review.
6. Preset evaluator decisions remain byte-for-behavior unchanged.

### History and persistence

7. Actual transcript and naturalized wording persist separately.
8. Conversation generation receives naturalized wording while teacher and
   student review retain the actual transcript.
9. Material corrections retain original and repeat evidence.
10. No database migration is introduced.

### Follow-up quality

11. A relevant exactly-one-question either/or reply is accepted.
12. Either/or phrasing does not disable topic-drift validation.
13. Multiple questions remain rejected.
14. The UAT run-on is regenerated with sentence-ending punctuation.
15. A corrected line that still runs on or drifts selects the attributable
    fallback.
16. Every follow-up fallback ends with exactly one answerable question.
17. `I hear you! Let's keep going.` and `Nice! What happens next?` are absent
    from the follow-up library.
18. The static final-closing fallback is byte-for-byte unchanged.

### Homework Review

19. Final Coco goodbye remains visible and replayable on the closing mission
    screen before **Finish mission**.
20. Dynamic **Finish mission** opens owned Homework Review.
21. Preset completion still opens the existing **Mission complete!** screen.
22. Dynamic Coco prompts reconstruct from opener plus persisted `coco_line`
    rows, and the final goodbye appears last.
23. Correct answers show green `✓ Good job!`.
24. Minor accepted corrections show actual wording plus red changed words and
    no repeat marker.
25. Material corrections show the original with a left-side red `!`, the
    accepted repeat, and green `✓ Good job!`.
26. Internal teacher-review wording remains hidden.
27. Long messages wrap on mobile.
28. Existing history audio and pronunciation evidence remain available.
29. Review reads independently prove ownership and terminal/latest-attempt
    state.
30. Review-load failure preserves completion and offers **Back to homework**.

Focused tests run first, followed by the relevant regression matrix, full test
suite, typecheck, and lint. Before any production build, confirm that no
development server is using the same checkout's `.next` directory.

## Non-goals

- Changing preset mission evaluation, authored target examples, completion, or
  recap presentation.
- Changing the teacher mission setting introduced in Task 1.
- Changing the final Coco closing prompt, validation, static fallback, TTS
  descriptor, or server completion timing.
- Showing minor corrections during the live conversation.
- Asking the learner to repeat a minor correction.
- Exposing teacher-review reasons or status to learners.
- Replacing pronunciation scoring or audio-retention behavior.
- Adding a database migration.
- Adding unbounded AI retries or a new conversation provider.
- Push, merge, deployment, publishing, or Supabase mutation.
