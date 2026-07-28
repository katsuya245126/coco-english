# Learner-Safe Hangul Transcripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve raw speech-to-text evidence while showing learners a safe English interpretation of Hangul-script accented English and using that interpretation for pronunciation practice.

**Architecture:** Add structured per-span interpretation metadata to the existing original and repeat evaluator results, persist it inside the existing `attempt_turns.evaluation` JSON, and derive learner text with one deterministic pure helper. The helper replaces only validated `accented_english` spans, preserves `name` spans, and returns `null` if any span is `korean_vocabulary`, `uncertain`, missing, duplicated, or malformed. Raw `original_transcript` and `repeat_transcript` remain the sole evidence fields; student APIs and views receive only the derived learner transcript.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Supabase JSON fields, Vitest, existing OpenAI Responses structured-output adapter, existing Azure pronunciation adapter.

## Global Constraints

- Never rewrite `attempt_turns.original_transcript` or `attempt_turns.repeat_transcript`; they remain verbatim normalized provider evidence.
- Do not add a loanword dictionary or translate genuine Korean vocabulary into a learner transcript.
- `accented_english` is the only classification allowed to supply an English replacement.
- `name` remains exactly as written in the raw transcript.
- Any `korean_vocabulary`, `uncertain`, incomplete, duplicated, extraneous, or malformed interpretation set suppresses the whole learner-facing transcript.
- A hidden learner transcript is `null`, not an empty string and not a placeholder that claims what the learner said.
- Hangul script alone never produces negative pronunciation feedback. Use the existing pronunciation provider, with the validated English interpretation as reference text, to decide stars and practice words.
- Preserve preset/conversation behavior, evaluation decisions, correction policy, mission snapshots, ownership filters, RLS, private audio, and signed-on-demand playback.
- Persist interpretation metadata in the existing evaluation JSON; no database migration.
- Keep `AI_EVALUATION_VERSION` at `ai-eval-v1`. Historical flow code explicitly recognizes that envelope, and this additive metadata does not change decision semantics.
- Tests use fake provider clients only. Live OpenAI/Azure UAT, Supabase operations, deployment, push, or production changes require separate explicit approval.
- Preserve unrelated untracked files reported by `git status`.

---

### Task 1: Pure Hangul interpretation contract and learner-display boundary

**Files:**
- Create: `src/domain/audio/transcript-interpretation.ts`
- Create: `tests/domain/transcript-interpretation.test.ts`

**Interfaces:**
- Consumes: `detectHangulSpans(rawTranscript)` from `src/domain/audio/hangul-romanization.ts`.
- Produces:

```ts
export type HangulInterpretationKind =
  | "accented_english"
  | "name"
  | "korean_vocabulary"
  | "uncertain";

export type HangulInterpretation = {
  hangul: string;
  kind: HangulInterpretationKind;
  englishReading: string | null;
};

export function validateHangulInterpretations(
  rawTranscript: string,
  interpretations: HangulInterpretation[],
): { ok: true } | { ok: false; reason: HangulInterpretationValidationError };

export function buildLearnerTranscript(
  rawTranscript: string,
  interpretations: HangulInterpretation[],
): string | null;
```

- [ ] **Step 1: Write the failing pure-domain tests**

Create `tests/domain/transcript-interpretation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildLearnerTranscript,
  validateHangulInterpretations,
} from "@/domain/audio/transcript-interpretation";

describe("learner-safe transcript interpretation", () => {
  it("replaces only validated accented-English Hangul spans", () => {
    const raw =
      "바닐라 아이스크림 is tastier than 초콜릿 아이스크림.";

    expect(
      buildLearnerTranscript(raw, [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
        {
          hangul: "아이스크림",
          kind: "accented_english",
          englishReading: "ice cream",
        },
        {
          hangul: "초콜릿",
          kind: "accented_english",
          englishReading: "chocolate",
        },
      ]),
    ).toBe("vanilla ice cream is tastier than chocolate ice cream.");
  });

  it("preserves a proper name exactly as spoken", () => {
    expect(
      buildLearnerTranscript("I'm going to 거제도.", [
        { hangul: "거제도", kind: "name", englishReading: null },
      ]),
    ).toBe("I'm going to 거제도.");
  });

  it.each(["korean_vocabulary", "uncertain"] as const)(
    "hides the whole learner transcript for %s",
    (kind) => {
      expect(
        buildLearnerTranscript("I like 축구.", [
          { hangul: "축구", kind, englishReading: null },
        ]),
      ).toBeNull();
    },
  );

  it("passes through an all-English transcript with empty metadata", () => {
    expect(buildLearnerTranscript("I like soccer.", [])).toBe(
      "I like soccer.",
    );
  });

  it.each([
    {
      name: "missing span",
      interpretations: [],
    },
    {
      name: "duplicated span",
      interpretations: [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
      ],
    },
    {
      name: "extraneous span",
      interpretations: [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "vanilla",
        },
        {
          hangul: "초콜릿",
          kind: "accented_english",
          englishReading: "chocolate",
        },
      ],
    },
    {
      name: "non-English replacement",
      interpretations: [
        {
          hangul: "바닐라",
          kind: "accented_english",
          englishReading: "香草",
        },
      ],
    },
    {
      name: "replacement on a name",
      interpretations: [
        { hangul: "바닐라", kind: "name", englishReading: "vanilla" },
      ],
    },
  ])("fails closed for $name", ({ interpretations }) => {
    expect(buildLearnerTranscript("바닐라 is good.", interpretations)).toBeNull();
    expect(
      validateHangulInterpretations(
        "바닐라 is good.",
        interpretations,
      ).ok,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new test and confirm the module is missing**

Run:

```bash
npx vitest run tests/domain/transcript-interpretation.test.ts
```

Expected: FAIL because `@/domain/audio/transcript-interpretation` does not exist.

- [ ] **Step 3: Implement the closed-world validator and display builder**

Create `src/domain/audio/transcript-interpretation.ts`:

```ts
import { z } from "zod";
import { detectHangulSpans } from "@/domain/audio/hangul-romanization";

export const hangulInterpretationKindSchema = z.enum([
  "accented_english",
  "name",
  "korean_vocabulary",
  "uncertain",
]);

export const hangulInterpretationSchema = z.object({
  hangul: z.string().trim().min(1),
  kind: hangulInterpretationKindSchema,
  englishReading: z.string().trim().min(1).nullable(),
});

export type HangulInterpretationKind = z.infer<
  typeof hangulInterpretationKindSchema
>;
export type HangulInterpretation = z.infer<
  typeof hangulInterpretationSchema
>;

export type HangulInterpretationValidationError =
  | "coverage_mismatch"
  | "duplicate_span"
  | "invalid_english_reading"
  | "unexpected_english_reading";

const ENGLISH_READING_PATTERN = /^[A-Za-z][A-Za-z' -]*$/u;

export function validateHangulInterpretations(
  rawTranscript: string,
  interpretations: HangulInterpretation[],
):
  | { ok: true }
  | { ok: false; reason: HangulInterpretationValidationError } {
  const expected = detectHangulSpans(rawTranscript).map((span) => span.hangul);
  const supplied = interpretations.map((item) => item.hangul);

  if (new Set(supplied).size !== supplied.length) {
    return { ok: false, reason: "duplicate_span" };
  }
  if (
    expected.length !== supplied.length ||
    expected.some((span) => !supplied.includes(span)) ||
    supplied.some((span) => !expected.includes(span))
  ) {
    return { ok: false, reason: "coverage_mismatch" };
  }

  for (const item of interpretations) {
    if (item.kind === "accented_english") {
      if (
        item.englishReading === null ||
        !ENGLISH_READING_PATTERN.test(item.englishReading)
      ) {
        return { ok: false, reason: "invalid_english_reading" };
      }
    } else if (item.englishReading !== null) {
      return { ok: false, reason: "unexpected_english_reading" };
    }
  }

  return { ok: true };
}

export function buildLearnerTranscript(
  rawTranscript: string,
  interpretations: HangulInterpretation[],
): string | null {
  if (!validateHangulInterpretations(rawTranscript, interpretations).ok) {
    return null;
  }
  if (
    interpretations.some(
      (item) =>
        item.kind === "korean_vocabulary" || item.kind === "uncertain",
    )
  ) {
    return null;
  }

  return interpretations.reduce(
    (display, item) =>
      item.kind === "accented_english"
        ? display.split(item.hangul).join(item.englishReading!)
        : display,
    rawTranscript,
  );
}
```

- [ ] **Step 4: Run the pure-domain tests**

Run:

```bash
npx vitest run tests/domain/transcript-interpretation.test.ts tests/domain/hangul-romanization.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the pure boundary**

```bash
git add src/domain/audio/transcript-interpretation.ts tests/domain/transcript-interpretation.test.ts
git commit -m "feat: derive learner-safe Hangul transcripts"
```

---

### Task 2: Make original and repeat evaluators return auditable span classifications

**Files:**
- Modify: `src/domain/ai/turn-evaluation.ts`
- Modify: `src/domain/ai/original-evaluation-contract.ts`
- Modify: `src/server/ai/turn-evaluator.ts`
- Modify: `tests/domain/turn-evaluation.test.ts`
- Modify: `src/domain/ai/original-evaluation-contract.test.ts`
- Modify: `tests/server/turn-evaluator.test.ts`

**Interfaces:**
- Consumes: `hangulInterpretationSchema`, `HangulInterpretation`, and `validateHangulInterpretations` from Task 1.
- Produces: required `hangulInterpretations: HangulInterpretation[]` on both `OriginalTurnEvaluation` and `RepeatTurnEvaluation`.
- Produces two new original-contract violations:

```ts
| "hangul_interpretation_invalid"
| "hangul_interpretation_missing"
```

- [ ] **Step 1: Add failing schema and prompt-contract tests**

Add tests that assert:

```ts
expect(
  originalTurnProviderEvaluationSchema.safeParse({
    version: "ai-eval-v1",
    outcome: "correct",
    meaningUnderstood: true,
    targetPatternAttempted: true,
    correctionNeeded: false,
    correctionSeverity: "none",
    correctionReason: "none",
    improvedSentence: null,
    englishLanguage: "english",
    confidence: "high",
    reviewReason: null,
    hangulInterpretations: [
      {
        hangul: "바닐라",
        kind: "accented_english",
        englishReading: "vanilla",
      },
    ],
  }).success,
).toBe(true);

expect(
  repeatTurnEvaluationSchema.safeParse({
    version: "ai-eval-v1",
    outcome: "repeat_accepted",
    repeatCloseEnough: true,
    englishLanguage: "english",
    confidence: "high",
    reviewReason: null,
    hangulInterpretations: [
      {
        hangul: "아이스크림",
        kind: "accented_english",
        englishReading: "ice cream",
      },
    ],
  }).success,
).toBe(true);
```

In `tests/server/turn-evaluator.test.ts`, update fake parsed results to include
`hangulInterpretations: []` (starting with
`correctOriginalProviderResult`), then add original and repeat cases whose fake
results classify loanwords. Assert that:

```ts
expect(result).toMatchObject({
  ok: true,
  evaluation: {
    hangulInterpretations: [
      {
        hangul: "바닐라",
        kind: "accented_english",
        englishReading: "vanilla",
      },
    ],
  },
});
```

Also inspect the captured prompt and assert it requires:

```ts
expect(prompt.instructions.join(" ")).toContain(
  "Return exactly one hangulInterpretations item for each supplied Korean-script span",
);
expect(prompt.instructions.join(" ")).toContain(
  "englishReading must be null",
);
```

Add negative cases:

- `validateOriginalEvaluationContract` maps a missing detected span to
  `hangul_interpretation_missing`;
- an evaluator call whose `policyRepair.violations` contains
  `hangul_interpretation_missing` includes that violation in the repair prompt;
- repeat output has invalid coverage and becomes `schema_failed`;
- all-English input requires `hangulInterpretations: []`.

- [ ] **Step 2: Run the evaluator tests and confirm failures**

Run:

```bash
npx vitest run tests/domain/turn-evaluation.test.ts src/domain/ai/original-evaluation-contract.test.ts tests/server/turn-evaluator.test.ts
```

Expected: FAIL because evaluation schemas and adapters do not yet carry or
validate `hangulInterpretations`.

- [ ] **Step 3: Extend both structured-output schemas**

In `src/domain/ai/turn-evaluation.ts`, import the Task 1 schema and add the
required field to both provider schemas:

```ts
import { hangulInterpretationSchema } from "@/domain/audio/transcript-interpretation";

// Inside originalTurnProviderEvaluationSchema:
hangulInterpretations: z.array(hangulInterpretationSchema),

// Inside repeatTurnEvaluationSchema:
hangulInterpretations: z.array(hangulInterpretationSchema),
```

Do not make the field optional and do not change `AI_EVALUATION_VERSION`.
Update all deterministic evaluation fixtures in the touched tests with
`hangulInterpretations: []`.

- [ ] **Step 4: Enforce exact original-span coverage through the existing repair loop**

In `src/domain/ai/original-evaluation-contract.ts`, extend
`OriginalEvaluationViolation` with the two violations above. After the existing
language-contract checks, add:

```ts
  const interpretationValidation = validateHangulInterpretations(
    input.transcript,
    evaluation.hangulInterpretations,
  );
  if (!interpretationValidation.ok) {
    violations.push(
      interpretationValidation.reason === "coverage_mismatch"
        ? "hangul_interpretation_missing"
        : "hangul_interpretation_invalid",
    );
  }
```

Import `validateHangulInterpretations`. This keeps malformed metadata inside
the existing single repair attempt and fails to teacher review if repair also
violates the contract.

- [ ] **Step 5: Enforce repeat-span coverage before returning parsed output**

In `evaluateRepeatTurn`, after `repeatTurnEvaluationSchema.safeParse`, validate
against the actual repeat transcript:

```ts
const repeatTranscript = input.repeatTranscript ?? input.transcript ?? "";
const interpretationValidation = validateHangulInterpretations(
  repeatTranscript,
  parsed.data.hangulInterpretations,
);
if (!interpretationValidation.ok) {
  log("error", "ai.evaluation_schema_failed", {
    turnKind: "repeat",
    model,
    issues: [
      {
        path: "hangulInterpretations",
        code: interpretationValidation.reason,
      },
    ],
  });
  return { ok: false, error: "schema_failed" };
}
```

Do not add a second provider call for repeats in this task.

- [ ] **Step 6: Update the prompts with a closed classification vocabulary**

For both original and repeat prompts, add these exact rules after the existing
phonetic-reading instructions:

```ts
"Return exactly one hangulInterpretations item for each supplied Korean-script span, in the same order, and no other items.",
"Use kind accented_english only when the romanization clearly sounds like an English word or phrase the child intended. Put that English spelling in englishReading.",
"Use kind name for a specific person, place, or Korean proper name that should remain as spoken.",
"Use kind korean_vocabulary for an ordinary Korean word whose English vocabulary should be taught.",
"Use kind uncertain whenever none of the other classifications is safe.",
"englishReading must be null for name, korean_vocabulary, and uncertain.",
```

For inputs with no detected spans, add:

```ts
"No Korean-script spans were supplied. Return hangulInterpretations as an empty array."
```

Do not ask the evaluator for a full rewritten transcript.

- [ ] **Step 7: Run evaluator and contract tests**

Run:

```bash
npx vitest run tests/domain/turn-evaluation.test.ts src/domain/ai/original-evaluation-contract.test.ts tests/server/turn-evaluator.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the evaluator contract**

```bash
git add src/domain/ai/turn-evaluation.ts src/domain/ai/original-evaluation-contract.ts src/server/ai/turn-evaluator.ts tests/domain/turn-evaluation.test.ts src/domain/ai/original-evaluation-contract.test.ts tests/server/turn-evaluator.test.ts
git commit -m "feat: classify Hangul transcript spans"
```

---

### Task 3: Persist interpretations, protect the student API, and score confirmed English readings

**Files:**
- Modify: `src/server/student-access/audio-upload.ts`
- Modify: `src/app/student/missions/[assignmentStudentId]/audio/route.ts`
- Modify: `tests/server/audio-upload.test.ts`

**Interfaces:**
- Consumes: `buildLearnerTranscript(rawTranscript, interpretations)`.
- Produces on successful upload:

```ts
{
  ok: true;
  displayTranscript: string | null;
  // no raw transcript property in the student-facing service result
}
```

- Persists `hangulInterpretations` inside the original or repeat evaluation
  JSON. A repeat evaluation continues nesting the original evaluation.

- [ ] **Step 1: Add failing orchestration tests**

Add focused cases to `tests/server/audio-upload.test.ts`:

1. Original loanword:

```ts
expect(result).toMatchObject({
  ok: true,
  displayTranscript:
    "vanilla ice cream is tastier than chocolate ice cream.",
});
expect(originalTurnWrite).toMatchObject({
  original_transcript:
    "바닐라 아이스크림 is tastier than 초콜릿 아이스크림.",
  evaluation: expect.objectContaining({
    hangulInterpretations: expect.any(Array),
  }),
});
expect(scorePronunciation).toHaveBeenCalledWith(
  expect.objectContaining({
    referenceText:
      "vanilla ice cream is tastier than chocolate ice cream.",
  }),
);
```

2. Korean vocabulary:

```ts
expect(result).toMatchObject({ ok: true, displayTranscript: null });
expect(originalTurnWrite.original_transcript).toBe("I like 축구.");
expect(scorePronunciation).not.toHaveBeenCalled();
```

3. Proper name:

```ts
expect(result).toMatchObject({
  ok: true,
  displayTranscript: "I'm going to 거제도.",
});
```

4. Missing/malformed metadata and deterministic pre-evaluator guard:
`displayTranscript` is `null`; raw Hangul is still written only to the
evidence field.

5. Repeat loanword: raw `repeat_transcript` remains Hangul, repeat evaluation
stores its classifications, and the response contains the English display.

6. Existing all-English upload: display equals raw and pronunciation scoring
still starts concurrently with evaluation.

7. Original evaluation omits one detected span: the existing orchestration
makes exactly one repair call with `hangul_interpretation_missing`; a valid
repair succeeds. If the repair still has incomplete coverage, the stored
decision is `teacher_review` and `displayTranscript` is null.

Add a route source/response assertion that successful JSON includes
`displayTranscript` and does not include `transcript: result.transcript`.

- [ ] **Step 2: Run the upload tests and confirm failures**

Run:

```bash
npx vitest run tests/server/audio-upload.test.ts
```

Expected: new cases FAIL because uploads still return raw `transcript` and
original scoring starts against Hangul before interpretation is available.

- [ ] **Step 3: Carry interpretation metadata through stored decisions**

Add `hangulInterpretations` to `StoredOriginalTurnEvaluation` and
`StoredRepeatTurnEvaluation`. In `applyRepeatTurnEvaluation`, copy it:

```ts
hangulInterpretations: result.evaluation.hangulInterpretations,
```

In provider/schema failure and deterministic fast-path evaluations, use:

```ts
hangulInterpretations: [],
```

Do not invent deterministic interpretations for Hangul. An empty set against a
Hangul raw transcript fails closed in `buildLearnerTranscript`.

- [ ] **Step 4: Derive `displayTranscript` after the turn decision**

After `originalEvaluation` or `repeatEvaluation` is resolved:

```ts
const currentEvaluation = originalEvaluation ?? repeatEvaluation;
const displayTranscript = buildLearnerTranscript(
  transcript,
  currentEvaluation?.hangulInterpretations ?? [],
);
```

Return `displayTranscript` from every successful branch. Remove raw
`transcript` from `UploadAttemptAudioClipResult` and all successful result
objects. Keep the local `transcript` variable for evaluation, persistence,
moderation, and conversation history.

- [ ] **Step 5: Preserve the fast path for all-English pronunciation and delay only Hangul cases**

Replace the unconditional early `scoringPromise` with:

```ts
const score = deps.scorePronunciation ?? scorePronunciation;

function beginPronunciationScoring(referenceText: string) {
  const scoringStartedAt = Date.now();
  return score({
    file: createAudioBlob(),
    referenceText,
    durationMs: input.durationMs,
  }).finally(() => {
    timings.pronunciationTotalMs = elapsedMs(scoringStartedAt);
  });
}

let scoringPromise =
  input.clipKind === "repeat_attempt"
    ? beginPronunciationScoring(repeatTarget!)
    : koreanSpans.length === 0
      ? beginPronunciationScoring(transcript)
    : null;
```

Repeat scoring stays against the English sentence the learner was asked to
repeat and remains concurrent. After deriving `displayTranscript`, start
delayed original-answer scoring only when the safe display exists and at least
one span was confirmed as accented English:

```ts
const hasAccentedEnglish = currentEvaluation?.hangulInterpretations.some(
  (item) => item.kind === "accented_english",
);
if (
  input.clipKind === "original_answer" &&
  scoringPromise === null &&
  displayTranscript &&
  hasAccentedEnglish
) {
  scoringPromise = beginPronunciationScoring(displayTranscript);
}
```

At the await site, skip cleanly when `scoringPromise === null`. Scope
`wordsToPractice` against `displayTranscript ?? transcript`; raw Hangul must
not filter English loanword scores out of learner feedback.

This preserves existing latency for all-English traffic and adds evaluator
latency to pronunciation scoring only for Hangul cases that require semantic
classification.

- [ ] **Step 6: Expose only `displayTranscript` through the student route**

In the audio route success response, replace:

```ts
transcript: result.transcript,
```

with:

```ts
displayTranscript: result.displayTranscript,
```

Do not include raw transcript under another response key.

- [ ] **Step 7: Run upload, route, and regression tests**

Run:

```bash
npx vitest run tests/server/audio-upload.test.ts tests/server/transcription.test.ts
```

Expected: PASS, including the existing all-English concurrency regression.

- [ ] **Step 8: Commit the server boundary**

```bash
git add src/server/student-access/audio-upload.ts 'src/app/student/missions/[assignmentStudentId]/audio/route.ts' tests/server/audio-upload.test.ts
git commit -m "feat: separate student transcript display from evidence"
```

---

### Task 4: Use learner-safe text in live and resumed feedback

**Files:**
- Modify: `src/components/student/MissionFlowShell.tsx`
- Modify: `src/domain/flow/completion.ts`
- Modify: `tests/server/mission-flow.test.ts`
- Modify: `tests/server/student-mission-flow.test.ts`

**Interfaces:**
- Consumes: `displayTranscript: string | null` from Task 3.
- Consumes: `buildLearnerTranscript` when reconstructing persisted resume state.
- Produces nullable transcript values in `OriginalFeedback`,
  `RepeatFeedback`, and `PendingTurnReview`.

- [ ] **Step 1: Add failing live-feedback and resume tests**

Add tests that assert:

- upload payload `{ displayTranscript: "vanilla ice cream" }` renders
  `You said: vanilla ice cream`;
- payload `{ displayTranscript: null }` succeeds and renders no `You said`
  block, while the existing `Try this` correction remains;
- neither response path reads a `transcript` property;
- resumed original and repeat feedback use interpretation metadata from
  persisted evaluation;
- resumed Korean-vocabulary feedback has `transcript: null`;
- all-English and legacy stored evaluations still resume with the raw
  transcript.

For repeat resume, read `evaluation.hangulInterpretations` for the repeat and
`evaluation.originalEvaluation.hangulInterpretations` for the original.

- [ ] **Step 2: Run focused flow tests and confirm failures**

Run:

```bash
npx vitest run tests/server/mission-flow.test.ts tests/server/student-mission-flow.test.ts
```

Expected: FAIL because resume reconstruction and `MissionFlowShell` still use
raw non-null `transcript`.

- [ ] **Step 3: Make the client payload and feedback transcript nullable**

In `MissionFlowShell.tsx`, change `UploadVoiceClipPayload` to:

```ts
type UploadVoiceClipPayload = {
  displayTranscript: string | null;
  evaluation?: {
    outcome?: string;
    improvedSentence?: string | null;
    retryReason?: string | null;
    minimalEffortKind?: "dont_know" | "short_answer";
    retryExample?: string | null;
  };
  starBand?: PronunciationStarBand | null;
  wordsToPractice?: WordHighlight[];
  cocoLine?: string | null;
};
```

Accept `payload.displayTranscript === null` as a valid successful response.
Require only that non-null values are non-empty strings. Return and propagate
`displayTranscript`; update `OriginalFeedback` and `RepeatFeedback` transcript
members to `string | null`.

Keep `StepAiEvaluationFeedback` unchanged: it already accepts
`transcript?: string | null` and hides the transcript block when null.

- [ ] **Step 4: Derive resume display from persisted raw evidence**

In `src/domain/flow/completion.ts`, add small safe readers for original and
repeat interpretation arrays. Validate them through
`hangulInterpretationSchema.array().safeParse`; invalid/absent metadata is:

- raw transcript for all-English legacy rows;
- `null` for any raw transcript that contains Hangul.

Use:

```ts
function readInterpretations(value: unknown): HangulInterpretation[] {
  const parsed = hangulInterpretationSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function readEvaluationObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function displayFor(
  rawTranscript: string,
  evaluation: Record<string, unknown> | null,
): string | null {
  return buildLearnerTranscript(
    rawTranscript,
    readInterpretations(evaluation?.hangulInterpretations),
  );
}
```

Change both `PendingTurnReview` transcript properties and
`originalTranscript` on repeat feedback to `string | null`. Do not change
completion decisions: they continue using the persisted raw evidence fields.
For a stored repeat evaluation, use the top-level object for the repeat and
`readEvaluationObject(evaluation.originalEvaluation)` for the original.

- [ ] **Step 5: Run live/resume tests**

Run:

```bash
npx vitest run tests/server/mission-flow.test.ts tests/server/student-mission-flow.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit student live/resume rendering**

```bash
git add src/components/student/MissionFlowShell.tsx src/domain/flow/completion.ts tests/server/mission-flow.test.ts tests/server/student-mission-flow.test.ts
git commit -m "feat: render safe transcripts in student feedback"
```

---

### Task 5: Use learner-safe text in completed homework review

**Files:**
- Modify: `src/server/student-access/student-history.ts`
- Modify: `tests/server/student-history.test.ts`
- Modify: `src/components/student/HomeworkReview.test.tsx`
- Modify: `src/components/student/HomeworkReviewAttempt.tsx`
- Modify: `src/components/student/StudentMissionRecap.tsx` if its transcript contract is non-null

**Interfaces:**
- Consumes: raw transcript plus original/repeat interpretation metadata from
  `attempt_turns.evaluation`.
- Produces: `StudentRecapAttempt.transcript: string | null`.
- Produces: `StudentRecapTurn.transcript: string | null`.
- Pronunciation practice-word filtering consumes the same safe display text;
  hidden transcript attempts return no learner practice words.

- [ ] **Step 1: Add failing history mapping tests**

Extend the mocked turn rows in `tests/server/student-history.test.ts` with:

```ts
{
  id: "turn-loanword",
  original_transcript: "I like 바닐라 아이스크림.",
  repeat_transcript: null,
  evaluation: {
    version: "ai-eval-v1",
    outcome: "accepted_original",
    correctionSeverity: "none",
    hangulInterpretations: [
      {
        hangul: "바닐라",
        kind: "accented_english",
        englishReading: "vanilla",
      },
      {
        hangul: "아이스크림",
        kind: "accented_english",
        englishReading: "ice cream",
      },
    ],
  },
}
```

Assert recap text is `I like vanilla ice cream.` while the mocked selected raw
row remains unchanged. Add vocabulary, name, repeat, malformed metadata, and
legacy all-English cases. Assert hidden attempts have `transcript: null` and
no learner-facing practice words.

Add component tests proving `HomeworkReviewAttempt` and
`StudentMissionRecap` omit the text bubble/“You said” label for null transcript
but may still render authorized audio and correction feedback.

- [ ] **Step 2: Run history/component tests and confirm failures**

Run:

```bash
npx vitest run tests/server/student-history.test.ts src/components/student/HomeworkReview.test.tsx src/components/student/HomeworkReviewAttempt.test.tsx
```

Expected: FAIL because history currently maps raw transcript directly and the
attempt type requires a string.

- [ ] **Step 3: Map original and repeat displays independently**

In `student-history.ts`:

- parse repeat interpretations from the top-level repeat evaluation;
- parse original interpretations from `evaluation.originalEvaluation` when a
  repeat exists, otherwise from the top-level original evaluation;
- call `buildLearnerTranscript` for each raw transcript;
- preserve all existing ownership, status, latest-attempt, and signed-audio
  filters unchanged.

Change:

```ts
export type StudentRecapAttempt = {
  transcript: string | null;
  audio: StudentRecapAudioClip | null;
  pronunciation: StudentRecapPronunciation | null;
};

export type StudentRecapTurn = {
  id: string;
  turnOrder: number;
  cocoPrompt: string;
  transcript: string | null;
  audio: StudentRecapAudioClip | null;
  pronunciation: StudentRecapPronunciation | null;
  original: StudentRecapAttempt;
  improvedSentence: string | null;
  repeat: StudentRecapAttempt | null;
  reviewState: StudentRecapReviewState;
};
```

When building learner pronunciation words:

```ts
words:
  displayTranscript === null
    ? []
    : wordsToPractice(
        score.word_scores as WordScore[],
        displayTranscript,
      ),
```

Do not use `improved_sentence` as the learner’s claimed transcript.

- [ ] **Step 4: Make both recap components null-safe**

Render the transcript paragraph and its “You said” label only when
`attempt.transcript` is non-null. Keep audio controls independent so retained,
authorized audio remains playable even when learner text is hidden.

- [ ] **Step 5: Run student history tests**

Run:

```bash
npx vitest run tests/server/student-history.test.ts tests/server/student-history-ui.test.ts src/components/student/HomeworkReview.test.tsx src/components/student/HomeworkReviewAttempt.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit completed-review behavior**

```bash
git add src/server/student-access/student-history.ts tests/server/student-history.test.ts tests/server/student-history-ui.test.ts src/components/student/HomeworkReview.test.tsx src/components/student/HomeworkReviewAttempt.tsx src/components/student/StudentMissionRecap.tsx
git commit -m "feat: use safe transcripts in homework review"
```

Stage only files actually modified.

---

### Task 6: Show raw and interpreted forms in teacher evidence

**Files:**
- Modify: `src/server/teacher/audio-evidence.ts`
- Modify: `src/app/teacher/evidence/[attemptId]/page.tsx`
- Modify: `tests/server/audio-evidence.test.ts`
- Modify: `tests/e2e/teacher-audio-evidence.spec.ts`

**Interfaces:**
- Produces on `AttemptTurnEvidence`:

```ts
originalTranscript: string | null; // raw evidence
originalDisplayTranscript: string | null;
repeatTranscript: string | null; // raw evidence
repeatDisplayTranscript: string | null;
```

- [ ] **Step 1: Add failing teacher-evidence mapping and rendering tests**

Create mocked original and repeat evaluations with accented-English
interpretations. Assert:

```ts
expect(turn).toMatchObject({
  originalTranscript: "I like 바닐라.",
  originalDisplayTranscript: "I like vanilla.",
  repeatTranscript: "바닐라.",
  repeatDisplayTranscript: "vanilla.",
});
```

Add a Korean-vocabulary case whose raw transcript remains visible to the
teacher and whose display transcript is null. Add ownership assertions
unchanged from the existing suite.

The page test should assert labels `Raw transcript` and
`Learner-facing interpretation`, and should not duplicate the second block
when the interpreted and raw strings are identical.

- [ ] **Step 2: Run teacher evidence tests and confirm failures**

Run:

```bash
npx vitest run tests/server/audio-evidence.test.ts
npx playwright test tests/e2e/teacher-audio-evidence.spec.ts
```

Expected: FAIL because teacher evidence currently exposes only raw transcript
fields.

- [ ] **Step 3: Derive teacher interpretation without weakening evidence**

In `mapTurn`, retain the current raw assignments and add derived fields using
the same original/repeat metadata selection rules as Task 5:

```ts
originalTranscript: row.original_transcript,
originalDisplayTranscript: row.original_transcript
  ? buildLearnerTranscript(
      row.original_transcript,
      originalInterpretations,
    )
  : null,
repeatTranscript: row.repeat_transcript,
repeatDisplayTranscript: row.repeat_transcript
  ? buildLearnerTranscript(row.repeat_transcript, repeatInterpretations)
  : null,
```

For a null raw transcript, set the matching display field to null rather than
calling the helper with an empty string.

- [ ] **Step 4: Render evidence labels explicitly**

For each attempt:

- always render the raw transcript block;
- render `Learner-facing interpretation` only when non-null and different from
  raw;
- when raw contains Hangul and interpretation is null, render a short
  teacher-only note: `Learner transcript hidden because the Hangul reading was
  Korean vocabulary or could not be interpreted safely.`

Do not label the interpreted reading as “what the student said.” Keep existing
audio signed-URL behavior untouched.

- [ ] **Step 5: Run teacher evidence tests**

Run:

```bash
npx vitest run tests/server/audio-evidence.test.ts
npx playwright test tests/e2e/teacher-audio-evidence.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit teacher evidence changes**

```bash
git add src/server/teacher/audio-evidence.ts 'src/app/teacher/evidence/[attemptId]/page.tsx' tests/server/audio-evidence.test.ts tests/e2e/teacher-audio-evidence.spec.ts
git commit -m "feat: show transcript interpretations in teacher evidence"
```

---

### Task 7: Cross-surface regression verification and plan closure

**Files:**
- Modify: `TASK.md`
- Move on completion:
  `TASK.md` to
  `docs/tasks/archive/2026-07-29-learner-safe-hangul-transcripts.md`

**Interfaces:**
- No new runtime interface. This task proves that every student surface uses
  derived text while every teacher/audit path retains raw evidence.

- [ ] **Step 1: Run the narrow feature suite**

```bash
npm test -- tests/domain/transcript-interpretation.test.ts tests/domain/hangul-romanization.test.ts tests/domain/turn-evaluation.test.ts src/domain/ai/original-evaluation-contract.test.ts tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts tests/server/mission-flow.test.ts tests/server/student-mission-flow.test.ts tests/server/student-history.test.ts tests/server/student-history-ui.test.ts src/components/student/HomeworkReview.test.tsx src/components/student/HomeworkReviewAttempt.test.tsx tests/server/audio-evidence.test.ts --run
npx playwright test tests/e2e/teacher-audio-evidence.spec.ts
```

Expected: PASS. Record the exact count in `TASK.md`.

- [ ] **Step 2: Search for remaining student-facing raw transcript wiring**

Run:

```bash
rg -n "original_transcript|repeat_transcript|result\\.transcript|payload\\.transcript" src/app/student src/components/student src/server/student-access src/domain/flow
```

Expected:

- raw fields remain only in server persistence, completion decisions, and
  inputs to `buildLearnerTranscript`;
- no student API response or React component directly renders raw persisted
  Hangul;
- any exception is documented in `TASK.md` before proceeding.

- [ ] **Step 3: Run static verification**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0. Record any pre-existing warning exactly; do not
claim it was fixed.

- [ ] **Step 4: Run the broader test suite**

```bash
npm test -- --run
```

Expected: either PASS or only the already-documented unrelated failures. If a
failure touches transcript, evaluation, pronunciation, student flow, history,
or teacher evidence, treat it as in scope and fix it before closure.

- [ ] **Step 5: Perform deterministic localhost UI evidence**

With the normal local test environment, exercise or fixture these three states:

1. loanword: raw Hangul evidence, English learner transcript;
2. Korean vocabulary: raw Hangul evidence, hidden learner transcript plus
   English correction;
3. proper name: raw and learner transcript both preserve the Hangul name.

Label screenshots as `localhost`. Do not present synthetic fixtures as live
provider evidence. Do not run live OpenAI/Azure UAT without separate approval.

- [ ] **Step 6: Update and archive the task**

Record:

- implementation commits;
- exact focused-test count;
- typecheck/lint/build results;
- broader-suite result;
- whether localhost evidence used fake/fixture data;
- live-provider UAT as not run unless separately approved.

Move `TASK.md` to
`docs/tasks/archive/2026-07-29-learner-safe-hangul-transcripts.md` with
`Status: Complete`.

- [ ] **Step 7: Commit verification records**

```bash
git add docs/tasks/archive/2026-07-29-learner-safe-hangul-transcripts.md
git commit -m "docs: archive learner-safe transcript task"
```

Do not push, deploy, publish, or run production UAT.
