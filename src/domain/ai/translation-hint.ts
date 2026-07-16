import { z } from "zod";

export const TRANSLATABLE_COCO_LINE_KINDS = [
  "mission_prompt",
  "coco_dynamic_line",
] as const;

export type TranslatableCocoLine = {
  lineKind: (typeof TRANSLATABLE_COCO_LINE_KINDS)[number];
  turnOrder: number;
};

export type TranslationPhrase = {
  source: string;
  start: number;
  end: number;
  translation: string;
};

export type TranslationHint = {
  phrases: TranslationPhrase[];
};

export type TranslationSegment =
  | { kind: "text"; text: string }
  | { kind: "phrase"; text: string; phrase: TranslationPhrase };

export const translationPhraseSchema = z
  .object({
    source: z.string().min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    translation: z.string().trim().min(1),
  })
  .strict();

export const translationHintSchema = z
  .object({
    phrases: z.array(translationPhraseSchema).max(3),
  })
  .strict();

export const translationHintRequestSchema = z
  .object({
    lineKind: z.enum(TRANSLATABLE_COCO_LINE_KINDS),
    turnOrder: z.coerce.number().int().positive(),
  })
  .strict();

const ISOLATED_FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "do",
  "does",
  "did",
  "am",
  "is",
  "are",
  "was",
  "were",
  "to",
  "of",
  "and",
  "or",
  "you",
  "i",
  "he",
  "she",
  "it",
  "we",
  "they",
]);

export type ParseTranslationHintResult =
  | { ok: true; hint: TranslationHint }
  | { ok: false; error: "schema_failed" };

export function parseTranslationHint(
  sourceText: string,
  value: unknown,
): ParseTranslationHintResult {
  const parsed = translationHintSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "schema_failed" };

  let previousEnd = 0;
  for (const phrase of parsed.data.phrases) {
    if (
      phrase.start >= phrase.end ||
      phrase.end > sourceText.length ||
      phrase.start < previousEnd ||
      sourceText.slice(phrase.start, phrase.end) !== phrase.source ||
      !/[\p{L}\p{N}]/u.test(phrase.source) ||
      ISOLATED_FUNCTION_WORDS.has(phrase.source.trim().toLowerCase())
    ) {
      return { ok: false, error: "schema_failed" };
    }
    previousEnd = phrase.end;
  }

  return { ok: true, hint: parsed.data };
}

export function buildTranslationSegments(
  sourceText: string,
  phrases: TranslationPhrase[],
): TranslationSegment[] {
  const segments: TranslationSegment[] = [];
  let cursor = 0;

  for (const phrase of phrases) {
    if (phrase.start > cursor) {
      segments.push({ kind: "text", text: sourceText.slice(cursor, phrase.start) });
    }
    segments.push({ kind: "phrase", text: phrase.source, phrase });
    cursor = phrase.end;
  }

  if (cursor < sourceText.length) {
    segments.push({ kind: "text", text: sourceText.slice(cursor) });
  }

  return segments;
}

export function getFirstTranslationPhraseSegmentIndex(
  sourceText: string,
  phrases: TranslationPhrase[],
): number | null {
  const index = buildTranslationSegments(sourceText, phrases).findIndex(
    (segment) => segment.kind === "phrase",
  );
  return index >= 0 ? index : null;
}

export function toggleTranslationBubble(
  currentIndex: number | null,
  firstIndex: number | null,
): number | null {
  if (firstIndex === null) return null;
  return currentIndex === null ? firstIndex : null;
}
