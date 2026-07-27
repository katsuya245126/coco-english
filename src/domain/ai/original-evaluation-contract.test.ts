import { describe, expect, it } from "vitest";
import type { OriginalTurnEvaluation } from "@/domain/ai/turn-evaluation";
import {
  canonicalizeNoOpOriginalEvaluation,
  validateOriginalEvaluationContract,
} from "@/domain/ai/original-evaluation-contract";

const baseEvaluation: OriginalTurnEvaluation = {
  version: "ai-eval-v1",
  outcome: "correct",
  meaningUnderstood: true,
  targetPatternAttempted: true,
  correctionNeeded: false,
  correctionSeverity: "none",
  correctionReason: "none",
  improvedSentence: null,
  englishLanguage: "english",
  confidence: "high",
  reviewReason: null,
  policyVersion: "natural-conversation-v1",
  evaluationModel: "test-evaluator",
  evaluationSource: "model",
  transcriptionModel: "test-transcriber",
  transcriptionConfidence: null,
  runtimeVersion: "test-runtime",
};

describe("original evaluation contract", () => {
  it("canonicalizes an identical minor correction to no correction", () => {
    expect(
      canonicalizeNoOpOriginalEvaluation(
        {
          ...baseEvaluation,
          outcome: "needs_correction",
          correctionNeeded: true,
          correctionSeverity: "minor",
          correctionReason: "grammar",
          improvedSentence: "I am going to the beach.",
        },
        "I am going to the beach.",
      ),
    ).toMatchObject({
      outcome: "correct",
      correctionNeeded: false,
      correctionSeverity: "none",
      correctionReason: "none",
      improvedSentence: null,
      reviewReason: null,
    });
  });

  it("does not canonicalize an identical sentence on a review outcome", () => {
    const review = {
      ...baseEvaluation,
      outcome: "teacher_review" as const,
      meaningUnderstood: false,
      correctionNeeded: true,
      correctionSeverity: "minor" as const,
      correctionReason: "grammar" as const,
      improvedSentence: "I am going to the beach.",
      reviewReason: "ambiguous" as const,
    };

    expect(
      canonicalizeNoOpOriginalEvaluation(
        review,
        "I am going to the beach.",
      ),
    ).toEqual(review);
  });

  it("rejects understood high-confidence ambiguous review", () => {
    expect(
      validateOriginalEvaluationContract({
        evaluation: {
          ...baseEvaluation,
          outcome: "teacher_review",
          meaningUnderstood: true,
          confidence: "high",
          reviewReason: "ambiguous",
        },
        evaluationMode: "conversation",
        answerShape: "open",
        missionQuestion: "What will you do at the beach?",
        targetPattern: "I'm going to ________",
        transcript: "I will swimming and my family eat 삼겹살.",
      }),
    ).toEqual({
      ok: false,
      violations: ["teacher_review_meaning_understood"],
    });
  });

  it("rejects correction fields that conflict with a correct outcome", () => {
    expect(
      validateOriginalEvaluationContract({
        evaluation: {
          ...baseEvaluation,
          correctionNeeded: true,
          correctionSeverity: "minor",
          correctionReason: "grammar",
          improvedSentence: "I am going to the beach.",
        },
        evaluationMode: "conversation",
        answerShape: "open",
        missionQuestion: "Where are you going?",
        targetPattern: "I'm going to ________",
        transcript: "I going to beach.",
      }),
    ).toMatchObject({
      ok: false,
      violations: expect.arrayContaining(["correct_contract_mismatch"]),
    });
  });

  it("rejects a correct outcome labeled as non-English", () => {
    expect(
      validateOriginalEvaluationContract({
        evaluation: {
          ...baseEvaluation,
          englishLanguage: "non_english",
        },
        evaluationMode: "conversation",
        answerShape: "open",
        missionQuestion: "What will you do at the beach?",
        targetPattern: "I'm going to ________",
        transcript: "I will swim.",
      }),
    ).toEqual({
      ok: false,
      violations: ["english_language_mismatch"],
    });
  });

  it("rejects a non-English outcome with understood English fields", () => {
    expect(
      validateOriginalEvaluationContract({
        evaluation: {
          ...baseEvaluation,
          outcome: "non_english",
        },
        evaluationMode: "conversation",
        answerShape: "open",
        missionQuestion: "What will you do at the beach?",
        targetPattern: "I'm going to ________",
        transcript: "I will swim.",
      }),
    ).toEqual({
      ok: false,
      violations: ["non_english_contract_mismatch"],
    });
  });

  it("accepts a coherent non-English outcome", () => {
    const evaluation = {
      ...baseEvaluation,
      outcome: "non_english" as const,
      meaningUnderstood: false,
      targetPatternAttempted: false,
      englishLanguage: "non_english" as const,
    };

    expect(
      validateOriginalEvaluationContract({
        evaluation,
        evaluationMode: "conversation",
        answerShape: "open",
        missionQuestion: "What will you do at the beach?",
        targetPattern: "I'm going to ________",
        transcript: "바다에 갈 거예요.",
      }),
    ).toEqual({ ok: true, evaluation });
  });

  describe("Hangul transcripts the evaluator read as English", () => {
    // Regression: attempt 77446535 (2026-07-27). The transcriber wrote accented
    // English as Hangul ("플레이 게임즈" = "play games"). The evaluator resolved it
    // correctly, but the correction policy compares word forms and Hangul never
    // matches Latin, so the correct completion was rejected as
    // fragment_content_lost + fragment_ungrounded and the child was told
    // "I didn't hear you well."
    const correction = {
      ...baseEvaluation,
      outcome: "needs_correction" as const,
      correctionNeeded: true,
      correctionSeverity: "material" as const,
      correctionReason: "fragment_completion" as const,
      improvedSentence: "I play games.",
    };

    it("accepts the correction when the answer was graded as English", () => {
      expect(
        validateOriginalEvaluationContract({
          evaluation: correction,
          evaluationMode: "conversation",
          answerShape: "open",
          missionQuestion:
            "What fun things do you want to do this summer vacation?",
          targetPattern: "I'm going to ________",
          transcript: "플레이 게임즈",
        }),
      ).toEqual({ ok: true, evaluation: correction });
    });

    it("does not relax grounding for an all-Latin transcript", () => {
      // The relaxation is keyed on Hangul being present, so an ordinary
      // English transcript keeps every check and invented detail still fails.
      const invented = { ...correction, improvedSentence: "I play games with my brother." };
      const result = validateOriginalEvaluationContract({
        evaluation: invented,
        evaluationMode: "conversation",
        answerShape: "open",
        missionQuestion:
          "What fun things do you want to do this summer vacation?",
        targetPattern: "I'm going to ________",
        transcript: "Play games.",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.violations).toContain("fragment_ungrounded");
      }
    });
  });
});
