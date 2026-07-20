export const DIALOGUE_PAGE_WORD_LIMIT = 16;
export const DIALOGUE_PAGE_PACK_WORD_LIMIT = 10;

export type TextRange = { start: number; end: number };
export type DialoguePage = TextRange & { text: string };

const sentenceBoundaryPattern = /[.!?]+["')\]]*(?:\s+|$)/gu;
const clauseBoundaryPattern = /[,;:]+(?:\s+|$)/gu;

type PageUnit = TextRange & { words: number; fragment: boolean };

function boundaryEnds(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map(
    (match) => (match.index ?? 0) + match[0].length,
  );
}

function countWords(source: string, start: number, end: number): number {
  return [...source.slice(start, end).matchAll(/\S+/gu)].length;
}

function sentenceRanges(source: string): TextRange[] {
  const ranges: TextRange[] = [];
  let start = 0;
  for (const end of boundaryEnds(source, sentenceBoundaryPattern)) {
    ranges.push({ start, end });
    start = end;
  }
  if (start < source.length) ranges.push({ start, end: source.length });
  return ranges;
}

function splitLongSentence(source: string, sentence: TextRange): TextRange[] {
  const clauseEnds = boundaryEnds(source, clauseBoundaryPattern);
  const fragments: TextRange[] = [];
  let start = sentence.start;
  while (start < sentence.end) {
    const words = [...source.slice(start, sentence.end).matchAll(/\S+/gu)];
    if (words.length <= DIALOGUE_PAGE_WORD_LIMIT) {
      fragments.push({ start, end: sentence.end });
      break;
    }
    const overflowWordOffset = words[DIALOGUE_PAGE_WORD_LIMIT]?.index;
    const hardBoundary =
      overflowWordOffset === undefined
        ? sentence.end
        : start + overflowWordOffset;
    const inBudget = (value: number) => value > start && value <= hardBoundary;
    const clause = clauseEnds.filter(inBudget).at(-1);
    const end = clause ?? hardBoundary;
    fragments.push({ start, end });
    start = end;
  }
  return fragments;
}

export function paginateDialogueText(sourceText: string): DialoguePage[] {
  if (sourceText.length === 0) return [];

  const units: PageUnit[] = [];
  for (const sentence of sentenceRanges(sourceText)) {
    const words = countWords(sourceText, sentence.start, sentence.end);
    if (words <= DIALOGUE_PAGE_WORD_LIMIT) {
      units.push({ ...sentence, words, fragment: false });
      continue;
    }
    for (const fragment of splitLongSentence(sourceText, sentence)) {
      units.push({
        ...fragment,
        words: countWords(sourceText, fragment.start, fragment.end),
        fragment: true,
      });
    }
  }

  const pages: DialoguePage[] = [];
  let pageWords = 0;
  let pageHasFragment = false;
  for (const unit of units) {
    const current = pages.at(-1);
    const packable =
      current !== undefined &&
      !unit.fragment &&
      !pageHasFragment &&
      pageWords + unit.words <= DIALOGUE_PAGE_PACK_WORD_LIMIT;
    if (current !== undefined && packable) {
      current.end = unit.end;
      current.text = sourceText.slice(current.start, current.end);
      pageWords += unit.words;
    } else {
      pages.push({
        start: unit.start,
        end: unit.end,
        text: sourceText.slice(unit.start, unit.end),
      });
      pageWords = unit.words;
      pageHasFragment = unit.fragment;
    }
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
