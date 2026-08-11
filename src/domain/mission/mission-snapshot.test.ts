import { describe, expect, it } from "vitest";
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";

const missionId = "11111111-1111-4111-8111-111111111111";
const turn = {
  turnOrder: 1,
  prompt: "What do you like doing after school?",
  targetExample: "I like playing soccer.",
  answerShape: "open",
  hintLadder: {
    tier1: "I like ___ing.",
    tier2: "play, soccer, like",
    tier3: "I like playing soccer.",
  },
};

const completeSnapshot = {
  missionId,
  title: "After-school likes",
  targetPattern: "I like ___ing.",
  level: "elementary",
  requiredTurns: 1,
  characterId: "default-buddy",
  conversationMode: false,
  requireCompleteSentenceAnswers: true,
  turns: [turn],
};

const legacySnapshot = {
  missionId,
  title: "Foundation Smoke Assignment",
  characterId: "default-buddy",
  requiredTurns: 1,
  turns: [
    {
      order: 1,
      prompt: "What are you going to do this weekend?",
      targetExample: "I am going to play soccer.",
    },
  ],
};

describe("interpretMissionSnapshot", () => {
  it("returns a complete preset mission snapshot", () => {
    expect(interpretMissionSnapshot(completeSnapshot)).toEqual({
      kind: "complete",
      snapshot: completeSnapshot,
    });
  });

  it("returns a complete conversation mission snapshot", () => {
    const snapshot = {
      ...completeSnapshot,
      requiredTurns: 3,
      conversationMode: true,
    };

    expect(interpretMissionSnapshot(snapshot)).toEqual({
      kind: "complete",
      snapshot,
    });
  });

  it("applies the historical defaults to an older complete snapshot", () => {
    const result = interpretMissionSnapshot({
      missionId,
      title: "Older complete mission",
      targetPattern: "I like ___.",
      level: "elementary",
      requiredTurns: 1,
      turns: [
        {
          prompt: turn.prompt,
          targetExample: turn.targetExample,
          hintLadder: turn.hintLadder,
          turnOrder: 1,
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "complete",
      snapshot: {
        characterId: "default-buddy",
        conversationMode: false,
        requireCompleteSentenceAnswers: true,
        turns: [{ answerShape: "open" }],
      },
    });
  });

  it("returns the exact legacy mission snapshot with normalized turn order", () => {
    expect(interpretMissionSnapshot(legacySnapshot)).toEqual({
      kind: "legacy",
      snapshot: {
        missionId,
        title: "Foundation Smoke Assignment",
        characterId: "default-buddy",
        requiredTurns: 1,
        turns: [
          {
            turnOrder: 1,
            prompt: "What are you going to do this weekend?",
            targetExample: "I am going to play soccer.",
          },
        ],
      },
    });
  });

  it.each([
    {
      ...legacySnapshot,
      turns: [{ prompt: "Question", targetExample: "Answer" }],
    },
    { ...legacySnapshot, turns: [{ order: 1, targetExample: "Answer" }] },
    { ...legacySnapshot, turns: [{ order: 1, prompt: "Question" }] },
    { ...legacySnapshot, requiredTurns: 2 },
  ])("returns invalid for a broken legacy mission snapshot", (snapshot) => {
    expect(interpretMissionSnapshot(snapshot)).toEqual({ kind: "invalid" });
  });

  it.each([
    null,
    [],
    "snapshot",
    { missionId, title: "Unknown partial", requiredTurns: 1, turns: [] },
    { ...legacySnapshot, targetPattern: "I am going to ___." },
  ])("returns invalid for malformed or unknown partial data", (snapshot) => {
    expect(interpretMissionSnapshot(snapshot)).toEqual({ kind: "invalid" });
  });
});
