export type NoSpeechReason = "prompt_echo" | "known_hallucination";

const MIN_PROMPT_OVERLAP_WORDS = 5;
const PROMPT_OVERLAP_THRESHOLD = 0.7;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

const KNOWN_HALLUCINATIONS = new Set([
  "thank you for watching",
  "thanks for watching",
  "subtitles by the amara org community",
  "please subscribe",
  "see you in the next video",
]);

function normalizeForDetection(text: string) {
  return text
    .toLocaleLowerCase("en-US")
    .replace(NON_ALPHANUMERIC, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function detectNoSpeech(
  transcript: string,
  promptText: string,
): NoSpeechReason | null {
  const normalizedTranscript = normalizeForDetection(transcript);
  if (!normalizedTranscript) return null;

  const normalizedPrompt = normalizeForDetection(promptText);
  if (normalizedPrompt) {
    if (normalizedTranscript.includes(normalizedPrompt)) {
      return "prompt_echo";
    }

    const transcriptWords = normalizedTranscript.split(" ");
    if (transcriptWords.length >= MIN_PROMPT_OVERLAP_WORDS) {
      const promptWords = new Set(normalizedPrompt.split(" "));
      const overlappingTranscriptWords = transcriptWords.filter((word) =>
        promptWords.has(word),
      ).length;
      const transcriptWordSet = new Set(transcriptWords);
      const overlappingPromptWords = [...promptWords].filter((word) =>
        transcriptWordSet.has(word),
      ).length;
      if (
        overlappingTranscriptWords / transcriptWords.length >=
          PROMPT_OVERLAP_THRESHOLD &&
        overlappingPromptWords / promptWords.size >= PROMPT_OVERLAP_THRESHOLD
      ) {
        return "prompt_echo";
      }
    }
  }

  return KNOWN_HALLUCINATIONS.has(normalizedTranscript)
    ? "known_hallucination"
    : null;
}
