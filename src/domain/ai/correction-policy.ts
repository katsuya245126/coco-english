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
  | "unsupported_detail"
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
  "my",
  "our",
  "your",
  "his",
  "her",
  "their",
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
const AUXILIARY_VERBS = new Set([
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
]);
const SUBJECT_DETERMINERS = new Set([
  "a",
  "an",
  "the",
  "my",
  "our",
  "your",
  "his",
  "her",
  "their",
]);
const NON_SUBJECT_STARTERS = new Set([
  "and",
  "but",
  "because",
  "to",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "with",
]);
const NON_PREDICATE_WORDS = new Set([
  ...NON_SUBJECT_STARTERS,
  ...SUBJECT_DETERMINERS,
]);
const SUBJECT_PRONOUNS = new Set([
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
]);
const QUESTION_STARTERS = new Set([
  "who",
  "what",
  "when",
  "where",
  "why",
  "how",
  "which",
  "whose",
]);
const BE_VERBS = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
]);
const IRREGULAR_CONTENT_STEMS = new Map([
  ["no", "not"],
  ["not", "not"],
  ["don't", "not"],
  ["doesn't", "not"],
  ["didn't", "not"],
  ["went", "go"],
  ["gone", "go"],
  ["ate", "eat"],
  ["eaten", "eat"],
  ["saw", "see"],
  ["seen", "see"],
  ["ran", "run"],
  ["drank", "drink"],
  ["drunk", "drink"],
  ["rode", "ride"],
  ["ridden", "ride"],
  ["made", "make"],
  ["thought", "think"],
  ["felt", "feel"],
  ["lying", "lie"],
  ["dying", "die"],
  ["tying", "tie"],
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

function inflectionBases(word: string) {
  const bases = new Set([word]);
  const irregularStem = IRREGULAR_CONTENT_STEMS.get(word);
  if (irregularStem) bases.add(irregularStem);

  if (/ies$/u.test(word)) {
    bases.add(word.replace(/ies$/u, "y"));
  } else if (/(?:ches|shes|sses|xes|zes|oes)$/u.test(word)) {
    bases.add(word.replace(/es$/u, ""));
  } else if (/s$/u.test(word) && !/ss$/u.test(word)) {
    bases.add(word.replace(/s$/u, ""));
  }

  const addVerbBases = (stem: string) => {
    if (stem.length < 2) return;
    bases.add(stem);
    bases.add(`${stem}e`);
    if (/(.)\1$/u.test(stem)) bases.add(stem.slice(0, -1));
  };
  if (/ing$/u.test(word)) {
    addVerbBases(word.slice(0, -3));
  }
  if (/ied$/u.test(word)) {
    bases.add(word.replace(/ied$/u, "y"));
  } else if (/ed$/u.test(word)) {
    addVerbBases(word.slice(0, -2));
  }

  return bases;
}

function relatedContentWord(left: string, right: string) {
  const rightBases = inflectionBases(right);
  return [...inflectionBases(left)].some((base) => rightBases.has(base));
}

function includesRelatedWord(wordsToSearch: string[], target: string) {
  return wordsToSearch.some((word) => relatedContentWord(word, target));
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
      .map((part) => normalized(part.replace(/^\s*(?:and|or)\s+/iu, "")))
      .filter(Boolean);
  }

  const commaParts = question.replace(/[?!]/gu, "").split(",");
  if (commaParts.length > 1) {
    const tailAlternatives = commaParts
      .slice(1)
      .map((part) => normalized(part.replace(/^\s*(?:and|or)\s+/iu, "")))
      .filter(Boolean);
    const maxTailWords = Math.max(
      1,
      ...tailAlternatives.map((alternative) => words(alternative).length),
    );
    const firstPartWords = words(commaParts[0] ?? "");
    const firstAlternativeSuffixes = QUESTION_STARTERS.has(
      firstPartWords[0] ?? "",
    )
      ? []
      : Array.from(
          { length: Math.min(maxTailWords, firstPartWords.length) },
          (_, index) => firstPartWords.slice(-(index + 1)).join(" "),
        );
    return [...firstAlternativeSuffixes, ...tailAlternatives];
  }

  const orIndex = question.toLocaleLowerCase("en-US").lastIndexOf(" or ");
  if (orIndex < 0) return [];
  const beforeOr = words(question.slice(0, orIndex)).at(-1);
  const afterOr = words(question.slice(orIndex + 4))[0];
  return [beforeOr, afterOr].filter((value): value is string => Boolean(value));
}

function questionPredicateWords(question: string | null) {
  const questionWords = words(question ?? "");
  const candidates: string[] = [];
  const addCandidate = (candidate: string | undefined) => {
    if (
      candidate &&
      !AUXILIARY_VERBS.has(candidate) &&
      !NON_PREDICATE_WORDS.has(candidate) &&
      !QUESTION_STARTERS.has(candidate)
    ) {
      candidates.push(candidate);
    }
  };

  if (
    questionWords[0] === "who" &&
    !AUXILIARY_VERBS.has(questionWords[1] ?? "")
  ) {
    addCandidate(questionWords[1]);
  }

  questionWords.forEach((word, index) => {
    if (
      SUBJECT_PRONOUNS.has(word) &&
      !AUXILIARY_VERBS.has(questionWords[index - 1] ?? "")
    ) {
      addCandidate(questionWords[index + 1]);
    }

    if (!AUXILIARY_VERBS.has(word)) return;
    const nextWord = questionWords[index + 1];
    const addAuxiliaryPredicate = (candidate: string | undefined) => {
      if (!BE_VERBS.has(word) || /(?:ing|ed)$/u.test(candidate ?? "")) {
        addCandidate(candidate);
      }
    };
    if (SUBJECT_PRONOUNS.has(nextWord ?? "")) {
      addAuxiliaryPredicate(questionWords[index + 2]);
      return;
    }
    if (SUBJECT_DETERMINERS.has(nextWord ?? "")) {
      const boundaryIndex = questionWords.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index + 1 && NON_SUBJECT_STARTERS.has(candidate),
      );
      addAuxiliaryPredicate(
        questionWords[
          boundaryIndex > index + 1 ? boundaryIndex - 1 : questionWords.length - 1
        ],
      );
      return;
    }
    addAuxiliaryPredicate(questionWords[index + 2] ?? nextWord);
  });

  return candidates;
}

function hasDeclarativeShape(sentence: string, missionQuestion: string | null) {
  const sentenceWords = words(sentence);
  if (sentenceWords.length < 2) return false;

  const firstWord = sentenceWords[0];
  if (!firstWord || NON_SUBJECT_STARTERS.has(firstWord)) return false;
  const predicateWords = questionPredicateWords(missionQuestion);
  const hasQuestionPredicate = sentenceWords
    .slice(1)
    .some((word) => includesRelatedWord(predicateWords, word));
  const copulaIndex = sentenceWords
    .slice(1)
    .findIndex((word) => BE_VERBS.has(word)) + 1;
  const hasGroundedCopula =
    sentenceWords.length >= 3 &&
    copulaIndex > 0 &&
    copulaIndex < sentenceWords.length - 1 &&
    words(missionQuestion ?? "").some((word) => BE_VERBS.has(word));

  return hasQuestionPredicate || hasGroundedCopula;
}

function hasTargetPatternPadding(
  transcript: string,
  improvedSentence: string,
  missionQuestion: string | null,
  targetPattern: string,
) {
  const transcriptWords = contentWords(transcript);
  const questionWords = contentWords(missionQuestion ?? "");
  const targetWords = contentWords(targetPattern);
  const improvedWords = contentWords(improvedSentence);

  return targetWords.some(
    (word) =>
      !includesRelatedWord(transcriptWords, word) &&
      !includesRelatedWord(questionWords, word) &&
      includesRelatedWord(improvedWords, word),
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

  if (
    input.evaluationMode === "conversation" &&
    input.correctionReason !== "fragment_completion"
  ) {
    const originalContent = contentWords(input.transcript);
    const improvedContent = contentWords(input.improvedSentence);
    const groundedContent = [
      ...originalContent,
      ...contentWords(input.missionQuestion ?? ""),
    ];
    const questionPredicates = questionPredicateWords(input.missionQuestion);
    const learnerAnchors = originalContent.filter(
      (word) => !includesRelatedWord(questionPredicates, word),
    );
    const unsupportedImproved = improvedContent.filter(
      (word) => !includesRelatedWord(groundedContent, word),
    );
    const lostLearnerAnchor = learnerAnchors.some(
      (word) => !includesRelatedWord(improvedContent, word),
    );

    if (lostLearnerAnchor || unsupportedImproved.length > 0) {
      addViolation("unsupported_detail");
    }
  }

  if (input.correctionReason === "fragment_completion") {
    const terminatorCount = input.improvedSentence.match(/[.!?]/gu)?.length ?? 0;
    if (
      input.improvedSentence.includes("?") ||
      terminatorCount > 1 ||
      !hasDeclarativeShape(input.improvedSentence, input.missionQuestion)
    ) {
      addViolation("fragment_not_declarative");
    }

    const originalContent = contentWords(input.transcript);
    const improvedContent = contentWords(input.improvedSentence);
    if (
      originalContent.some(
        (word) => !includesRelatedWord(improvedContent, word),
      )
    ) {
      addViolation("fragment_content_lost");
    }

    const groundedWords = [
      ...contentWords(input.transcript),
      ...contentWords(input.missionQuestion ?? ""),
    ];
    if (
      contentWords(input.improvedSentence).some(
        (word) => !includesRelatedWord(groundedWords, word),
      )
    ) {
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
