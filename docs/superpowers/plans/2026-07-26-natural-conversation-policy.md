# Natural Conversation Policy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Coco preserve a learner's meaning, recover cleanly from incomplete recordings, use only minimal grounded corrections, and ask natural one-detail follow-ups while recording enough evidence to diagnose future attempts.

**Architecture:** Add small pure policy modules for incomplete utterances, authored open frames, correction validation, and structured reply validation. Keep upload orchestration server-owned: deterministic results run before paid evaluation, model corrections get one policy-constrained repair, and invalid second results route to teacher review. Preserve the existing database schema and assembled `reply.line` consumer contract while enriching evaluation JSON and the read-only attempt report.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Zod 3, OpenAI Responses API adapters, Supabase, Vitest 3, Node.js 20.

## Global Constraints

- Preserve the preset/conversation split: preset behavior changes only for the approved open-frame and meaning-preservation rules.
- `requireCompleteSentenceAnswers: false` accepts a meaningful fragment; `true` permits only the shortest grounded complete recast.
- The exact target fast path runs before incomplete-utterance detection.
- Incomplete recording copy is exactly: `It sounds like the recording stopped early. Try recording your answer again.`
- Incomplete recording produces no target sentence, correction TTS, pronunciation scoring, next Coco line, or turn consumption.
- Correction reasons are exactly `none`, `fragment_completion`, `grammar`, and `vocabulary`.
- Fragment completion is one declarative clause, preserves learner content words, uses only the transcript and active question as content grounding, and adds at most five lexical tokens.
- An invalid model correction gets exactly one constrained evaluator repair; an invalid repair becomes teacher review with no repeat.
- Structured provider replies use `reaction`, `focus`, and `question`; existing consumers continue to receive an assembled `reply.line`.
- Preserve exactly-one-question, run-on, topic-drift, vague-echo, history-known-fact, active-activity, moderation, closing, and fallback behavior.
- Persist policy version `natural-conversation-v1`, evaluator model, transcription model/confidence, and runtime version in existing evaluation JSON; do not add a database migration.
- The inspection report must never print audio object keys, signed URLs, student PINs, or reusable access values.
- Do not change ownership checks, RLS, mission snapshots, assignment/attempt state transitions, per-turn audio storage, signed playback, scoring rules, hint ladders, or teacher review authorization.
- Do not change configured AI providers or add dependencies.
- Do not push, merge, deploy, publish, call paid providers, mutate Supabase, or run live UAT without separate approval naming the exact action and environment.
- Preserve the unrelated working-tree change at `.superpowers/sdd/task-1-report.md`.

---

## File Structure

- Create `src/domain/ai/incomplete-utterance.ts`: conservative normalized dangling-utterance detector.
- Create `tests/domain/incomplete-utterance.test.ts`: positive and negative detector cases.
- Create `src/domain/ai/open-answer-frame.ts`: compile and match safe underscore frames from `hintLadder.tier1`.
- Create `tests/domain/open-answer-frame.test.ts`: frame safety, normalization, and learner-choice matches.
- Create `src/domain/ai/correction-policy.ts`: pure improved-sentence policy validator and violation types.
- Create `tests/domain/correction-policy.test.ts`: choice preservation, embellishment, grounding, clause, and token-budget cases.
- Modify `src/domain/ai/turn-evaluation.ts`: typed correction reason, provenance, retry reason, and policy-failure contract.
- Modify `tests/domain/turn-evaluation.test.ts`: schema and decision regressions.
- Modify `src/server/audio/transcription.ts`: return resolved transcription model and numeric confidence with successful results.
- Modify `tests/server/transcription.test.ts`: successful evidence contract.
- Modify `src/server/ai/turn-evaluator.ts`: policy-aware provider schema, provenance enrichment, and constrained-repair input.
- Modify `tests/server/turn-evaluator.test.ts`: prompt, schema, model, runtime, and repair evidence.
- Modify `src/server/student-access/audio-upload.ts`: deterministic ordering, policy validation/repair, persistence, and bypasses.
- Modify `tests/server/audio-upload.test.ts`: preset open-frame, incomplete recording, unsafe correction, and repeat provenance coverage.
- Modify `src/server/student-access/audio-upload.test.ts`: conversation-mode orchestration, complete-sentence toggle, correction repair, generation, and TTS coverage.
- Modify `src/domain/flow/completion.ts`: resumable incomplete-recording feedback kind.
- Modify `tests/server/mission-flow.test.ts`: same-question resume behavior.
- Modify `src/components/student/MissionFlowShell.tsx`: map incomplete recording independently from generic retries.
- Modify `src/components/student/StepAiEvaluationFeedback.tsx`: neutral incomplete-recording presentation with no sentence card.
- Modify `src/domain/character/expression.ts`: encouraging expression for recording recovery.
- Modify `tests/domain/character-expression.test.ts`: expression contract.
- Modify `tests/server/student-mission-flow.test.ts`: source/UI contract for no target and no feedback TTS.
- Modify `src/domain/ai/conversation-generation.ts`: structured reply parts, assembly, and new policy violations.
- Modify `src/domain/ai/conversation-generation.test.ts`: structured parsing/assembly and policy cases.
- Modify `src/server/ai/conversation-generator.ts`: structured provider format and exact one-repair hints.
- Modify `src/server/ai/conversation-generator.test.ts`: structured generation, correction retry, closing, moderation-adjacent failure contract.
- Create `scripts/lib/attempt-report.mjs`: pure attempt-report formatting.
- Create `scripts/lib/attempt-report.test.mjs`: deterministic report fixtures and secret-field exclusion.
- Modify `scripts/inspect-attempts.mjs`: richer read-only query and formatter integration.
- Modify `TASK.md`: implementation milestones and verification evidence.

---

### Task 1: Conservative Incomplete-Utterance and Open-Frame Policies

**Files:**
- Create: `src/domain/ai/incomplete-utterance.ts`
- Create: `tests/domain/incomplete-utterance.test.ts`
- Create: `src/domain/ai/open-answer-frame.ts`
- Create: `tests/domain/open-answer-frame.test.ts`

**Interfaces:**
- Produces: `isIncompleteUtterance(transcript: string): boolean`.
- Produces: `compileOpenAnswerFrame(tier1Hint: string | null | undefined): RegExp | null`.
- Produces: `matchesOpenAnswerFrame(transcript: string, tier1Hint: string | null | undefined): boolean`.
- Consumes later: Task 4 calls these functions after exact-target resolution and before paid evaluation.

- [ ] **Step 1: Write failing incomplete-utterance tests**

Create `tests/domain/incomplete-utterance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isIncompleteUtterance } from "@/domain/ai/incomplete-utterance";

describe("isIncompleteUtterance", () => {
  it.each(["I", " i. ", "A", "an", "the!", "and", "but.", "because", "to"])(
    "flags the syntactically dangling utterance %j",
    (transcript) => {
      expect(isIncompleteUtterance(transcript)).toBe(true);
    },
  );

  it.each([
    "I swim.",
    "I do.",
    "My family.",
    "Chocolate.",
    "On the side.",
    "Because it is fun.",
    "To school.",
    "A cat.",
  ])("does not claim a meaningful short answer is incomplete: %j", (transcript) => {
    expect(isIncompleteUtterance(transcript)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the detector test and verify red**

Run:

```bash
npm test -- --run tests/domain/incomplete-utterance.test.ts
```

Expected: FAIL because `@/domain/ai/incomplete-utterance` does not exist.

- [ ] **Step 3: Implement the conservative detector**

Create `src/domain/ai/incomplete-utterance.ts`:

```ts
const INCOMPLETE_UTTERANCES = new Set([
  "i",
  "a",
  "an",
  "the",
  "and",
  "but",
  "because",
  "to",
]);

function normalizeIncompleteCandidate(transcript: string) {
  return transcript
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isIncompleteUtterance(transcript: string): boolean {
  return INCOMPLETE_UTTERANCES.has(normalizeIncompleteCandidate(transcript));
}
```

- [ ] **Step 4: Write failing open-frame tests**

Create `tests/domain/open-answer-frame.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  compileOpenAnswerFrame,
  matchesOpenAnswerFrame,
} from "@/domain/ai/open-answer-frame";

describe("open answer frames", () => {
  it("matches a learner-owned multiword choice without requiring evaluator judgment", () => {
    expect(
      matchesOpenAnswerFrame(
        "I think chocolate ice cream is the best.",
        "Try using: I think _______ is the best",
      ),
    ).toBe(true);
  });

  it("is case- and punctuation-insensitive but fully anchored", () => {
    expect(matchesOpenAnswerFrame("I THINK VANILLA IS THE BEST!", "I think ___ is the best."))
      .toBe(true);
    expect(matchesOpenAnswerFrame("Well, I think vanilla is the best.", "I think ___ is the best."))
      .toBe(false);
  });

  it.each([
    [null, null],
    ["I think vanilla is the best", null],
    ["___ please", null],
    ["Try using: ___ is good", null],
  ] as const)("rejects an unsafe frame %j", (hint, expected) => {
    expect(compileOpenAnswerFrame(hint)).toBe(expected);
  });

  it("requires learner content in every underscore slot", () => {
    expect(matchesOpenAnswerFrame("I think is the best.", "I think ___ is the best."))
      .toBe(false);
  });
});
```

- [ ] **Step 5: Run the frame test and verify red**

Run:

```bash
npm test -- --run tests/domain/open-answer-frame.test.ts
```

Expected: FAIL because `@/domain/ai/open-answer-frame` does not exist.

- [ ] **Step 6: Implement safe frame compilation**

Create `src/domain/ai/open-answer-frame.ts`:

```ts
const INSTRUCTION_PREFIX = /^\s*(?:try using|say|use)\s*:\s*/iu;
const SLOT_PATTERN = /_+/gu;
const LEXICAL_TOKEN = /[\p{L}\p{N}']+/gu;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function literalPattern(value: string) {
  const words = value.match(LEXICAL_TOKEN) ?? [];
  return words.map(escapeRegex).join("[^\\p{L}\\p{N}']+");
}

export function compileOpenAnswerFrame(
  tier1Hint: string | null | undefined,
): RegExp | null {
  const frame = tier1Hint?.replace(INSTRUCTION_PREFIX, "").trim() ?? "";
  if (!SLOT_PATTERN.test(frame)) return null;
  SLOT_PATTERN.lastIndex = 0;

  const literalTokenCount = (frame.replace(SLOT_PATTERN, " ").match(LEXICAL_TOKEN) ?? [])
    .length;
  SLOT_PATTERN.lastIndex = 0;
  if (literalTokenCount < 3) return null;

  const pieces: string[] = [];
  let cursor = 0;
  for (const match of frame.matchAll(SLOT_PATTERN)) {
    pieces.push(literalPattern(frame.slice(cursor, match.index)));
    pieces.push("[\\p{L}\\p{N}']+(?:[^\\p{L}\\p{N}']+[\\p{L}\\p{N}']+)*");
    cursor = (match.index ?? 0) + match[0].length;
  }
  pieces.push(literalPattern(frame.slice(cursor)));

  return new RegExp(
    `^[^\\p{L}\\p{N}']*${pieces.join("[^\\p{L}\\p{N}']*")}[^\\p{L}\\p{N}']*$`,
    "iu",
  );
}

export function matchesOpenAnswerFrame(
  transcript: string,
  tier1Hint: string | null | undefined,
): boolean {
  return compileOpenAnswerFrame(tier1Hint)?.test(transcript.trim()) ?? false;
}
```

Before accepting this implementation, reset `SLOT_PATTERN.lastIndex` exactly as shown because the global regular expression is reused.

- [ ] **Step 7: Run both focused test files**

Run:

```bash
npm test -- --run tests/domain/incomplete-utterance.test.ts tests/domain/open-answer-frame.test.ts
```

Expected: both files PASS.

- [ ] **Step 8: Commit the pure deterministic policies**

```bash
git add src/domain/ai/incomplete-utterance.ts src/domain/ai/open-answer-frame.ts tests/domain/incomplete-utterance.test.ts tests/domain/open-answer-frame.test.ts
git commit -m "feat: add deterministic answer intake policies"
```

---

### Task 2: Typed Evaluation and Improved-Sentence Policy

**Files:**
- Create: `src/domain/ai/correction-policy.ts`
- Create: `tests/domain/correction-policy.test.ts`
- Modify: `src/domain/ai/turn-evaluation.ts`
- Modify: `tests/domain/turn-evaluation.test.ts`

**Interfaces:**
- Produces: `CORRECTION_POLICY_VERSION = "natural-conversation-v1"`.
- Produces: `CorrectionReason = "none" | "fragment_completion" | "grammar" | "vocabulary"`.
- Produces: `CorrectionPolicyViolation = "no_op" | "parroted_question" | "open_choice_changed" | "pure_embellishment" | "fragment_not_declarative" | "fragment_content_lost" | "fragment_ungrounded" | "fragment_too_long" | "target_pattern_padding"`.
- Produces: `validateImprovedSentencePolicy(input: ImprovedSentencePolicyInput): ImprovedSentencePolicyResult`.
- Extends: `OriginalTurnDecision.retry_original.reason` with `"incomplete_recording"`.
- Extends: stored `OriginalTurnEvaluation` with policy, evaluator, transcription, runtime, and decision-source provenance.
- Consumes: `TranscriptConfidence` from `src/domain/audio/transcript-confidence.ts`.

- [ ] **Step 1: Add failing evaluation-schema tests**

Append focused cases to `tests/domain/turn-evaluation.test.ts`:

```ts
it("requires a typed correction reason and provenance", () => {
  expect(
    originalTurnEvaluationSchema.safeParse({
      version: AI_EVALUATION_VERSION,
      outcome: "correct",
      meaningUnderstood: true,
      targetPatternAttempted: false,
      correctionNeeded: false,
      correctionSeverity: "none",
      correctionReason: "none",
      improvedSentence: null,
      englishLanguage: "english",
      confidence: "high",
      reviewReason: null,
      policyVersion: "natural-conversation-v1",
      evaluationModel: "gpt-4.1-mini",
      evaluationSource: "model",
      transcriptionModel: "gpt-4o-mini-transcribe",
      transcriptionConfidence: { minLogprob: -0.01, tokenCount: 4 },
      runtimeVersion: "local-dev",
    }).success,
  ).toBe(true);
});

it("rejects none with an improved sentence", () => {
  expect(
    decideOriginalTurnOutcome(
      evaluation({
        correctionNeeded: false,
        correctionSeverity: "none",
        correctionReason: "none",
        improvedSentence: "I like Jenga when we swim.",
      }),
      "conversation",
    ).kind,
  ).toBe("teacher_review");
});
```

Update the test's existing `evaluation(...)` fixture builder to include:

```ts
correctionReason: "none",
policyVersion: "natural-conversation-v1",
evaluationModel: "gpt-4.1-mini",
evaluationSource: "model",
transcriptionModel: "gpt-4o-mini-transcribe",
transcriptionConfidence: null,
runtimeVersion: "test-runtime",
```

- [ ] **Step 2: Run the evaluation tests and verify red**

Run:

```bash
npm test -- --run tests/domain/turn-evaluation.test.ts
```

Expected: FAIL because the new correction/provenance fields and incomplete retry reason are absent.

- [ ] **Step 3: Extend the evaluation contracts**

In `src/domain/ai/turn-evaluation.ts`, add the schemas and fields:

```ts
export const CORRECTION_POLICY_VERSION = "natural-conversation-v1" as const;

export const correctionReasonSchema = z.enum([
  "none",
  "fragment_completion",
  "grammar",
  "vocabulary",
]);
export type CorrectionReason = z.infer<typeof correctionReasonSchema>;

export const evaluationSourceSchema = z.enum(["model", "deterministic"]);

export const originalTurnProviderEvaluationSchema = z.object({
  version: z.literal(AI_EVALUATION_VERSION),
  outcome: z.enum([
    "correct",
    "needs_correction",
    "non_english",
    "teacher_review",
  ]),
  meaningUnderstood: z.boolean(),
  targetPatternAttempted: z.boolean(),
  correctionNeeded: z.boolean(),
  correctionSeverity: correctionSeveritySchema,
  correctionReason: correctionReasonSchema,
  improvedSentence: z.string().trim().min(1).nullable(),
  englishLanguage: aiEvaluationEnglishLanguageSchema,
  confidence: aiEvaluationConfidenceSchema,
  reviewReason: aiEvaluationReviewReasonSchema.nullable(),
});

export const originalTurnEvaluationSchema =
  originalTurnProviderEvaluationSchema.extend({
    policyVersion: z.literal(CORRECTION_POLICY_VERSION),
    evaluationModel: z.string().trim().min(1),
    evaluationSource: evaluationSourceSchema,
    transcriptionModel: z.string().trim().min(1),
    transcriptionConfidence: z
      .object({
        minLogprob: z.number().finite(),
        tokenCount: z.number().int().nonnegative(),
      })
      .nullable(),
    runtimeVersion: z.string().trim().min(1),
  });
```

Replace the old provider-facing `originalTurnEvaluationSchema` definition with the split above. Extend the retry decision exactly:

```ts
reason:
  | "non_english"
  | "parroted_correction"
  | "minimal_effort"
  | "incomplete_recording";
```

In `decideOriginalTurnOutcome`, require these correction combinations before mode-specific mapping:

```ts
const validReasonCombination =
  (evaluation.correctionSeverity === "none" &&
    evaluation.correctionReason === "none" &&
    evaluation.improvedSentence === null) ||
  (evaluation.correctionSeverity !== "none" &&
    evaluation.correctionReason !== "none" &&
    evaluation.improvedSentence !== null);

if (!validReasonCombination) return failedOriginalContract();
```

- [ ] **Step 4: Write failing correction-policy tests**

Create `tests/domain/correction-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  validateImprovedSentencePolicy,
  type ImprovedSentencePolicyInput,
} from "@/domain/ai/correction-policy";

const base: ImprovedSentencePolicyInput = {
  evaluationMode: "conversation",
  answerShape: "open",
  missionQuestion: "What games do you like to play when you swim together?",
  targetPattern: "I like to play _____",
  transcript: "My family.",
  correctionReason: "fragment_completion",
  improvedSentence: "I will swim with my family.",
};

describe("validateImprovedSentencePolicy", () => {
  it("accepts the shortest grounded complete recast", () => {
    expect(validateImprovedSentencePolicy(base)).toEqual({ ok: true });
  });

  it("rejects changing the learner's listed choice", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      evaluationMode: "preset",
      missionQuestion:
        "Which ice cream is the best: vanilla, strawberry, or chocolate?",
      targetPattern: "I think _____ is the best",
      transcript: "I think chocolate ice cream is the best.",
      correctionReason: "vocabulary",
      improvedSentence: "I think vanilla ice cream is the best.",
    });
    expect(result).toEqual({ ok: false, violations: ["open_choice_changed"] });
  });

  it("rejects pure appended embellishment", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "I like to play Jenga.",
      correctionReason: "grammar",
      improvedSentence: "I like to play Jenga when we swim together.",
    });
    expect(result).toEqual({ ok: false, violations: ["pure_embellishment"] });
  });

  it("rejects an invented location", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "On the side.",
      missionQuestion: "What games do you like to play when you swim together?",
      improvedSentence: "I like to play Jenga on the side of the pool.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_ungrounded");
  });

  it("rejects a fragment completion that adds more than five lexical tokens", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      improvedSentence: "I am going to swim with my family in the valley.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_too_long");
  });

  it("rejects copied target-pattern padding", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      targetPattern: "I'm going to _____ in the valley",
      improvedSentence: "I'm going to swim with my family in the valley.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("target_pattern_padding");
  });
});
```

- [ ] **Step 5: Run the correction-policy tests and verify red**

Run:

```bash
npm test -- --run tests/domain/correction-policy.test.ts
```

Expected: FAIL because `@/domain/ai/correction-policy` does not exist.

- [ ] **Step 6: Implement the correction-policy boundary**

Create `src/domain/ai/correction-policy.ts` with this public contract:

```ts
import type { CorrectionReason } from "@/domain/ai/turn-evaluation";
import type { AnswerShape } from "@/domain/mission/schemas";

export type CorrectionPolicyViolation =
  | "no_op"
  | "parroted_question"
  | "open_choice_changed"
  | "pure_embellishment"
  | "fragment_not_declarative"
  | "fragment_content_lost"
  | "fragment_ungrounded"
  | "fragment_too_long"
  | "target_pattern_padding";

export type ImprovedSentencePolicyInput = {
  evaluationMode: "preset" | "conversation";
  answerShape: AnswerShape;
  missionQuestion: string | null;
  targetPattern: string;
  transcript: string;
  correctionReason: CorrectionReason;
  improvedSentence: string;
};

export type ImprovedSentencePolicyResult =
  | { ok: true }
  | { ok: false; violations: CorrectionPolicyViolation[] };
```

Use these shared normalizers:

```ts
const WORD = /[\p{L}\p{N}']+/gu;
const DANGLING_END = /\b(?:a|an|the|and|but|because|to|am|is|are|was|were|do|does|did|can|will|have|has|at|by|for|from|in|of|on|with)$/iu;
const FUNCTION_WORDS = new Set([
  "a", "an", "the", "i", "you", "he", "she", "it", "we", "they",
  "am", "is", "are", "was", "were", "be", "do", "does", "did",
  "can", "will", "would", "have", "has", "had", "to", "at", "by",
  "for", "from", "in", "of", "on", "with", "and", "but", "because",
]);

function words(text: string) {
  return (text.toLocaleLowerCase("en-US").match(WORD) ?? []);
}

function normalized(text: string) {
  return words(text).join(" ");
}

function contentWords(text: string) {
  return words(text).filter((word) => !FUNCTION_WORDS.has(word));
}
```

Implement `validateImprovedSentencePolicy` by evaluating these checks in the
listed order and pushing each violation at most once:

- `no_op` when normalized transcript and correction are equal.
- `parroted_question` using the current `isParrotedMissionQuestion` behavior,
  exported from `turn-evaluation.ts`; do not weaken its question-segment
  handling.
- `open_choice_changed` only for `answerShape === "open"` when a colon/comma/`or` alternatives list yields an alternative present in the transcript and the correction drops it or introduces a different listed alternative.
- `pure_embellishment` when the original has at least four words, does not match `DANGLING_END`, and its full normalized word sequence is a strict prefix of the correction.
- Fragment checks only for `correctionReason === "fragment_completion"`:
  - reject `?`, multiple sentence terminators, or a missing subject/finite-verb shape as `fragment_not_declarative`;
  - require every original content word in the correction or emit `fragment_content_lost`;
  - permit correction content words only from transcript plus mission question or emit `fragment_ungrounded`;
  - emit `fragment_too_long` when correction word count minus original word count exceeds five;
  - emit `target_pattern_padding` when words added beyond the learner's content are copied only from the mission-wide target pattern and are not needed to form the shortest clause.

Return unique violations in the fixed order so provider repair prompts and tests remain deterministic.

- [ ] **Step 7: Run domain policy tests**

Run:

```bash
npm test -- --run tests/domain/turn-evaluation.test.ts tests/domain/correction-policy.test.ts
```

Expected: both files PASS, including all pre-existing turn-evaluation guards.

- [ ] **Step 8: Commit the typed correction policy**

```bash
git add src/domain/ai/turn-evaluation.ts src/domain/ai/correction-policy.ts tests/domain/turn-evaluation.test.ts tests/domain/correction-policy.test.ts
git commit -m "feat: validate learner meaning in corrections"
```

---

### Task 3: Transcription and Evaluator Provenance with Constrained Repair

**Files:**
- Modify: `src/server/audio/transcription.ts`
- Modify: `tests/server/transcription.test.ts`
- Modify: `src/server/ai/turn-evaluator.ts`
- Modify: `tests/server/turn-evaluator.test.ts`

**Interfaces:**
- Produces successful transcription shape `{ ok: true; text; koreanSpans; model; confidence }`.
- Produces `TranscriptionEvidence = { model: string; confidence: TranscriptConfidence | null }`.
- Extends `EvaluateOriginalTurnInput` with `transcriptionEvidence` and optional `policyRepair`.
- Exports `resolveEvaluationModel(deps?: TurnEvaluatorDeps): string`.
- Produces `resolveEvaluationRuntimeVersion(): string`.
- `policyRepair` is `{ violations: CorrectionPolicyViolation[] }` and is sent only on the one repair call.

- [ ] **Step 1: Write failing transcription-evidence tests**

In `tests/server/transcription.test.ts`, update a successful result assertion:

```ts
const client = createFakeClient({
  text: "I like chocolate.",
  logprobs: [{ logprob: -0.01 }, { logprob: -0.02 }, { logprob: -0.01 }],
});
const result = await transcribeAudioFile(
  {
    file: new Blob(["voice"], { type: "audio/webm" }),
    mimeType: "audio/webm",
  },
  { apiKey: "test-key", client, model: "test-transcriber" },
);
expect(result).toEqual({
  ok: true,
  text: "I like chocolate.",
  koreanSpans: [],
  model: "test-transcriber",
  confidence: { minLogprob: -0.02, tokenCount: 3 },
});
```

Configure that test with `deps.model: "test-transcriber"` and three finite fake logprobs. Add:

```ts
it("returns null confidence when the provider omits usable logprobs", async () => {
  const { transcribeAudioFile } = await import("@/server/audio/transcription");
  const client = createFakeClient({ text: "My family.", logprobs: null });
  const result = await transcribeAudioFile(
    {
      file: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
    },
    { apiKey: "test-key", client, model: "test-transcriber" },
  );
  expect(result.ok && result.confidence).toBeNull();
});
```

Update every pre-existing exact successful-result assertion in this file with
the resolved `model` and `confidence` fields. Tests whose fake response omits
logprobs expect `confidence: null`.

- [ ] **Step 2: Run transcription tests and verify red**

Run:

```bash
npm test -- --run tests/server/transcription.test.ts
```

Expected: FAIL because successful results do not expose `model` or `confidence`.

- [ ] **Step 3: Return resolved transcription evidence**

In `src/server/audio/transcription.ts`, import `TranscriptConfidence`, add:

```ts
export type TranscriptionEvidence = {
  model: string;
  confidence: TranscriptConfidence | null;
};
```

Extend the successful result branch with `TranscriptionEvidence`. Resolve the model once before the provider call:

```ts
const model = resolveModel(input, deps);
```

Pass `model` to the provider and return:

```ts
return {
  ok: true,
  text,
  koreanSpans,
  model,
  confidence,
};
```

Keep current low-confidence logging and rejection behavior unchanged.

- [ ] **Step 4: Write failing evaluator provenance and repair tests**

In `tests/server/turn-evaluator.test.ts`, update the provider fixture to include `correctionReason`. Add tests that assert:

```ts
expect(result).toMatchObject({
  ok: true,
  evaluation: {
    correctionReason: "none",
    policyVersion: "natural-conversation-v1",
    evaluationModel: "test-evaluator",
    evaluationSource: "model",
    transcriptionModel: "test-transcriber",
    transcriptionConfidence: { minLogprob: -0.02, tokenCount: 3 },
    runtimeVersion: "test-runtime",
  },
});
```

Use this input fragment:

```ts
transcriptionEvidence: {
  model: "test-transcriber",
  confidence: { minLogprob: -0.02, tokenCount: 3 },
},
runtimeVersion: "test-runtime",
```

Add a repair-prompt test:

```ts
expect(JSON.parse(userMessage.content)).toMatchObject({
  policyRepair: {
    violations: ["open_choice_changed"],
  },
});
expect(systemMessage.content).toContain("open_choice_changed");
expect(systemMessage.content).toContain("one replacement evaluation");
```

- [ ] **Step 5: Run evaluator tests and verify red**

Run:

```bash
npm test -- --run tests/server/turn-evaluator.test.ts
```

Expected: FAIL because the provider schema has no correction reason and the adapter has no provenance/repair input.

- [ ] **Step 6: Separate provider output from stored evaluation**

In `src/server/ai/turn-evaluator.ts`:

```ts
import type { TranscriptionEvidence } from "@/server/audio/transcription";
import type { CorrectionPolicyViolation } from "@/domain/ai/correction-policy";
import {
  CORRECTION_POLICY_VERSION,
  originalTurnProviderEvaluationSchema,
  type OriginalTurnEvaluation,
} from "@/domain/ai/turn-evaluation";
```

Extend the input:

```ts
export type EvaluateOriginalTurnInput = {
  // existing fields remain
  transcriptionEvidence: TranscriptionEvidence;
  runtimeVersion?: string;
  policyRepair?: {
    violations: CorrectionPolicyViolation[];
  };
};
```

Add:

```ts
export function resolveEvaluationModel(deps?: TurnEvaluatorDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_EVALUATION_MODEL?.trim() ||
    DEFAULT_EVALUATION_MODEL
  );
}

export function resolveEvaluationRuntimeVersion(override?: string) {
  return (
    override?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    "local-dev"
  );
}
```

Replace the private `resolveModel` with `resolveEvaluationModel`, use
`originalTurnProviderEvaluationSchema` in `zodTextFormat`, resolve the model
once, and enrich the parsed output:

```ts
const model = resolveEvaluationModel(deps);
const evaluation: OriginalTurnEvaluation = {
  ...parsedProviderEvaluation,
  policyVersion: CORRECTION_POLICY_VERSION,
  evaluationModel: model,
  evaluationSource: "model",
  transcriptionModel: input.transcriptionEvidence.model,
  transcriptionConfidence: input.transcriptionEvidence.confidence,
  runtimeVersion: resolveEvaluationRuntimeVersion(input.runtimeVersion),
};
```

Add the provider instructions:

```ts
"Set correctionReason to none only with correctionSeverity none and improvedSentence null.",
"Use fragment_completion only when a relevant fragment needs clause structure because requireCompleteSentenceAnswers is true.",
"Use grammar or vocabulary only to repair an actual error. Never add optional facts or make a complete relevant sentence longer.",
```

When `policyRepair` exists, append the exact violations and:

```ts
"The previous evaluation was rejected by deterministic correction policy. Return one replacement evaluation that fixes every named violation. Do not quote or defend the rejected sentence."
```

The repair remains the same `evaluateOriginalTurn` function; Task 4 owns the exactly-once call count.

- [ ] **Step 7: Run transcription and evaluator tests**

Run:

```bash
npm test -- --run tests/server/transcription.test.ts tests/server/turn-evaluator.test.ts
```

Expected: both files PASS; fake clients are the only providers called.

- [ ] **Step 8: Commit adapter evidence and repair input**

```bash
git add src/server/audio/transcription.ts src/server/ai/turn-evaluator.ts tests/server/transcription.test.ts tests/server/turn-evaluator.test.ts
git commit -m "feat: record evaluation runtime provenance"
```

---

### Task 4: Upload Orchestration and Correction Repair

**Files:**
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `tests/server/audio-upload.test.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Consumes: Task 1 intake policies.
- Consumes: Task 2 correction validator and evaluation contracts.
- Consumes: Task 3 transcription evidence and evaluator repair input.
- Produces stored incomplete retry `{ outcome: "retry_original", retryReason: "incomplete_recording", requireRepeat: false }`.
- Produces exactly one second evaluator call only after an unsafe first improved sentence.
- Preserves existing `UploadAudioResult` and owned Supabase orchestration contracts.
- Updates both existing `successfulTranscriber` test helpers to return
  `model: "test-transcriber"` and `confidence: null`.
- Updates both existing `successfulOriginalEvaluator` base fixtures with
  correction intent and provenance.

- [ ] **Step 1: Write failing preset orchestration tests**

In `tests/server/audio-upload.test.ts`, add:

```ts
it("accepts an authored open frame with the learner's own choice without evaluation", async () => {
  mockSupabase = createMockSupabase({
    missionSnapshot: {
      ...missionSnapshotFixture,
      targetPattern: "I think _____ is the best",
      turns: [{
        ...missionSnapshotFixture.turns[0],
        prompt: "Which ice cream is the best: vanilla, strawberry, or chocolate?",
        targetExample: "I think vanilla ice cream is the best.",
        hintLadder: {
          tier1: "I think _______ is the best",
          tier2: "vanilla",
          tier3: "I think vanilla ice cream is the best.",
        },
        answerShape: "open",
      }],
    },
  });
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const evaluateOriginalTurn = vi.fn();
  const result = await uploadAttemptAudioClip(audioInput(), {
    transcribeAudioFile: successfulTranscriber(
      "I think chocolate ice cream is the best.",
    ),
    evaluateOriginalTurn,
  });

  expect(result).toMatchObject({
    ok: true,
    evaluation: {
      outcome: "correct",
      requireRepeat: false,
      evaluationSource: "deterministic",
    },
  });
  expect(evaluateOriginalTurn).not.toHaveBeenCalled();
});

it("retries a dangling original before scoring or evaluation", async () => {
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const scorePronunciation = vi.fn();
  const evaluateOriginalTurn = vi.fn();
  const result = await uploadAttemptAudioClip(audioInput(), {
    transcribeAudioFile: successfulTranscriber("I"),
    scorePronunciation,
    evaluateOriginalTurn,
  });

  expect(result).toMatchObject({
    ok: true,
    evaluation: {
      outcome: "retry_original",
      retryReason: "incomplete_recording",
      requireRepeat: false,
    },
  });
  expect(scorePronunciation).not.toHaveBeenCalled();
  expect(evaluateOriginalTurn).not.toHaveBeenCalled();
});

it("lets an exact single-token authored target win before incomplete detection", async () => {
  mockSupabase = createMockSupabase({
    missionSnapshot: {
      ...missionSnapshotFixture,
      targetPattern: "I",
      turns: [{
        ...missionSnapshotFixture.turns[0],
        targetExample: "I",
        hintLadder: { tier1: "I", tier2: "I", tier3: "I" },
        answerShape: "fixed",
      }],
    },
  });
  const { uploadAttemptAudioClip } = await import(
    "@/server/student-access/audio-upload"
  );
  const evaluateOriginalTurn = vi.fn();
  const result = await uploadAttemptAudioClip(audioInput(), {
    transcribeAudioFile: successfulTranscriber("I"),
    evaluateOriginalTurn,
  });
  expect(result).toMatchObject({
    ok: true,
    evaluation: { outcome: "accepted_original" },
  });
  expect(evaluateOriginalTurn).not.toHaveBeenCalled();
});
```

At the start of this task, update `successfulTranscriber` in both upload test
files to:

```ts
function successfulTranscriber(
  text: string,
  koreanSpans: Array<{ hangul: string; romanized: string }> = [],
) {
  return vi.fn(async () => ({
    ok: true as const,
    text,
    koreanSpans,
    model: "test-transcriber",
    confidence: null,
  }));
}
```

Update both `successfulOriginalEvaluator` base objects with:

```ts
correctionReason: "none" as const,
policyVersion: "natural-conversation-v1" as const,
evaluationModel: "test-evaluator",
evaluationSource: "model" as const,
transcriptionModel: "test-transcriber",
transcriptionConfidence: null,
runtimeVersion: "test-runtime",
```

For every existing upload-test override with `correctionSeverity: "minor"` or
`"material"`, add `correctionReason: "grammar"` unless that case specifically
tests `fragment_completion` or `vocabulary`. This keeps the Task 2 reason/
severity contract valid without changing each test's intended decision.

- [ ] **Step 2: Write failing conversation orchestration tests**

In `src/server/student-access/audio-upload.test.ts`, add cases proving:

```ts
expect(generateCocoReply).not.toHaveBeenCalled();
expect(warmTtsAudioCache).not.toHaveBeenCalled();
expect(scorePronunciation).not.toHaveBeenCalled();
```

for `"I"`; and:

```ts
expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
expect(evaluateOriginalTurn.mock.calls[1]?.[0].policyRepair).toEqual({
  violations: ["pure_embellishment"],
});
```

for the first result:

```ts
{
  correctionSeverity: "material",
  correctionReason: "grammar",
  improvedSentence: "I like to play Jenga when we swim together.",
}
```

followed by a valid repaired `none` result.

Add a second-invalid case and assert:

```ts
expect(result.evaluation).toMatchObject({
  outcome: "teacher_review",
  requireRepeat: false,
  reviewReason: "ambiguous",
});
expect(evaluateOriginalTurn).toHaveBeenCalledTimes(2);
expect(warmTtsAudioCache).not.toHaveBeenCalled();
expect(generateCocoReply).toHaveBeenCalledWith(
  expect.objectContaining({ responseHandling: "review_pending" }),
);
```

Add complete-sentence setting cases:

```ts
// false: provider returns none and "My family." is accepted unchanged.
// true: provider returns fragment_completion with
// "I will swim with my family." and one repeat is required.
```

- [ ] **Step 3: Run both upload suites and verify red**

Run:

```bash
npm test -- --run tests/server/audio-upload.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: new cases FAIL because deterministic frame/incomplete intake and policy repair are not integrated.

- [ ] **Step 4: Add deterministic evaluation construction**

In `src/server/student-access/audio-upload.ts`, import the new policies and provenance constants. Add one local constructor so every deterministic path writes the same evidence:

```ts
function deterministicOriginalEvaluation(
  fields: Omit<
    StoredOriginalTurnEvaluation,
    | "policyVersion"
    | "evaluationModel"
    | "evaluationSource"
    | "transcriptionModel"
    | "transcriptionConfidence"
    | "runtimeVersion"
  >,
  evidence: {
    evaluationModel: string;
    transcriptionModel: string;
    transcriptionConfidence: TranscriptConfidence | null;
    runtimeVersion: string;
  },
): StoredOriginalTurnEvaluation {
  return {
    ...fields,
    policyVersion: CORRECTION_POLICY_VERSION,
    evaluationModel: evidence.evaluationModel,
    evaluationSource: "deterministic",
    transcriptionModel: evidence.transcriptionModel,
    transcriptionConfidence: evidence.transcriptionConfidence,
    runtimeVersion: evidence.runtimeVersion,
  };
}
```

Extend `StoredOriginalTurnEvaluation` to mirror the Task 2 schema, including `correctionReason` and the new retry reason. Use the exported resolved evaluator-model/runtime helpers; do not infer a production release from timestamps.

More precisely, keep its existing decision-shaped `outcome` and
`requireRepeat` fields, then add:

```ts
type StoredEvaluationProvenance = Pick<
  OriginalTurnEvaluation,
  | "policyVersion"
  | "evaluationModel"
  | "evaluationSource"
  | "transcriptionModel"
  | "transcriptionConfidence"
  | "runtimeVersion"
>;
```

Make `StoredOriginalTurnEvaluation` extend `StoredEvaluationProvenance`.
`applyOriginalTurnEvaluation` copies those six fields plus `correctionReason`
from a successful evaluator result. Give it a third
`fallbackProvenance: StoredEvaluationProvenance` argument so schema/provider
failure rows also record the configured evaluator, transcription, policy, and
runtime evidence rather than losing provenance.

- [ ] **Step 5: Enforce intake ordering**

Immediately after a successful transcription and before the current minimal-effort/scoring block, apply this order:

```ts
const exactTargetMatched =
  targetExample !== null && isExactTargetMatch(transcript, targetExample);

if (!exactTargetMatched && isIncompleteUtterance(transcript)) {
  // Persist original_transcript and deterministic retry evaluation.
  // Mark the clip transcribed, return immediately, and do not start scoring,
  // evaluation, generation, moderation, next-line TTS, or correction TTS.
}

const openFrameMatched =
  !exactTargetMatched &&
  evaluationMode === "preset" &&
  answerShape === "open" &&
  matchesOpenAnswerFrame(transcript, snapshotTurn?.hintLadder?.tier1);

if (exactTargetMatched || openFrameMatched) {
  // Persist deterministic correct/accepted-original evidence and continue
  // through the existing accepted-turn path.
}
```

Move the existing exact-target branch rather than duplicating it. Keep the current two-strike minimal-effort behavior after incomplete detection.

- [ ] **Step 6: Validate and repair model corrections exactly once**

After `evaluateOriginalTurn` succeeds and before `applyOriginalTurnEvaluation`, add:

```ts
async function validatedOriginalEvaluation(
  first: OriginalTurnEvaluation,
): Promise<OriginalTurnEvaluation | null> {
  if (!first.improvedSentence) return first;

  const firstPolicy = validateImprovedSentencePolicy({
    evaluationMode,
    answerShape,
    missionQuestion,
    targetPattern,
    transcript,
    correctionReason: first.correctionReason,
    improvedSentence: first.improvedSentence,
  });
  if (firstPolicy.ok) return first;

  const repaired = await evaluate({
    ...evaluationInput,
    policyRepair: { violations: firstPolicy.violations },
  });
  if (!repaired.ok || !repaired.evaluation.improvedSentence) {
    return repaired.ok ? repaired.evaluation : null;
  }

  const repairedPolicy = validateImprovedSentencePolicy({
    evaluationMode,
    answerShape,
    missionQuestion,
    targetPattern,
    transcript,
    correctionReason: repaired.evaluation.correctionReason,
    improvedSentence: repaired.evaluation.improvedSentence,
  });
  return repairedPolicy.ok ? repaired.evaluation : null;
}
```

If this returns `null`, construct teacher-review evidence with `reviewReason: "ambiguous"`, `requireRepeat: false`, no improved sentence, and no correction TTS. Do not make a third evaluator call.

Pass:

```ts
transcriptionEvidence: {
  model: transcriptionResult.model,
  confidence: transcriptionResult.confidence,
}
```

on both evaluator calls.

- [ ] **Step 7: Preserve provenance in repeat writes**

When storing repeat evaluation, keep:

```ts
originalEvaluation:
  originalEvaluation ?? priorOriginalEvaluation ?? undefined
```

and add test assertions that `policyVersion`, `evaluationModel`, `evaluationSource`, `transcriptionModel`, `transcriptionConfidence`, and `runtimeVersion` survive beneath `originalEvaluation`. Legacy rows may still lack it; do not fabricate historical evidence.

- [ ] **Step 8: Run upload and adjacent scoring tests**

Run:

```bash
npm test -- --run tests/server/audio-upload.test.ts src/server/student-access/audio-upload.test.ts tests/domain/minimal-effort-detection.test.ts tests/domain/turn-evaluation.test.ts
```

Expected: all files PASS; call-count assertions prove the bypass and one-repair limits.

- [ ] **Step 9: Commit orchestration**

```bash
git add src/server/student-access/audio-upload.ts tests/server/audio-upload.test.ts src/server/student-access/audio-upload.test.ts
git commit -m "feat: enforce natural correction policy in uploads"
```

---

### Task 5: Same-Question Recording-Recovery Feedback

**Files:**
- Modify: `src/domain/flow/completion.ts`
- Modify: `tests/server/mission-flow.test.ts`
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `src/components/student/StepAiEvaluationFeedback.tsx`
- Modify: `src/domain/character/expression.ts`
- Modify: `tests/domain/character-expression.test.ts`
- Modify: `tests/server/student-mission-flow.test.ts`

**Interfaces:**
- Produces UI feedback kind/outcome `retryIncompleteRecording`.
- Consumes stored retry reason `"incomplete_recording"`.
- Preserves generic transcription-failure and non-English retry behavior.
- Produces no mascot dialogue/TTS text and no target sentence for this state.

- [ ] **Step 1: Write failing resume and expression tests**

In `tests/server/mission-flow.test.ts`, add:

```ts
it("resumes incomplete recording on the same original question", () => {
  const review = getPendingTurnReview(
    pendingTurn({
      evaluation: {
        outcome: "retry_original",
        retryReason: "incomplete_recording",
        requireRepeat: false,
      },
    }),
  );
  expect(review).toMatchObject({
    step: "aiFeedback",
    aiFeedback: { outcome: "retryIncompleteRecording" },
  });
});
```

In `tests/domain/character-expression.test.ts`, add `retryIncompleteRecording` to the local union/list and assert it maps to `"encouraging"`.

- [ ] **Step 2: Run focused flow tests and verify red**

Run:

```bash
npm test -- --run tests/server/mission-flow.test.ts tests/domain/character-expression.test.ts
```

Expected: FAIL because the new feedback kind is not in the unions or mappings.

- [ ] **Step 3: Add the resumable feedback kind**

In `src/domain/flow/completion.ts`, add `"retryIncompleteRecording"` to `PendingTurnReview.aiFeedback.outcome` and map:

```ts
const retryOutcome =
  retryReason === "minimal_effort"
    ? "retryMinimalEffort"
    : retryReason === "incomplete_recording"
      ? "retryIncompleteRecording"
      : "retryOriginal";
```

In `src/domain/character/expression.ts`, add the kind and:

```ts
if (input.originalFeedbackKind === "retryIncompleteRecording") {
  return "encouraging";
}
```

- [ ] **Step 4: Write failing UI source-contract tests**

In `tests/server/student-mission-flow.test.ts`, assert the feedback component contains the exact copy and that `MissionFlowShell` maps the retry reason to the named kind:

```ts
expect(feedbackSource).toContain(
  "It sounds like the recording stopped early. Try recording your answer again.",
);
expect(shellSource).toContain('retryReason === "incomplete_recording"');
expect(shellSource).toContain('kind: "retryIncompleteRecording"');
```

Also assert the mascot dialogue branch returns `line: null` for the new kind, which prevents feedback TTS warmup/playback.

- [ ] **Step 5: Run UI contract tests and verify red**

Run:

```bash
npm test -- --run tests/server/student-mission-flow.test.ts
```

Expected: FAIL because the exact feedback state/copy is absent.

- [ ] **Step 6: Implement neutral recovery presentation**

In `src/components/student/MissionFlowShell.tsx`:

```ts
type OriginalFeedback = (
  | {
      kind: "acceptedOriginal";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "needsCorrection";
      transcript: string;
      improvedSentence: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryOriginal";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryIncompleteRecording";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "retryMinimalEffort";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
  | {
      kind: "teacherReview";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
) & {
  minimalEffortKind?: "dont_know" | "short_answer";
  retryExample?: string | null;
};
```

Map `evaluation.retryReason === "incomplete_recording"` before generic `retryOriginal`. Add it to the same retry-original button handler, but return no mascot dialogue:

```ts
if (
  flow.step === "aiFeedback" &&
  flow.originalFeedback?.kind === "retryIncompleteRecording"
) {
  return {
    text:
      "It sounds like the recording stopped early. Try recording your answer again.",
    line: null,
  };
}
```

In `src/components/student/StepAiEvaluationFeedback.tsx`, add the outcome and render:

```tsx
if (outcome === "retryIncompleteRecording") {
  return (
    <div style={stepCardStyle} aria-live="polite" role="alert">
      <Transcript transcript={transcript} audioUrl={audioUrl} />
      <div style={{ ...evaluationReviewStyle, marginTop: transcript ? 16 : 0 }}>
        <p style={{ margin: 0 }}>
        It sounds like the recording stopped early. Try recording your answer
        again.
        </p>
      </div>
      <RecordingReview onRetry={onRetry} />
    </div>
  );
}
```

- [ ] **Step 7: Run flow and UI tests**

Run:

```bash
npm test -- --run tests/server/mission-flow.test.ts tests/domain/character-expression.test.ts tests/server/student-mission-flow.test.ts
```

Expected: all files PASS.

- [ ] **Step 8: Commit recording-recovery UI**

```bash
git add src/domain/flow/completion.ts src/components/student/MissionFlowShell.tsx src/components/student/StepAiEvaluationFeedback.tsx src/domain/character/expression.ts tests/server/mission-flow.test.ts tests/domain/character-expression.test.ts tests/server/student-mission-flow.test.ts
git commit -m "feat: add incomplete recording recovery feedback"
```

---

### Task 6: Structured One-Detail Coco Replies

**Files:**
- Modify: `src/domain/ai/conversation-generation.ts`
- Modify: `src/domain/ai/conversation-generation.test.ts`
- Modify: `src/server/ai/conversation-generator.ts`
- Modify: `src/server/ai/conversation-generator.test.ts`
- Modify: `src/server/student-access/audio-upload.test.ts`

**Interfaces:**
- Provider schema: `{ reaction: string | null; focus: string | null; question: string | null }`.
- App result: `{ reaction; focus; question; line }`, preserving `reply.line`.
- Produces `assembleGeneratedCocoReply(parts): GeneratedCocoReply`.
- Adds violations `multi_detail_echo`, `response_summary`, `stacked_generic_reaction`, and `focus_mismatch`.

- [ ] **Step 1: Write failing structured-reply domain tests**

In `src/domain/ai/conversation-generation.test.ts`, replace `{ line }` provider fixtures and add:

```ts
it("assembles a follow-up while preserving reply.line for consumers", () => {
  expect(
    parseGeneratedCocoReply({
      reaction: "Nice plans!",
      focus: "swim",
      question: "Who will you swim with?",
    }),
  ).toEqual({
    ok: true,
    reply: {
      reaction: "Nice plans!",
      focus: "swim",
      question: "Who will you swim with?",
      line: "Nice plans! Who will you swim with?",
    },
  });
});

it("rejects closing parts that contain a focus or question", () => {
  expect(
    validateGeneratedCocoReplyParts(
      { reaction: "That sounds great. See you next time!", focus: "swim", question: null },
      { expectsQuestion: false, latestStudentResponse: "I swim." },
    ).ok,
  ).toBe(false);
});

it.each([
  [
    {
      reaction: "Eating watermelon, swimming, and eating chicken sounds fun!",
      focus: "swimming",
      question: "Who will you swim with?",
    },
    "multi_detail_echo",
  ],
  [
    {
      reaction: "Eating watermelon swimming eating chicken!",
      focus: "swimming",
      question: "Who will you swim with?",
    },
    "response_summary",
  ],
  [
    {
      reaction: "That sounds delicious and fun!",
      focus: "swimming",
      question: "Who will you swim with?",
    },
    "stacked_generic_reaction",
  ],
  [
    {
      reaction: "Nice plans!",
      focus: "swimming",
      question: "What chicken will you eat?",
    },
    "focus_mismatch",
  ],
])("reports %s deterministically", (parts, violation) => {
  const result = validateGeneratedCocoReplyParts(parts, {
    expectsQuestion: true,
    activeQuestion: "What will you do in the valley?",
    latestStudentResponse: "I will eat watermelon, swim, and eat chicken.",
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reasons).toContain(violation);
});
```

Retain every current line-policy test by adapting its fixture to structured parts.

- [ ] **Step 2: Run domain generation tests and verify red**

Run:

```bash
npm test -- --run src/domain/ai/conversation-generation.test.ts
```

Expected: FAIL because the provider schema is still `{ line }` and new validator/violations do not exist.

- [ ] **Step 3: Implement structured parsing, assembly, and validation**

In `src/domain/ai/conversation-generation.ts`, define:

```ts
export const generatedCocoReplyPartsSchema = z.object({
  reaction: z.string().trim().min(1).nullable(),
  focus: z.string().trim().min(1).nullable(),
  question: z.string().trim().min(1).nullable(),
});

export type GeneratedCocoReplyParts = z.infer<
  typeof generatedCocoReplyPartsSchema
>;

export type GeneratedCocoReply = GeneratedCocoReplyParts & {
  line: string;
};

export function assembleGeneratedCocoReply(
  parts: GeneratedCocoReplyParts,
): GeneratedCocoReply {
  return {
    ...parts,
    line: [parts.reaction, parts.question].filter(Boolean).join(" ").trim(),
  };
}
```

`parseGeneratedCocoReply` parses parts, assembles `line`, and rejects an empty assembled line. Replace `validateGeneratedCocoReplyLine` with:

```ts
export function validateGeneratedCocoReplyParts(
  parts: GeneratedCocoReplyParts,
  options: {
    expectsQuestion: boolean;
    activeQuestion?: string;
    latestStudentResponse?: string;
  },
): GeneratedCocoReplyLinePolicyResult
```

Run all current punctuation/topic/vague checks on the assembled line. Add these deterministic rules:

- Follow-up requires non-null `question`; closing requires null `question` and null `focus`.
- `multi_detail_echo`: reaction includes two or more distinct non-stopword content details from the latest response.
- `response_summary`: reaction includes at least 70% of distinct latest-response content words when that response has at least three.
- `stacked_generic_reaction`: reaction matches `sounds ... <generic adjective> and <generic adjective>` using the fixed set `fun`, `good`, `great`, `nice`, `delicious`, `exciting`, `cool`.
- `focus_mismatch`: when focus is non-null, it must occur in the latest response, and either the question contains that focus/related topic word or the existing active-topic check permits a nearby transition.

Keep violations unique and in stable order.

- [ ] **Step 4: Write failing server-generator tests**

In `src/server/ai/conversation-generator.test.ts`:

- Change all provider payloads to structured parts.
- Assert returned `reply.line` remains assembled.
- Add a first-candidate `multi_detail_echo` and valid second candidate.
- Assert the second system message contains the literal `multi_detail_echo` explanation.
- Add a second-invalid response and assert existing `reply_policy_failed`.
- Keep closing, schema failure, provider failure, review-pending, and response-state-aware fallback-facing tests intact.

Use:

```ts
expect(client.responses.parse).toHaveBeenCalledTimes(2);
expect(secondSystemMessage).toContain("multi_detail_echo");
expect(result).toMatchObject({
  ok: true,
  reply: { line: "Nice plans! Who will you swim with?" },
});
```

In `src/server/student-access/audio-upload.test.ts`, import
`GeneratedCocoReply` and add:

```ts
function generatedReply(line: string): GeneratedCocoReply {
  return {
    reaction: null,
    focus: null,
    question: null,
    line,
  };
}
```

Replace each injected downstream generator result shaped as
`reply: { line: value }` with `reply: generatedReply(value)`. These fakes test
upload orchestration after generation, so their structured provider parsing is
covered in `src/server/ai/conversation-generator.test.ts`.

- [ ] **Step 5: Run server generation tests and verify red**

Run:

```bash
npm test -- --run src/server/ai/conversation-generator.test.ts
```

Expected: FAIL because the server still requests and validates `{ line }`.

- [ ] **Step 6: Request structured parts and send exact repair hints**

In `src/server/ai/conversation-generator.ts`:

- Use `generatedCocoReplyPartsSchema` in both `zodTextFormat` calls.
- Validate parts with `validateGeneratedCocoReplyParts`.
- Return the assembled reply from `parseGeneratedCocoReply`.
- Extend `VIOLATION_CORRECTION_HINTS`:

```ts
multi_detail_echo:
  "The reaction repeated two or more details from the student's latest answer. React briefly without replaying the list, then explore only the declared focus.",
response_summary:
  "The reaction summarized most of the student's response. Replace it with one short social reaction and keep only one focus.",
stacked_generic_reaction:
  "The reaction stacked generic adjectives in a 'sounds ... and ...' phrase. Use one short reaction without an adjective pair.",
focus_mismatch:
  "The question did not explore the declared focus. Keep one learner-owned focus from the latest response and ask about that detail, or make a gentle nearby transition.",
```

Update system/prompt instructions:

```ts
"Return reaction, focus, and question separately.",
"A follow-up may react briefly or mention one learner-owned detail, but must not summarize a list.",
"Choose at most one focus from the latest studentResponse and make the question explore it.",
"A closing uses reaction only; set focus and question to null.",
```

- [ ] **Step 7: Run generation and upload conversation tests**

Run:

```bash
npm test -- --run src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/audio-upload.test.ts
```

Expected: all files PASS; upload consumers still use `reply.line` unchanged.

- [ ] **Step 8: Commit structured replies**

```bash
git add src/domain/ai/conversation-generation.ts src/server/ai/conversation-generator.ts src/domain/ai/conversation-generation.test.ts src/server/ai/conversation-generator.test.ts src/server/student-access/audio-upload.test.ts
git commit -m "feat: keep Coco follow-ups focused and natural"
```

---

### Task 7: Complete Read-Only Attempt Evidence

**Files:**
- Create: `scripts/lib/attempt-report.mjs`
- Create: `scripts/lib/attempt-report.test.mjs`
- Modify: `scripts/inspect-attempts.mjs`

**Interfaces:**
- Produces `formatAssignmentPolicy(snapshot): string[]`.
- Produces `formatAttemptTurn(turn, snapshotTurn): string[]`.
- Produces `formatEvaluation(evaluation, { label }): string[]`.
- Produces `formatAudioClip(clip): string[]`.
- Inspector continues to perform only `select` queries and passes raw rows to pure formatters.

- [ ] **Step 1: Write failing deterministic formatter tests**

Create `scripts/lib/attempt-report.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAssignmentPolicy,
  formatAttemptTurn,
} from "./attempt-report.mjs";

test("prints mission policy, correction, provenance, failed clips, and fallback evidence", () => {
  const policy = formatAssignmentPolicy({
    conversationMode: true,
    scenePremise: "A summer day in the valley",
    targetPattern: "I'm going to _____",
    requireCompleteSentenceAnswers: true,
    turns: [{ turnOrder: 1, answerShape: "open" }],
  }).join("\n");

  const turn = formatAttemptTurn(
    {
      turn_order: 1,
      original_transcript: "I",
      improved_sentence: null,
      repeat_transcript: null,
      created_at: "2026-07-26T00:00:00Z",
      updated_at: "2026-07-26T00:00:01Z",
      evaluation: {
        outcome: "retry_original",
        retryReason: "incomplete_recording",
        policyVersion: "natural-conversation-v1",
        evaluationModel: "gpt-4.1-mini",
        evaluationSource: "deterministic",
        transcriptionModel: "gpt-4o-mini-transcribe",
        transcriptionConfidence: { minLogprob: -0.2, tokenCount: 1 },
        runtimeVersion: "abc123",
      },
      moderation_event: {
        kind: "canned_fallback",
        cause: "reply_policy_failed",
        violations: ["question_format"],
      },
      audio_clips: [
        {
          clip_kind: "original_answer",
          processing_status: "failed",
          duration_ms: 6548,
          byte_size: 30460,
          mime_type: "audio/webm",
          created_at: "2026-07-26T00:00:00Z",
          updated_at: "2026-07-26T00:00:01Z",
          object_key: "must-not-print",
          pronunciation_scores: [],
        },
      ],
    },
    { answerShape: "open", prompt: "Why?", targetExample: "Because it is good." },
  ).join("\n");

  const output = `${policy}\n${turn}`;
  assert.match(output, /require complete sentence answers: true/i);
  assert.match(output, /answer shape: open/i);
  assert.match(output, /improved sentence: —/i);
  assert.match(output, /processing status: failed/i);
  assert.match(output, /duration: 6548 ms/i);
  assert.match(output, /byte size: 30460/i);
  assert.match(output, /moderation event: canned_fallback/i);
  assert.match(output, /fallback cause: reply_policy_failed/i);
  assert.match(output, /violations: question_format/i);
  assert.match(output, /policy version: natural-conversation-v1/i);
  assert.doesNotMatch(output, /must-not-print/);
  assert.doesNotMatch(output, /object_key/i);
});

test("labels missing repeat provenance instead of inventing it", () => {
  const output = formatAttemptTurn(
    {
      turn_order: 1,
      evaluation: { outcome: "repeat_accepted", repeatCloseEnough: true },
      audio_clips: [],
    },
    {},
  ).join("\n");
  assert.match(
    output,
    /original evaluation unavailable \(legacy row or stale runtime\)/i,
  );
});
```

- [ ] **Step 2: Run the formatter test and verify red**

Run:

```bash
node --test scripts/lib/attempt-report.test.mjs
```

Expected: FAIL because `scripts/lib/attempt-report.mjs` does not exist.

- [ ] **Step 3: Extract pure report formatting**

Create `scripts/lib/attempt-report.mjs` and move the current evaluation formatting into exported functions:

```js
function shown(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function formatEvaluation(evaluation, { label = "evaluation" } = {}) {
  const lines = [`    ${label}:`];
  if (!evaluation || Object.keys(evaluation).length === 0) {
    return [...lines, "      (no evaluation recorded)"];
  }
  const fields = [
    ["outcome", evaluation.outcome],
    ["meaning understood", evaluation.meaningUnderstood],
    ["target pattern attempted", evaluation.targetPatternAttempted],
    ["correction needed", evaluation.correctionNeeded],
    ["correction severity", evaluation.correctionSeverity],
    ["correction reason", evaluation.correctionReason],
    ["improved sentence", evaluation.improvedSentence],
    ["retry reason", evaluation.retryReason],
    ["repeat close enough", evaluation.repeatCloseEnough],
    ["language", evaluation.englishLanguage],
    ["confidence", evaluation.confidence],
    ["review reason", evaluation.reviewReason],
    ["policy version", evaluation.policyVersion],
    ["evaluator model", evaluation.evaluationModel],
    ["evaluation source", evaluation.evaluationSource],
    ["transcription model", evaluation.transcriptionModel],
    [
      "transcription confidence",
      evaluation.transcriptionConfidence
        ? `minLogprob=${evaluation.transcriptionConfidence.minLogprob} tokenCount=${evaluation.transcriptionConfidence.tokenCount}`
        : null,
    ],
    ["runtime version", evaluation.runtimeVersion],
  ];
  for (const [field, value] of fields) {
    if (value !== undefined) lines.push(`      ${field}: ${shown(value)}`);
  }
  if (evaluation.originalEvaluation) {
    lines.push(
      ...formatEvaluation(evaluation.originalEvaluation, {
        label: "original evaluation (before repeat)",
      }),
    );
  } else if (
    "repeatCloseEnough" in evaluation ||
    evaluation.outcome === "accepted_repeat" ||
    evaluation.outcome === "repeat_accepted" ||
    evaluation.outcome === "retry_repeat"
  ) {
    lines.push(
      "      original evaluation unavailable (legacy row or stale runtime)",
    );
  }
  return lines;
}

export function formatAssignmentPolicy(snapshot) {
  return [
    `  conversation mode: ${snapshot?.conversationMode === true}`,
    `  scene premise: ${snapshot?.scenePremise ?? "—"}`,
    `  target pattern: ${snapshot?.targetPattern ?? "—"}`,
    `  require complete sentence answers: ${snapshot?.requireCompleteSentenceAnswers ?? true}`,
    ...(snapshot?.turns ?? []).map(
      (turn) => `  turn ${turn.turnOrder} answer shape: ${turn.answerShape ?? "fixed"}`,
    ),
  ];
}

export function formatAudioClip(clip) {
  const lines = [
    `    audio clip: ${shown(clip.clip_kind)}`,
    `      processing status: ${shown(clip.processing_status)}`,
    `      duration: ${shown(clip.duration_ms)}${clip.duration_ms == null ? "" : " ms"}`,
    `      byte size: ${shown(clip.byte_size)}`,
    `      MIME type: ${shown(clip.mime_type)}`,
    `      created at: ${shown(clip.created_at)}`,
    `      updated at: ${shown(clip.updated_at)}`,
  ];
  for (const score of clip.pronunciation_scores ?? []) {
    lines.push(
      `      pronunciation: accuracy=${shown(score.accuracy_score)} fluency=${shown(score.fluency_score)} completeness=${shown(score.completeness_score)} overall=${shown(score.pronunciation_score)} stars=${shown(score.star_band)}`,
    );
  }
  return lines;
}

export function formatAttemptTurn(turn, snapshotTurn = {}) {
  const evaluation = turn.evaluation ?? {};
  const hintLevel = turn.hint_level_used ?? 0;
  const lines = [
    `  Turn ${shown(turn.turn_order)}`,
    `    coco said: ${shown(turn.coco_line ?? snapshotTurn.prompt)}`,
    `    target: ${shown(snapshotTurn.targetExample)}`,
    `    answer shape: ${shown(snapshotTurn.answerShape ?? "fixed")}`,
    `    said (original): ${shown(turn.original_transcript)}`,
    `    improved sentence: ${shown(turn.improved_sentence)}`,
    `    said (repeat): ${shown(turn.repeat_transcript)}`,
    `    hint level used: ${shown(hintLevel)}`,
    `    created at: ${shown(turn.created_at)}`,
    `    updated at: ${shown(turn.updated_at)}`,
    ...formatEvaluation(evaluation, {
      label:
        "originalEvaluation" in evaluation ||
        "repeatCloseEnough" in evaluation
          ? "repeat evaluation"
          : "original evaluation",
    }),
  ];
  const hintShown = snapshotTurn.hintLadder?.[`tier${hintLevel}`];
  if (hintLevel > 0 && hintShown) {
    lines.push(`    hint shown (tier${hintLevel}): ${hintShown}`);
  }
  const event = turn.moderation_event;
  if (event) {
    lines.push(`    moderation event: ${shown(event.kind)}`);
    if (event.cause) lines.push(`      fallback cause: ${shown(event.cause)}`);
    if (event.violations) {
      lines.push(`      violations: ${event.violations.join(", ")}`);
    }
  }
  for (const clip of turn.audio_clips ?? []) {
    lines.push(...formatAudioClip(clip));
  }
  return lines;
}
```

Do not call `Object.entries` on rows and do not add `id`, `object_key`, access
values, or URLs to these allowlists.

- [ ] **Step 4: Expand read-only inspector selects**

In `scripts/inspect-attempts.mjs`:

```js
import {
  formatAssignmentPolicy,
  formatAttemptTurn,
} from "./lib/attempt-report.mjs";
```

Expand the attempt/turn/audio selects to request the existing columns:

```text
attempts: id, status, started_at, completed_at, created_at, updated_at,
          needs_review_reason
attempt_turns: turn_order, original_transcript, improved_sentence,
               repeat_transcript, evaluation, target_attempted,
               repeat_accepted, hint_level_used, coco_line,
               created_at, updated_at, moderation_event
audio_clips: clip_kind, processing_status, duration_ms, byte_size, mime_type,
             created_at, updated_at, pronunciation_scores(...)
```

Pass the selected `moderation_event` through unchanged; do not add or infer a
database column.

Print `formatAssignmentPolicy(snapshot)` once per assignment/student header.
Include `started_at`, `completed_at`, `created_at`, and `updated_at` in the
attempt header. For each turn, construct:

```js
const effectiveTurnPolicy = {
  ...snapshotTurn,
  prompt:
    turn.coco_line ??
    turn.mission_turn_templates?.prompt ??
    snapshotTurn?.prompt,
  targetExample:
    turn.mission_turn_templates?.target_example ??
    snapshotTurn?.targetExample,
  hintLadder:
    turn.mission_turn_templates?.hint_ladder ??
    snapshotTurn?.hintLadder,
};
```

Then print `formatAttemptTurn(turn, effectiveTurnPolicy)`. Remove the in-file
`formatEvaluation`.

- [ ] **Step 5: Run formatter and script safety checks**

Run:

```bash
node --test scripts/lib/attempt-report.test.mjs
node --check scripts/inspect-attempts.mjs
node --check scripts/lib/attempt-report.mjs
rg -n "object_key|signed_url|pin|access_value" scripts/lib/attempt-report.mjs
```

Expected: tests PASS; both syntax checks exit 0; `rg` exits 1 with no matches.

- [ ] **Step 6: Commit the inspector upgrade**

```bash
git add scripts/inspect-attempts.mjs scripts/lib/attempt-report.mjs scripts/lib/attempt-report.test.mjs
git commit -m "feat: expose complete attempt inspection evidence"
```

---

### Task 8: Integrated Regression and Verification Gate

**Files:**
- Modify: `TASK.md`

**Interfaces:**
- Consumes every preceding task.
- Produces automated verification evidence and a clearly separated optional live-UAT checkpoint.

- [ ] **Step 1: Run all focused natural-conversation tests**

Run:

```bash
npm test -- --run tests/domain/incomplete-utterance.test.ts tests/domain/open-answer-frame.test.ts tests/domain/correction-policy.test.ts tests/domain/turn-evaluation.test.ts src/domain/ai/conversation-generation.test.ts tests/server/transcription.test.ts tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts src/server/student-access/audio-upload.test.ts tests/server/mission-flow.test.ts tests/domain/character-expression.test.ts tests/server/student-mission-flow.test.ts src/server/ai/conversation-generator.test.ts
node --test scripts/lib/attempt-report.test.mjs
```

Expected: every listed test passes. If a regression fails, fix only the owning implementation and add/adjust the narrow regression assertion before rerunning this exact command.

- [ ] **Step 2: Run the full automated test suite**

Run:

```bash
npm test -- --run
```

Expected: all Vitest files PASS with no paid provider calls.

- [ ] **Step 3: Run static verification**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both commands exit 0. Do not clean unrelated pre-existing warnings by editing adjacent code.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: Next.js production build exits 0.

- [ ] **Step 5: Audit the observable done cases in tests**

Run:

```bash
rg -n "chocolate ice cream|incomplete_recording|My family|I like to play Jenga|On the side|multi_detail_echo|original evaluation unavailable|natural-conversation-v1" tests src/server/student-access/audio-upload.test.ts scripts/lib/attempt-report.test.mjs
```

Expected: each observable example appears in a focused automated regression. Add a missing focused assertion before proceeding; do not rely on prose alone.

- [ ] **Step 6: Update the active task record**

In `TASK.md`:

- Change status to `Implemented; automated verification complete; live UAT awaiting separate approval`.
- Check each implementation and automated verification milestone.
- Record exact commands and pass counts from Steps 1–4.
- Keep live localhost provider replay unchecked.
- Record that `.superpowers/sdd/task-1-report.md` remained untouched.

- [ ] **Step 7: Commit automated completion evidence**

```bash
git add TASK.md
git commit -m "docs: record natural conversation verification"
```

- [ ] **Step 8: Stop at the live-provider approval gate**

Do not call providers or mutate remote data. Report the automated results and ask for separate approval naming:

```text
localhost paid-provider UAT against <named Supabase environment>
```

Only after that approval, replay the seven cases from the design specification, inspect the resulting attempt using the upgraded script, and label screenshots/audio/report excerpts as localhost application evidence. Live UAT failure creates a focused follow-up task; it does not authorize deployment, production mutation, or provider changes.
