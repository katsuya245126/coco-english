import { describe, expect, it } from "vitest";
import type { MissionSnapshotTurn } from "@/domain/mission/schemas";
import {
  advanceConversationQuestion,
  deriveActiveStudentQuestion,
  deriveResumedDynamicPrompt,
  resolveAcceptedConversationTurn,
} from "@/domain/mission/student-question-state";

const opener: MissionSnapshotTurn = {
  turnOrder: 1,
  prompt: "What do you like to do after school?",
  targetExample: "I like to play soccer after school.",
  hintLadder: {
    tier1: "Use I like to...",
    tier2: "play soccer",
    tier3: "I like to play soccer after school.",
  },
};

describe("student question state", () => {
  it("uses translation-only question state for a conversation opener", () => {
    const question = deriveActiveStudentQuestion({
      conversationMode: true,
      turnIndex: 0,
      turns: [opener],
      dynamicPrompt: "Tell me more about soccer.",
    });

    expect(question).toEqual({
      kind: "conversation",
      prompt: opener.prompt,
      activeTurnOrder: 1,
      recordingEnabled: true,
      line: { lineKind: "mission_prompt", turnOrder: 1 },
    });
  });

  it("carries a returned Coco line through correction-loop advance into the next question", () => {
    const advanced = advanceConversationQuestion({
      turnIndex: 0,
      pendingCocoLine: " Tell me more about soccer. ",
    });
    const question = deriveActiveStudentQuestion({
      conversationMode: true,
      turns: [opener],
      ...advanced,
    });

    expect(advanced).toEqual({
      turnIndex: 1,
      dynamicPrompt: "Tell me more about soccer.",
    });
    expect(question).toEqual({
      kind: "conversation",
      prompt: "Tell me more about soccer.",
      activeTurnOrder: 2,
      recordingEnabled: true,
      line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
    });
  });

  it("ignores a legacy authored tail when a generated conversation prompt owns turn two", () => {
    const legacyTail: MissionSnapshotTurn = {
      ...opener,
      turnOrder: 2,
      prompt: "What food do you like?",
    };

    expect(
      deriveActiveStudentQuestion({
        conversationMode: true,
        turnIndex: 1,
        turns: [opener, legacyTail],
        dynamicPrompt: "Tell me more about soccer.",
      }),
    ).toEqual({
      kind: "conversation",
      prompt: "Tell me more about soccer.",
      activeTurnOrder: 2,
      recordingEnabled: true,
      line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
    });
  });

  it("restores the exact owned previous Coco line for a resumed dynamic question", () => {
    const dynamicPrompt = deriveResumedDynamicPrompt({
      conversationMode: true,
      startingTurnIndex: 1,
      attemptTurns: [
        { turnOrder: 1, cocoLine: "Tell me more about soccer." },
        { turnOrder: 2, cocoLine: "A later line must not be used." },
      ],
    });

    expect(dynamicPrompt).toBe("Tell me more about soccer.");
    expect(
      deriveActiveStudentQuestion({
        conversationMode: true,
        turnIndex: 1,
        turns: [{ ...opener }, { ...opener, turnOrder: 2 }],
        dynamicPrompt,
      }),
    ).toMatchObject({
      kind: "conversation",
      prompt: "Tell me more about soccer.",
      line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
    });
  });

  it("keeps the answer-help ladder for preset missions", () => {
    expect(
      deriveActiveStudentQuestion({
        conversationMode: false,
        turnIndex: 0,
        turns: [opener],
        dynamicPrompt: null,
      }),
    ).toEqual({
      kind: "preset",
      prompt: opener.prompt,
      activeTurnOrder: 1,
      hintLadder: opener.hintLadder,
      targetExample: opener.targetExample,
      recordingEnabled: true,
      line: { lineKind: "mission_prompt", turnOrder: 1 },
    });
  });

  it("fails closed when a dynamic prompt is missing or blank", () => {
    for (const dynamicPrompt of [null, "   "]) {
      expect(
        deriveActiveStudentQuestion({
          conversationMode: true,
          turnIndex: 1,
          turns: [opener],
          dynamicPrompt,
        }),
      ).toEqual({
        kind: "unavailable",
        reason: "missing_dynamic_prompt",
        recordingEnabled: false,
      });
    }
  });

  it("advances an accepted chat turn directly to the pending Coco line", () => {
    expect(
      resolveAcceptedConversationTurn({
        turnIndex: 0,
        requiredTurns: 4,
        pendingCocoLine: " Oh, what do you like to do instead? ",
      }),
    ).toEqual({
      kind: "next",
      turnIndex: 1,
      dynamicPrompt: "Oh, what do you like to do instead?",
    });
  });

  it("completes the final accepted chat turn without requiring another Coco line", () => {
    expect(
      resolveAcceptedConversationTurn({
        turnIndex: 3,
        requiredTurns: 4,
        pendingCocoLine: null,
      }),
    ).toEqual({ kind: "complete" });
  });

  it("fails closed when a non-final accepted chat turn has no pending Coco line", () => {
    expect(
      resolveAcceptedConversationTurn({
        turnIndex: 1,
        requiredTurns: 4,
        pendingCocoLine: "   ",
      }),
    ).toEqual({ kind: "unavailable" });
  });
});
