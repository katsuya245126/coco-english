# Repeat Hangul Accented English Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the prompt and service contract needed for repeat attempts where English words transcribed in Hangul, such as `바닐라 아이스크림`, can be judged as accented English instead of being routed as `non_english`.

**Architecture:** Keep transcription evidence unchanged: stored transcripts continue preserving provider text verbatim, including Hangul. Extend the repeat-evaluation boundary to receive normalized, deduplicated Hangul spans recomputed from the transcript and add repeat-specific phonetic guidance matching the original-answer evaluator's existing approach. The implementation claim is "prompt contract implemented"; live behavior against OpenAI requires a separately approved UAT step.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, OpenAI structured-output adapter, Supabase service-layer tests.

## Global Constraints

- Preserve student audio/transcript evidence: do not rewrite stored Hangul to English.
- Preserve the original-answer Korean span behavior and code-switch judgment.
- Preserve genuine Korean protection: prompts must still allow `non_english` when Hangul does not phonetically match the expected English repeat.
- Scope changes to repeat attempt evaluation and tests.
- No external OpenAI, Supabase, deployment, push, or production mutation during implementation unless separately approved for the exact target.
- Use narrow tests first: `npm test -- tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts --run`, then `npm run typecheck`, then `npm run lint`.
- Full build is optional for this bounded server-side change unless executor broadens scope.

---

## File Structure

- Create or update local `TASK.md`: active consequential-work brief and implementation approval checkpoint. `TASK.md` is ignored by git and must not be staged or committed.
- Plan artifact `docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md`: intended to be committed with the implementation branch if implementation proceeds; do not commit it during planning-only revision.
- Modify `src/server/ai/turn-evaluator.ts`: add optional `koreanSpans` to `EvaluateRepeatTurnInput`, include spans in the repeat prompt, and add repeat-specific phonetic and genuine-Korean instructions.
- Modify `src/server/student-access/audio-upload.ts`: pass normalized transcript `koreanSpans` into `evaluateRepeatTurn` for `repeat_attempt` clips.
- Modify `tests/server/turn-evaluator.test.ts`: assert repeat prompts include deduplicated Hangul spans, phonetic accented-English instructions, and genuine-Korean protection.
- Modify `tests/server/audio-upload.test.ts`: assert repeat uploads forward normalized transcript spans, and exact English repeats still bypass evaluation.

---

### Task 0: Consequential Work Preflight

**Files:**
- Create/Modify local-only: `TASK.md`

**Interfaces:**
- Consumes: repository workflow rules in `AGENTS.md`, current branch, current `HEAD`.
- Produces: local active task brief containing `BASE_SHA`, scope, plan link, and an explicit approval checkpoint before implementation. This file is coordination state only and is not part of tracked implementation diffs.

- [x] **Step 1: Inspect branch, status, and base SHA**

Run:

```bash
git status --short --branch
git rev-parse HEAD
```

Expected: branch and dirty state are visible. Record the SHA as `BASE_SHA` in local `TASK.md`. Preserve unrelated untracked files; do not stage or delete them.

- [x] **Step 2: Create active task brief**

If no `TASK.md` exists, create it with this content. If an unrelated `TASK.md` exists, stop and resolve the active-task conflict before continuing.

```md
# Repeat Hangul Accented English Evaluation

Status: Planned - awaiting implementation approval
Branch: main
Base SHA: <paste `git rev-parse HEAD` output here>
Plan: docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md

## Goal

Implement the repeat-evaluation prompt and service contract needed so Hangul-script accented English in a repeat attempt can be judged against the English improved sentence, while genuine Korean repeats remain protected by the `non_english` path.

## Scope

- Add `koreanSpans` to repeat evaluator input.
- Pass normalized transcript spans from repeat audio upload to repeat evaluation.
- Add prompt-contract and service-wiring tests.
- Preserve transcript storage and original-answer evaluation behavior.

## Non-Goals

- No transcript rewriting or romanized text storage.
- No production data changes.
- No deployment.
- No live OpenAI UAT without separate approval.

## Done Checks

- `npm test -- tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts tests/server/transcription.test.ts tests/domain/hangul-romanization.test.ts --run`
- `npm run typecheck`
- `npm run lint`
- Final diff is reviewed against `Base SHA`.

## Approval

Implementation requires explicit user approval after this brief and plan are reviewed.
```

- [x] **Step 3: Obtain implementation approval**

Before Task 1, ask the user:

```text
Approve implementation of docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md on branch main from BASE_SHA <sha>?
```

Expected: Do not edit app or test code until the user approves this exact implementation target.

---

### Task 1: Add Repeat Evaluator Prompt Coverage

**Files:**
- Modify: `tests/server/turn-evaluator.test.ts`

**Interfaces:**
- Consumes: `evaluateRepeatTurn(input, deps)` from `src/server/ai/turn-evaluator.ts`.
- Produces: Failing tests requiring `EvaluateRepeatTurnInput.koreanSpans`, phonetic guidance, and genuine-Korean protection in the repeat prompt.

- [x] **Step 1: Add a prompt parser helper inside the repeat evaluator describe block**

Add this helper at the top of `describe("evaluateRepeatTurn server adapter (AI-04, AI-05)", () => {`:

```ts
  function repeatPromptFor(client: ReturnType<typeof createFakeClient>) {
    const request = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const userMessage = request?.input.find((message) => message.role === "user");
    return JSON.parse(userMessage?.content ?? "{}") as {
      repeatTranscript?: string;
      improvedSentence?: string;
      koreanSpans?: Array<{ hangul: string; romanized: string }>;
      instructions?: string[];
    };
  }
```

- [x] **Step 2: Add the failing accented-English prompt test**

Add this test in the same repeat evaluator describe block:

```ts
  it("tells repeat evaluation to treat Hangul loanword spans as accented English when they sound like the expected sentence", async () => {
    const { evaluateRepeatTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        version: "ai-eval-v1",
        outcome: "repeat_accepted",
        repeatCloseEnough: true,
        englishLanguage: "english",
        confidence: "high",
        reviewReason: null,
      },
    });

    await evaluateRepeatTurn(
      {
        originalTranscript: "Vanilla ice cream is more tasty than strawberry ice cream.",
        improvedSentence: "Vanilla ice cream is tastier than strawberry ice cream.",
        targetPattern: "____ is ______er than _____.",
        level: "elementary",
        repeatTranscript: "바닐라 아이스크림 is tastier than strawberry 아이스크림.",
        koreanSpans: [
          { hangul: "바닐라", romanized: "Banilra" },
          { hangul: "아이스크림", romanized: "Aiseukeurim" },
        ],
      },
      { apiKey: "test-key", client },
    );

    const prompt = repeatPromptFor(client);
    const instructions = prompt.instructions?.join("\n") ?? "";

    expect(prompt.koreanSpans).toEqual([
      { hangul: "바닐라", romanized: "Banilra" },
      { hangul: "아이스크림", romanized: "Aiseukeurim" },
    ]);
    expect(instructions).toContain("romanization sounds like an English word");
    expect(instructions).toContain("Banilra -> vanilla");
    expect(instructions).toContain("Aiseukeurim -> ice cream");
    expect(instructions).toContain("not non_english");
    expect(instructions).toContain("Compare the normalized reading to improvedSentence");
  });
```

- [x] **Step 3: Add the failing genuine-Korean protection prompt test**

Add this test in the same repeat evaluator describe block:

```ts
  it("keeps genuine Korean repeats eligible for non_english instead of blanket-accepting Hangul", async () => {
    const { evaluateRepeatTurn } = await import("@/server/ai/turn-evaluator");
    const client = createFakeClient({
      output_parsed: {
        version: "ai-eval-v1",
        outcome: "repeat_retry",
        repeatCloseEnough: false,
        englishLanguage: "non_english",
        confidence: "high",
        reviewReason: null,
      },
    });

    await evaluateRepeatTurn(
      {
        improvedSentence: "I like soccer after school.",
        targetPattern: "I like ____ after school.",
        level: "elementary",
        repeatTranscript: "나는 방과 후에 축구를 좋아해요.",
        koreanSpans: [
          { hangul: "나는", romanized: "Naneun" },
          { hangul: "방과", romanized: "Banggwa" },
          { hangul: "후에", romanized: "Hue" },
          { hangul: "축구를", romanized: "Chukgureul" },
          { hangul: "좋아해요", romanized: "Johahaeyo" },
        ],
      },
      { apiKey: "test-key", client },
    );

    const instructions = repeatPromptFor(client).instructions?.join("\n") ?? "";

    expect(instructions).toContain("Only mark englishLanguage non_english");
    expect(instructions).toContain("do not phonetically resemble the expected English sentence");
  });
```

- [x] **Step 4: Run the narrow failing test**

Run:

```bash
npm test -- tests/server/turn-evaluator.test.ts --run
```

Expected: FAIL because `koreanSpans` is not accepted on repeat input and/or missing from the repeat prompt.

---

### Task 2: Extend Repeat Evaluator Input and Prompt

**Files:**
- Modify: `src/server/ai/turn-evaluator.ts`

**Interfaces:**
- Consumes: `HangulSpan` type already imported in `src/server/ai/turn-evaluator.ts`.
- Produces: `EvaluateRepeatTurnInput.koreanSpans?: HangulSpan[]` and repeat prompt JSON containing `koreanSpans`.

- [x] **Step 1: Add `koreanSpans` to `EvaluateRepeatTurnInput`**

Change the type to:

```ts
export type EvaluateRepeatTurnInput = {
  originalTranscript?: string;
  improvedSentence?: string;
  targetPattern?: string;
  level: MissionLevel;
  repeatTranscript?: string;
  expectedSentence?: string;
  transcript?: string;
  /**
   * Korean-script spans kept verbatim in repeatTranscript. Some are genuine
   * Korean; some are accented English the transcriber wrote in Hangul.
   */
  koreanSpans?: HangulSpan[];
};
```

- [x] **Step 2: Add repeat-specific Korean span instructions in `buildRepeatPrompt`**

Replace `buildRepeatPrompt` with:

```ts
function buildRepeatPrompt(input: EvaluateRepeatTurnInput) {
  const improvedSentence = input.improvedSentence ?? input.expectedSentence ?? "";
  const repeatTranscript = input.repeatTranscript ?? input.transcript ?? "";
  const koreanSpans = input.koreanSpans ?? [];
  const koreanSpanInstructions =
    koreanSpans.length > 0
      ? [
          `The repeat transcript contains ${koreanSpans.length === 1 ? "one Korean-script span" : `${koreanSpans.length} Korean-script spans`}: ${koreanSpans
            .map((span) => `"${span.hangul}" (romanized: ${span.romanized})`)
            .join(", ")}.`,
          "For each Korean-script span, say its romanization aloud in your head. If the romanization sounds like an English word or phrase in improvedSentence (Banilra -> vanilla, Aiseukeurim -> ice cream, Chokolrit -> chocolate, Pija -> pizza), treat that span as the English word the child repeated with a Korean accent, not non_english.",
          "Compare the normalized reading to improvedSentence. Example: repeatTranscript \"바닐라 아이스크림 is tastier than strawberry 아이스크림.\" with improvedSentence \"Vanilla ice cream is tastier than strawberry ice cream.\" should be repeat_accepted when the only differences are those phonetic Korean-script spans.",
          "Only mark englishLanguage non_english when the repeat meaning is carried by Korean words that do not phonetically resemble the expected English sentence.",
        ]
      : [];

  return {
    originalTranscript: input.originalTranscript ?? null,
    improvedSentence,
    targetPattern: input.targetPattern ?? null,
    level: input.level,
    repeatTranscript,
    koreanSpans,
    instructions: [
      "Evaluate whether the repeat is close enough for an elementary ESL learner.",
      "Compare the repeat transcript to the improved sentence, not to the child's original answer.",
      ...koreanSpanInstructions,
      "Use teacher_review for ambiguity, low confidence, or unsafe uncertainty.",
      "Do not score pronunciation numerically.",
    ],
  };
}
```

- [x] **Step 3: Run the prompt tests**

Run:

```bash
npm test -- tests/server/turn-evaluator.test.ts --run
```

Expected: PASS for the new repeat prompt tests and existing evaluator tests.

- [x] **Step 4: Commit the evaluator prompt change**

Run:

```bash
git add docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md src/server/ai/turn-evaluator.ts tests/server/turn-evaluator.test.ts
git commit -m "fix: guide repeat evaluator on Hangul accented English"
```

---

### Task 3: Pass Normalized Transcript Spans from Repeat Audio Upload to Evaluation

**Files:**
- Modify: `tests/server/audio-upload.test.ts`
- Modify: `src/server/student-access/audio-upload.ts`

**Interfaces:**
- Consumes: `normalizeEnglishTranscript(transcription.text)` output in `src/server/student-access/audio-upload.ts`; `detectHangulSpans` deduplicates repeated Hangul runs.
- Produces: `evaluateRepeatTurn({ ..., koreanSpans })` call for repeat attempts using normalized transcript spans, not the fake transcriber's supplied span array.

- [x] **Step 1: Add the failing service test for normalized, deduplicated spans**

Add this test near the existing repeat evaluator call assertion in `tests/server/audio-upload.test.ts`:

```ts
  it("passes normalized repeat transcript Korean spans to repeat evaluation", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = successfulRepeatEvaluator();

    await uploadAttemptAudioClip(
      audioInput({ clipKind: "repeat_attempt", body: "repeat" }),
      {
        transcribeAudioFile: successfulTranscriber(
          "바닐라 아이스크림 is tastier than strawberry 아이스크림.",
        ),
        evaluateRepeatTurn: evaluateRepeat,
      },
    );

    expect(evaluateRepeat).toHaveBeenCalledWith(
      expect.objectContaining({
        repeatTranscript: "바닐라 아이스크림 is tastier than strawberry 아이스크림.",
        koreanSpans: [
          { hangul: "바닐라", romanized: "Banilra" },
          { hangul: "아이스크림", romanized: "Aiseukeurim" },
        ],
      }),
    );
  });
```

- [x] **Step 2: Add the exact English repeat bypass test**

Add this test in `tests/server/audio-upload.test.ts` near the repeat evaluation tests:

```ts
  it("still bypasses repeat evaluation for an exact English repeat", async () => {
    const { uploadAttemptAudioClip } = await import(
      "@/server/student-access/audio-upload"
    );
    const evaluateRepeat = successfulRepeatEvaluator();

    const result = await uploadAttemptAudioClip(
      audioInput({ clipKind: "repeat_attempt", body: "repeat" }),
      {
        transcribeAudioFile: successfulTranscriber(
          "I like playing soccer after school.",
        ),
        evaluateRepeatTurn: evaluateRepeat,
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(evaluateRepeat).not.toHaveBeenCalled();
  });
```

- [x] **Step 3: Run the failing service tests**

Run:

```bash
npm test -- tests/server/audio-upload.test.ts --run
```

Expected: FAIL because `audio-upload.ts` does not pass `koreanSpans` into `evaluateRepeatTurn`. The exact English bypass test should PASS before implementation; if it fails, stop and diagnose because the plan would be touching existing behavior.

- [x] **Step 4: Pass `koreanSpans` in the repeat evaluator call**

In `src/server/student-access/audio-upload.ts`, update the repeat evaluation call:

```ts
                  return evaluate({
                    originalTranscript: turn.original_transcript ?? "",
                    improvedSentence: repeatTarget,
                    targetPattern: snapshot.targetPattern,
                    level: snapshot.level,
                    repeatTranscript: transcript,
                    koreanSpans,
                  });
```

- [x] **Step 5: Run the service tests**

Run:

```bash
npm test -- tests/server/audio-upload.test.ts --run
```

Expected: PASS.

- [x] **Step 6: Commit the service wiring**

Run:

```bash
git add src/server/student-access/audio-upload.ts tests/server/audio-upload.test.ts
git commit -m "fix: pass repeat Hangul spans to evaluator"
```

---

### Task 4: Regression Sweep and Review

**Files:**
- No additional files expected.

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: verification evidence that the prompt contract and service wiring are implemented without breaking original Korean/code-switch behavior.

- [x] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts tests/server/transcription.test.ts tests/domain/hangul-romanization.test.ts --run
```

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [x] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [x] **Step 4: Review committed and uncommitted tracked diffs against preflight base**

Use the `BASE_SHA` recorded in `TASK.md`, not `HEAD~N`.

Run:

```bash
BASE_SHA=<paste TASK.md Base SHA here>
git diff --stat "$BASE_SHA"..HEAD
git diff "$BASE_SHA"..HEAD -- docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md src/server/ai/turn-evaluator.ts src/server/student-access/audio-upload.ts tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts
git diff --stat
git diff --cached --stat
git diff -- docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md src/server/ai/turn-evaluator.ts src/server/student-access/audio-upload.ts tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts
git diff --cached -- docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md src/server/ai/turn-evaluator.ts src/server/student-access/audio-upload.ts tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts
```

Expected: The committed range from `BASE_SHA..HEAD` plus any remaining tracked working-tree or staged changes are limited to repeat evaluator prompt, repeat service wiring, tests, and the plan artifact. `TASK.md` is ignored local coordination state; inspect it separately with `sed -n '1,140p' TASK.md` when reporting status, but do not include it in `git diff` path filters or commits. No transcript normalization or storage rewrite was introduced.

- [ ] **Step 5: Optional live OpenAI UAT, separately approved**

This step is not covered by local test approval. Ask for separate approval before making any live provider call:

```text
Approve a live OpenAI UAT for the repeat transcript case using model <model> from this local branch?
```

If approved, run a narrow script or manual probe that sends the repeat prompt for:

```text
improvedSentence: Vanilla ice cream is tastier than strawberry ice cream.
repeatTranscript: 바닐라 아이스크림 is tastier than strawberry 아이스크림.
koreanSpans: 바닐라/Banilra, 아이스크림/Aiseukeurim
```

Expected: Record the actual provider output as live UAT evidence. If not approved or not run, final acceptance must say only that the prompt contract and service wiring are implemented and locally verified.

- [x] **Step 6: Commit any remaining intended tracked changes**

Run:

```bash
git status --short
```

Expected: Known unrelated untracked files may still appear and must remain untouched. `TASK.md` must not appear because it is ignored local coordination state. There must be no unintended tracked modifications or staged files.

If app/test implementation changes are still tracked but uncommitted, commit them with the plan artifact in the final implementation commit:

```bash
git add docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md src/server/ai/turn-evaluator.ts src/server/student-access/audio-upload.ts tests/server/turn-evaluator.test.ts tests/server/audio-upload.test.ts
git commit -m "fix: accept Hangul-script accented English repeats"
```

If all app/test changes were already committed and the plan artifact is modified, staged, or still untracked, stage and commit the plan artifact unconditionally in a final documentation/status commit:

```bash
git add docs/superpowers/plans/2026-07-28-repeat-hangul-accented-english.md
git commit -m "docs: update repeat Hangul plan status"
```

Expected: The plan artifact is committed if it changed during execution or was still untracked. Any checkbox/status changes in the plan artifact are committed. `TASK.md` is never staged.

- [x] **Step 7: Confirm clean tracked working tree**

Run:

```bash
git status --short
git diff --stat
git diff --cached --stat
```

Expected: No tracked modifications and no staged files remain. The plan artifact must not remain as an untracked file. Known unrelated untracked files may still appear in `git status --short`; preserve them and mention they were not touched.

---

## Self-Review

- Spec coverage: The plan fixes the missing prompt evidence and service wiring for repeat-side `koreanSpans`, adds genuine-Korean protection, adds exact-match bypass coverage, and adds a consequential-work preflight.
- Placeholder scan: No placeholders or deferred implementation notes remain.
- Type consistency: `koreanSpans?: HangulSpan[]` is added to `EvaluateRepeatTurnInput`, passed from `audio-upload.ts`, and asserted as normalized/deduplicated spans in both server adapter and service tests.
- Acceptance accuracy: Local tests prove the prompt contract and service wiring, not live model behavior. Live OpenAI UAT is explicitly separate and requires approval.
