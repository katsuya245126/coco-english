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
   * Teacher-authored topic text for anchoring (mission title + target
   * pattern). Empty means no topic anchor is available.
   */
  topicSeed?: string | null;
};

/**
 * Content words (length >= 4, lowercased) usable as topic anchors.
 * Derived from the teacher-authored snapshot fields only.
 */
export function topicAnchorWords(topicSeed: string | null | undefined): string[] {
  const normalized = (topicSeed ?? "").toLocaleLowerCase("en-US");
  const words = normalized.match(/[a-z]{4,}/gu) ?? [];
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

/**
 * Recovery accepts open WH questions and simple yes/no or two-choice
 * scaffolds (the generation policy allows both for recovery), so an
 * auxiliary-led question counts as a valid shape. Only a candidate that is
 * neither WH- nor auxiliary-led fails the shape check.
 */
const AUXILIARY_LEAD_PATTERN =
  /^(?:is|are|am|can|could|do|does|did|will|would|have|has|was|were)\b/iu;

export function validateRecoveryPivotQuestion(
  candidate: string,
  input: RecoveryPivotInput & { previouslyAsked?: string[] },
): { ok: true } | { ok: false; reasons: RecoveryPivotViolation[] } {
  const reasons: RecoveryPivotViolation[] = [];
  const trimmed = candidate.trim();
  if (!trimmed.endsWith("?")) reasons.push("not_question");

  const candidateWord = leadingQuestionWord(trimmed);
  if (
    candidateWord === null &&
    !AUXILIARY_LEAD_PATTERN.test(trimmed)
  ) {
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
 * Deterministic fallback pivot. Guaranteed to satisfy
 * validateRecoveryPivotQuestion by construction:
 * - the future-plan family yields a WH pivot different from the failed word,
 * - otherwise the scaffold is auxiliary-led and embeds a short topic phrase
 *   derived from the seed so the topic anchor check passes,
 * - both contain phrasing that cannot verbatim-match any authored question
 *   already asked.
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

  const anchors = topicAnchorWords(input.topicSeed);
  if (anchors.length > 0) {
    // A two-word noun phrase reads naturally aloud; the raw teacher title
    // ("Summer Vacation Free Talking Homework") does not.
    const phrase = anchors.slice(0, 2).join(" ");
    const phraseCapitalized =
      phrase.charAt(0).toLocaleUpperCase("en-US") + phrase.slice(1);
    return `Can you tell me one more thing about ${phraseCapitalized}?`;
  }
  return "Can you tell me one more thing about that?";
}
