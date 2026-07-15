import type { MissionTurnInput } from "@/domain/mission/schemas";

export function buildChatOpeningTurn(
  opener: string,
  targetPattern: string,
): MissionTurnInput {
  const reviewedOpener = opener.trim();
  const pattern = targetPattern.trim();

  return {
    prompt: reviewedOpener,
    targetExample: pattern,
    hintLadder: {
      tier1: `Try using: ${pattern}`,
      tier2: `Choose your own words for: ${pattern}`,
      tier3: `Use this sentence frame: ${pattern}`,
    },
  };
}

export function serializeMissionTurns(input: {
  conversationMode: boolean;
  opener: string;
  targetPattern: string;
  turns: MissionTurnInput[];
}): MissionTurnInput[] {
  if (!input.conversationMode) {
    return input.turns;
  }

  return [
    buildChatOpeningTurn(input.opener, input.targetPattern),
    ...input.turns.slice(1),
  ];
}
