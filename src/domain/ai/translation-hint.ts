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

export const TRANSLATION_HINT_MAX_PHRASES = 12;

// What the model returns: phrase text only. Offsets are computed here —
// LLMs cannot count characters, so model-provided offsets are never trusted.
export const translationHintModelPhraseSchema = z
  .object({
    source: z.string().min(1),
    translation: z.string().min(1),
  })
  .strict();

export const translationHintModelSchema = z
  .object({
    phrases: z.array(translationHintModelPhraseSchema).max(
      TRANSLATION_HINT_MAX_PHRASES,
    ),
  })
  .strict();

const translationHintInputSchema = z.object({
  phrases: z
    .array(
      z.object({
        source: z.string().min(1),
        // Legacy/cached payloads may still carry offsets; they are ignored.
        start: z.number().optional(),
        end: z.number().optional(),
        translation: z.string().trim().min(1),
      }),
    )
    .max(TRANSLATION_HINT_MAX_PHRASES),
});

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

const LONG_COMPLETE_SENTENCE_WORD_LIMIT = 6;

export type ParseTranslationHintResult =
  | { ok: true; hint: TranslationHint }
  | { ok: false; error: "schema_failed" };

export function parseTranslationHint(
  sourceText: string,
  value: unknown,
): ParseTranslationHintResult {
  const parsed = translationHintInputSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "schema_failed" };

  const phrases: TranslationPhrase[] = [];
  let cursor = 0;
  for (const [index, phrase] of parsed.data.phrases.entries()) {
    const source = phrase.source.trim();
    if (
      !/[\p{L}\p{N}]/u.test(source) ||
      ISOLATED_FUNCTION_WORDS.has(source.toLowerCase())
    ) {
      continue;
    }
    const start = sourceText.indexOf(source, cursor);
    if (start < 0) continue;
    const end = start + source.length;
    if (
      isLongCompleteSentenceSpan(sourceText, start, end) &&
      hasCompleteSmallerAlternativeCoverage(
        parsed.data.phrases,
        index,
        sourceText,
        start,
        end,
      )
    ) {
      continue;
    }
    phrases.push({
      source,
      start,
      end,
      translation: phrase.translation.trim(),
    });
    cursor = end;
  }

  return { ok: true, hint: { phrases } };
}

function isLongCompleteSentenceSpan(
  sourceText: string,
  start: number,
  end: number,
): boolean {
  const wordCount = [...sourceText.slice(start, end).matchAll(/\S+/gu)].length;
  if (wordCount <= LONG_COMPLETE_SENTENCE_WORD_LIMIT) return false;

  const before = sourceText.slice(0, start).trimEnd();
  const startsSentence = before === "" || /[.!?]$/u.test(before);
  if (!startsSentence) return false;

  const after = sourceText.slice(end);
  return /^[\s.!?,"')\]]*$/u.test(after) || /^[.!?]["')\]]*(?:\s|$)/u.test(after);
}

function hasCompleteSmallerAlternativeCoverage(
  phrases: Array<{ source: string }>,
  currentIndex: number,
  sourceText: string,
  sentenceStart: number,
  sentenceEnd: number,
): boolean {
  const covered = new Set<number>();
  for (const [index, phrase] of phrases.entries()) {
    if (index === currentIndex) continue;
    const source = phrase.source.trim();
    if (
      !/[\p{L}\p{N}]/u.test(source) ||
      ISOLATED_FUNCTION_WORDS.has(source.toLowerCase())
    ) {
      continue;
    }
    const start = sourceText.indexOf(source, sentenceStart);
    if (start < sentenceStart || start >= sentenceEnd) continue;
    const end = start + source.length;
    if (end > sentenceEnd || (start === sentenceStart && end === sentenceEnd)) {
      continue;
    }
    for (let offset = start; offset < end; offset += 1) covered.add(offset);
  }

  for (let offset = sentenceStart; offset < sentenceEnd; offset += 1) {
    if (/[\p{L}\p{N}]/u.test(sourceText[offset] ?? "") && !covered.has(offset)) {
      return false;
    }
  }
  return true;
}

const TERMINAL_PUNCTUATION_ONLY = /^[.!?,]+$/u;

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
    const trailing = sourceText.slice(cursor);
    const lastSegment = segments.at(-1);
    if (lastSegment?.kind === "phrase" && TERMINAL_PUNCTUATION_ONLY.test(trailing)) {
      lastSegment.text += trailing;
    } else {
      segments.push({ kind: "text", text: trailing });
    }
  }

  return segments;
}

export function clampPhrasesToPage(
  phrases: TranslationPhrase[],
  page: { start: number; end: number; text: string },
): TranslationPhrase[] {
  return phrases
    .filter((phrase) => phrase.start < page.end && phrase.end > page.start)
    .map((phrase) => {
      const start = Math.max(phrase.start, page.start) - page.start;
      const end = Math.min(phrase.end, page.end) - page.start;
      return {
        source: page.text.slice(start, end),
        start,
        end,
        translation: phrase.translation,
      };
    });
}
