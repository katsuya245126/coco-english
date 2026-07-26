const INSTRUCTION_PREFIX = /^\s*(?:try using|say|use)\s*:\s*/iu;
const SLOT_PATTERN = /_+/gu;
const LEXICAL_TOKEN = /[\p{L}\p{N}']+/gu;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function literalPattern(value: string) {
  const words = value.match(LEXICAL_TOKEN) ?? [];
  return words.map(escapeRegex).join("[^\\p{L}\\p{N}']+");
}

export function compileOpenAnswerFrame(
  tier1Hint: string | null | undefined,
): RegExp | null {
  const frame = tier1Hint?.replace(INSTRUCTION_PREFIX, "").trim() ?? "";
  if (!SLOT_PATTERN.test(frame)) return null;
  SLOT_PATTERN.lastIndex = 0;

  const literalTokenCount = (frame.replace(SLOT_PATTERN, " ").match(LEXICAL_TOKEN) ?? [])
    .length;
  SLOT_PATTERN.lastIndex = 0;
  if (literalTokenCount < 3) return null;

  const pieces: string[] = [];
  let cursor = 0;
  for (const match of frame.matchAll(SLOT_PATTERN)) {
    pieces.push(literalPattern(frame.slice(cursor, match.index)));
    pieces.push("[\\p{L}\\p{N}']+(?:[^\\p{L}\\p{N}']+[\\p{L}\\p{N}']+)*");
    cursor = (match.index ?? 0) + match[0].length;
  }
  pieces.push(literalPattern(frame.slice(cursor)));

  return new RegExp(
    `^[^\\p{L}\\p{N}']*${pieces.join("[^\\p{L}\\p{N}']*")}[^\\p{L}\\p{N}']*$`,
    "iu",
  );
}

export function matchesOpenAnswerFrame(
  transcript: string,
  tier1Hint: string | null | undefined,
): boolean {
  return compileOpenAnswerFrame(tier1Hint)?.test(transcript.trim()) ?? false;
}
