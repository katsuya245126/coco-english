import { z } from "zod";
import { detectHangulSpans } from "@/domain/audio/hangul-romanization";

/**
 * Learner-safe derivation of transcript text from raw provider evidence.
 *
 * `original_transcript` and `repeat_transcript` are the record a teacher reads,
 * so they stay verbatim (see the note atop `hangul-romanization.ts`). But a
 * child who says "vanilla ice cream" with a Korean accent may get it back as
 * 바닐라 아이스크림, and showing that to the learner as "You said:" tells them
 * they spoke Korean when they were speaking English.
 *
 * This module derives a display-only string from the raw transcript plus
 * per-span classifications the evaluator supplies. It is deliberately a closed
 * world: every Hangul run the transcript actually contains must be accounted
 * for exactly once, and anything the evaluator could not confidently call
 * accented English hides the whole learner transcript rather than showing a
 * partly-Korean sentence or putting words in the child's mouth. A hidden
 * transcript is `null` — never an empty string, and never a placeholder that
 * claims what the learner said.
 *
 * There is no loanword dictionary here on purpose. Whether 바닐라 is accented
 * English or ordinary Korean vocabulary is a semantic judgement about what the
 * child intended, which belongs to the evaluator that sees the whole sentence.
 */

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
export type HangulInterpretation = z.infer<typeof hangulInterpretationSchema>;

export type HangulInterpretationValidationError =
  | "coverage_mismatch"
  | "duplicate_span"
  | "invalid_english_reading"
  | "unexpected_english_reading";

/**
 * An English reading may only be plain Latin words. This rejects a reading
 * that is itself Korean, Han characters, or otherwise not something the child
 * could be shown as the English they intended.
 */
const ENGLISH_READING_PATTERN = /^[A-Za-z][A-Za-z' -]*$/u;

/**
 * Check that `interpretations` accounts for exactly the Hangul runs in
 * `rawTranscript`, once each, with a replacement only where one is allowed.
 *
 * `detectHangulSpans` deduplicates runs, so a word the child repeats is one
 * classification decision covering every occurrence.
 */
export function validateHangulInterpretations(
  rawTranscript: string,
  interpretations: HangulInterpretation[],
): { ok: true } | { ok: false; reason: HangulInterpretationValidationError } {
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

/**
 * The learner-facing reading of `rawTranscript`, or `null` when no safe
 * reading exists.
 *
 * Only `accented_english` spans are replaced. A `name` stays exactly as
 * spoken, so a place or person the child named in Korean is still their word.
 * Any `korean_vocabulary` or `uncertain` span hides the entire transcript:
 * partially translating a sentence would either teach the Korean word as
 * acceptable English or misrepresent what the child produced.
 */
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
      item.kind === "accented_english" && item.englishReading
        ? display.split(item.hangul).join(item.englishReading)
        : display,
    rawTranscript,
  );
}
