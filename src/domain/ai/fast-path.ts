/**
 * Deterministic fast-paths for obvious original-answer matches.
 *
 * Pure domain logic: no network calls. Only exact target examples bypass
 * semantic evaluation; grammar-shaped open answers still need the mission
 * question to determine whether they are relevant.
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
