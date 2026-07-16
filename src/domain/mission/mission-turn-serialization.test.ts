import { describe, expect, it } from "vitest";
import {
  buildChatOpeningTurn,
  serializeMissionTurns,
} from "@/domain/mission/mission-turn-serialization";
import type { MissionTurnInput } from "@/domain/mission/schemas";

const tailTurn: MissionTurnInput = {
  prompt: "What food do you like?",
  targetExample: "I like pizza.",
  hintLadder: {
    tier1: "Try using: I like...",
    tier2: "Choose your own words for: I like...",
    tier3: "Use this sentence frame: I like...",
  },
};

describe("buildChatOpeningTurn", () => {
  it("builds the complete first turn from the reviewed opener and target pattern", () => {
    expect(
      buildChatOpeningTurn("  Hi! What would you like to eat?  ", "  Can I have a...?  "),
    ).toEqual({
      prompt: "Hi! What would you like to eat?",
      targetExample: "Can I have a...?",
      hintLadder: {
        tier1: "Try using: Can I have a...?",
        tier2: "Choose your own words for: Can I have a...?",
        tier3: "Use this sentence frame: Can I have a...?",
      },
    });
  });
});

describe("serializeMissionTurns", () => {
  it("serializes only the generated opener for conversation missions", () => {
    const secondTurn = { ...tailTurn };
    const thirdTurn: MissionTurnInput = {
      ...tailTurn,
      prompt: "What drink would you like?",
    };
    const turns = [tailTurn, secondTurn, thirdTurn];

    const result = serializeMissionTurns({
      conversationMode: true,
      opener: "Welcome to Coco's cafe! What would you like?",
      targetPattern: "Can I have a...?",
      turns,
    });

    expect(result[0]).toEqual(
      buildChatOpeningTurn(
        "Welcome to Coco's cafe! What would you like?",
        "Can I have a...?",
      ),
    );
    expect(result).toHaveLength(1);
  });

  it("returns preset turns with byte-equivalent JSON serialization", () => {
    const turns = [tailTurn, { ...tailTurn, prompt: "What do you enjoy?" }];

    const result = serializeMissionTurns({
      conversationMode: false,
      opener: "Ignored for preset missions",
      targetPattern: "Can I have a...?",
      turns,
    });

    expect(JSON.stringify(result)).toBe(JSON.stringify(turns));
  });
});
