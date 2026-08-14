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
