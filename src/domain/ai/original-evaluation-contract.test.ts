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
});
