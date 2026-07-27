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
/**
 * Base-form verbs common in beginner ESL answers, used only as positive
 * evidence that a completion has a predicate (see hasDeclarativeShape).
 *
 * Deliberately a closed list rather than morphology: English bare verbs are
 * indistinguishable from nouns by shape ("play", "swim", "cook", "watch" are
 * all both), so guessing would readmit the subject-plus-noun fragments this
 * guard exists to reject. Missing a verb here is safe — it only falls back to
 * the question-predicate and copula checks, which is the pre-existing
 * behavior.
 */
const KNOWN_VERBS = new Set([
  "play", "go", "eat", "drink", "read", "write", "watch", "swim", "run",
  "walk", "sleep", "study", "cook", "draw", "sing", "dance", "jump", "ride",
  "like", "love", "want", "need", "have", "make", "take", "see", "look",
  "come", "get", "give", "help", "learn", "live", "meet", "buy", "visit",
  "talk", "speak", "say", "tell", "ask", "think", "know", "feel", "work",
  "start", "finish", "practice", "travel", "wear", "clean", "wash", "open",
  "close", "listen", "climb", "build", "paint", "fish", "camp", "hike",
  "rest", "relax", "enjoy", "stay", "sit", "stand", "hold", "find", "keep",
  "bring", "send", "call", "use", "try", "wait", "show", "put", "let",
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

/**
 * Contractions expand to their component words before any policy check runs.
 *
 * WORD keeps apostrophes, so "I'm" tokenized as the single token "i'm", which
 * is in neither FUNCTION_WORDS nor any transcript/question. contentWords()
 * therefore kept it as a *content* word that could never be grounded, and
 * "I'm going to play games." was reported as both fragment_ungrounded and
 * target_pattern_padding while the identical "I am going to play games."
 * passed clean (attempt 2b496b6d, 2026-07-27).
 *
 * That made every fragment completion toward a contracted target pattern —
 * such as this project's "I'm going to ________" — unsatisfiable, so the turn
 * exhausted its retries and surfaced to the child as "I didn't understand
 * that."
 *
 * Expanding here rather than adding "i'm" to FUNCTION_WORDS is deliberate: the
 * expansion also restores the real content word in cases like "don't" -> "not",
 * which IRREGULAR_CONTENT_STEMS already expects to see.
 */
const CONTRACTIONS = new Map([
  ["i'm", ["i", "am"]],
  ["you're", ["you", "are"]],
  ["we're", ["we", "are"]],
  ["they're", ["they", "are"]],
  ["he's", ["he", "is"]],
  ["she's", ["she", "is"]],
  ["it's", ["it", "is"]],
  ["that's", ["that", "is"]],
  ["i've", ["i", "have"]],
  ["you've", ["you", "have"]],
  ["we've", ["we", "have"]],
  ["they've", ["they", "have"]],
  ["i'll", ["i", "will"]],
  ["you'll", ["you", "will"]],
  ["we'll", ["we", "will"]],
  ["they'll", ["they", "will"]],
  ["i'd", ["i", "would"]],
  ["you'd", ["you", "would"]],
  ["don't", ["do", "not"]],
  ["doesn't", ["does", "not"]],
  ["didn't", ["did", "not"]],
  ["isn't", ["is", "not"]],
  ["aren't", ["are", "not"]],
  ["wasn't", ["was", "not"]],
  ["weren't", ["were", "not"]],
  ["can't", ["can", "not"]],
  ["won't", ["will", "not"]],
  ["let's", ["let", "us"]],
]);

function words(text: string) {
  const tokens = text.toLocaleLowerCase("en-US").match(WORD) ?? [];
  return tokens.flatMap((token) => CONTRACTIONS.get(token) ?? [token]);
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

  /*
   * A clause is declarative when it has a verb — not when it happens to reuse
   * the mission question's verb.
   *
   * The two checks above only recognize a predicate that echoes the question
   * (or a copula the question also uses), so "I swim." for "What do you like
   * to do?" was reported as fragment_not_declarative while the stilted "I want
   * to swim." passed. Combined with the contraction bug fixed in words(), that
   * left short child answers with no legal completion at all.
   *
   * The verb evidence below is additive: every case the original two checks
   * accepted still passes. It only adds a third way to be declarative, so the
   * subject-plus-noun fragments this guard exists to catch ("I pasta.",
   * "I dinner.", "My car red.") still have no verb and stay rejected.
   */
  const hasOwnVerb = sentenceWords
    .slice(1)
    .some(
      (word, index) =>
        AUXILIARY_VERBS.has(word) ||
        // A to-infinitive ("I want to play") marks the preceding word as a
        // verb; the infinitive itself is covered by the suffix test below.
        sentenceWords[index + 2] === "to" ||
        KNOWN_VERBS.has(word) ||
        [...inflectionBases(word)].some((base) => KNOWN_VERBS.has(base)) ||
        // Inflections that only ever attach to verbs. Bare "-s" is excluded on
        // purpose: it is ambiguous with plural nouns ("I games."), and the
        // third-person cases in the suite ("cooks", "likes", "goes") are
        // already grounded by the question predicate.
        //
        // The length floor keeps short words whose ending merely *looks*
        // inflected from counting: "red" is an adjective, not the past tense
        // of "r" ("My car red." must stay a fragment).
        (/ing$/u.test(word) && word.length > 5) ||
        (/ed$/u.test(word) && word.length > 4),
    );

  return hasQuestionPredicate || hasGroundedCopula || hasOwnVerb;
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
    /*
     * Grounding is about invented *facts*, not invented grammar.
     *
     * Completing a fragment necessarily supplies the verb the child omitted:
     * "Inside." -> "I play inside." must add "play", and no rule can require
     * that verb to already appear in the transcript or the question. Requiring
     * it made well-formed completions unsatisfiable, which is what surfaced to
     * the child as "I didn't understand that."
     *
     * Only the supplied predicate is exempt. Every other content word — the
     * nouns and modifiers that carry what the student actually claimed — still
     * has to be grounded, so Coco still cannot invent a detail.
     */
    const suppliedVerb = (word: string) =>
      KNOWN_VERBS.has(word) ||
      [...inflectionBases(word)].some((base) => KNOWN_VERBS.has(base));
    if (
      contentWords(input.improvedSentence).some(
        (word) => !includesRelatedWord(groundedWords, word) && !suppliedVerb(word),
      )
    ) {
      addViolation("fragment_ungrounded");
    }

    if (improvedWords.length - transcriptWords.length > 5) {
      addViolation("fragment_too_long");
    }

    /*
     * Conversation mode does not police the target pattern.
     *
     * The check exists to stop a preset mission from shoehorning its pattern
     * into an answer the child never gave. In free-talking conversation the
     * pattern is not something the student is being held to — the product
     * decision (2026-07-27) is that free talking is allowed to drift off it —
     * yet the check still fired on any completion that used a pattern word
     * absent from the question, which for "I'm going to ________" meant every
     * natural completion of a short answer was a violation.
     */
    if (
      input.evaluationMode !== "conversation" &&
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
