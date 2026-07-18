export const DIALOGUE_PAGE_WORD_LIMIT = 8;

export type TextRange = { start: number; end: number };
export type DialoguePage = TextRange & { text: string };

const sentenceBoundaryPattern = /[.!?]+["')\]]*(?:\s+|$)/gu;
const clauseBoundaryPattern = /[,;:]+(?:\s+|$)/gu;

function boundaries(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map(
    (match) => (match.index ?? 0) + match[0].length,
  );
}

function nextBudgetBoundary(source: string, start: number): number {
  const words = [...source.matchAll(/\S+/gu)].filter(
    (match) => (match.index ?? 0) >= start,
  );
  if (words.length <= DIALOGUE_PAGE_WORD_LIMIT) return source.length;

  const hardBoundary = words[DIALOGUE_PAGE_WORD_LIMIT]?.index ?? source.length;
  const inBudget = (value: number) => value > start && value <= hardBoundary;
  const sentence = boundaries(source, sentenceBoundaryPattern).filter(inBudget).at(-1);
  if (sentence !== undefined) return sentence;
  const clause = boundaries(source, clauseBoundaryPattern).filter(inBudget).at(-1);
  return clause ?? hardBoundary;
}

function protectBoundary(
  source: string,
  pageStart: number,
  boundary: number,
  protectedRanges: TextRange[],
): number {
  let adjusted = boundary;
  for (const range of protectedRanges) {
    if (adjusted <= range.start || adjusted >= range.end) continue;
    const beforePhrase = source.slice(pageStart, range.start);
    adjusted = beforePhrase.trim().length > 0 ? range.start : range.end;
  }
  return Math.min(source.length, Math.max(pageStart + 1, adjusted));
}

export function paginateDialogueText(
  sourceText: string,
  protectedRanges: TextRange[] = [],
): DialoguePage[] {
  if (sourceText.length === 0) return [];
  const ranges = [...protectedRanges].sort((a, b) => a.start - b.start);
  const pages: DialoguePage[] = [];
  let start = 0;

  while (start < sourceText.length) {
    const candidate = nextBudgetBoundary(sourceText, start);
    const end = protectBoundary(sourceText, start, candidate, ranges);
    pages.push({ start, end, text: sourceText.slice(start, end) });
    start = end;
  }
  return pages;
}

export function findDialoguePageIndex(
  pages: DialoguePage[],
  sourceOffset: number,
): number {
  if (pages.length === 0) return 0;
  const index = pages.findIndex(
    (page) => sourceOffset >= page.start && sourceOffset < page.end,
  );
  return index >= 0 ? index : pages.length - 1;
}
