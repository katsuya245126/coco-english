/**
 * W-pivot recovery question (2026-08-22 recovery ladder, PR #61 follow-up).
 *
 * When a student's answer cannot be understood twice, Coco asks about the
 * same topic with a different interrogative ("What are you going to do
 * during summer vacation?" -> "Where are you going during summer
 * vacation?") instead of repeating any already-asked question.
 *
 * The AI-first path generates the pivot and this module validates it
 * deterministically; when generation fails or the candidate breaks a rule,
 * buildDeterministicPivotQuestion supplies a grammar-safe pivot seeded from
 * the mission's topic fields. Everything here is pure and deterministic so
 * tests need no AI calls.
 */

export const RECOVERY_QUESTION_WORDS = [
  "what",
  "who",
  "when",
  "where",
  "why",
  "how",
] as const;

export type RecoveryQuestionWord = (typeof RECOVERY_QUESTION_WORDS)[number];

const NON_TOPIC_ANCHOR_WORDS = new Set(
  `what who when where why how am is are was were be been being do does did have has had can could will would shall should may might must going often i you he she it we they me him her us them my your his its our their mine yours hers ours theirs this that these those a an the about after against among around at as before behind below beside between beyond by during except for from in inside into near of on outside over through to toward under upon with within without please like play say tell rather because homework mission practice scene free talking one more thing answer`.split(
    /\s+/u,
  ),
);

const QUESTION_WORD_PATTERN = new RegExp(
  `^["'“”\\s]*(?:okay|ok|alright|so|well[,:]?\\s+)?(${RECOVERY_QUESTION_WORDS.join("|")})\\b`,
  "iu",
);

export function leadingQuestionWord(question: string): RecoveryQuestionWord | null {
  const match = QUESTION_WORD_PATTERN.exec(question.trim());
  if (!match) return null;
  return match[1]?.toLocaleLowerCase("en-US") as RecoveryQuestionWord | null;
}

/**
 * The interrogative the AI-generated pivot must lead with: always different
 * from the failed question's word so the retry changes the angle.
 */
export function pickRecoveryPivotWord(
  failedWord: RecoveryQuestionWord | null,
): RecoveryQuestionWord {
  const preference: RecoveryQuestionWord[] = [
    "where",
    "who",
    "when",
    "why",
    "how",
  ];
  return preference.find((word) => word !== failedWord) ?? "how";
}

export type RecoveryPivotInput = {
  /** The question the student just failed to answer understandably. */
  failedQuestion: string;
  /**
   * Teacher-authored target/question text for anchoring. Empty means no topic
   * anchor is available.
   */
  topicSeed?: string | null;
  /** Questions already asked in this attempt, used to avoid verbatim repeats. */
  previouslyAsked?: string[];
};

/**
 * Content words (length >= 4, lowercased) usable as topic anchors.
 * Derived from the teacher-authored snapshot fields only.
 */
export function topicAnchorWords(topicSeed: string | null | undefined): string[] {
  const normalized = (topicSeed ?? "").toLocaleLowerCase("en-US");
  const words = (normalized.match(/[a-z]{4,}/gu) ?? []).filter(
    (word) => !NON_TOPIC_ANCHOR_WORDS.has(word),
  );
  const unique = new Set(words);
  return [...unique];
}

function normalizeQuestionText(question: string): string {
  return question
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .replace(/^(okay|ok|alright|so|well)[,:]\s+/u, "");
}

export type RecoveryPivotViolation =
  | "not_question"
  | "missing_question_word"
  | "same_question_word"
  | "repeats_asked_question"
  | "off_topic";

export function validateRecoveryPivotQuestion(
  candidate: string,
  input: RecoveryPivotInput,
): { ok: true } | { ok: false; reasons: RecoveryPivotViolation[] } {
  const reasons: RecoveryPivotViolation[] = [];
  const trimmed = candidate.trim();
  if (!trimmed.endsWith("?")) reasons.push("not_question");

  const candidateWord = leadingQuestionWord(trimmed);
  if (candidateWord === null) {
    reasons.push("missing_question_word");
  } else {
    const failedWord = leadingQuestionWord(input.failedQuestion);
    if (
      candidateWord !== null &&
      failedWord !== null &&
      candidateWord === failedWord
    ) {
      reasons.push("same_question_word");
    }
  }

  const asked = new Set(
    [input.failedQuestion, ...(input.previouslyAsked ?? [])]
      .map((question) => normalizeQuestionText(question))
      .filter(Boolean),
  );
  if (asked.has(normalizeQuestionText(trimmed))) {
    reasons.push("repeats_asked_question");
  }

  const anchors = topicAnchorWords(input.topicSeed);
  if (anchors.length > 0) {
    const candidateWords = new Set(
      (trimmed.toLocaleLowerCase("en-US").match(/[a-z]+/gu) ?? []),
    );
    const grounded = anchors.some((anchor) => candidateWords.has(anchor));
    if (!grounded) reasons.push("off_topic");
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * Deterministic pivot for the canonical future-plan opener ("What are you
 * going to do ... ?"), where dropping "to do" yields correct grammar:
 * "What are you going to do during summer vacation?" ->
 * "Where are you going during summer vacation?".
 */
function buildFuturePlanPivot(failedQuestion: string): string | null {
  const match = /^what\s+are\s+you\s+going\s+to\s+do\b(.*)$/iu.exec(
    failedQuestion.trim(),
  );
  if (!match) return null;
  let tail = (match[1] ?? "").trim().replace(/[.?!\s]+$/u, "");
  tail = tail ? ` ${tail}` : "";
  return `Where are you going${tail}?`;
}

/**
 * Deterministic fallback pivot:
 * - the future-plan family yields a WH pivot different from the failed word
 *   and is validated against the supplied topic,
 * - otherwise an ordered set of short, topic-grounded WH questions is tried
 *   until one is grammatical, changes the failed W, and is not a repeat;
 *   finite-history word-count variants keep searching if all templates repeat.
 */
export function buildDeterministicPivotQuestion(
  input: RecoveryPivotInput,
): string {
  const futurePlanPivot = buildFuturePlanPivot(input.failedQuestion);
  if (
    futurePlanPivot &&
    validateRecoveryPivotQuestion(futurePlanPivot, input).ok
  ) {
    return futurePlanPivot;
  }

  const anchors = topicAnchorWords(input.topicSeed).slice(0, 2);
  const topic = anchors.length > 0
    ? `the topic "${anchors.join(" ")}"`
    : "your answer";
  const candidates = [
    `What can you tell me about ${topic}?`,
    `Who do you talk to about ${topic}?`,
    `When do you talk about ${topic}?`,
    `Where do you talk about ${topic}?`,
    `Why is ${topic} interesting to you?`,
    `How do you feel about ${topic}?`,
  ];

  const firstValidTemplate = candidates.find((candidate) =>
    validateRecoveryPivotQuestion(candidate, input).ok,
  );
  if (firstValidTemplate) return firstValidTemplate;

  const fallbackBase =
    leadingQuestionWord(input.failedQuestion) === "what"
      ? `How do you feel about ${topic}`
      : `What can you tell me about ${topic}`;
  for (let wordCount = 3; ; wordCount += 1) {
    const candidate = `${fallbackBase} in ${wordCount} words?`;
    if (validateRecoveryPivotQuestion(candidate, input).ok) return candidate;
  }
}
