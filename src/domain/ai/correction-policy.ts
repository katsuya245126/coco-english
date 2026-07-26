import {
  isParrotedMissionQuestion,
  type CorrectionReason,
} from "@/domain/ai/turn-evaluation";
import type { AnswerShape } from "@/domain/mission/schemas";

export type CorrectionPolicyViolation =
  | "no_op"
  | "parroted_question"
  | "open_choice_changed"
  | "pure_embellishment"
  | "fragment_not_declarative"
  | "fragment_content_lost"
  | "fragment_ungrounded"
  | "fragment_too_long"
  | "target_pattern_padding";

export type ImprovedSentencePolicyInput = {
  evaluationMode: "preset" | "conversation";
  answerShape: AnswerShape;
  missionQuestion: string | null;
  targetPattern: string;
  transcript: string;
  correctionReason: CorrectionReason;
  improvedSentence: string;
};

export type ImprovedSentencePolicyResult =
  | { ok: true }
  | { ok: false; violations: CorrectionPolicyViolation[] };

const WORD = /[\p{L}\p{N}']+/gu;
const DANGLING_END =
  /\b(?:a|an|the|and|but|because|to|am|is|are|was|were|do|does|did|can|will|have|has|at|by|for|from|in|of|on|with)$/iu;
const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "do",
  "does",
  "did",
  "can",
  "will",
  "would",
  "have",
  "has",
  "had",
  "to",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "with",
  "and",
  "but",
  "because",
]);
const FINITE_VERBS = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "can",
  "could",
  "will",
  "would",
  "should",
  "may",
  "might",
  "must",
  "have",
  "has",
  "had",
  "like",
  "likes",
  "play",
  "plays",
  "swim",
  "swims",
  "eat",
  "eats",
  "go",
  "goes",
  "feel",
  "feels",
  "think",
  "thinks",
  "want",
  "wants",
  "need",
  "needs",
  "see",
  "sees",
  "read",
  "reads",
  "watch",
  "watches",
  "visit",
  "visits",
  "study",
  "studies",
  "live",
  "lives",
  "make",
  "makes",
  "run",
  "runs",
  "ride",
  "rides",
  "drink",
  "drinks",
]);

function words(text: string) {
  return text.toLocaleLowerCase("en-US").match(WORD) ?? [];
}

function normalized(text: string) {
  return words(text).join(" ");
}

function contentWords(text: string) {
  return words(text).filter((word) => !FUNCTION_WORDS.has(word));
}

function hasWordSequence(haystack: string[], needle: string[]) {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  return haystack.some((_, start) =>
    needle.every((word, offset) => haystack[start + offset] === word),
  );
}

function extractAlternatives(question: string | null): string[] {
  if (!question) return [];

  const colonIndex = question.indexOf(":");
  const afterColon = colonIndex >= 0 ? question.slice(colonIndex + 1) : "";
  if (afterColon) {
    return afterColon
      .split(/,|\bor\b/iu)
      .map(normalized)
      .filter(Boolean);
  }

  const commaParts = question.replace(/[?!]/gu, "").split(",");
  if (commaParts.length > 1) {
    return commaParts.map(normalized).filter(Boolean);
  }

  const orIndex = question.toLocaleLowerCase("en-US").lastIndexOf(" or ");
  if (orIndex < 0) return [];
  const beforeOr = words(question.slice(0, orIndex)).at(-1);
  const afterOr = words(question.slice(orIndex + 4))[0];
  return [beforeOr, afterOr].filter((value): value is string => Boolean(value));
}

function hasDeclarativeShape(sentence: string) {
  const sentenceWords = words(sentence);
  if (sentenceWords.length < 2) return false;

  const firstWord = sentenceWords[0];
  const hasSubject =
    /^(?:i|you|he|she|it|we|they|this|that|there|my|our|your|his|her|their|a|an|the)$/u.test(
      firstWord,
    ) || /^[a-z\p{L}][\p{L}\p{N}']*$/iu.test(firstWord);
  const hasFiniteVerb = sentenceWords.some((word) => FINITE_VERBS.has(word));
  return hasSubject && hasFiniteVerb;
}

function hasTargetPatternPadding(
  transcript: string,
  improvedSentence: string,
  missionQuestion: string | null,
  targetPattern: string,
) {
  const transcriptWords = new Set(words(transcript));
  const questionWords = new Set(words(missionQuestion ?? ""));
  const targetWords = contentWords(targetPattern);
  const improvedWords = new Set(words(improvedSentence));

  return targetWords.some(
    (word) =>
      !transcriptWords.has(word) &&
      !questionWords.has(word) &&
      improvedWords.has(word),
  );
}

export function validateImprovedSentencePolicy(
  input: ImprovedSentencePolicyInput,
): ImprovedSentencePolicyResult {
  const violations: CorrectionPolicyViolation[] = [];
  const addViolation = (violation: CorrectionPolicyViolation) => {
    if (!violations.includes(violation)) violations.push(violation);
  };

  const transcriptWords = words(input.transcript);
  const improvedWords = words(input.improvedSentence);
  const normalizedTranscript = normalized(input.transcript);
  const normalizedImprovedSentence = normalized(input.improvedSentence);

  if (normalizedTranscript === normalizedImprovedSentence) {
    addViolation("no_op");
  }

  if (
    isParrotedMissionQuestion(input.improvedSentence, input.missionQuestion)
  ) {
    addViolation("parroted_question");
  }

  if (input.answerShape === "open") {
    const alternatives = extractAlternatives(input.missionQuestion);
    const selected = alternatives.filter((alternative) =>
      hasWordSequence(transcriptWords, words(alternative)),
    );
    const introducedDifferentAlternative = alternatives.some(
      (alternative) =>
        hasWordSequence(improvedWords, words(alternative)) &&
        !selected.some((selectedAlternative) => selectedAlternative === alternative),
    );
    const selectedDropped = selected.some(
      (alternative) => !hasWordSequence(improvedWords, words(alternative)),
    );
    if (selected.length > 0 && (selectedDropped || introducedDifferentAlternative)) {
      addViolation("open_choice_changed");
    }
  }

  if (
    transcriptWords.length >= 4 &&
    !DANGLING_END.test(normalizedTranscript) &&
    transcriptWords.length < improvedWords.length &&
    transcriptWords.every((word, index) => improvedWords[index] === word)
  ) {
    addViolation("pure_embellishment");
  }

  if (input.correctionReason === "fragment_completion") {
    const terminatorCount = input.improvedSentence.match(/[.!?]/gu)?.length ?? 0;
    if (
      input.improvedSentence.includes("?") ||
      terminatorCount > 1 ||
      !hasDeclarativeShape(input.improvedSentence)
    ) {
      addViolation("fragment_not_declarative");
    }

    const originalContent = contentWords(input.transcript);
    const improvedContent = new Set(contentWords(input.improvedSentence));
    if (originalContent.some((word) => !improvedContent.has(word))) {
      addViolation("fragment_content_lost");
    }

    const groundedWords = new Set([
      ...contentWords(input.transcript),
      ...contentWords(input.missionQuestion ?? ""),
    ]);
    if (contentWords(input.improvedSentence).some((word) => !groundedWords.has(word))) {
      addViolation("fragment_ungrounded");
    }

    if (improvedWords.length - transcriptWords.length > 5) {
      addViolation("fragment_too_long");
    }

    if (
      hasTargetPatternPadding(
        input.transcript,
        input.improvedSentence,
        input.missionQuestion,
        input.targetPattern,
      )
    ) {
      addViolation("target_pattern_padding");
    }
  }

  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}
