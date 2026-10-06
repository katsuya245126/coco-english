import type { Database } from "@/lib/db/types";
import type { PreGuardClassification } from "@/server/ai/answer-evaluation";
import type { HangulInterpretation } from "@/domain/audio/transcript-interpretation";
import type { PronunciationScoreResult } from "@/server/audio/pronunciation-scorer";
import {
  wordsToPractice,
  type PronunciationStarBand,
  type WordHighlight,
} from "@/domain/pronunciation/scoring";
import type { OwnedSpeakingTryPersistence } from "@/server/student-access/speaking-try-persistence";

// Scoring rules: see docs/features/mission-pronunciation-scoring.md.

type ClipKind = Database["public"]["Enums"]["audio_clip_kind"];

/**
 * Reference text to score as soon as the clip is transcribed, or null.
 * Repeats always score against the repeat target. Originals score against
 * the transcript only when it has no Korean spans and no deterministic guard
 * stage will short-circuit evaluation.
 */
export function initialPronunciationReference(input: {
  clipKind: ClipKind;
  repeatTarget: string;
  transcript: string;
  koreanSpanCount: number;
  preGuardStage: PreGuardClassification["stage"];
}): string | null {
  if (input.clipKind === "repeat_attempt") return input.repeatTarget;
  return input.koreanSpanCount === 0 && input.preGuardStage === "evaluate"
    ? input.transcript
    : null;
}

/**
 * Reference text for a late start after evaluation, or null. Call only when
 * scoring did not start up front: an original answer whose Hangul the
 * evaluator confirmed as accented English scores against the display
 * transcript.
 */
export function latePronunciationReference(input: {
  clipKind: ClipKind;
  displayTranscript: string | null | undefined;
  hangulInterpretations: HangulInterpretation[];
}): string | null {
  if (input.clipKind !== "original_answer" || !input.displayTranscript) {
    return null;
  }
  return input.hangulInterpretations.some(
    (item) => item.kind === "accented_english",
  )
    ? input.displayTranscript
    : null;
}

/**
 * Awaits a started score, persists it, and returns what the student sees.
 * Scoring and persistence failures are logged and yield no stars; they never
 * fail the turn.
 */
export async function settleTurnPronunciation(
  scoring: Promise<PronunciationScoreResult>,
  deps: {
    persist: OwnedSpeakingTryPersistence["persistPronunciation"];
    onAwaitMs: (ms: number) => void;
    logFailure: (error: unknown) => void;
    highlightText: string;
  },
): Promise<{ starBand: PronunciationStarBand | null; wordHighlights: WordHighlight[] }> {
  const none = { starBand: null, wordHighlights: [] };
  try {
    const awaitStartedAt = Date.now();
    const result = await scoring;
    deps.onAwaitMs(Math.max(0, Date.now() - awaitStartedAt));
    if (!result.ok) {
      deps.logFailure(result.error);
      return none;
    }

    const { score } = result;
    const write = await deps.persist(score);
    if (!write.ok) {
      deps.logFailure(write.error);
      return none;
    }
    if (write.value.error) {
      deps.logFailure(write.value.error.message);
      return none;
    }

    return {
      starBand: score.starBand,
      wordHighlights: wordsToPractice(score.wordScores, deps.highlightText),
    };
  } catch (error) {
    deps.logFailure(error instanceof Error ? error.message : String(error));
    return none;
  }
}
