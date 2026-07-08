/**
 * Deterministic fast-path for obvious original-answer matches.
 *
 * Pure domain logic: no network calls. Only fires on an exact normalized
 * match against the turn's targetExample — not fuzzy pattern containment,
 * since targetPattern strings include question templates and blanks
 * ("How often do you ____?") that are unsafe to substring-match against a
 * student's spoken answer.
 */

const TERMINAL_PUNCTUATION = /[.!?]+$/g;
const NON_WORD_EXCEPT_APOSTROPHE = /[^\p{L}\p{N}'\s]/gu;

function normalizeForExactMatch(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(TERMINAL_PUNCTUATION, "")
    .replace(NON_WORD_EXCEPT_APOSTROPHE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isExactTargetMatch(transcript: string, targetExample: string) {
  const normalizedTranscript = normalizeForExactMatch(transcript);
  const normalizedTarget = normalizeForExactMatch(targetExample);

  return (
    normalizedTranscript.length > 0 && normalizedTranscript === normalizedTarget
  );
}
