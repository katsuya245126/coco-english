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
  hangulInterpretations: [],
};

describe("original evaluation contract", () => {
  const correction = (improvedSentence: string) => ({
    ...baseEvaluation,
    outcome: "needs_correction" as const,
    correctionNeeded: true,
    correctionSeverity: "minor" as const,
    correctionReason: "grammar" as const,
    improvedSentence,
  });

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

  it.each([
    ["I make sandcastles at the beach.", "I make sandcastles."],
    ["I use a shovel at the beach.", "I use a shovel."],
  ])("canonicalizes an optional-detail addition: %s", (improvedSentence, transcript) => {
    expect(
      canonicalizeNoOpOriginalEvaluation(
        correction(improvedSentence),
        transcript,
        "conversation",
      ),
    ).toMatchObject({
      outcome: "correct",
      correctionNeeded: false,
      improvedSentence: null,
    });
  });

  it("canonicalizes the logged material fragment-completion label when it only appends optional detail", () => {
    expect(
      canonicalizeNoOpOriginalEvaluation(
        {
          ...correction("I make sandcastles at the beach."),
          correctionSeverity: "material",
          correctionReason: "fragment_completion",
        },
        "I make sandcastles.",
        "conversation",
      ),
    ).toMatchObject({
      outcome: "correct",
      correctionNeeded: false,
      correctionSeverity: "none",
      correctionReason: "none",
      improvedSentence: null,
    });
  });

  it("preserves optional-detail corrections in preset mode", () => {
    const evaluation = {
      ...correction("I make sandcastles at the beach."),
      correctionSeverity: "material" as const,
      correctionReason: "fragment_completion" as const,
    };

    expect(
      canonicalizeNoOpOriginalEvaluation(
        evaluation,
        "I make sandcastles.",
        "preset",
      ),
    ).toEqual(evaluation);
  });

  it("rejects an open-preset correction that invents the learner's choice and reason", () => {
    const evaluation = {
      ...correction("I'd rather live in a small city because it is quieter."),
      correctionSeverity: "material" as const,
    };
    const result = validateOriginalEvaluationContract({
      evaluation,
      evaluationMode: "preset",
      answerShape: "open",
      missionQuestion:
        "Would you rather live in a big city or a small town? Why?",
      targetPattern: "I'd rather _____ because _____",
      transcript: "I like leather because more thin.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContain("unsupported_detail");
    }
  });

  it("keeps a real grammar correction as needs_correction", () => {
    expect(
      canonicalizeNoOpOriginalEvaluation(
        correction("I like puns."),
        "I like pun.",
      ),
    ).toMatchObject({
      outcome: "needs_correction",
      correctionNeeded: true,
      improvedSentence: "I like puns.",
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
          hangulInterpretations: [
            { hangul: "삼겹살", kind: "name" as const, englishReading: null },
          ],
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

  it("rejects a correct preset outcome that did not attempt the target pattern", () => {
    expect(
      validateOriginalEvaluationContract({
        evaluation: {
          ...baseEvaluation,
          targetPatternAttempted: false,
        },
        evaluationMode: "preset",
        answerShape: "open",
        missionQuestion: "What will you do tomorrow?",
        targetPattern: "I will ___.",
        transcript: "I like soccer.",
      }),
    ).toEqual({
      ok: false,
      violations: ["correct_contract_mismatch"],
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
      hangulInterpretations: [
        { hangul: "바다에", kind: "korean_vocabulary" as const, englishReading: null },
        { hangul: "갈", kind: "korean_vocabulary" as const, englishReading: null },
        { hangul: "거예요", kind: "korean_vocabulary" as const, englishReading: null },
      ],
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
      hangulInterpretations: [
        { hangul: "플레이", kind: "accented_english" as const, englishReading: "play" },
        { hangul: "게임즈", kind: "accented_english" as const, englishReading: "games" },
      ],
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
      const invented = {
        ...correction,
        improvedSentence: "I play games with my brother.",
        hangulInterpretations: [],
      };
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

describe("Hangul interpretation coverage in the original contract", () => {
  it("flags a detected span the evaluator did not classify", () => {
    const result = validateOriginalEvaluationContract({
      evaluation: { ...baseEvaluation, hangulInterpretations: [] },
      evaluationMode: "preset",
      answerShape: "open",
      missionQuestion: "Which ice cream is best?",
      targetPattern: "I like _____.",
      transcript: "I like 바닐라.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContain("hangul_interpretation_missing");
    }
  });

  it("flags a malformed English reading as invalid rather than missing", () => {
    const result = validateOriginalEvaluationContract({
      evaluation: {
        ...baseEvaluation,
        hangulInterpretations: [
          { hangul: "바닐라", kind: "accented_english" as const, englishReading: "香草" },
        ],
      },
      evaluationMode: "preset",
      answerShape: "open",
      missionQuestion: "Which ice cream is best?",
      targetPattern: "I like _____.",
      transcript: "I like 바닐라.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContain("hangul_interpretation_invalid");
    }
  });

  it("accepts a fully and validly classified Hangul transcript", () => {
    const result = validateOriginalEvaluationContract({
      evaluation: {
        ...baseEvaluation,
        hangulInterpretations: [
          {
            hangul: "바닐라",
            kind: "accented_english" as const,
            englishReading: "vanilla",
          },
        ],
      },
      evaluationMode: "preset",
      answerShape: "open",
      missionQuestion: "Which ice cream is best?",
      targetPattern: "I like _____.",
      transcript: "I like 바닐라.",
    });

    expect(result.ok).toBe(true);
  });

  it("leaves an all-English transcript with empty metadata untouched", () => {
    const result = validateOriginalEvaluationContract({
      evaluation: { ...baseEvaluation, hangulInterpretations: [] },
      evaluationMode: "preset",
      answerShape: "open",
      missionQuestion: "Which ice cream is best?",
      targetPattern: "I like _____.",
      transcript: "I like vanilla.",
    });

    expect(result.ok).toBe(true);
  });
});
