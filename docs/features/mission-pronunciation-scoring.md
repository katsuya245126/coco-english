# Pronunciation scoring on mission turns

Preset and conversation missions score each recorded turn with Azure Speech,
separately from [pronunciation practice](pronunciation-practice.md) homework.

## Pipeline

1. `src/server/student-access/audio-upload.ts` decides whether to score while it
   evaluates the turn (`beginPronunciationScoring`):
   - `repeat_attempt` clips always score against the repeat target.
   - `original_answer` clips score against the transcript only when it has no
     Korean spans and `classifyPreGuardStage` returns `evaluate`. Incomplete
     recordings and minimal-effort answers skip scoring.
   - Accented-English Hangul interpretations start a late score against the
     display transcript.
2. `src/server/audio/pronunciation-scorer.ts` calls Azure. Clips over 60 s are
   rejected (`MAX_PRONUNCIATION_AUDIO_MS`).
3. `persistPronunciation` in `src/server/student-access/speaking-try-persistence.ts`
   writes `pronunciation_scores` (schema in `src/lib/db/types.ts`). Reprocessing
   is in [pronunciation reprocessing](../operations/pronunciation-reprocessing.md).

## Where students see stars

`src/components/student/StepAiEvaluationFeedback.tsx` renders stars and words
to practice only for the `acceptedOriginal`, `repeatAccepted`, and
`repeatLimitReached` outcomes. A score saved for an original answer that needs
correction or teacher review does not appear; the student sees stars on the
repeat step instead.
