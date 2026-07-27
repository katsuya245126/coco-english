import { describe, expect, it } from "vitest";
import {
  validateImprovedSentencePolicy,
  type ImprovedSentencePolicyInput,
} from "@/domain/ai/correction-policy";

const base: ImprovedSentencePolicyInput = {
  evaluationMode: "conversation",
  answerShape: "open",
  missionQuestion: "What games do you like to play when you swim together?",
  targetPattern: "I like to play _____",
  transcript: "My family.",
  correctionReason: "fragment_completion",
  improvedSentence: "I will swim with my family.",
};

describe("validateImprovedSentencePolicy", () => {
  it("accepts the shortest grounded complete recast", () => {
    expect(validateImprovedSentencePolicy(base)).toEqual({ ok: true });
  });

  it("rejects changing the learner's listed choice", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      evaluationMode: "preset",
      missionQuestion:
        "Which ice cream is the best: vanilla, strawberry, or chocolate?",
      targetPattern: "I think _____ is the best",
      transcript: "I think chocolate ice cream is the best.",
      correctionReason: "vocabulary",
      improvedSentence: "I think vanilla ice cream is the best.",
    });
    expect(result).toEqual({ ok: false, violations: ["open_choice_changed"] });
  });

  it("preserves the learner's choice in a comma list without a colon", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      evaluationMode: "preset",
      missionQuestion: "Which is best, vanilla, strawberry, or chocolate?",
      targetPattern: "I think _____ is the best",
      transcript: "I think chocolate is the best.",
      correctionReason: "vocabulary",
      improvedSentence: "I think vanilla is the best.",
    });
    expect(result).toEqual({ ok: false, violations: ["open_choice_changed"] });
  });

  it("extracts the first choice when it shares a comma segment with the question", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      evaluationMode: "preset",
      missionQuestion:
        "Would you like vanilla, strawberry, or chocolate?",
      targetPattern: "I would like _____",
      transcript: "I would like vanilla.",
      correctionReason: "vocabulary",
      improvedSentence: "I would like strawberry.",
    });
    expect(result).toEqual({ ok: false, violations: ["open_choice_changed"] });
  });

  it("does not mistake a WH-question predicate for the first listed choice", () => {
    expect(
      validateImprovedSentencePolicy({
        ...base,
        evaluationMode: "preset",
        missionQuestion:
          "Which activity do you like, swimming, hiking, or reading?",
        targetPattern: "I like _____",
        transcript: "I like swimming.",
        correctionReason: "vocabulary",
        improvedSentence: "I enjoy swimming.",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects pure appended embellishment", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "I like to play Jenga.",
      correctionReason: "grammar",
      improvedSentence: "I like to play Jenga when we swim together.",
    });
    expect(result).toEqual({ ok: false, violations: ["pure_embellishment"] });
  });

  it("rejects an invented location", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "On the side.",
      missionQuestion: "What games do you like to play when you swim together?",
      improvedSentence: "I like to play Jenga on the side of the pool.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_ungrounded");
  });

  it("rejects unsupported details regardless of the evaluator's reason label", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "On the side.",
      missionQuestion: "What games do you like to play when you swim together?",
      correctionReason: "grammar",
      improvedSentence: "I like to play Jenga on the side of the pool.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("unsupported_detail");
  });

  it.each(["grammar", "vocabulary"] as const)(
    "rejects a %s label that replaces the learner's only content anchor",
    (correctionReason) => {
      const result = validateImprovedSentencePolicy({
        ...base,
        transcript: "On the side.",
        missionQuestion: "Where do you play?",
        correctionReason,
        improvedSentence: "At the pool.",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.violations).toContain("unsupported_detail");
    },
  );

  it("rejects a vocabulary label that swaps one retained choice for another", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "I play Jenga.",
      missionQuestion: "What games do you play?",
      correctionReason: "vocabulary",
      improvedSentence: "I play chess.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("unsupported_detail");
  });

  it("does not let the question overwrite a learner-owned answer anchor", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "I play golf.",
      missionQuestion: "Do you play soccer?",
      correctionReason: "vocabulary",
      improvedSentence: "I play soccer.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("unsupported_detail");
  });

  it("rejects a near-spelling substitution when context does not prove the meaning", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "I play chest.",
      missionQuestion: "What games do you play?",
      correctionReason: "vocabulary",
      improvedSentence: "I play chess.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("unsupported_detail");
  });

  it("does not treat an arbitrary one-character substitution as meaning-preserving", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "I play golf.",
      missionQuestion: "What games do you play?",
      correctionReason: "vocabulary",
      improvedSentence: "I play wolf.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("unsupported_detail");
  });

  it("accepts a grounded grammar correction across a regular inflection", () => {
    expect(
      validateImprovedSentencePolicy({
        ...base,
        transcript: "I study English.",
        missionQuestion: "What are you studying?",
        correctionReason: "grammar",
        improvedSentence: "I am studying English.",
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    {
      missionQuestion: "What do you cook at home?",
      transcript: "Pasta.",
      improvedSentence: "I cook pasta.",
    },
    {
      missionQuestion: "Who cooks dinner?",
      transcript: "My brother.",
      improvedSentence: "My brother cooks dinner.",
    },
    {
      missionQuestion: "What are you cooking?",
      transcript: "Pasta.",
      improvedSentence: "I cook pasta.",
    },
    {
      missionQuestion: "What game does your sister like?",
      transcript: "Jenga.",
      improvedSentence: "My sister likes Jenga.",
    },
    {
      missionQuestion: "Where does he go?",
      transcript: "Go home.",
      improvedSentence: "He goes home.",
    },
    {
      missionQuestion: "Who cooks dinner?",
      transcript: "My older brother.",
      improvedSentence: "My older brother cooks dinner.",
    },
    {
      missionQuestion: "What does Minju cook for dinner?",
      transcript: "Pasta.",
      improvedSentence: "Minju cooks pasta.",
    },
  ])(
    "accepts an ordinary grounded fragment recast: $improvedSentence",
    ({ missionQuestion, transcript, improvedSentence }) => {
      expect(
        validateImprovedSentencePolicy({
          ...base,
          missionQuestion,
          targetPattern: "I _____",
          transcript,
          improvedSentence,
        }),
      ).toEqual({ ok: true });
    },
  );

  it("does not mistake a subject plus noun for a complete declarative clause", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      missionQuestion: "What do you cook?",
      transcript: "Pasta.",
      improvedSentence: "I pasta.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_not_declarative");
  });

  it("does not treat a question-grounded noun as the sentence predicate", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      missionQuestion: "What do you cook for dinner?",
      transcript: "Dinner.",
      improvedSentence: "I dinner.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_not_declarative");
  });

  it("requires a copula in a recast grounded by a copular question", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      missionQuestion: "What color is your car?",
      transcript: "Red.",
      improvedSentence: "My car red.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_not_declarative");
  });

  it("rejects a fragment completion that adds more than five lexical tokens", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      improvedSentence: "I am going to swim with my family in the valley.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_too_long");
  });

  it("rejects copied target-pattern padding", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      // Preset, not the fixture's conversation default: free-talking
      // conversation deliberately stopped policing the target pattern
      // (2026-07-27). The padding rule still guards preset missions, which is
      // the case this test exists for.
      evaluationMode: "preset",
      targetPattern: "I'm going to _____ in the valley",
      improvedSentence: "I'm going to swim with my family in the valley.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("target_pattern_padding");
  });

  it("does not police the target pattern in free-talking conversation", () => {
    // Regression: attempt 2b496b6d (2026-07-27). "Play games." had no legal
    // completion — using the mission's own "I'm going to ________" pattern was
    // itself a violation — so the turn burned its retries and the child was
    // told "I didn't understand that."
    expect(
      validateImprovedSentencePolicy({
        ...base,
        evaluationMode: "conversation",
        missionQuestion:
          "What fun things do you want to do this summer vacation?",
        targetPattern: "I'm going to ________",
        transcript: "Play games.",
        improvedSentence: "I'm going to play games.",
      }),
    ).toEqual({ ok: true });
  });

  it("treats a contraction as its expanded words", () => {
    // "I'm" tokenized as one unmatchable content word, so the contracted form
    // was rejected while "I am ..." passed.
    expect(
      validateImprovedSentencePolicy({
        ...base,
        evaluationMode: "preset",
        missionQuestion: "What are you going to do this summer?",
        targetPattern: "I'm going to ________",
        transcript: "Going to play games.",
        improvedSentence: "I'm going to play games.",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts a completion whose only new word is the supplied verb", () => {
    expect(
      validateImprovedSentencePolicy({
        ...base,
        missionQuestion:
          "What fun things do you want to do this summer vacation?",
        transcript: "Inside.",
        improvedSentence: "I play inside.",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts a who-answer fragment completed with words already grounded by Coco's question", () => {
    expect(
      validateImprovedSentencePolicy({
        ...base,
        missionQuestion: "Who do you like to play Valorant with?",
        transcript: "My friend.",
        improvedSentence: "I like to play Valorant with my friend.",
      }),
    ).toEqual({ ok: true });
  });

  it("still rejects a completion that invents a detail the student never gave", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      missionQuestion:
        "What fun things do you want to do this summer vacation?",
      transcript: "Play games.",
      improvedSentence: "I play games with my brother.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toContain("fragment_ungrounded");
  });

  describe("transcripts the evaluator resolved from Korean", () => {
    // Regression: attempt 77446535 (2026-07-27). The transcriber wrote the
    // child's accented English as Hangul ("플레이 게임즈" for "play games"). The
    // evaluator read it correctly, but the grounding checks compare word forms
    // — Hangul never matches Latin — so every correct completion was rejected
    // and the child heard "I didn't hear you well."
    const korean = {
      ...base,
      missionQuestion: "What fun things do you want to do this summer vacation?",
      transcript: "플레이 게임즈",
      improvedSentence: "I play games.",
    };

    it("accepts a completion whose transcript is accented English in Hangul", () => {
      expect(
        validateImprovedSentencePolicy({
          ...korean,
          transcriptResolvedFromKorean: true,
        }),
      ).toEqual({ ok: true });
    });

    it("accepts a Korean-script proper noun the evaluator kept", () => {
      expect(
        validateImprovedSentencePolicy({
          ...korean,
          missionQuestion: "What games do you like to play?",
          transcript: "발로란트",
          improvedSentence: "I play Valorant.",
          transcriptResolvedFromKorean: true,
        }),
      ).toEqual({ ok: true });
    });

    it("accepts a short question-grounded completion when Hangul tokenization undercounts the English answer", () => {
      expect(
        validateImprovedSentencePolicy({
          ...korean,
          missionQuestion: "What do you like to do in the summer?",
          transcript: "플레이 게임즈",
          improvedSentence: "I like to play games in the summer.",
          transcriptResolvedFromKorean: true,
        }),
      ).toEqual({ ok: true });
    });

    it("still applies grounding when the flag is absent", () => {
      // The caller only sets the flag when englishLanguage is "english", so a
      // genuinely Korean answer keeps every check and still routes to retry.
      const result = validateImprovedSentencePolicy(korean);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.violations).toContain("fragment_content_lost");
        expect(result.violations).toContain("fragment_ungrounded");
      }
    });
  });

  it("accepts a bare declarative that does not echo the question's verb", () => {
    // "I swim." was reported as fragment_not_declarative because the guard
    // required the completion to reuse a verb from the mission question.
    expect(
      validateImprovedSentencePolicy({
        ...base,
        missionQuestion: "What do you like to do?",
        transcript: "Swim.",
        improvedSentence: "I swim.",
      }),
    ).toEqual({ ok: true });
  });
});

describe("romanization artifacts (attempt 6406e6a5, 2026-07-27)", () => {
  const base = {
    evaluationMode: "conversation" as const,
    answerShape: "open" as const,
    missionQuestion: "What games do you play?",
    targetPattern: "I like to play ________.",
    correctionReason: "fragment_completion" as const,
  };

  it("rejects a correction naming a word the evaluator invented", () => {
    // 발로란트 (Valorant) was misheard as 배달란트; "Baedalranteu" is its RR
    // reading and exists in no language, yet became a repeat target.
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "배달란트",
      improvedSentence: "I like to play Baedalranteu.",
      transcriptResolvedFromKorean: true,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.violations).toContain(
      "romanization_artifact",
    );
  });

  it("still accepts a correction that genuinely resolved the Korean", () => {
    const result = validateImprovedSentencePolicy({
      ...base,
      transcript: "플레이 게임즈.",
      improvedSentence: "I play games.",
      transcriptResolvedFromKorean: true,
    });
    expect(result.ok).toBe(true);
  });
});
