# Pronunciation Practice Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pronunciation practice card with a sound-first Coco mascot-stage experience while preserving server-owned scoring, upload, completion, and teacher evidence behavior.

**Architecture:** Keep `PronunciationPracticeShell` as the stateful client boundary and reuse `MascotStage`/`CocoDialogueBox` directly. Centralize the new feedback copy in the pronunciation domain data/helpers so the upload response and student TTS resolver speak the same lines; keep stars and existing score fields in the state model but render them only in the finish view.

**Tech Stack:** Next.js App Router, React 19, TypeScript, inline student style tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-pronunciation-practice-screen-design.md`

## Global Constraints

- The target sound is the only per-try verdict. Stars never appear during practice and appear exactly once per word on the finish screen; scoring, evidence, and stored fields remain unchanged.
- Reuse `MascotStage` and the Phase 10 mascot style tokens. Do not fork the stage or alter mission behavior; pass an explicit practice expression and the existing `step="question"` compatibility value if needed.
- Per-try copy is sound-centric: passed praises the repeated target cue, `target_weak` uses the per-sound micro-tip, `word_weak` praises the sound before asking for the whole word, `different_word` names the expected word, and a non-passed third try says “Good try! Let’s do the next word.”
- Add exactly one short `tip` to each `PRACTICE_SOUNDS` entry; do not add per-word tip variants.
- Replace the percent bar and `Word N of 5 · NN% complete` line with five progress dots: filled finished, ring current, empty upcoming, with an accessible `N of 5 words completed` label.
- Use the attached-tab pattern for “Hear the word” and “Hear the [sound] sound”; preserve current word-audio autoplay and loading/not-found/unavailable copy/retry behavior.
- Keep the recorder and “Next word” in one action slot and preserve the reserved verdict/stage height so a verdict does not move the action.
- The finish screen shows Coco celebrating, the existing tinted words, whole-word stars, short per-word lines, and the existing “Back to homework” link.
- No schema, scoring, storage, route-contract, teacher-evidence, Korean-transcript, word-audio-generation, silent-failure-logging, or error-bucketing changes.
- Do not stage or delete local-only `scripts/local/`, `scripts/dev-local.sh`, or `.env.local`.

---

### Task 1: Sound-first pronunciation feedback

**Files:**
- Modify: `src/domain/pronunciation/practice.ts`
- Test: `tests/domain/pronunciation-practice.test.ts`
- Test: `tests/server/pronunciation-tts-route.test.ts`
- Test: `tests/server/pronunciation-upload.test.ts`

**Interfaces:**
- `PRACTICE_SOUNDS[soundId]` gains `tip: string`; its existing `label`, `ipa`, `arpabet`, and `clip` fields remain unchanged.
- `gradePronunciationTry(input)` continues returning `PronunciationTryGrade`; only its `feedback` text changes.
- `resolvePronunciationFeedbackLineText(variant, input)` keeps the existing signature and returns the same approved line that the upload grader uses for the corresponding outcome/variant.
- `pronunciation-upload.ts` and the TTS route remain on their current contracts and consume the updated domain copy.

- [ ] **Step 1: Add failing copy assertions.**

Extend the existing domain and server tests before changing production code. Cover the four first/second-try outcomes and the non-passed third-try variant. For `/f/` and `face`, the expected strings are:

```ts
{
  passed: "Your fff was strong!",
  target_weak: "Almost! Teeth on your lip — fff. Try again.",
  word_weak: "Great fff! Now say the whole word smoothly.",
  different_word: "Let's try face — listen again.",
  thirdTry: "Good try! Let's do the next word.",
}
```

Also assert that `PRACTICE_SOUNDS` exposes one non-empty tip for all five sound IDs and that the upload/TTS paths return the same copy. Run:

```bash
npm test -- --run tests/domain/pronunciation-practice.test.ts tests/server/pronunciation-tts-route.test.ts tests/server/pronunciation-upload.test.ts
```

Expected: the new assertions fail against the old feedback strings, while unrelated existing assertions remain understandable.

- [ ] **Step 2: Add per-sound tips and the minimal shared copy helpers.**

Add one short tip to each sound:

```ts
light_l: "Touch your tongue behind your top teeth"
s: "Keep your teeth close and let air hiss"
f: "Teeth on your lip"
v: "Teeth on your lip and turn your voice on"
z: "Keep your teeth close and turn your voice on"
```

Use the existing lowercase `ipa` value repeated three times as the spoken/visible target cue (`f` → `fff`). Update `gradePronunciationTry` so it produces the approved lines, including the third-try transition line, without changing outcome selection, score thresholds, or persistence fields. Update `resolvePronunciationFeedbackLineText` so `CocoSpeechAudio` resolves the same lines server-side; keep non-pronunciation TTS feedback untouched.

- [ ] **Step 3: Run the focused green checks.**

```bash
npm test -- --run tests/domain/pronunciation-practice.test.ts tests/server/pronunciation-tts-route.test.ts tests/server/pronunciation-upload.test.ts
```

Expected: all tests in the three files pass with no new warnings.

- [ ] **Step 4: Commit the feedback slice.**

```bash
git add src/domain/pronunciation/practice.ts tests/domain/pronunciation-practice.test.ts tests/server/pronunciation-tts-route.test.ts tests/server/pronunciation-upload.test.ts
git commit -m "feat: use sound-first pronunciation feedback"
```

---

### Task 2: Mascot-stage practice and finish views

**Files:**
- Modify: `src/components/student/PronunciationPracticeShell.tsx`
- Test: `src/components/student/PronunciationPracticeShell.test.tsx`
- Modify: `tests/e2e/pronunciation-practice.spec.ts`

**Interfaces:**
- Preserve `PronunciationPracticeShell({ page })`, the upload endpoint body, `completePronunciationAttemptAction` arguments, and the existing word-audio endpoint body.
- Reuse `MascotStage` with `displayName="Coco"`, explicit `expression`, the current `assignmentStudentId`, and a stable amplitude ref/playing state for feedback audio; no `MascotStage` fork is needed.
- Keep `CocoSpeechAudio` on the existing `coco_feedback` line descriptor and `feedbackVariant` mapping so the server continues to own spoken verdict text.

- [ ] **Step 1: Replace progress and practice-view tests with failing redesign assertions.**

Update the component test fixture expectations before the shell implementation changes. Assert five dots and their filled/ring/empty states, the `N of 5 words completed` accessible label, no percent progress copy, no stars or `whole word` label in practice, exact sound-first dialogue for passed/weak/different-word/third-try outcomes, the `celebrate`/`encouraging` stage expressions, and two audio-tab labels that replay the existing word/sound audio elements. Keep tests for word-audio loading/not-found/unavailable states, retry behavior, unlimited replay, explicit Next word, completion retry, resume, and no transcript text.

Add a finish-view fixture that asserts a celebrating mascot line, five finish-word star groups, and no recorder. The stars must not be present in the practice verdict after a try and must be present only in the finish list.

Run the focused component file and confirm the new behavior assertions fail before implementation:

```bash
npm test -- --run src/components/student/PronunciationPracticeShell.test.tsx
```

- [ ] **Step 2: Rewire the shell to the sound-first layout.**

Use the existing mission page/content tokens instead of the old white step-card/progress-bar presentation. Render the title, a five-dot progress indicator, the responsive centered highlighted word, and a direct `MascotStage`:

```tsx
<MascotStage
  assignmentStudentId={page.assignmentStudentId}
  displayName="Coco"
  dialogueText={lastTry?.message ?? "Listen, then say it!"}
  expression={lastTry ? EXPRESSION_BY_OUTCOME[lastTry.outcome] : "happy"}
  step="question"
  playing={mascotPlaying}
  amplitudeRef={mascotAmplitudeRef}
  voiceControl={practiceAudioTabs}
/>
```

Build `practiceAudioTabs` from two buttons using `mascotHintTabStyle`: “Hear the word” replays the signed word audio and remains disabled until ready; “Hear the [sound] sound” replays the isolated `PRACTICE_SOUNDS` clip. Include `CocoSpeechAudio` as the compact third tab only when a verdict exists, with the existing feedback variant and mascot playback callbacks. Keep the existing word-audio status messages immediately below the stage.

Move the verdict message/expression into the stage dialogue. Keep the stage/dialogue height and a reserved action/verdict slot so the recorder/Next word position does not move. Keep `highlightedWord` tint behavior, upload state derivation, try limits, error copy, and completion logic unchanged. Remove `TryVerdict`, all practice-time star rendering, and the old two gray outline buttons. Leave `starsForBand`/finish star rendering in the finish branch only.

Render the finish branch with a celebrating `MascotStage` and short “You did it!” line before the existing tinted per-word list and its whole-word stars/short lines; keep both existing homework links and the primary “Back to homework” link.

- [ ] **Step 3: Make the focused component tests green and update the pronunciation E2E selectors.**

Run:

```bash
npm test -- --run src/components/student/PronunciationPracticeShell.test.tsx
```

Update `tests/e2e/pronunciation-practice.spec.ts` to use “Hear the word” for the word-audio readiness check and the new passed feedback text in the provider double/record helper. Preserve the existing real route, resume, completion, and teacher-evidence assertions.

- [ ] **Step 4: Commit the screen slice.**

```bash
git add src/components/student/PronunciationPracticeShell.tsx src/components/student/PronunciationPracticeShell.test.tsx tests/e2e/pronunciation-practice.spec.ts
git commit -m "feat: redesign pronunciation practice around sound"
```

---

## Final verification and handoff

- [ ] Re-read the spec and inspect the full diff for scope drift, especially stars, route payloads, scoring fields, and local-only files.
- [ ] Run the required automated checks:

```bash
npm test -- --run
npm run typecheck
```

- [ ] Run the real-app visual check from this worktree with `npm run local` (port 3200 only; never bare `npm run dev`). Log in with join code `LOCALF`, name `john`, and the existing local PIN. Verify the “F Sound Practice” mission at 375×812 and desktop, including a real passed/celebrate try and an encouraging try, with no stars during practice and stars on the finish screen. Capture only evidence from this localhost environment; do not describe it as production evidence.
- [ ] Stop the local server before any build that contends for `.next`/the port, run the final build if proportionate, and record actual command output.
- [ ] Archive the completed brief as `docs/tasks/archive/2026-08-19-pronunciation-practice-screen-redesign.md`, remove the root `TASK.md`, and leave `scripts/local/`, `scripts/dev-local.sh`, and `.env.local` unmodified and unstaged.
- [ ] Commit the archive/cleanup and any verified final changes on `feature/pronunciation-practice`; do not push or merge.
