import {
  isPureEmbellishment,
  validateImprovedSentencePolicy,
  type CorrectionPolicyViolation,
} from "@/domain/ai/correction-policy";
import { detectHangulSpans } from "@/domain/audio/hangul-romanization";
import { validateHangulInterpretations } from "@/domain/audio/transcript-interpretation";
import { detectNoSpeech } from "@/domain/audio/no-speech-detection";
import type { OriginalTurnEvaluation } from "@/domain/ai/turn-evaluation";
import type { AnswerShape } from "@/domain/mission/schemas";

export type OriginalEvaluationViolation =
  | "correct_contract_mismatch"
  | "correction_contract_mismatch"
  | "teacher_review_contract_mismatch"
  | "teacher_review_meaning_understood"
  | "english_language_mismatch"
  | "non_english_contract_mismatch"
  | "prompt_echo"
  | "hangul_interpretation_invalid"
  | "hangul_interpretation_missing"
  | CorrectionPolicyViolation;

export type OriginalEvaluationContractInput = {
  evaluation: OriginalTurnEvaluation;
  evaluationMode: "preset" | "conversation";
  answerShape: AnswerShape;
  missionQuestion: string | null;
  targetPattern: string;
  transcript: string;
};

export type OriginalEvaluationContractResult =
  | { ok: true; evaluation: OriginalTurnEvaluation }
  | { ok: false; violations: OriginalEvaluationViolation[] };

function normalizeSentence(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizePromptEchoSentence(value: string) {
  return normalizeSentence(value.replace(/[’]/gu, "'"));
}

const PROMPT_ECHO_LEADING_MARKERS = new Set([
  "ah",
  "er",
  "erm",
  "hm",
  "hmm",
  "oh",
  "uh",
  "uhh",
  "um",
  "umm",
  "well",
  "ok",
  "okay",
]);

function normalizedWords(value: string) {
  const normalized = normalizePromptEchoSentence(value);
  return normalized ? normalized.split(" ") : [];
}

function isPromptEchoWithoutAnswer(
  transcript: string,
  missionQuestion: string | null,
) {
  if (!normalizePromptEchoSentence(transcript) || !missionQuestion?.trim()) {
    return false;
  }

  const promptSegments = missionQuestion.split(/(?<=[.!?])\s+/u);
  const promptWords = promptSegments.map(normalizedWords);
  const transcriptClauses = transcript
    .split(/(?<=[.!?])\s+/u)
    .map(normalizedWords)
    .filter((clause) => clause.length > 0);

  const isEchoClause = (clause: string[]) =>
    promptSegments.some((promptSegment, promptIndex) => {
      if (detectNoSpeech(clause.join(" "), promptSegment) !== "prompt_echo") {
        return false;
      }

      let contentStart = 0;
      while (
        contentStart < clause.length &&
        PROMPT_ECHO_LEADING_MARKERS.has(clause[contentStart])
      ) {
        contentStart += 1;
      }
      const contentWords = clause.slice(contentStart);
      const words = promptWords[promptIndex] ?? [];
      if (contentWords.length === 0 || words.length === 0) return false;

      const exactPromptMatches = words.every(
        (word, offset) => contentWords[offset] === word,
      );
      if (exactPromptMatches) {
        return contentWords.length === words.length;
      }

      // ponytail: fuzzy prompt matching only permits omitted prompt words and
      // consecutive prompt-token stutters before the prompt is complete.
      let promptIndexInWords = 0;
      let transcriptIndex = 0;
      while (transcriptIndex < contentWords.length) {
        if (promptIndexInWords >= words.length) break;
        const matchedPromptIndex = words.indexOf(
          contentWords[transcriptIndex],
          promptIndexInWords,
        );
        if (matchedPromptIndex >= 0) {
          promptIndexInWords = matchedPromptIndex + 1;
          transcriptIndex += 1;
          continue;
        }
        if (
          transcriptIndex > 0 &&
          contentWords[transcriptIndex] === contentWords[transcriptIndex - 1] &&
          words.includes(contentWords[transcriptIndex])
        ) {
          transcriptIndex += 1;
          continue;
        }
        break;
      }
      return transcriptIndex === contentWords.length;
    });

  return (
    transcriptClauses.length > 0 && transcriptClauses.every(isEchoClause)
  );
}

export function canonicalizeNoOpOriginalEvaluation(
  evaluation: OriginalTurnEvaluation,
  transcript: string,
  evaluationMode: "preset" | "conversation" = "preset",
): OriginalTurnEvaluation {
  if (
    evaluation.outcome !== "needs_correction" ||
    !evaluation.correctionNeeded ||
    !evaluation.improvedSentence ||
    (normalizeSentence(evaluation.improvedSentence) !==
      normalizeSentence(transcript) &&
      (evaluationMode !== "conversation" ||
        (evaluation.correctionSeverity !== "minor" &&
          evaluation.correctionReason !== "fragment_completion") ||
        !isPureEmbellishment(transcript, evaluation.improvedSentence)))
  ) {
    return evaluation;
  }

  return {
    ...evaluation,
    outcome: "correct",
    correctionNeeded: false,
    correctionSeverity: "none",
    correctionReason: "none",
    improvedSentence: null,
    reviewReason: null,
  };
}

export function validateOriginalEvaluationContract(
  input: OriginalEvaluationContractInput,
): OriginalEvaluationContractResult {
  const { evaluation } = input;
  const violations: OriginalEvaluationViolation[] = [];

  if (evaluation.outcome === "teacher_review") {
    if (evaluation.meaningUnderstood) {
      violations.push("teacher_review_meaning_understood");
    }
    if (
      evaluation.correctionNeeded ||
      evaluation.correctionSeverity !== "none" ||
      evaluation.correctionReason !== "none" ||
      evaluation.improvedSentence !== null ||
      !evaluation.reviewReason
    ) {
      violations.push("teacher_review_contract_mismatch");
    }
  } else if (evaluation.outcome === "correct") {
    if (
      !evaluation.meaningUnderstood ||
      (input.evaluationMode === "preset" && !evaluation.targetPatternAttempted) ||
      evaluation.correctionNeeded ||
      evaluation.correctionSeverity !== "none" ||
      evaluation.correctionReason !== "none" ||
      evaluation.improvedSentence !== null ||
      evaluation.reviewReason !== null
    ) {
      violations.push("correct_contract_mismatch");
    }
  } else if (evaluation.outcome === "needs_correction") {
    if (
      (input.evaluationMode === "conversation" &&
        !evaluation.meaningUnderstood) ||
      !evaluation.correctionNeeded ||
      evaluation.correctionSeverity === "none" ||
      evaluation.correctionReason === "none" ||
      !evaluation.improvedSentence ||
      evaluation.reviewReason !== null
    ) {
      violations.push("correction_contract_mismatch");
    }
  } else if (
    evaluation.englishLanguage !== "non_english" ||
    evaluation.meaningUnderstood ||
    evaluation.correctionNeeded ||
    evaluation.correctionSeverity !== "none" ||
    evaluation.correctionReason !== "none" ||
    evaluation.improvedSentence !== null ||
    evaluation.reviewReason !== null
  ) {
    violations.push("non_english_contract_mismatch");
  }

  if (
    input.evaluationMode === "conversation" &&
    (evaluation.outcome === "correct" ||
      evaluation.outcome === "needs_correction") &&
    isPromptEchoWithoutAnswer(input.transcript, input.missionQuestion)
  ) {
    violations.push("prompt_echo");
  }

  if (
    (evaluation.outcome === "correct" ||
      evaluation.outcome === "needs_correction") &&
    evaluation.englishLanguage !== "english"
  ) {
    violations.push("english_language_mismatch");
  }

  /*
   * Every Hangul run must be classified exactly once. Routing a shortfall
   * through the existing single repair attempt gives the evaluator one chance
   * to complete the set; if repair also violates the contract the turn goes to
   * teacher review rather than showing the child an unexplained Korean word.
   */
  const interpretationValidation = validateHangulInterpretations(
    input.transcript,
    evaluation.hangulInterpretations,
  );
  if (!interpretationValidation.ok) {
    violations.push(
      interpretationValidation.reason === "coverage_mismatch"
        ? "hangul_interpretation_missing"
        : "hangul_interpretation_invalid",
    );
  }

  if (evaluation.improvedSentence) {
    /*
     * A Hangul transcript the evaluator graded as English is one it resolved
     * via the romanization ("플레이 게임즈" -> play games). The grounding checks
     * compare word forms and so can never match Hangul against the English
     * correction; telling them to stand down is what keeps a correct answer
     * from being thrown out (attempt 77446535, 2026-07-27).
     *
     * Gated on englishLanguage === "english" on purpose: a genuinely Korean
     * answer is "non_english", keeps every check, and still routes to retry.
     */
    const transcriptResolvedFromKorean =
      evaluation.englishLanguage === "english" &&
      detectHangulSpans(input.transcript).length > 0;

    const correction = validateImprovedSentencePolicy({
      evaluationMode: input.evaluationMode,
      answerShape: input.answerShape,
      missionQuestion: input.missionQuestion,
      targetPattern: input.targetPattern,
      transcript: input.transcript,
      correctionReason: evaluation.correctionReason,
      improvedSentence: evaluation.improvedSentence,
      transcriptResolvedFromKorean,
    });
    if (!correction.ok) violations.push(...correction.violations);
  }

  return violations.length === 0
    ? { ok: true, evaluation }
    : { ok: false, violations: [...new Set(violations)] };
}
