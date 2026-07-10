/**
 * Deterministic fast-paths for obvious original-answer matches.
 *
 * Pure domain logic: no network calls. Exact examples and safe,
 * answer-shaped fill-in patterns can be accepted without a non-deterministic
 * model call. Question-shaped templates remain excluded because echoing a
 * question is not an answer.
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

function normalizeForPatternMatch(text: string) {
  return text
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/\bi'm\b/g, "i am")
    .replace(TERMINAL_PUNCTUATION, "")
    .replace(NON_WORD_EXCEPT_APOSTROPHE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleTextPattern(text: string) {
  return escapeRegExp(text).replace(/\s+/g, "\\s+");
}

export function isExactTargetMatch(transcript: string, targetExample: string) {
  const normalizedTranscript = normalizeForExactMatch(transcript);
  const normalizedTarget = normalizeForExactMatch(targetExample);

  return (
    normalizedTranscript.length > 0 && normalizedTranscript === normalizedTarget
  );
}

export function isFillInTargetPatternMatch(
  transcript: string,
  targetPattern: string,
) {
  const normalizedTargetPattern = normalizeForPatternMatch(targetPattern);
  if (
    /\?\s*$/.test(targetPattern) ||
    /^(?:who|what|when|where|why|how|do|does|did|is|are|can|could|would|will)\b/.test(
      normalizedTargetPattern,
    )
  ) {
    return false;
  }

  const rawParts = targetPattern.split(/_{2,}/);
  if (rawParts.length !== 2) return false;

  const [beforeRaw, afterRaw] = rawParts;
  const before = normalizeForPatternMatch(beforeRaw);
  const after = normalizeForPatternMatch(afterRaw);
  if (!before && !after) return false;

  const spaceBeforeSlot = /\s$/.test(beforeRaw) ? "\\s+" : "";
  const spaceAfterSlot = /^\s/.test(afterRaw) ? "\\s+" : "";
  const slot = "\\S+(?:\\s+\\S+)*?";
  const source = [
    "(?:^|\\s)",
    flexibleTextPattern(before),
    spaceBeforeSlot,
    slot,
    spaceAfterSlot,
    flexibleTextPattern(after),
    "(?:$|\\s)",
  ].join("");

  return new RegExp(source, "u").test(normalizeForPatternMatch(transcript));
}
