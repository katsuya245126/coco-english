import { describe, expect, it } from "vitest";
import {
  missionFormSchema,
  missionSnapshotSchema,
} from "@/domain/mission/schemas";

const completeTurn = {
  prompt: "What do you like doing after school?",
  targetExample: "I like playing soccer.",
  hintLadder: {
    tier1: "I like ___ing.",
    tier2: "play, soccer, like",
    tier3: "I like playing soccer.",
  },
};

describe("missionFormSchema manual authoring contract (MISS-01, MISS-04)", () => {
  it("accepts D-01/D-03 complete mission content with ordered turns and hint tiers", () => {
    const parsed = missionFormSchema.parse({
      title: "After-school likes",
      targetPattern: "I like ___ing.",
      topic: "After school",
      level: "elementary",
      requiredTurns: 2,
      turns: [
        completeTurn,
        {
          ...completeTurn,
          prompt: "What does your friend like doing?",
          targetExample: "She likes drawing.",
        },
      ],
    });

    expect(parsed.turns).toHaveLength(2);
    expect(parsed.level).toBe("elementary");
    expect(parsed.characterId).toBe("default-buddy");
  });

  it("rejects D-02 required turns that differ from authored turns", () => {
    const parsed = missionFormSchema.safeParse({
      title: "Mismatch",
      targetPattern: "I can ___.",
      topic: "Abilities",
      level: "beginner",
      requiredTurns: 3,
      turns: [completeTurn],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects D-03 free-text levels and defaults D-16 characterId", () => {
    const invalid = missionFormSchema.safeParse({
      title: "Invalid level",
      targetPattern: "I want ___.",
      topic: "Wants",
      level: "advanced",
      requiredTurns: 1,
      turns: [completeTurn],
    });
    const valid = missionFormSchema.parse({
      title: "Default buddy",
      targetPattern: "I want ___.",
      topic: "Wants",
      level: "beginner",
      requiredTurns: 1,
      turns: [completeTurn],
    });

    expect(invalid.success).toBe(false);
    expect(valid.characterId).toBe("default-buddy");
  });
});

describe("missionSnapshotSchema reusable assignment contract (D-07)", () => {
  it("keeps MISS-04 character id and all D-01 turn fields in the snapshot", () => {
    const snapshot = missionSnapshotSchema.parse({
      missionId: "11111111-1111-4111-8111-111111111111",
      title: "Snapshot mission",
      targetPattern: "I like ___.",
      topic: "Food",
      level: "elementary",
      requiredTurns: 1,
      characterId: "default-buddy",
      turns: [{ turnOrder: 1, ...completeTurn }],
    });

    expect(snapshot.characterId).toBe("default-buddy");
    expect(snapshot.turns[0]?.hintLadder.tier3).toBe("I like playing soccer.");
  });
});
