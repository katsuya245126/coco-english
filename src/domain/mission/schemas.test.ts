import { describe, expect, it } from "vitest";
import {
  missionFormSchema,
  missionSnapshotSchema,
  DEFAULT_CHARACTER_ID,
  missionTurnInputSchema,
  missionSnapshotTurnSchema,
  type AnswerShape,
} from "@/domain/mission/schemas";

const baseFormFields = {
  title: "Ordering food",
  targetPattern: "Can I have a...?",
  level: "elementary" as const,
  characterId: DEFAULT_CHARACTER_ID,
};

const oneTurn = {
  prompt: "What would you like to order?",
  targetPattern: "Can I have a...?",
  targetExample: "Can I have a burger, please?",
  hintLadder: {
    tier1: "Can I have a...?",
    tier2: "burger / pizza / salad",
    tier3: "Can I have a burger, please?",
  },
};

function makeTurns(count: number) {
  return Array.from({ length: count }, () => oneTurn);
}

const baseSnapshotFields = {
  missionId: "11111111-1111-1111-1111-111111111111",
  title: "Ordering food",
  targetPattern: "Can I have a...?",
  level: "elementary" as const,
  characterId: DEFAULT_CHARACTER_ID,
};

const snapshotTurn = {
  turnOrder: 1,
  prompt: "What would you like to order?",
  targetExample: "Can I have a burger, please?",
  hintLadder: {
    tier1: "Can I have a...?",
    tier2: "burger / pizza / salad",
    tier3: "Can I have a burger, please?",
  },
};

function makeSnapshotTurns(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...snapshotTurn,
    turnOrder: index + 1,
  }));
}

describe("missionFormSchema", () => {
  it("still fails with mismatched turn count when conversationMode is false (backward compatible)", () => {
    const result = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 5,
      conversationMode: false,
      turns: makeTurns(3),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) =>
        entry.path.includes("requiredTurns"),
      );
      expect(issue?.message).toBe(
        "Required turns must match the number of authored turns.",
      );
    }
  });

  it("requires a Coco opening line when conversationMode is true", () => {
    const result = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 5,
      conversationMode: true,
      turns: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) =>
        entry.path.includes("turns"),
      );
      expect(issue?.message).toBe("Coco opening line is required.");
    }
  });

  it("enforces a 3-8 requiredTurns range when conversationMode is true", () => {
    const tooLow = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 2,
      conversationMode: true,
      turns: makeTurns(1),
    });
    expect(tooLow.success).toBe(false);
    if (!tooLow.success) {
      const issue = tooLow.error.issues.find((entry) =>
        entry.path.includes("requiredTurns"),
      );
      expect(issue?.message).toBe("Choose between 3 and 8 turns.");
    }

    const low = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 3,
      conversationMode: true,
      turns: makeTurns(1),
    });
    expect(low.success).toBe(true);

    const mid = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 5,
      conversationMode: true,
      turns: makeTurns(1),
    });
    expect(mid.success).toBe(true);

    const high = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 8,
      conversationMode: true,
      turns: makeTurns(1),
    });
    expect(high.success).toBe(true);

    const tooHigh = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 9,
      conversationMode: true,
      turns: makeTurns(1),
    });
    expect(tooHigh.success).toBe(false);
    if (!tooHigh.success) {
      const issue = tooHigh.error.issues.find((entry) =>
        entry.path.includes("requiredTurns"),
      );
      expect(issue?.message).toBe("Choose between 3 and 8 turns.");
    }
  });

  it("still requires at least one turn for preset (conversationMode false) missions", () => {
    const result = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 0,
      conversationMode: false,
      turns: [],
    });

    expect(result.success).toBe(false);
  });

  it("defaults the dynamic complete-sentence policy on for forms and snapshots", () => {
    const form = missionFormSchema.parse({
      ...baseFormFields,
      requiredTurns: 3,
      conversationMode: true,
      turns: makeTurns(1),
    });
    const snapshot = missionSnapshotSchema.parse({
      ...baseSnapshotFields,
      requiredTurns: 3,
      conversationMode: true,
      turns: makeSnapshotTurns(1),
    });

    expect(form.requireCompleteSentenceAnswers).toBe(true);
    expect(snapshot.requireCompleteSentenceAnswers).toBe(true);
  });

  it("preserves an explicitly disabled dynamic complete-sentence policy", () => {
    const form = missionFormSchema.parse({
      ...baseFormFields,
      requiredTurns: 3,
      conversationMode: true,
      requireCompleteSentenceAnswers: false,
      turns: makeTurns(1),
    });

    expect(form.requireCompleteSentenceAnswers).toBe(false);
  });

  it("accepts a preset with only per-turn target patterns", () => {
    const parsed = missionFormSchema.parse({
      title: "Mixed review",
      level: "elementary",
      requiredTurns: 2,
      conversationMode: false,
      turns: [
        { ...oneTurn, targetPattern: "I like ___ing." },
        {
          ...oneTurn,
          prompt: "What will you do tomorrow?",
          targetPattern: "I will ___.",
          targetExample: "I will study.",
        },
      ],
    });

    expect(parsed.targetPattern).toBeUndefined();
    expect(parsed.turns.map((turn) => turn.targetPattern)).toEqual([
      "I like ___ing.",
      "I will ___.",
    ]);
  });

  it("allows preset turns to repeat any nonempty teacher-authored notation", () => {
    const result = missionFormSchema.safeParse({
      title: "Repeated review",
      level: "elementary",
      requiredTurns: 2,
      conversationMode: false,
      turns: [
        { ...oneTurn, targetPattern: "Past tense verb" },
        {
          ...oneTurn,
          prompt: "What did your friend do?",
          targetPattern: "Past tense verb",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a preset turn without a target pattern", () => {
    const { targetPattern: _pattern, ...turnWithoutPattern } = oneTurn;
    const result = missionFormSchema.safeParse({
      title: "Missing pattern",
      level: "elementary",
      requiredTurns: 1,
      conversationMode: false,
      turns: [turnWithoutPattern],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["turns", 0, "targetPattern"] }),
      );
    }
  });

  it("rejects a preset mission-level target pattern", () => {
    const result = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 1,
      conversationMode: false,
      turns: [oneTurn],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["targetPattern"] }),
      );
    }
  });

  it("rejects incomplete picture metadata", () => {
    const result = missionFormSchema.safeParse({
      title: "Missing picture description",
      level: "elementary",
      requiredTurns: 1,
      conversationMode: false,
      turns: [
        {
          ...oneTurn,
          picture: {
            objectKey: "teachers/teacher-1/picture-1.jpg",
            description: "  ",
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["turns", 0, "picture", "description"] }),
      );
    }
  });

  it("requires conversation context without requiring an opener turn pattern", () => {
    const { targetPattern: _pattern, ...opener } = oneTurn;
    const valid = missionFormSchema.safeParse({
      ...baseFormFields,
      targetPattern: "Can I have a...?",
      requiredTurns: 3,
      conversationMode: true,
      turns: [opener],
    });
    const missingContext = missionFormSchema.safeParse({
      title: "Cafe chat",
      level: "elementary",
      requiredTurns: 3,
      conversationMode: true,
      turns: [opener],
    });

    expect(valid.success).toBe(true);
    expect(missingContext.success).toBe(false);
  });

  it("accepts one picture per preset turn and trims its accessibility description", () => {
    const result = missionFormSchema.safeParse({
      title: "Food likes",
      level: "elementary",
      requiredTurns: 1,
      conversationMode: false,
      turns: [
        {
          ...oneTurn,
          picture: {
            objectKey: "teachers/teacher-1/picture-1.jpg",
            description: "  A child choosing an apple.  ",
          },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.turns[0]?.picture).toEqual({
        objectKey: "teachers/teacher-1/picture-1.jpg",
        description: "A child choosing an apple.",
      });
    }
  });

  it("rejects picture metadata in conversation missions", () => {
    const result = missionFormSchema.safeParse({
      ...baseFormFields,
      targetPattern: "I like ___",
      requiredTurns: 3,
      conversationMode: true,
      turns: [
        {
          ...oneTurn,
          targetPattern: undefined,
          picture: {
            objectKey: "teachers/teacher-1/picture-1.jpg",
            description: "A child choosing an apple.",
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["turns", 0, "picture"] }),
      );
    }
  });
});

describe("missionSnapshotSchema", () => {
  it("requires a Coco opening line in a conversation-mode snapshot", () => {
    const result = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 5,
      conversationMode: true,
      scenePremise: "You and Coco are exploring a busy market.",
      turns: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) =>
        entry.path.includes("turns"),
      );
      expect(issue?.message).toBe(
        "Snapshot Coco opening line is required.",
      );
    }
  });

  it("strips retired topic and scene-premise fields from legacy snapshots", () => {
    const result = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 5,
      conversationMode: true,
      topic: "Restaurant",
      scenePremise: "You and Coco are exploring a busy market.",
      turns: makeSnapshotTurns(1),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("topic");
      expect(result.data).not.toHaveProperty("scenePremise");
    }
  });

  it("keeps the strict turns.length === requiredTurns refine when conversationMode is false", () => {
    const mismatched = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 3,
      conversationMode: false,
      turns: makeSnapshotTurns(2),
    });
    expect(mismatched.success).toBe(false);

    const matched = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 2,
      conversationMode: false,
      turns: makeSnapshotTurns(2),
    });
    expect(matched.success).toBe(true);
  });

  it("keeps the strict refine when conversationMode is omitted (defaults to false)", () => {
    const result = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 3,
      turns: makeSnapshotTurns(2),
    });

    expect(result.success).toBe(false);
  });

  it("rejects a preset snapshot with neither turn nor historical mission patterns", () => {
    const result = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      targetPattern: undefined,
      requiredTurns: 1,
      conversationMode: false,
      turns: makeSnapshotTurns(1),
    });

    expect(result.success).toBe(false);
  });

  it("carries picture metadata in preset snapshots and rejects it in conversation snapshots", () => {
    const picture = {
      objectKey: "teachers/teacher-1/picture-1.jpg",
      description: "A child choosing an apple.",
    };
    const preset = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      targetPattern: undefined,
      requiredTurns: 1,
      conversationMode: false,
      turns: [{ ...snapshotTurn, targetPattern: "I like ___", picture }],
    });
    expect(preset.success).toBe(true);
    if (preset.success) {
      expect(preset.data.turns[0]?.picture).toEqual(picture);
    }

    const conversation = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 3,
      conversationMode: true,
      turns: [{ ...snapshotTurn, picture }],
    });
    expect(conversation.success).toBe(false);
    if (!conversation.success) {
      expect(conversation.error.issues).toContainEqual(
        expect.objectContaining({ path: ["turns", 0, "picture"] }),
      );
    }
  });

  it("rejects a conversation snapshot without mission-level context", () => {
    const result = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      targetPattern: undefined,
      requiredTurns: 3,
      conversationMode: true,
      turns: makeSnapshotTurns(1),
    });

    expect(result.success).toBe(false);
  });
});

describe("answerShape on turns", () => {
  const baseTurn = {
    prompt: "Which is best?",
    targetExample: "I think vanilla is the best.",
    hintLadder: { tier1: "a", tier2: "b", tier3: "c" },
  };

  it("defaults answerShape to open when omitted", () => {
    const parsed = missionTurnInputSchema.parse(baseTurn);
    expect(parsed.answerShape).toBe("open");
  });

  it("accepts an explicit fixed answerShape", () => {
    const parsed = missionTurnInputSchema.parse({ ...baseTurn, answerShape: "fixed" });
    expect(parsed.answerShape).toBe("fixed");
  });

  it("rejects an unknown answerShape", () => {
    expect(() =>
      missionTurnInputSchema.parse({ ...baseTurn, answerShape: "maybe" }),
    ).toThrow();
  });

  it("defaults answerShape on snapshot turns", () => {
    const parsed = missionSnapshotTurnSchema.parse({ ...baseTurn, turnOrder: 1 });
    const shape: AnswerShape = parsed.answerShape;
    expect(shape).toBe("open");
  });

  it("accepts and trims an optional turn target pattern", () => {
    const parsed = missionTurnInputSchema.parse({
      ...baseTurn,
      targetPattern: "  I like ___ing.  ",
    });

    expect(parsed.targetPattern).toBe("I like ___ing.");
  });

  it("keeps target patterns optional until preset authoring moves in ticket 42", () => {
    expect(missionTurnInputSchema.parse(baseTurn)).not.toHaveProperty(
      "targetPattern",
    );
  });
});
