import { describe, expect, it } from "vitest";

const generatedTurn = {
  prompt: "What do you like doing after school?",
  targetExample: "I like playing soccer after school.",
  hintLadder: {
    tier1: "I like ___ing.",
    tier2: "like, playing, soccer",
    tier3: "I like playing soccer after school.",
  },
};

describe("generated mission draft schema (MISS-02, MISS-03, MISS-05)", () => {
  it("parses a D-08 previewable draft with ordered turns, examples, and three hint tiers", async () => {
    const { generatedMissionDraftSchema } = await import(
      "@/domain/ai/mission-generation"
    );

    const draft = generatedMissionDraftSchema.parse({
      title: "After-school likes",
      targetPattern: "I like ___ing.",
      topic: "After school",
      level: "elementary",
      requiredTurns: 2,
      turns: [
        generatedTurn,
        {
          ...generatedTurn,
          prompt: "What does your friend like doing?",
          targetExample: "She likes drawing after school.",
        },
      ],
      targetExamples: [
        "I like playing soccer after school.",
        "She likes drawing after school.",
      ],
    });

    expect(draft.requiredTurns).toBe(2);
    expect(draft.turns.map((turn) => turn.prompt)).toEqual([
      "What do you like doing after school?",
      "What does your friend like doing?",
    ]);
    expect(draft.turns[0]?.hintLadder).toEqual({
      tier1: "I like ___ing.",
      tier2: "like, playing, soccer",
      tier3: "I like playing soccer after school.",
    });
  });

  it("rejects D-09 generated drafts when requiredTurns does not match generated turn count", async () => {
    const { generatedMissionDraftSchema } = await import(
      "@/domain/ai/mission-generation"
    );

    const parsed = generatedMissionDraftSchema.safeParse({
      title: "Mismatch",
      targetPattern: "I can ___.",
      topic: "Abilities",
      level: "beginner",
      requiredTurns: 3,
      turns: [generatedTurn],
      targetExamples: ["I can swim."],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects D-09 malformed provider output before it can become assignable mission data", async () => {
    const { parseGeneratedMissionDraft } = await import(
      "@/domain/ai/mission-generation"
    );

    const parsed = parseGeneratedMissionDraft({
      title: "Malformed",
      targetPattern: "I want ___.",
      topic: "Wants",
      level: "advanced",
      requiredTurns: 1,
      turns: [
        {
          prompt: "What do you want?",
          targetExample: "I want juice.",
          hintLadder: { tier1: "I want ___." },
        },
      ],
    });

    expect(parsed).toEqual({ ok: false, error: "schema_failed" });
  });
});
