import {
  validateImprovedSentencePolicy,
  type CorrectionPolicyViolation,
} from "@/domain/ai/correction-policy";
import { detectHangulSpans } from "@/domain/audio/hangul-romanization";
import type { OriginalTurnEvaluation } from "@/domain/ai/turn-evaluation";
import type { AnswerShape } from "@/domain/mission/schemas";

export type OriginalEvaluationViolation =
  | "correct_contract_mismatch"
  | "correction_contract_mismatch"
  | "teacher_review_contract_mismatch"
  | "teacher_review_meaning_understood"
  | "english_language_mismatch"
  | "non_english_contract_mismatch"
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

export function canonicalizeNoOpOriginalEvaluation(
  evaluation: OriginalTurnEvaluation,
  transcript: string,
): OriginalTurnEvaluation {
  if (
    evaluation.outcome !== "needs_correction" ||
    !evaluation.correctionNeeded ||
    !evaluation.improvedSentence ||
    normalizeSentence(evaluation.improvedSentence) !==
      normalizeSentence(transcript)
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
    (evaluation.outcome === "correct" ||
      evaluation.outcome === "needs_correction") &&
    evaluation.englishLanguage !== "english"
  ) {
    violations.push("english_language_mismatch");
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
