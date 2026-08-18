export type ReviewTextPart = {
  text: string;
  changed: boolean;
};

const TOKEN_PATTERN =
  /\p{L}+(?:['’]\p{L}+)*|\p{N}+|[^\p{L}\p{N}\s]+|\s+/gu;
const LEXICAL_PATTERN = /^[\p{L}\p{N}]/u;

function tokenize(text: string) {
  return text.match(TOKEN_PATTERN) ?? [];
}

function normalized(token: string) {
  return token.toLocaleLowerCase("en-US").replace(/[’‘]/gu, "'");
}

export function buildImprovedSentenceParts(
  original: string,
  improved: string,
): ReviewTextPart[] {
  const originalTokens = tokenize(original.trim());
  const improvedTokens = tokenize(improved.trim());
  const originalWords = originalTokens.filter((token) =>
    LEXICAL_PATTERN.test(token),
  );
  const improvedWordEntries = improvedTokens.flatMap((token, tokenIndex) =>
    LEXICAL_PATTERN.test(token) ? [{ token, tokenIndex }] : [],
  );

  if (!originalWords.length || !improvedWordEntries.length) {
    return improved.trim()
      ? [{ text: improved.trim(), changed: true }]
      : [];
  }

  const rows = originalWords.length + 1;
  const columns = improvedWordEntries.length + 1;
  const lcs = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  );
  // Out-of-range reads are the DP boundary: the LCS of an empty suffix is 0.
  const lcsAt = (left: number, right: number) => lcs[left]?.[right] ?? 0;

  for (let left = originalWords.length - 1; left >= 0; left -= 1) {
    const row = lcs[left];
    const originalWord = originalWords[left];
    if (!row || originalWord === undefined) continue;
    for (let right = improvedWordEntries.length - 1; right >= 0; right -= 1) {
      const entry = improvedWordEntries[right];
      if (entry === undefined) continue;
      row[right] =
        normalized(originalWord) === normalized(entry.token)
          ? 1 + lcsAt(left + 1, right + 1)
          : Math.max(lcsAt(left + 1, right), lcsAt(left, right + 1));
    }
  }

  const unchangedTokenIndexes = new Set<number>();
  let left = 0;
  let right = 0;
  while (left < originalWords.length && right < improvedWordEntries.length) {
    const originalWord = originalWords[left];
    const entry = improvedWordEntries[right];
    if (originalWord === undefined || entry === undefined) break;
    if (normalized(originalWord) === normalized(entry.token)) {
      unchangedTokenIndexes.add(entry.tokenIndex);
      left += 1;
      right += 1;
    } else if (lcsAt(left + 1, right) >= lcsAt(left, right + 1)) {
      left += 1;
    } else {
      right += 1;
    }
  }

  return improvedTokens.map((text, tokenIndex) => ({
    text,
    changed:
      LEXICAL_PATTERN.test(text) && !unchangedTokenIndexes.has(tokenIndex),
  }));
}
