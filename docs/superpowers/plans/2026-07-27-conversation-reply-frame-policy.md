# Conversation Reply Frame Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor conversation reply hints from ad hoc prompt fixes into a policy-based frame builder that produces short, natural optional answer starters.

**Architecture:** Keep the existing UI path (`replyHintFrame` on conversation question state into `StepBuddyQuestion`) and replace only the frame-generation internals. The new `src/domain/ai/reply-hint-frame.ts` should classify Coco prompts by answer function, then render a conservative frame or return `null` when confidence is low.

**Tech Stack:** TypeScript, Vitest, existing React/Next.js student mission flow.

## Global Constraints

- Reply hints are optional scaffolds, not grading requirements.
- Conversation evaluation must remain independent of the hint frame; students can ignore the hint and still pass with relevant valid English.
- The lower recorder-area hint remains separate from Coco speech-bubble translation hints.
- UI copy remains `Show hint`, `Hide hint`, and `Try:`.
- Generate one simple frame only.
- Never include a frame that encourages malformed insertions such as `I am going to do play...`.
- For broad `what` questions, prefer a short core frame and drop optional time/place/context phrases.
- For `who`, `where`, and `when` questions, keep enough verb phrase context for the blank to answer the WH function.
- If the generator cannot confidently make a natural elementary ESL frame, return `null` and hide the button.
- No schema changes, teacher UI changes, or AI-provider calls.

---

## File Structure

- Modify: `tests/domain/reply-hint-frame.test.ts`
  - Owns the policy table for supported and unsupported Coco question shapes.
- Modify: `src/domain/ai/reply-hint-frame.ts`
  - Owns prompt normalization, question classification, and frame rendering.
- No expected changes: `src/components/student/StepBuddyQuestion.tsx`
  - Existing UI already renders `Show hint` / `Hide hint` / `Try:` when `replyHintFrame` exists.
- No expected changes: `src/domain/mission/student-question-state.ts`
  - Existing state already passes `buildReplyHintFrame(activePrompt)` through the conversation branch.
- No expected changes: `src/components/student/MissionFlowShell.tsx`
  - Existing shell already passes `activeQuestion.replyHintFrame` into `StepBuddyQuestion`.

---

### Task 1: Codify The Reply-Frame Policy In Tests

**Files:**
- Modify: `tests/domain/reply-hint-frame.test.ts`

**Interfaces:**
- Consumes: `buildReplyHintFrame(prompt: string): string | null`
- Produces: A policy test table that Task 2 must satisfy.

- [ ] **Step 1: Replace narrow example tests with policy-grouped cases**

Replace the body of `tests/domain/reply-hint-frame.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { buildReplyHintFrame } from "@/domain/ai/reply-hint-frame";

describe("conversation reply hint frames", () => {
  it.each([
    ["What games do you like to play?", "I like to play ____."],
    ["What games do you like to play this summer?", "I like to play ____."],
    ["What food do you like to eat at home?", "I like to eat ____."],
    ["What shows do you like to watch after school?", "I like to watch ____."],
    ["What books do you like to read before bed?", "I like to read ____."],
  ])("drops optional context for like-to object questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["What games are you going to play this summer?", "I am going to play ____."],
    ["What are you going to do this summer vacation?", "I am going to ____."],
    ["What games will you play after school?", "I will play ____."],
    ["What food will you eat at home?", "I will eat ____."],
  ])("drops optional context for future-intent what questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["What do you do in that game?", "I ____ in that game."],
    ["What games do you play inside?", "I play ____ inside."],
    ["What food do you eat for breakfast?", "I eat ____ for breakfast."],
  ])("keeps necessary context for present-tense what-action questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["Who do you play with?", "I play with ____."],
    ["Who do you talk to at school?", "I talk to ____."],
  ])("keeps prepositions for who questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["Where do you play soccer?", "I play soccer ____."],
    ["When do you usually play soccer?", "I usually play soccer ____."],
  ])("keeps the verb phrase for where/when questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    "Tell me more about that.",
    "Do you like soccer?",
    "Why do you like that game?",
    "How do you play that game?",
    "Which one is your favorite?",
    "What about your friend?",
  ])("returns null instead of guessing for unsupported prompts: %s", (prompt) => {
    expect(buildReplyHintFrame(prompt)).toBe(null);
  });

  it("uses the final question when Coco's line includes a reaction first", () => {
    expect(buildReplyHintFrame("Nice! What games do you like to play this summer?")).toBe(
      "I like to play ____.",
    );
  });
});
```

- [ ] **Step 2: Run the policy tests and verify they fail**

Run:

```bash
npm test -- --run tests/domain/reply-hint-frame.test.ts
```

Expected: FAIL. The current helper should fail multiple cases, including optional context on `like to`, unsupported `want`/future variants if added later, and unsupported prompt `Which one is your favorite?` returning `null`.

---

### Task 2: Replace Ad Hoc Regexes With A Policy-Based Frame Builder

**Files:**
- Modify: `src/domain/ai/reply-hint-frame.ts`

**Interfaces:**
- Consumes: `buildReplyHintFrame(prompt: string): string | null`
- Produces: Same public function signature, implemented through internal classification helpers.

- [ ] **Step 1: Replace the current helper with explicit policy helpers**

Replace `src/domain/ai/reply-hint-frame.ts` with this implementation:

```ts
const WORD_PATTERN = /[\p{L}\p{N}']+/gu;
const TRAILING_CONTEXT_PATTERN =
  /\s+(after|before|for|in|inside|outside|on|at|with|near|about|this|next|last|every)\s+[\p{L}\p{N}'\s]*$/iu;

function sentenceCase(value: string) {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

function cleanQuestion(input: string) {
  const questions = input.match(/[^.?!]*\?/gu);
  const question = questions?.at(-1) ?? input;
  return question.replace(/\s+/gu, " ").trim();
}

function cleanPhrase(value: string) {
  return value
    .replace(/\?$/u, "")
    .replace(/\b(?:today|tomorrow|now)\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasWords(value: string) {
  WORD_PATTERN.lastIndex = 0;
  return WORD_PATTERN.test(value);
}

function completeFrame(value: string) {
  const frame = value.replace(/\s+/gu, " ").trim();
  if (!hasWords(frame) || !frame.includes("____")) return null;
  return `${sentenceCase(frame)}.`;
}

function withFinalBlank(value: string) {
  const frame = value.replace(/\s+/gu, " ").trim();
  if (!hasWords(frame)) return null;
  return completeFrame(`${frame} ____`);
}

function dropTrailingContext(value: string) {
  return cleanPhrase(value).replace(TRAILING_CONTEXT_PATTERN, "").trim();
}

function splitTrailingContext(value: string) {
  const phrase = cleanPhrase(value);
  const match = phrase.match(TRAILING_CONTEXT_PATTERN);
  if (!match || match.index === undefined) {
    return { core: phrase, context: "" };
  }

  return {
    core: phrase.slice(0, match.index).trim(),
    context: phrase.slice(match.index).trim(),
  };
}

function frameBroadObject(prefix: string, verbPhrase: string) {
  const core = dropTrailingContext(verbPhrase);
  if (!core) return null;
  if (core.toLowerCase() === "do") return completeFrame(`I ${prefix} ____`);
  return completeFrame(`I ${prefix} ${core} ____`);
}

function framePresentObject(verbPhrase: string) {
  const { core, context } = splitTrailingContext(verbPhrase);
  if (!core) return null;
  if (core.toLowerCase() === "do") {
    return context ? completeFrame(`I ____ ${context}`) : completeFrame("I ____");
  }
  return context
    ? completeFrame(`I ${core} ____ ${context}`)
    : completeFrame(`I ${core} ____`);
}

function frameWhDetail(verbPhrase: string) {
  return withFinalBlank(`I ${cleanPhrase(verbPhrase)}`);
}

export function buildReplyHintFrame(prompt: string): string | null {
  const question = cleanQuestion(prompt);

  const futureGoingTo = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+are\s+you\s+going\s+to\s+(.+)\?$/iu,
  );
  if (futureGoingTo) {
    return frameBroadObject("am going to", futureGoingTo[1]);
  }

  const futureWill = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+will\s+you\s+(.+)\?$/iu,
  );
  if (futureWill) {
    return frameBroadObject("will", futureWill[1]);
  }

  const likeToDo = question.match(
    /^what\s+do\s+you\s+like\s+to\s+do(?:\s+(.+))?\?$/iu,
  );
  if (likeToDo) {
    return completeFrame("I like to ____");
  }

  const likeToObject = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+do\s+you\s+like\s+to\s+(.+)\?$/iu,
  );
  if (likeToObject) {
    return frameBroadObject("like to", likeToObject[1]);
  }

  const whoQuestion = question.match(/^who\s+do\s+you\s+(.+)\?$/iu);
  if (whoQuestion) {
    return frameWhDetail(whoQuestion[1]);
  }

  const whereWhenQuestion = question.match(
    /^(?:where|when)\s+do\s+you\s+(.+)\?$/iu,
  );
  if (whereWhenQuestion) {
    return frameWhDetail(whereWhenQuestion[1]);
  }

  const presentWhat = question.match(
    /^what(?:\s+[\p{L}\p{N}']+)?\s+do\s+you\s+(.+)\?$/iu,
  );
  if (presentWhat) {
    return framePresentObject(presentWhat[1]);
  }

  return null;
}
```

- [ ] **Step 2: Run the reply-frame tests and verify they pass**

Run:

```bash
npm test -- --run tests/domain/reply-hint-frame.test.ts
```

Expected: PASS.

- [ ] **Step 3: Refactor only if the implementation duplicates policy concepts**

Allowed cleanup after green:
- Rename helper functions for clarity.
- Split one helper if it mixes two policies.
- Do not change the public `buildReplyHintFrame` signature.
- Do not add external dependencies or AI calls.

Run again:

```bash
npm test -- --run tests/domain/reply-hint-frame.test.ts
```

Expected: PASS after any cleanup.

---

### Task 3: Verify The Existing UI Wiring Still Enforces Separation

**Files:**
- Modify only if a test fails:
  - `src/domain/mission/student-question-state.ts`
  - `src/components/student/StepBuddyQuestion.tsx`
  - `src/components/student/MissionFlowShell.tsx`
  - `tests/domain/tts-ui-source.test.ts`

**Interfaces:**
- Consumes: `replyHintFrame: string | null` from `deriveActiveStudentQuestion`
- Produces: Existing UI behavior remains: lower hint appears only when `replyHintFrame` is non-null.

- [ ] **Step 1: Run the touched integration/source tests**

Run:

```bash
npm test -- --run tests/domain/reply-hint-frame.test.ts src/domain/mission/student-question-state.test.ts tests/domain/tts-ui-source.test.ts
```

Expected: PASS.

- [ ] **Step 2: If `student-question-state` fails because expected frames changed, update only frame expectations**

Only update expectations that assert `replyHintFrame`. Do not alter preset mission expectations.

Expected conversation opener expectation:

```ts
expect(question).toEqual({
  kind: "conversation",
  prompt: opener.prompt,
  replyHintFrame: "I like to ____.",
  activeTurnOrder: 1,
  recordingEnabled: true,
  line: { lineKind: "mission_prompt", turnOrder: 1 },
});
```

If the opener fixture remains `What do you like to do after school?`, the expected frame should be:

```ts
replyHintFrame: "I like to ____.",
```

- [ ] **Step 3: Confirm no evaluator coupling was introduced**

Run:

```bash
rg -n "replyHintFrame|buildReplyHintFrame" src/server src/domain/ai src/domain/flow tests/server tests/domain
```

Expected:
- `buildReplyHintFrame` appears in `src/domain/ai/reply-hint-frame.ts`, its tests, and `src/domain/mission/student-question-state.ts`.
- `replyHintFrame` appears in question state, student UI, and source tests.
- No server evaluator, correction policy, or audio upload path consumes `replyHintFrame`.

---

### Task 4: Final Verification And Task Record

**Files:**
- Modify: `docs/tasks/archive/2026-07-27-conversation-reply-hint.md`

**Interfaces:**
- Consumes: verification output from Tasks 2 and 3.
- Produces: Updated task archive noting the policy refactor and final checks.

- [ ] **Step 1: Run final verification**

Run:

```bash
npm test -- --run tests/domain/reply-hint-frame.test.ts src/domain/mission/student-question-state.test.ts tests/domain/tts-ui-source.test.ts
npm run typecheck
npm run lint
```

Expected:
- Focused tests pass.
- Typecheck passes.
- Lint exits 0. The existing warning in `scripts/check-student-feedback-states.mjs` may remain if unrelated.

- [ ] **Step 2: Update the task archive**

Append this note to `docs/tasks/archive/2026-07-27-conversation-reply-hint.md`:

```md
## Policy Refactor

- Replaced prompt-by-prompt reply frame fixes with a policy-based frame builder.
- Broad `what` object questions now drop optional context so frames stay short.
- `who`, `where`, and `when` questions preserve enough context for the blank to answer the WH function.
- Unsupported or low-confidence prompts return `null`, hiding the lower reply hint rather than showing a misleading scaffold.
```

- [ ] **Step 3: Report completion with evidence**

Final response should include:
- The policy categories implemented.
- The fact that students can ignore the hint and still pass because evaluation remains independent.
- Exact verification commands and results.
- Any remaining unrelated lint warning.

---

## Self-Review

- Spec coverage: The plan covers optional hint behavior, broad `what` policy, WH detail policy, unsupported fallback, UI separation, and evaluator independence.
- Placeholder scan: No `TBD`, `TODO`, or unspecified “write tests” steps remain.
- Type consistency: Public interface remains `buildReplyHintFrame(prompt: string): string | null`; `replyHintFrame` remains `string | null` in conversation question state.
