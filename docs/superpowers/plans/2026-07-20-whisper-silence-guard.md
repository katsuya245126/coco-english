# Whisper Silence Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent prompt echoes, known silence hallucinations, and sub-500 ms accidental taps from consuming a student's turn.

**Architecture:** A pure `detectNoSpeech` domain function owns lexical detection policy. The transcription adapter supplies its exact exported provider prompt and maps detector hits to a typed `no_speech` failure; the upload service rejects extreme-short taps before any file, database, storage, or provider work and otherwise reuses its existing retryable transcription-failure gate.

**Tech Stack:** TypeScript, Next.js server modules, Vitest, injected provider/Supabase fakes. No new packages, browser harness, jsdom, React Testing Library, database migration, or paid API call.

## Global Constraints

- Work only in `/Users/john/Desktop/my-portfolio/projects/coco-english/.worktrees/whisper-silence-guard` on branch `codex/whisper-silence-guard`.
- Preserve the dirty main checkout and the protected port-3200 worktree `.claude/worktrees/dynamic-dialogue-pagination`; do not stop or replace its server.
- Use Node.js `>=20.19.0`, matching `package.json`. If the shell still reports `20.12.0`, select a compatible local runtime before executing implementation commands.
- Do not push, merge, deploy, publish, send, or mutate production without explicit approval for that exact action and target.
- Preserve ownership checks, mission snapshots, RLS, private per-turn audio storage, and signed teacher-review playback.
- Prompt overlap is lexical: at least 70% of transcript word tokens must appear in the prompt word set, and the transcript must contain at least 5 tokens.
- Reject only durations strictly less than 500 ms. A clip at exactly 500 ms proceeds normally; longer clips are never rejected by duration alone.
- The known-hallucination blocklist uses normalized exact full-transcript matching only. Do not reject substrings or plausible utterances such as `Thank you.` or `Bye.`.
- Reuse `transcription_failed_retryable` and the existing child-ESL copy. Add no client state, API response field, schema, or migration.
- Follow strict red → green cycles. Never call the real OpenAI or pronunciation provider from tests.

---

### Task 1: Add the pure no-speech detector

**Files:**
- Create: `src/domain/audio/no-speech-detection.ts`
- Create: `tests/domain/no-speech-detection.test.ts`

**Interfaces:**
- Consumes: plain transcript and prompt strings only.
- Produces: `NoSpeechReason = "prompt_echo" | "known_hallucination"` and `detectNoSpeech(transcript: string, promptText: string): NoSpeechReason | null`.

- [ ] **Step 1: Write the failing domain test**

Create `tests/domain/no-speech-detection.test.ts` with exactly:

```typescript
import { describe, expect, it } from "vitest";
import { detectNoSpeech } from "@/domain/audio/no-speech-detection";

const TRANSCRIPTION_PROMPT =
  "The student is a Korean ESL learner speaking English. Transcribe only the English words spoken.";

describe("detectNoSpeech", () => {
  it("detects the complete prompt and a Context-prefixed prompt echo", () => {
    expect(detectNoSpeech(TRANSCRIPTION_PROMPT, TRANSCRIPTION_PROMPT)).toBe(
      "prompt_echo",
    );
    expect(
      detectNoSpeech(`Context: ${TRANSCRIPTION_PROMPT}`, TRANSCRIPTION_PROMPT),
    ).toBe("prompt_echo");
  });

  it("detects lexical prompt overlap at the approved 70 percent boundary", () => {
    const prompt = "one two three four five six seven";

    expect(
      detectNoSpeech(
        "one two three four five six seven alpha beta gamma",
        prompt,
      ),
    ).toBe("prompt_echo");
    expect(
      detectNoSpeech(
        "one two three four five six alpha beta gamma delta",
        prompt,
      ),
    ).toBeNull();
  });

  it("does not apply overlap matching below five transcript tokens", () => {
    expect(
      detectNoSpeech("one two three four", "one two three four five six"),
    ).toBeNull();
  });

  it("normalizes case, punctuation, and whitespace before matching", () => {
    expect(
      detectNoSpeech(
        "Context... THE   student says hello, Coco!",
        "The student says: hello Coco.",
      ),
    ).toBe("prompt_echo");
  });

  it.each([
    "thank you for watching",
    "Thanks for watching!",
    "subtitles by the amara org community",
    "Please subscribe.",
    "see you in the next video",
  ])("detects the exact normalized hallucination %s", (transcript) => {
    expect(detectNoSpeech(transcript, TRANSCRIPTION_PROMPT)).toBe(
      "known_hallucination",
    );
  });

  it.each([
    "Thank you.",
    "Bye.",
    "I said thank you for watching my game.",
    "Please subscribe to our class newsletter tomorrow.",
    "I like playing soccer after school.",
  ])("keeps plausible student speech %s", (transcript) => {
    expect(detectNoSpeech(transcript, TRANSCRIPTION_PROMPT)).toBeNull();
  });

  it("does not treat an empty prompt as a substring match", () => {
    expect(detectNoSpeech("I like apples.", "   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```bash
npx vitest run tests/domain/no-speech-detection.test.ts
```

Expected: FAIL because `@/domain/audio/no-speech-detection` does not exist.

- [ ] **Step 3: Implement the minimum pure detector**

Create `src/domain/audio/no-speech-detection.ts` with exactly:

```typescript
export type NoSpeechReason = "prompt_echo" | "known_hallucination";

const MIN_PROMPT_OVERLAP_WORDS = 5;
const PROMPT_OVERLAP_THRESHOLD = 0.7;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

const KNOWN_HALLUCINATIONS = new Set([
  "thank you for watching",
  "thanks for watching",
  "subtitles by the amara org community",
  "please subscribe",
  "see you in the next video",
]);

function normalizeForDetection(text: string) {
  return text
    .toLocaleLowerCase("en-US")
    .replace(NON_ALPHANUMERIC, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function detectNoSpeech(
  transcript: string,
  promptText: string,
): NoSpeechReason | null {
  const normalizedTranscript = normalizeForDetection(transcript);
  if (!normalizedTranscript) return null;

  const normalizedPrompt = normalizeForDetection(promptText);
  if (normalizedPrompt) {
    if (normalizedTranscript.includes(normalizedPrompt)) {
      return "prompt_echo";
    }

    const transcriptWords = normalizedTranscript.split(" ");
    if (transcriptWords.length >= MIN_PROMPT_OVERLAP_WORDS) {
      const promptWords = new Set(normalizedPrompt.split(" "));
      const overlappingWords = transcriptWords.filter((word) =>
        promptWords.has(word),
      ).length;
      if (overlappingWords / transcriptWords.length >= PROMPT_OVERLAP_THRESHOLD) {
        return "prompt_echo";
      }
    }
  }

  return KNOWN_HALLUCINATIONS.has(normalizedTranscript)
    ? "known_hallucination"
    : null;
}
```

- [ ] **Step 4: Run the domain test and verify GREEN**

Run:

```bash
npx vitest run tests/domain/no-speech-detection.test.ts
```

Expected: PASS with 15 tests and 0 failures (Vitest expands both `it.each` tables).

- [ ] **Step 5: Commit the pure policy**

```bash
git add src/domain/audio/no-speech-detection.ts tests/domain/no-speech-detection.test.ts
git commit -m "feat(audio): detect prompt echoes and silence hallucinations"
```

---

### Task 2: Integrate detection at the transcription boundary

**Files:**
- Modify: `src/server/audio/transcription.ts:8-18,101-117`
- Modify: `tests/server/transcription.test.ts:1-16,160`

**Interfaces:**
- Consumes: `detectNoSpeech(transcript: string, promptText: string)` from Task 1.
- Produces: exported `TRANSCRIPTION_PROMPT: string` and the new `TranscriptionError` value `"no_speech"`.

- [ ] **Step 1: Add the failing adapter test and logger seam**

At the top of `tests/server/transcription.test.ts`, change the Vitest import and add the hoisted logger mock so the first 13 lines become:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptionClient } from "@/server/audio/transcription";

const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));

vi.mock("@/server/logging/logger", () => ({
  log: mockLog,
}));

type FakeTranscriptionClient = TranscriptionClient;
```

Inside `describe("transcribeAudioFile", ...)`, add this setup before the first test:

```typescript
  beforeEach(() => {
    mockLog.mockClear();
  });
```

Then add this test before the provider-failure test:

```typescript
  it("rejects a prompt echo using the exact prompt sent to the provider", async () => {
    const { TRANSCRIPTION_PROMPT, transcribeAudioFile } = await import(
      "@/server/audio/transcription"
    );
    const client = createFakeClient({
      text: `Context: ${TRANSCRIPTION_PROMPT}`,
    });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["silence"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "no_speech" });
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: TRANSCRIPTION_PROMPT }),
    );
    expect(mockLog).toHaveBeenCalledWith("error", "audio.transcription_failed", {
      error: "no_speech",
      reason: "prompt_echo",
    });
  });
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run:

```bash
npx vitest run tests/server/transcription.test.ts
```

Expected: FAIL because `TRANSCRIPTION_PROMPT` is not exported and the prompt echo currently returns `{ ok: true }`.

- [ ] **Step 3: Add the shared prompt and typed adapter failure**

In `src/server/audio/transcription.ts`, import the detector and define the shared prompt beside the model constant:

```typescript
import OpenAI from "openai";
import { detectNoSpeech } from "@/domain/audio/no-speech-detection";
import { log } from "@/server/logging/logger";

const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
export const TRANSCRIPTION_PROMPT =
  "The student is a Korean ESL learner speaking English. Transcribe only the English words spoken.";
```

Extend the error union exactly:

```typescript
export type TranscriptionError =
  | "missing_api_key"
  | "empty_transcript"
  | "no_speech"
  | "transcription_failed";
```

Replace the literal `prompt` value in the provider request:

```typescript
      prompt: TRANSCRIPTION_PROMPT,
```

After the existing empty/non-English guard and before the success return, insert:

```typescript
    const noSpeechReason = detectNoSpeech(text, TRANSCRIPTION_PROMPT);
    if (noSpeechReason) {
      log("error", "audio.transcription_failed", {
        error: "no_speech",
        reason: noSpeechReason,
      });
      return { ok: false, error: "no_speech" };
    }
```

- [ ] **Step 4: Run domain and adapter tests and verify GREEN**

Run:

```bash
npx vitest run tests/domain/no-speech-detection.test.ts tests/server/transcription.test.ts
```

Expected: PASS with 24 tests and 0 failures.

- [ ] **Step 5: Commit the adapter integration**

```bash
git add src/server/audio/transcription.ts tests/server/transcription.test.ts
git commit -m "feat(audio): reject detected no-speech transcripts"
```

---

### Task 3: Short-circuit accidental taps and lock no-turn orchestration

**Files:**
- Modify: `src/server/student-access/audio-upload.ts:64-76,461-505`
- Modify: `tests/server/audio-upload.test.ts:54-96,738-815,900-955`

**Interfaces:**
- Consumes: `TranscriptionResult` with the `"no_speech"` error from Task 2.
- Produces: exported `MIN_TRANSCRIBABLE_AUDIO_DURATION_MS = 500`; no change to `UploadAttemptAudioClipResult`.

- [ ] **Step 1: Add the orchestration helpers and tests**

After `failedTranscriber` in `tests/server/audio-upload.test.ts`, add:

```typescript
function noSpeechTranscriber() {
  return vi.fn(async () => ({
    ok: false as const,
    error: "no_speech" as const,
  }));
}

function successfulPronunciationScorer() {
  return vi.fn(async () => ({
    ok: true as const,
    score: {
      accuracyScore: 88,
      fluencyScore: 90,
      completenessScore: 95,
      pronunciationScore: 87,
      starBand: 3 as const,
      referenceText: "I like apples.",
      wordScores: [],
    },
  }));
}
```

After the existing `marks the clip failed when transcription fails` test, add:

```typescript
  it("maps no_speech to retryable without evaluation, scoring, or a transcript write", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const transcribe = noSpeechTranscriber();
    const evaluateOriginal = successfulOriginalEvaluator();
    const scorePronunciation = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(audioInput(), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: evaluateOriginal,
      scorePronunciation,
    });

    expect(result).toEqual({
      ok: false,
      error: "transcription_failed_retryable",
      retryable: true,
    });
    expect(transcribe).toHaveBeenCalledOnce();
    expect(evaluateOriginal).not.toHaveBeenCalled();
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(
      mockSupabase.operations.some(
        (operation) =>
          operation.table === "attempt_turns" &&
          typeof operation.payload === "object" &&
          operation.payload !== null &&
          ("original_transcript" in operation.payload ||
            "repeat_transcript" in operation.payload),
      ),
    ).toBe(false);
  });
```

Before the existing invalid-audio tests, add both cutoff cases:

```typescript
  it("returns retryable for a 300 ms tap before file, database, storage, or transcription work", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const file = new Blob(["voice"], { type: "audio/webm" });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const transcribe = successfulTranscriber("I like apples.");
    const evaluateOriginal = successfulOriginalEvaluator();
    const scorePronunciation = successfulPronunciationScorer();

    const result = await uploadAttemptAudioClip(
      audioInput({ durationMs: 300, file }),
      {
        transcribeAudioFile: transcribe,
        evaluateOriginalTurn: evaluateOriginal,
        scorePronunciation,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "transcription_failed_retryable",
      retryable: true,
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.upload).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(evaluateOriginal).not.toHaveBeenCalled();
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      "info",
      "audio.upload_timing",
      expect.objectContaining({
        status: "failed",
        audioClipId: null,
        durationMs: 300,
        error: "transcription_failed_retryable",
        step: "duration_precheck",
        reason: "short_clip",
      }),
    );
  });

  it("allows a clip at the exact 500 ms boundary", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const transcribe = successfulTranscriber("I like apples.");

    const result = await uploadAttemptAudioClip(audioInput({ durationMs: 500 }), {
      transcribeAudioFile: transcribe,
      evaluateOriginalTurn: successfulOriginalEvaluator(),
      scorePronunciation: successfulPronunciationScorer(),
    });

    expect(result).toMatchObject({ ok: true, transcript: "I like apples." });
    expect(transcribe).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 2: Run the upload tests and verify RED**

Run:

```bash
npx vitest run tests/server/audio-upload.test.ts
```

Expected: the 300 ms test FAILS because the current service reads the file, queries Supabase, uploads, transcribes, and returns success. The `no_speech` mapping and 500 ms boundary tests are characterization checks and may already pass through the generic failure/current duration paths.

- [ ] **Step 3: Add the short-duration policy and early return**

Beside the existing audio limits in `src/server/student-access/audio-upload.ts`, add:

```typescript
export const MIN_TRANSCRIBABLE_AUDIO_DURATION_MS = 500;
```

Inside `uploadAttemptAudioClip`, after the `timeStage` helper closes and before the outer `try`, insert:

```typescript
  if (input.durationMs < MIN_TRANSCRIBABLE_AUDIO_DURATION_MS) {
    logTiming("failed", {
      error: "transcription_failed_retryable",
      step: "duration_precheck",
      reason: "short_clip",
    });
    return {
      ok: false,
      error: "transcription_failed_retryable",
      retryable: true,
    };
  }
```

Do not move or weaken `isValidInput`; malformed, oversized, overlong, or unsupported audio must retain `invalid_audio`. Do not add a client error or persist a short-tap clip.

- [ ] **Step 4: Run all focused silence-guard tests and verify GREEN**

Run:

```bash
npx vitest run tests/domain/no-speech-detection.test.ts tests/server/transcription.test.ts tests/server/audio-upload.test.ts
```

Expected: PASS with all three files green and 0 failures.

- [ ] **Step 5: Commit the upload guard**

```bash
git add src/server/student-access/audio-upload.ts tests/server/audio-upload.test.ts
git commit -m "feat(audio): retry extreme-short recording taps"
```

---

### Task 4: Run the project gate and close the task record

**Files:**
- Modify: `TASK.md`
- Create at completion: `docs/tasks/archive/2026-07-20-whisper-silence-guard.md`
- Delete at completion: `TASK.md`

**Interfaces:**
- Consumes: the completed Tasks 1-3 and their commits.
- Produces: fresh verification evidence and an archived factual task record. No runtime interface changes.

- [ ] **Step 1: Run the focused regression gate**

Run:

```bash
npx vitest run tests/domain/no-speech-detection.test.ts tests/server/transcription.test.ts tests/server/audio-upload.test.ts
```

Expected: all focused tests pass with 0 failures. Record the exact file/test counts in `TASK.md`.

- [ ] **Step 2: Run the full unit suite**

Run:

```bash
npx vitest run
```

Expected: exit 0 with 0 failed test files. The existing UAT runtime tests require permission to bind temporary localhost ports; if a sandboxed run reports `listen EPERM`, rerun the same command with the required localhost permission and report both results accurately.

- [ ] **Step 3: Run typecheck and lint**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both commands exit 0. Report any warnings verbatim; do not call a warning-free run “clean” if warnings remain.

- [ ] **Step 4: Verify scope and protected state**

Run:

```bash
git diff 52dc4696 --check
git diff 52dc4696 --name-only
git status --short --branch
git worktree list --porcelain
git -C /Users/john/Desktop/my-portfolio/projects/coco-english status --short --branch
```

Expected:

- no whitespace errors;
- only the detector, transcription adapter, upload service, their three test files, and task documentation differ from `52dc4696`;
- the feature worktree is on `codex/whisper-silence-guard`;
- the protected dynamic-dialogue worktree remains at its original path and branch;
- main retains the user's pre-existing dirty files without additions from this feature.

- [ ] **Step 5: Archive the completed task record**

Update every `TASK.md` done check with the exact commit IDs and verification counts. Change its status to `Complete`, change `Current position` to state that implementation and automated verification are complete and external integration still requires approval, then move the complete contents to:

```text
docs/tasks/archive/2026-07-20-whisper-silence-guard.md
```

Remove root `TASK.md`; do not modify another archived task.

- [ ] **Step 6: Commit verification evidence**

```bash
git add TASK.md docs/tasks/archive/2026-07-20-whisper-silence-guard.md
git commit -m "docs: record silence guard verification"
```

- [ ] **Step 7: Use the branch-finishing gate**

Invoke `superpowers:requesting-code-review`, address any verified findings test-first, rerun the affected checks, then invoke `superpowers:finishing-a-development-branch`. Do not merge, push, deploy, publish, or remove either worktree without the user's explicit approval for the exact action.
