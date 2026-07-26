const INCOMPLETE_UTTERANCES = new Set([
  "i",
  "a",
  "an",
  "the",
  "and",
  "but",
  "because",
  "to",
]);

function normalizeIncompleteCandidate(transcript: string) {
  return transcript
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isIncompleteUtterance(transcript: string): boolean {
  return INCOMPLETE_UTTERANCES.has(normalizeIncompleteCandidate(transcript));
}
