import { describe, expect, it } from "vitest";
import {
  missionFormSchema,
  missionSnapshotSchema,
  DEFAULT_CHARACTER_ID,
} from "@/domain/mission/schemas";

const baseFormFields = {
  title: "Ordering food",
  targetPattern: "Can I have a...?",
  topic: "Restaurant",
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
  topic: "Restaurant",
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

  it("passes with zero authored turns when conversationMode is true", () => {
    const result = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 5,
      conversationMode: true,
      turns: [],
    });

    expect(result.success).toBe(true);
  });

  it("enforces a 3-8 requiredTurns range when conversationMode is true", () => {
    const tooLow = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 2,
      conversationMode: true,
      turns: [],
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
      turns: [],
    });
    expect(low.success).toBe(true);

    const mid = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 5,
      conversationMode: true,
      turns: [],
    });
    expect(mid.success).toBe(true);

    const high = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 8,
      conversationMode: true,
      turns: [],
    });
    expect(high.success).toBe(true);

    const tooHigh = missionFormSchema.safeParse({
      ...baseFormFields,
      requiredTurns: 9,
      conversationMode: true,
      turns: [],
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
});

describe("missionSnapshotSchema", () => {
  it("validates a conversation-mode snapshot with zero turns and a scenePremise", () => {
    const result = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 5,
      conversationMode: true,
      scenePremise: "You and Coco are exploring a busy market.",
      turns: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenePremise).toBe(
        "You and Coco are exploring a busy market.",
      );
      expect(result.data.conversationMode).toBe(true);
    }
  });

  it("defaults scenePremise to null when omitted", () => {
    const result = missionSnapshotSchema.safeParse({
      ...baseSnapshotFields,
      requiredTurns: 5,
      conversationMode: true,
      turns: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenePremise).toBeNull();
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
