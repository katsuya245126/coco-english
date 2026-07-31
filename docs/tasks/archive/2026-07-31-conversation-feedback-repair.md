# Conversation Feedback Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Paused — switched to approved student-access security remediation; resume only after that task is complete or paused.

**Goal:** Fix the misleading reply hints and unnecessary corrections found in the inspected attempts, allow one plainly worded retry for an unclear answer, and make Coco continue from the most recent answer she actually understood.

**Architecture:** Make surgical changes in the existing hint builder, correction policy, retry copy, and conversation generator. Reuse the existing single policy-repair generation call; give it the rejected candidate and validate its replacement against the same understood exchange used by the prompt. Do not add a question-classification parser, another dependency, a database change, or another student retry.

**Tech Stack:** Next.js, React, TypeScript, Vitest, existing OpenAI response adapter

## Global Constraints

- Conversation mode only unless a shared pure helper is being corrected; preset success and transition behavior must remain unchanged.
- The first unclear recording gets one retry. The second unclear recording goes to teacher review, consumes the turn, and moves on.
- The learner-facing and spoken retry sentence is exactly `Hmm... try one more time.`
- Never treat an unclear transcript as something the learner said.
- A contextual pivot may use only earlier understood attempt history owned by the current attempt.
- No new dependency, schema, table, migration, model call, or configuration option.
- Preserve all unrelated working-tree changes.

## Observable behavior

The contextual pivot must have a real source:

> Coco: “Where are you going this summer?”
> Student: “I’m going to the waterpark.” *(understood)*
> Coco: “Who are you going with?”
> Student: unclear answer
> Coco: “Hmm... try one more time.”
> Student: still unclear
> Coco: “What do you do at the waterpark?”

The retry does not consume a turn. The second unclear answer does. If there is no earlier understood student answer, Coco must use the mission scene premise and must not invent a detail.

## Files

- Modify `src/domain/ai/reply-hint-frame.ts` — repair the two malformed hint shapes.
- Modify `tests/domain/reply-hint-frame.test.ts` — cover the exact logged prompts.
- Modify `src/domain/ai/correction-policy.ts` — expose the existing pure-embellishment check and include complete three-word answers.
- Modify `src/domain/ai/original-evaluation-contract.ts` — canonicalize optional-detail-only corrections to `correct`.
- Modify `src/domain/ai/original-evaluation-contract.test.ts` — cover accepted optional additions and retained real corrections.
- Modify `src/server/student-access/audio-upload.test.ts` — prove optional additions do not trigger repeat/repair and contextual history is passed through.
- Modify `src/components/student/MissionFlowShell.tsx` — update visible retry copy.
- Modify `src/app/student/missions/[assignmentStudentId]/tts/route.ts` — update spoken retry copy.
- Modify `tests/server/student-mission-flow.test.ts` — keep visible and spoken copy identical.
- Modify `tests/domain/turn-evaluation.test.ts` — lock the existing one-retry limit.
- Modify `src/domain/ai/conversation-generation.ts` — select the most recent understood grounding exchange.
- Modify `src/domain/ai/conversation-generation.test.ts` — cover normal, review-pending, and no-prior-answer grounding.
- Modify `src/server/ai/conversation-generator.ts` — validate and repair against the selected exchange and include the rejected candidate in the repair request.
- Modify `src/server/ai/conversation-generator.test.ts` — cover the waterpark pivot and prevent invented details.

---

### Task 1: Repair the logged hint frames

- [ ] Add these failing cases to `tests/domain/reply-hint-frame.test.ts`:

```ts
it.each([
  ["What do you see when you swim?", "I see ____ when I swim."],
  [
    "What do you use to make your sandcastles?",
    "I use ____ to make my sandcastles.",
  ],
])("builds a natural frame for %s", (prompt, frame) => {
  expect(buildReplyHintFrame(prompt)).toBe(frame);
});
```

- [ ] Run `npm test -- --run tests/domain/reply-hint-frame.test.ts`.

  Expected: both new cases fail with the malformed frames from the log.

- [ ] In `src/domain/ai/reply-hint-frame.ts`, convert learner-facing `you` to `I` inside `cleanPhrase`, and handle `What do you use to ...?` before the general present-tense matcher:

```ts
.replace(/\byou\b/giu, "I")
```

```ts
const presentUseTo = question.match(
  /^what\s+do\s+you\s+use\s+to\s+(.+)\?$/iu,
);
if (presentUseTo) {
  return completeFrame(`I use ____ to ${cleanPhrase(presentUseTo[1])}`);
}
```

- [ ] Re-run `npm test -- --run tests/domain/reply-hint-frame.test.ts`.

  Expected: PASS.

---

### Task 2: Stop correcting answers that only omit optional detail

- [ ] Add contract tests showing:

```ts
canonicalizeNoOpOriginalEvaluation(correction("I make sandcastles at the beach."), "I make sandcastles.")
// => outcome: "correct", improvedSentence: null

canonicalizeNoOpOriginalEvaluation(correction("I use a shovel at the beach."), "I use a shovel.")
// => outcome: "correct", improvedSentence: null

canonicalizeNoOpOriginalEvaluation(correction("I like puns."), "I like pun.")
// => remains needs_correction
```

- [ ] Run `npm test -- --run src/domain/ai/original-evaluation-contract.test.ts`.

  Expected: the optional-detail cases fail; the real grammar correction remains unchanged.

- [ ] Extract the existing prefix-extension condition in `src/domain/ai/correction-policy.ts` as:

```ts
export function isPureEmbellishment(
  transcript: string,
  improvedSentence: string,
): boolean
```

Use the existing normalization and dangling-fragment guard. Change only the minimum complete-answer floor from four words to three so `I make sandcastles` and `I use a shovel` qualify.

- [ ] Reuse `isPureEmbellishment` in both the correction-policy violation check and `canonicalizeNoOpOriginalEvaluation`. Canonicalize only `needs_correction` evaluations; teacher-review outcomes remain untouched.

- [ ] Add one `src/server/student-access/audio-upload.test.ts` regression proving an optional-detail addition is accepted after one evaluator call and does not request a repeat or repair evaluation.

- [ ] Run:

```bash
npm test -- --run src/domain/ai/original-evaluation-contract.test.ts tests/domain/correction-policy.test.ts src/server/student-access/audio-upload.test.ts
```

  Expected: PASS.

---

### Task 3: Use one simple retry, then move on

- [ ] Change the visible line in `src/components/student/MissionFlowShell.tsx` and the TTS line in `src/app/student/missions/[assignmentStudentId]/tts/route.ts` to:

```ts
"Hmm... try one more time."
```

- [ ] Update `tests/server/student-mission-flow.test.ts` to require that exact sentence in both locations.

- [ ] Add or tighten one `tests/domain/turn-evaluation.test.ts` regression:

```ts
expect(decideOriginalTurnOutcome(ambiguousReview, "conversation", null, 0))
  .toMatchObject({ kind: "retry_original", reason: "unclear_meaning" });

expect(decideOriginalTurnOutcome(ambiguousReview, "conversation", null, 1))
  .toMatchObject({ kind: "teacher_review" });
```

No production retry-counter change is planned; the existing `priorAmbiguityRetries` branch already enforces the desired maximum.

- [ ] Run:

```bash
npm test -- --run tests/domain/turn-evaluation.test.ts tests/server/student-mission-flow.test.ts src/server/student-access/audio-upload.test.ts
```

  Expected: PASS, with no path requesting a third recording for the same turn.

---

### Task 4: Ground Coco’s pivot in the last understood answer

- [ ] Add a pure helper in `src/domain/ai/conversation-generation.ts`:

```ts
export function mostRecentUnderstoodExchange(
  input: Pick<
    GenerateCocoReplyInput,
    "conversationHistory" | "responseHandling"
  >,
): ConversationExchange | null
```

For normal handling, return the latest exchange. For `review_pending`, skip the latest exchange and scan backward for the first response other than `WITHHELD_STUDENT_RESPONSE`. Return `null` when none exists.

- [ ] Add `src/domain/ai/conversation-generation.test.ts` cases proving:

  - Normal history selects the latest exchange.
  - Waterpark history followed by an unclear answer selects the earlier waterpark exchange.
  - A first-turn unclear answer returns `null` and leaves generation grounded only in `scenePremise`.

- [ ] In `src/server/ai/conversation-generator.ts`, compute the prompt and grounding exchange once. Use that exchange’s `cocoLine` and `studentResponse` for both the first and corrected policy validations.

- [ ] Include the rejected candidate in the existing corrected request. The repair instruction must say:

```text
The previous candidate was rejected. Do not repeat its question direction.
Use the most recent understood student response and ask one short, concrete
WH-question about a different unanswered detail. Never invent a detail.
```

The structured repair payload must include `rejectedCandidate` and `violations` alongside the existing conversation prompt. This fixes the current blind repair call, which is told that a candidate failed but is not shown what it said.

- [ ] Add `src/server/ai/conversation-generator.test.ts` coverage where:

  1. The understood exchange is `I’m going to the waterpark.`
  2. A later exchange is withheld as not understood.
  3. The first candidate is rejected.
  4. The corrected candidate is `What do you do at the waterpark?`
  5. The result passes without `What else do you want to tell me?`, `What do you like about that?`, or any detail absent from the understood history.

- [ ] Add an `src/server/student-access/audio-upload.test.ts` regression proving the second unclear recording is stored for teacher review, the turn advances, and generation receives both the earlier understood exchange and the withheld latest exchange.

- [ ] Run:

```bash
npm test -- --run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/audio-upload.test.ts
```

  Expected: PASS.

**Deliberate ceiling:** Provider, schema, moderation, or repeated policy-repair failures still use the existing deterministic canned-fallback safety path. A static sentence cannot be genuinely contextual. Removing that last-resort path would require either an additional model call or teacher-authored fallback questions, neither of which is part of this minimal fix.

---

### Task 5: Proportionate verification

- [ ] Run the complete targeted suite:

```bash
npm test -- --run tests/domain/reply-hint-frame.test.ts tests/domain/correction-policy.test.ts src/domain/ai/original-evaluation-contract.test.ts tests/domain/turn-evaluation.test.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/audio-upload.test.ts tests/server/student-mission-flow.test.ts
```

  Expected: PASS.

- [ ] Run:

```bash
npm run typecheck
npm run lint
```

  Expected: both commands exit successfully.

- [ ] Review the final diff and confirm every changed production line maps to one of the four requested behaviors. Do not modify unrelated files.

## Approval gate

Implementation must not begin until the user approves this plan. If deterministic tests show that the final canned outage fallback itself must also be contextual, stop and request a product choice between one extra model call and teacher-authored scene fallback questions.
