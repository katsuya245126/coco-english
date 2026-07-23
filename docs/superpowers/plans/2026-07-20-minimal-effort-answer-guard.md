# Minimal-Effort Answer Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "yes" / "no" / "I don't know"-class answers no longer consume a mission turn; the student is prompted in child-ESL register to try a full sentence and re-records the same turn (phone-UAT followup item 6).

**Architecture:** A deterministic normalized-blocklist detector (pure domain function, same style as `src/domain/audio/no-speech-detection.ts`) runs server-side in `uploadAttemptAudioClip` after transcript validation and **before** pronunciation scoring, the paid evaluator, and conversation-turn generation. On a hit it writes an auditable `retry_original` evaluation (new `retryReason: "minimal_effort"` + `minimalEffortBlocks` counter in the existing evaluation JSON column — no migration) and returns early. After 2 blocks on the same turn, the answer passes through to normal evaluation (D-04: never trap a struggling student). The client renders a new full-sentence retry variant; Coco's spoken line resolves server-side in the TTS route.

**Tech Stack:** TypeScript, Next.js App Router, Vitest (fake Supabase + fake evaluator/transcriber deps only — never the paid providers).

## Global Constraints

- User-approved design (2026-07-20): deterministic word list; copy = card "Good start! Can you say it in a full sentence?", spoken/bubble line "Try a full sentence!"; 2 blocks then evaluate normally; server log only for teacher visibility (no schema/UI changes).
- Preserve the preset/conversation split (AGENTS.md): the guard is shared pre-evaluation logic; it must not change any other preset or conversation behavior.
- Turn/attempt state transitions stay server-owned and auditable (evaluation JSON persisted per blocked try; audio clip rows still stored).
- No new DB columns or migrations. No push/merge/deploy without approval.
- Exact target-example matches are never blocked (a teacher-authored target like "Yes, I do." must keep working via the existing fast path).
- Tests: `npx vitest run <file>` for focused runs; full gate `npm test -- --run`, `npm run typecheck`, `npm run lint`.

---

### Task 1: Domain detector `isMinimalEffortAnswer`

**Files:**
- Create: `src/domain/ai/minimal-effort-detection.ts`
- Test: `tests/domain/minimal-effort-detection.test.ts`

**Interfaces:**
- Produces: `isMinimalEffortAnswer(transcript: string): boolean`, `MAX_MINIMAL_EFFORT_BLOCKS = 2` (both consumed by Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/minimal-effort-detection.test.ts
import { describe, expect, it } from "vitest";
import {
  isMinimalEffortAnswer,
  MAX_MINIMAL_EFFORT_BLOCKS,
} from "@/domain/ai/minimal-effort-detection";

describe("isMinimalEffortAnswer", () => {
  it.each([
    "yes",
    "Yes.",
    "YES!",
    "no",
    "No.",
    "yeah",
    "Yep",
    "yup",
    "nope",
    "nah",
    "ok",
    "Okay.",
    "maybe",
    "Maybe...",
    "I don't know",
    "I don't know.",
    "I dont know",
    "i dunno",
    "dunno",
    "idk",
    "I don’t know.", // curly apostrophe from mobile keyboards
  ])("flags %j as minimal effort", (transcript) => {
    expect(isMinimalEffortAnswer(transcript)).toBe(true);
  });

  it.each([
    "Yes, I like pizza.",
    "No, I don't play soccer.",
    "I don't know how to swim.",
    "I like playing soccer after school.",
    "with my friend", // real accepted UAT answer — must not be flagged
    "I'm fine.",
    "Okay, let's go to the park.",
    "",
    "   ",
  ])("does not flag %j", (transcript) => {
    expect(isMinimalEffortAnswer(transcript)).toBe(false);
  });

  it("caps blocks at 2 per turn", () => {
    expect(MAX_MINIMAL_EFFORT_BLOCKS).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/minimal-effort-detection.test.ts`
Expected: FAIL — cannot resolve `@/domain/ai/minimal-effort-detection`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/ai/minimal-effort-detection.ts
/**
 * Deterministic minimal-effort answer detector (phone-UAT item 6).
 *
 * Pure module — exact normalized match against a small blocklist only, so a
 * legitimate short answer ("with my friend", "I'm fine.") can never be
 * flagged. Word-count or LLM-judged effort was explicitly rejected
 * (design approval 2026-07-20).
 */

/** After this many blocks on one turn, the answer evaluates normally (D-04). */
export const MAX_MINIMAL_EFFORT_BLOCKS = 2;

const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

const MINIMAL_EFFORT_ANSWERS = new Set([
  "yes",
  "no",
  "yeah",
  "yep",
  "yup",
  "nope",
  "nah",
  "ok",
  "okay",
  "maybe",
  "i dont know",
  "dont know",
  "i dunno",
  "dunno",
  "idk",
]);

function normalizeForDetection(text: string) {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[’‘']/gu, "") // "don't" -> "dont", keeping it one token
    .replace(NON_ALPHANUMERIC, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isMinimalEffortAnswer(transcript: string): boolean {
  const normalized = normalizeForDetection(transcript);
  if (!normalized) return false;
  return MINIMAL_EFFORT_ANSWERS.has(normalized);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/minimal-effort-detection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/ai/minimal-effort-detection.ts tests/domain/minimal-effort-detection.test.ts
git commit -m "feat(domain): deterministic minimal-effort answer detector"
```

---

### Task 2: Server guard in `uploadAttemptAudioClip`

**Files:**
- Modify: `src/domain/ai/turn-evaluation.ts` (`retry_original` reason union, ~line 71)
- Modify: `src/server/student-access/audio-upload.ts`
- Test: `tests/server/audio-upload.test.ts`

**Interfaces:**
- Consumes: `isMinimalEffortAnswer`, `MAX_MINIMAL_EFFORT_BLOCKS` (Task 1); existing `isExactTargetMatch` from `@/domain/ai/fast-path` (already imported in audio-upload.ts).
- Produces: stored evaluation JSON gains optional `retryReason?: "minimal_effort"` and `minimalEffortBlocks?: number`; the audio API route already passes `result.evaluation` through untouched (`src/app/student/missions/[assignmentStudentId]/audio/route.ts:84`), so Tasks 3–4 read `evaluation.retryReason` with no route change. New structured log event `audio.minimal_effort_blocked`.

- [ ] **Step 1: Extend the `retry_original` reason union**

In `src/domain/ai/turn-evaluation.ts`, `OriginalTurnDecision` (~line 71):

```ts
  | {
      kind: "retry_original";
      reason: "non_english" | "parroted_correction" | "minimal_effort";
      requireRepeat: false;
    }
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/server/audio-upload.test.ts`. Two harness changes first:

1. In `createMockSupabase` options add `turnEvaluation?: unknown`, and change the `single()` branch for `attempt_turns` to return it:

```ts
        if (table === "attempt_turns") {
          return {
            data: { id: "turn-1", evaluation: options.turnEvaluation ?? null },
            error: null,
          };
        }
```

(If the current branch returns more fields, e.g. `original_transcript` / `improved_sentence`, keep them and add `evaluation`.)

2. New describe block (place near the existing no-speech / retry tests):

```ts
describe("minimal-effort answer guard", () => {
  it("blocks a minimal-effort answer without calling the evaluator or scorer", async () => {
    mockSupabase = createMockSupabase();
    const evaluate = successfulOriginalEvaluator();
    const score = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: evaluate,
      scorePronunciation: score,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(evaluate).not.toHaveBeenCalled();
    expect(score).not.toHaveBeenCalled();
    expect(result.evaluation).toMatchObject({
      outcome: "retry_original",
      retryReason: "minimal_effort",
      minimalEffortBlocks: 1,
      requireRepeat: false,
    });
    expect(result.starBand).toBeNull();

    const turnUpsert = mockSupabase.operations.find(
      (operation) =>
        operation.table === "attempt_turns" &&
        operation.action === "upsert" &&
        typeof operation.payload === "object" &&
        operation.payload !== null &&
        "original_transcript" in operation.payload,
    );
    expect(turnUpsert?.payload).toMatchObject({
      original_transcript: "Yes.",
      improved_sentence: null,
    });
  });

  it("increments the block counter from the stored evaluation", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        retryReason: "minimal_effort",
        minimalEffortBlocks: 1,
      },
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("I don't know."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.evaluation).toMatchObject({
      retryReason: "minimal_effort",
      minimalEffortBlocks: 2,
    });
  });

  it("evaluates normally after 2 prior blocks (never traps the student)", async () => {
    mockSupabase = createMockSupabase({
      turnEvaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        retryReason: "minimal_effort",
        minimalEffortBlocks: 2,
      },
    });
    const evaluate = successfulOriginalEvaluator({
      outcome: "needs_correction",
      correctionNeeded: true,
      improvedSentence: "Yes, I like pizza.",
    });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: evaluate,
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result.evaluation).toMatchObject({ outcome: "needs_correction" });
  });

  it("never blocks an exact target-example match", async () => {
    const snapshot = {
      ...missionSnapshotFixture,
      turns: [
        {
          ...missionSnapshotFixture.turns[0],
          targetExample: "Yes.",
        },
        missionSnapshotFixture.turns[1],
      ],
    };
    mockSupabase = createMockSupabase({ missionSnapshot: snapshot });

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("Yes."),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.evaluation).toMatchObject({ outcome: "accepted_original" });
  });

  it("does not run the guard for repeat attempts", async () => {
    mockSupabase = createMockSupabase();

    const result = await uploadAttemptAudioClip(
      audioInput({ clipKind: "repeat_attempt" }),
      {
        transcribeAudioFile: successfulTranscriber("Yes."),
        evaluateRepeatTurn: successfulRepeatEvaluator(),
        scorePronunciation: successfulPronunciationScorer(),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.evaluation).toMatchObject({ outcome: "accepted_repeat" });
  });

  it("skips conversation-turn generation on a blocked answer", async () => {
    mockSupabase = createMockSupabase({
      missionSnapshot: conversationSnapshotFixture, // reuse the existing conversation-mode fixture in this file; if it has another name, use that
    });
    const generateCocoReply = vi.fn();

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: successfulTranscriber("no"),
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
      generateCocoReply,
    });

    expect(result.ok).toBe(true);
    expect(generateCocoReply).not.toHaveBeenCalled();
  });
});
```

Note for the implementer: this file already has conversation-mode tests — reuse whatever conversation-mode snapshot fixture/helper they use rather than inventing a new one. Repeat-attempt uploads may need `turnEvaluation`/`improved_sentence` handling consistent with existing repeat tests — mirror them.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/server/audio-upload.test.ts`
Expected: new tests FAIL (evaluator called, no `retryReason` in evaluation); all pre-existing tests still pass.

- [ ] **Step 4: Implement the guard**

In `src/server/student-access/audio-upload.ts`:

1. Import the detector:

```ts
import {
  isMinimalEffortAnswer,
  MAX_MINIMAL_EFFORT_BLOCKS,
} from "@/domain/ai/minimal-effort-detection";
```

2. Extend `StoredOriginalTurnEvaluation` (~line 135) with:

```ts
  retryReason?: "minimal_effort";
  minimalEffortBlocks?: number;
```

3. Extend the `turnInit` upsert select (~line 657) from `"id, original_transcript, improved_sentence"` to `"id, original_transcript, improved_sentence, evaluation"`.

4. Add a helper near `toJson`:

```ts
function priorMinimalEffortBlocks(evaluation: unknown): number {
  if (
    typeof evaluation !== "object" ||
    evaluation === null ||
    Array.isArray(evaluation)
  ) {
    return 0;
  }
  const stored = evaluation as {
    retryReason?: unknown;
    minimalEffortBlocks?: unknown;
  };
  if (stored.retryReason !== "minimal_effort") return 0;
  return typeof stored.minimalEffortBlocks === "number" &&
    Number.isFinite(stored.minimalEffortBlocks)
    ? Math.max(0, Math.floor(stored.minimalEffortBlocks))
    : 0;
}
```

5. Insert the guard **after** the transcript-validation block (the `if (!transcript || !hasEnglishTranscript(transcript))` early return, ~line 808) and **before** the `scorePronunciation` promise is created (~line 818). Placement matters: the guard must not start scoring, evaluation, or conversation generation.

```ts
    // Minimal-effort answer guard (phone-UAT item 6, design approved
    // 2026-07-20). Deterministic blocklist only; an exact target-example
    // match ("Yes, I do." as an authored target) always wins; after
    // MAX_MINIMAL_EFFORT_BLOCKS blocks the answer evaluates normally so a
    // stuck student is never trapped (D-04). Runs before pronunciation
    // scoring / evaluation / conversation generation — a blocked try incurs
    // no paid provider call and never consumes the turn.
    if (input.clipKind === "original_answer" && isMinimalEffortAnswer(transcript)) {
      const exactTargetMatch =
        targetExample !== null && isExactTargetMatch(transcript, targetExample);
      const blocks = priorMinimalEffortBlocks(
        (turn as { evaluation?: unknown }).evaluation,
      );
      if (!exactTargetMatch && blocks < MAX_MINIMAL_EFFORT_BLOCKS) {
        const evaluation: StoredOriginalTurnEvaluation = {
          version: AI_EVALUATION_VERSION,
          outcome: "retry_original",
          confidence: "high",
          reviewReason: null,
          meaningUnderstood: false,
          targetPatternAttempted: false,
          englishLanguage: "english",
          correctionNeeded: false,
          improvedSentence: null,
          requireRepeat: false,
          retryReason: "minimal_effort",
          minimalEffortBlocks: blocks + 1,
        };

        const write = await timeStage("turnWrite", () =>
          supabase.from("attempt_turns").upsert(
            {
              attempt_id: input.attemptId,
              turn_order: input.turnOrder,
              original_transcript: transcript,
              target_attempted: false,
              improved_sentence: null,
              evaluation: toJson(evaluation),
            },
            { onConflict: "attempt_id,turn_order" },
          ),
        );
        if (write.error) {
          logTiming("failed", { error: "db_error", step: "turn_write" });
          return { ok: false, error: "db_error", retryable: true };
        }

        const { error: clipUpdateError } = await timeStage(
          "finalClipUpdate",
          () =>
            supabase
              .from("audio_clips")
              .update({
                object_key: objectKey,
                mime_type: input.mimeType,
                duration_ms: input.durationMs,
                byte_size: input.byteSize,
                processing_status: "transcribed",
              })
              .eq("id", audioClip.id),
        );
        if (clipUpdateError) {
          logTiming("failed", { error: "db_error", step: "final_clip_update" });
          return { ok: false, error: "db_error", retryable: true };
        }

        log("info", "audio.minimal_effort_blocked", {
          audioClipId: audioClip.id,
          assignmentStudentId: input.assignmentStudentId,
          attemptId: input.attemptId,
          turnOrder: input.turnOrder,
          blocks: blocks + 1,
        });
        logTiming("success", { step: "minimal_effort_guard" });
        return {
          ok: true,
          audioClipId: audioClip.id,
          processingStatus: "transcribed",
          transcript,
          evaluation,
          starBand: null,
          wordsToPractice: [],
          cocoLine: null,
          cocoLineModerationEvent: null,
        };
      }
    }
```

Note: `targetExample`, `turn`, `objectKey`, `audioClip` are all in scope at that point; the transcript is only persisted after the storage upload + transcription `Promise.all` resolves, so the audit clip row is real. Do not log the transcript content itself (existing log calls never include transcripts).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/server/audio-upload.test.ts tests/domain/turn-evaluation.test.ts`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 6: Commit**

```bash
git add src/domain/ai/turn-evaluation.ts src/server/student-access/audio-upload.ts tests/server/audio-upload.test.ts
git commit -m "feat(server): block minimal-effort answers before evaluation without consuming the turn"
```

---

### Task 3: Student-facing retry variant (card + bubble + resume)

**Files:**
- Modify: `src/components/student/StepAiEvaluationFeedback.tsx` (outcome union ~line 18, new branch after `retryOriginal` ~line 145)
- Modify: `src/components/student/MissionFlowShell.tsx` (`OriginalFeedback` union ~line 67, `UploadVoiceClipPayload` ~line 328, `feedbackFromEvaluation` ~line 413, mascot line mapping ~line 1112, resume mapping from `getPendingTurnReview`)
- Modify: `src/domain/flow/completion.ts` (`PendingTurnReview` outcome union ~line 21, original outcome mapping ~line 114)
- Test: `tests/server/mission-flow.test.ts` (resume), `tests/domain/tts-ui-source.test.ts` only if it pins feedback copy (check first)

**Interfaces:**
- Consumes: `evaluation.retryReason === "minimal_effort"` from the upload payload (Task 2) and from `attempt_turns.evaluation` on resume.
- Produces: feedback kind `"retryFullSentence"` (client), `feedbackVariant: "retry_full_sentence"` (TTS descriptor — resolved server-side in Task 4). Card copy exactly: heading `Good start!`, line `Can you say it in a full sentence?`.

- [ ] **Step 1: Write the failing resume test**

In `tests/server/mission-flow.test.ts`, find the existing `getPendingTurnReview` cases and add:

```ts
  it("resumes a minimal-effort block as retryFullSentence", () => {
    const review = getPendingTurnReview({
      turn_order: 1,
      original_transcript: "Yes.",
      improved_sentence: null,
      repeat_transcript: null,
      repeat_accepted: null,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        retryReason: "minimal_effort",
        minimalEffortBlocks: 1,
        requireRepeat: false,
      },
      coco_line: null,
    });

    expect(review).toMatchObject({
      step: "aiFeedback",
      outcome: "retryFullSentence",
      transcript: "Yes.",
    });
  });

  it("resumes a plain retry_original as retryOriginal (unchanged)", () => {
    const review = getPendingTurnReview({
      turn_order: 1,
      original_transcript: "안녕하세요",
      improved_sentence: null,
      repeat_transcript: null,
      repeat_accepted: null,
      evaluation: {
        version: "ai-eval-v1",
        outcome: "retry_original",
        requireRepeat: false,
      },
      coco_line: null,
    });

    expect(review).toMatchObject({ outcome: "retryOriginal" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/mission-flow.test.ts`
Expected: FAIL — outcome is `"retryOriginal"`, and the `PendingTurnReview` type has no `"retryFullSentence"`.

- [ ] **Step 3: Implement completion resume mapping**

In `src/domain/flow/completion.ts`:

1. `PendingTurnReview` aiFeedback outcome union → `"acceptedOriginal" | "needsCorrection" | "retryOriginal" | "retryFullSentence"`.
2. Add next to `evaluationOutcome`:

```ts
function evaluationRetryReason(turn: CompletionTurn): string | null {
  if (
    typeof turn.evaluation !== "object" ||
    turn.evaluation === null ||
    Array.isArray(turn.evaluation)
  ) {
    return null;
  }
  const evaluation = turn.evaluation as { retryReason?: unknown };
  return typeof evaluation.retryReason === "string"
    ? evaluation.retryReason
    : null;
}
```

3. In the original outcome mapping (~line 114), replace the `retry_original` arm:

```ts
        : outcome === "retry_original"
          ? evaluationRetryReason(turn) === "minimal_effort"
            ? "retryFullSentence"
            : "retryOriginal"
          : null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/mission-flow.test.ts`
Expected: PASS. Fix any TypeScript fallout in consumers of `PendingTurnReview` (`src/app/student/missions/[assignmentStudentId]/page.tsx`, `MissionFlowShell.tsx`) as part of Step 5 before committing.

- [ ] **Step 5: Implement the client variant**

`src/components/student/StepAiEvaluationFeedback.tsx`:

1. Outcome union: add `"retryFullSentence"` to `OriginalOutcome`.
2. New branch directly after the `retryOriginal` branch (~line 157):

```tsx
  if (outcome === "retryFullSentence") {
    return (
      <div style={stepCardStyle} aria-live="polite" role="alert">
        <Transcript transcript={transcript} audioUrl={audioUrl} />
        {showCocoLine ? (
          <div style={{ ...evaluationErrorStyle, marginTop: transcript ? 16 : 0 }}>
            <h2 style={headingInlineStyle}>Good start!</h2>
            <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
              Can you say it in a full sentence?
            </p>
          </div>
        ) : null}
        <RecordingReview onRetry={onRetry} />
      </div>
    );
  }
```

`src/components/student/MissionFlowShell.tsx`:

1. `OriginalFeedback` union: duplicate the `retryOriginal` member as:

```ts
  | {
      kind: "retryFullSentence";
      transcript: string;
      starBand?: PronunciationStarBand | null;
      wordsToPractice?: WordHighlight[];
    }
```

2. `UploadVoiceClipPayload.evaluation` (~line 330): add `retryReason?: string | null;`.
3. `feedbackFromEvaluation` (~line 429): before the generic retry branch:

```ts
    if (
      evaluation?.outcome === "retry_original" &&
      evaluation.retryReason === "minimal_effort"
    ) {
      return { kind: "retryFullSentence", transcript, starBand, wordsToPractice };
    }
```

4. Mascot line mapping (~line 1112): add alongside the `retryOriginal` case:

```ts
  if (
    flow.step === "aiFeedback" &&
    flow.originalFeedback?.kind === "retryFullSentence"
  ) {
    return {
      line: { lineKind: "coco_feedback", feedbackVariant: "retry_full_sentence" },
      // copy the sibling retryOriginal entry's other fields exactly
    };
  }
```

(Match the exact shape of the neighbouring `retryOriginal` mapping — copy it and change only the kind check and `feedbackVariant`.)

5. Everywhere the file switches on feedback kinds (`retryOriginal` render/step handling, e.g. the `StepAiEvaluationFeedback` call sites and any `kind === "retryOriginal"` conditions around lines 940–960 and 1100–1160): make `"retryFullSentence"` follow the same paths, passing `outcome="retryFullSentence"` to `StepAiEvaluationFeedback`. Also map the resume outcome `"retryFullSentence"` from `getPendingTurnReview` into the same flow state the `retryOriginal` resume path uses (grep for `retryOriginal` in this file — every occurrence needs a deliberate keep-or-extend decision; the retry action itself, `retryOriginal()` at ~line 702, is shared and needs no duplicate).

- [ ] **Step 6: Verify with typecheck + focused tests**

Run: `npm run typecheck && npx vitest run tests/server/mission-flow.test.ts tests/server/student-mission-page.test.ts`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/domain/flow/completion.ts src/components/student/StepAiEvaluationFeedback.tsx src/components/student/MissionFlowShell.tsx tests/server/mission-flow.test.ts
git commit -m "feat(student): full-sentence retry card for minimal-effort answers"
```

---

### Task 4: Spoken line (TTS route)

Teacher visibility stays server-log-only per the approved design — do **not**
touch `src/server/teacher/audio-evidence.ts`; its existing "Try again" meaning
label already covers `retry_original` regardless of retry reason.

**Files:**
- Modify: `src/app/student/missions/[assignmentStudentId]/tts/route.ts` (`resolveFeedbackLineText`, ~line 70)
- Test: `tests/server/student-tts-route.test.ts` if it exists (check with `ls tests/server | grep tts`); otherwise the source-string test below in `tests/domain/tts-ui-source.test.ts`

**Interfaces:**
- Consumes: `feedbackVariant: "retry_full_sentence"` descriptor (Task 3). The `ttsRequestSchema` accepts any ≤64-char string variant (`src/domain/audio/tts.ts:113`) — no schema change.
- Produces: spoken line exactly `Try a full sentence!`.

- [ ] **Step 1: Write the failing test**

If a TTS route test exists, add a case asserting the variant maps to the line. Otherwise pin the copy at source-string level in `tests/domain/tts-ui-source.test.ts` (follow that file's existing pattern of reading source text):

```ts
  it("speaks the full-sentence retry line for retry_full_sentence", () => {
    const source = readFileSync(
      "src/app/student/missions/[assignmentStudentId]/tts/route.ts",
      "utf8",
    );
    expect(source).toContain('case "retry_full_sentence":');
    expect(source).toContain('"Try a full sentence!"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/tts-ui-source.test.ts`
Expected: new case FAILS.

- [ ] **Step 3: Implement**

`tts/route.ts`, in `resolveFeedbackLineText`:

```ts
    case "retry_full_sentence":
      return "Try a full sentence!";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/tts-ui-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/student/missions/[assignmentStudentId]/tts/route.ts" tests/domain/tts-ui-source.test.ts
git commit -m "feat(voice): speak the full-sentence retry line"
```

---

### Task 5: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Focused suites**

Run: `npx vitest run tests/domain/minimal-effort-detection.test.ts tests/server/audio-upload.test.ts tests/server/mission-flow.test.ts tests/domain/tts-ui-source.test.ts tests/domain/turn-evaluation.test.ts`
Expected: PASS.

- [ ] **Step 2: Full suite**

Run: `npm test -- --run`
Expected: all pass (baseline 2026-07-20: 801 passed; new total higher).

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: typecheck clean; lint 0 errors (1 pre-existing warning at `scripts/check-student-feedback-states.mjs:435` is known).

- [ ] **Step 4: Update TASK.md done checks and request code review**

Mark implementation done checks in `TASK.md`; use superpowers:requesting-code-review before archiving.
