/**
 * Deterministic minimal-effort answer detector (phone-UAT item 6).
 *
 * Pure module — exact normalized match against a small blocklist only, so a
 * legitimate short answer ("with my friend", "I'm fine.") can never be
 * flagged. Word-count or LLM-judged effort was explicitly rejected
 * (design approval 2026-07-20).
 */

/** After this many blocks on one turn, the answer evaluates normally (D-04). */
export const MAX_MINIMAL_EFFORT_BLOCKS = 2;

const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

const MINIMAL_EFFORT_ANSWERS = new Set([
  "yes",
  "no",
  "yeah",
  "yep",
  "yup",
  "nope",
  "nah",
  "ok",
  "okay",
  "maybe",
  "i dont know",
  "dont know",
  "i dunno",
  "dunno",
  "idk",
]);

function normalizeForDetection(text: string) {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[’‘']/gu, "") // "don't" -> "dont", keeping it one token
    .replace(NON_ALPHANUMERIC, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isMinimalEffortAnswer(transcript: string): boolean {
  const normalized = normalizeForDetection(transcript);
  if (!normalized) return false;
  return MINIMAL_EFFORT_ANSWERS.has(normalized);
}
