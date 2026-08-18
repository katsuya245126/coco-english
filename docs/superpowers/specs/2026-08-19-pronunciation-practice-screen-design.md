# Pronunciation Practice Screen — Sound-First Redesign

Date: 2026-08-19
Branch: `feature/pronunciation-practice` (worktree `.claude/worktrees/pronunciation-design`)
Status: Approved design, pending implementation plan

## Problem

The practice screen juggles two scores per try — whole-word stars and a
target-sound pass/fail — and a nine-year-old cannot process both. The page is
also visually flat: a plain white card with two gray outline buttons, while the
conversation missions already have the Coco mascot stage. Decision: the target
sound is the whole game, and the screen adopts the mission stage look.

## Decisions

1. **Focus: all-in on the target sound.** Per-try feedback speaks only about
   the target sound. Stars never appear during practice. They appear exactly
   once, on the finish screen, as the reward. Teacher evidence and all scoring
   are unchanged.
2. **Look: reuse the mission mascot stage.** Classroom backdrop, Coco sprite,
   speech-bubble dialogue box (`MascotStage` and the Phase 10 style tokens in
   `src/components/student/styles.ts`).

## Per-try feedback model

The verdict is Coco's message plus his expression. Copy is sound-centric for
every outcome; the retry mechanics do not change.

| Outcome (`PracticeTryOutcome`) | Expression | Message shape (example for /f/, "face") |
|---|---|---|
| `passed` | celebrate | "Your *fff* was strong!" |
| `target_weak` | encouraging | "Almost! Teeth on your lip — *fff*. Try again." |
| `word_weak` | encouraging | "Great *fff*! Now say the whole word smoothly." |
| `different_word` | encouraging | "Let's try *face* — listen again." |
| third try, not passed | encouraging | "Good try! Let's do the next word." |

Rules:

- No stars, no "whole word" label, no second score anywhere in the try verdict.
- `word_weak` still praises the sound (it genuinely passed) while explaining
  the retry, so the single-focus story never breaks.
- The highlighted target letters in the big word keep their existing tint
  behavior: neutral before a try, green when the sound was clear, amber with
  underline when weak (`highlightedWord` already implements this).
- Micro-tips (e.g. "teeth on your lip") come from per-sound copy on
  `PRACTICE_SOUNDS`; one short tip per sound, no per-word variation.

Feedback strings are produced server-side today; the sound-first copy replaces
them there. `CocoSpeechAudio` keeps voicing the message via the existing
feedback variants.

## Screen layout (practice state, top to bottom)

1. **Title + progress dots.** Five dots, one per word: filled = finished,
   ring = current, empty = upcoming. Replaces the percent bar and
   "Word N of 5 · NN% complete" line. Dots carry an aria-label with the same
   "N of 5 words completed" text.
2. **The word.** ~52px, centered, target letters highlighted, above the stage.
3. **Coco stage.** `MascotStage` pattern: classroom backdrop, Coco sprite,
   dialogue box. The dialogue text is the prompt ("Listen, then say it!")
   before a try and the verdict after one. Expressions: idle/happy on prompt,
   celebrate/encouraging on verdicts (sprites exist).
   - **Audio controls as dialogue tabs**: "Hear the word" (word TTS, existing
     autoplay on word entry stays) and "Hear the *f* sound" (isolated sound
     clip) using the existing attached-tab styles
     (`mascotHintTabStyle` / `mascotDialogueActionsStyle`). The two gray
     outline buttons are removed.
   - Word-audio loading/not_found/unavailable states keep their current
     copy and retry button, rendered under the stage.
4. **Action slot.** Unchanged mechanics: `VoiceRecorderControl` until the word
   finishes, then "Next word" in the same slot. Verdict zone keeps a reserved
   min-height so the screen never reflows.

## Finish screen

- Coco celebrating at the top (sprite + short line, e.g. "You did it!").
- Then the per-word list, as today: word with tinted target letters, whole-word
  stars, short line. This is the only place stars render.
- "Back to homework" primary link stays.

## Implementation shape

- UI-only plus server feedback copy. No schema, scoring, storage, or teacher
  evidence changes. All existing route contracts stay.
- Reuse `MascotStage` if its mission-specific props (`ExpressionInput`: step,
  feedback kinds) generalize; otherwise a thin `PracticeStage` wrapper that
  reuses the same style tokens and sprite map. Prefer reuse over a fork.
- `PronunciationPracticeShell` is rewired for the new layout; upload flow,
  state derivation, and completion logic stay as they are.
- `starsForBand` / star rendering move to the finish view only.

## Testing

- Update `PronunciationPracticeShell.test.tsx`: verdicts show sound-first copy
  and no stars; finish view shows stars; dots reflect progress; audio tabs
  render and trigger playback.
- Server tests for the new feedback strings.
- Visual confirmation in the browser (real recorded try) at 375×812 and
  desktop for both celebrate and encourage variants — this also closes
  Question 5 from `docs/tasks/2026-08-04-pronunciation-open-questions-handoff.md`
  (the redesign was never visually confirmed).

## Out of scope

Known open issues from the handoff doc, deliberately not part of this
redesign: Korean transcripts (transcription prompt), word-audio generation
guarantee (`warmPronunciationWordAudio` never called in production paths),
silent-failure logging, and error-message bucketing.
