import { describe, expect, it } from "vitest";
import type { MissionSnapshotTurn } from "@/domain/mission/schemas";
import {
  advanceConversationQuestion,
  deriveActiveStudentQuestion,
  deriveSameTurnRecoveryPrompt,
  deriveResumedDynamicPrompt,
  isPendingConversationRecovery,
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
  answerShape: "open",
};

describe("student question state", () => {
  it("uses current-row recovery without advancing turn one", () => {
    expect(
      deriveActiveStudentQuestion({
        conversationMode: true,
        turnIndex: 0,
        turns: [opener],
        dynamicPrompt: {
          text: "Do you play soccer with friends or family?",
          sourceTurnOrder: 1,
        },
      }),
    ).toMatchObject({
      kind: "conversation",
      prompt: "Do you play soccer with friends or family?",
      activeTurnOrder: 1,
      line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
    });
  });

  it("uses translation-only question state for a conversation opener", () => {
    const question = deriveActiveStudentQuestion({
      conversationMode: true,
      turnIndex: 0,
      turns: [opener],
      dynamicPrompt: null,
    });

    expect(question).toEqual({
      kind: "conversation",
      prompt: opener.prompt,
      replyHintFrame: "I like to ____.",
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
      dynamicPrompt: {
        text: "Tell me more about soccer.",
        sourceTurnOrder: 1,
      },
    });
    expect(question).toEqual({
      kind: "conversation",
      prompt: "Tell me more about soccer.",
      replyHintFrame: null,
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
        dynamicPrompt: {
          text: "Tell me more about soccer.",
          sourceTurnOrder: 1,
        },
      }),
    ).toEqual({
      kind: "conversation",
      prompt: "Tell me more about soccer.",
      replyHintFrame: null,
      activeTurnOrder: 2,
      recordingEnabled: true,
      line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
    });
  });

  it("restores the exact owned previous Coco line for a resumed dynamic question", () => {
    const dynamicPrompt = deriveResumedDynamicPrompt({
      conversationMode: true,
      startingTurnIndex: 1,
      pendingUnclearRetry: false,
      attemptTurns: [
        { turnOrder: 1, cocoLine: "Tell me more about soccer." },
        { turnOrder: 2, cocoLine: "A later line must not be used." },
      ],
    });

    expect(dynamicPrompt).toEqual({
      text: "Tell me more about soccer.",
      sourceTurnOrder: 1,
    });
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
      replyHintFrame: null,
      line: { lineKind: "coco_dynamic_line", turnOrder: 1 },
    });
  });

  it("restores pending recovery from the current row", () => {
    expect(
      deriveResumedDynamicPrompt({
        conversationMode: true,
        startingTurnIndex: 1,
        pendingUnclearRetry: true,
        attemptTurns: [
          { turnOrder: 1, cocoLine: "Who do you play soccer with?" },
          {
            turnOrder: 2,
            cocoLine: "Do you play soccer with friends or family?",
          },
        ],
      }),
    ).toEqual({
      text: "Do you play soccer with friends or family?",
      sourceTurnOrder: 2,
    });
  });

  it("restores pending recovery on the first conversation turn", () => {
    expect(
      deriveResumedDynamicPrompt({
        conversationMode: true,
        startingTurnIndex: 0,
        pendingUnclearRetry: true,
        attemptTurns: [
          {
            turnOrder: 1,
            cocoLine: "Do you play soccer with friends or family?",
          },
        ],
      }),
    ).toEqual({
      text: "Do you play soccer with friends or family?",
      sourceTurnOrder: 1,
    });
  });

  it("keeps incomplete and minimal-effort recovery rows pending", () => {
    for (const retryReason of [
      "incomplete_recording",
      "minimal_effort",
    ] as const) {
      const pendingRecovery = isPendingConversationRecovery({
        conversationMode: true,
        evaluation: {
          kind: "original",
          outcome: "retry_original",
          retryReason,
          ambiguityRetries: 1,
        },
        cocoLine: "Do you play soccer with friends or family?",
      });

      expect(pendingRecovery).toBe(true);
      expect(
        deriveResumedDynamicPrompt({
          conversationMode: true,
          startingTurnIndex: 0,
          pendingUnclearRetry: pendingRecovery,
          attemptTurns: [
            { turnOrder: 1, cocoLine: "Do you play soccer with friends or family?" },
          ],
        }),
      ).toEqual({
        text: "Do you play soccer with friends or family?",
        sourceTurnOrder: 1,
      });
    }
  });

  it.each([
    [
      "a free low-confidence audio retry",
      {
        kind: "original",
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        lowConfidenceAudioRetries: 1,
      },
      true,
    ],
    [
      "prompt echo",
      {
        kind: "original",
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 1,
        contractViolations: ["prompt_echo"],
      },
      false,
    ],
    [
      "an invalid ambiguity counter",
      {
        kind: "original",
        outcome: "retry_original",
        retryReason: "unclear_meaning",
        ambiguityRetries: 3,
      },
      false,
    ],
    [
      "a repeat row",
      {
        kind: "repeat",
        outcome: "repeat_retry",
        ambiguityRetries: 1,
      },
      false,
    ],
  ] as const)(
    "does not rebuild recovery predicates for %s",
    (_name, evaluation, expected) => {
      expect(
        isPendingConversationRecovery({
          conversationMode: true,
          evaluation,
          cocoLine: "Do you play soccer with friends or family?",
        }),
      ).toBe(expected);
    },
  );

  it("does not keep accepted or teacher-review rows pending", () => {
    for (const outcome of ["accepted_original", "teacher_review"] as const) {
      expect(
        isPendingConversationRecovery({
          conversationMode: true,
          evaluation: { kind: "original", outcome, ambiguityRetries: 1 },
          cocoLine: "A stale recovery question.",
        }),
      ).toBe(false);
    }
  });

  it("keeps normal first-turn resume without a dynamic prompt", () => {
    expect(
      deriveResumedDynamicPrompt({
        conversationMode: true,
        startingTurnIndex: 0,
        pendingUnclearRetry: false,
        attemptTurns: [
          { turnOrder: 1, cocoLine: "A future line must not be used." },
        ],
      }),
    ).toBeNull();
  });

  it("keeps a recovery prompt on the current turn", () => {
    expect(
      deriveSameTurnRecoveryPrompt({
        turnIndex: 0,
        pendingCocoLine: " Do you play soccer with friends or family? ",
      }),
    ).toEqual({
      turnIndex: 0,
      dynamicPrompt: {
        text: "Do you play soccer with friends or family?",
        sourceTurnOrder: 1,
      },
    });
  });

  it("fails closed when a same-turn recovery line is blank", () => {
    expect(
      deriveSameTurnRecoveryPrompt({
        turnIndex: 1,
        pendingCocoLine: "   ",
      }),
    ).toBeNull();
  });

  it("keeps normal resume on the previous completed row", () => {
    expect(
      deriveResumedDynamicPrompt({
        conversationMode: true,
        startingTurnIndex: 1,
        pendingUnclearRetry: false,
        attemptTurns: [
          { turnOrder: 1, cocoLine: "Who do you play soccer with?" },
          { turnOrder: 2, cocoLine: "A future line must not be used." },
        ],
      }),
    ).toEqual({
      text: "Who do you play soccer with?",
      sourceTurnOrder: 1,
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
    for (const dynamicPrompt of [
      null,
      { text: "   ", sourceTurnOrder: 1 },
    ]) {
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
      dynamicPrompt: {
        text: "Oh, what do you like to do instead?",
        sourceTurnOrder: 1,
      },
    });
  });

  it("resolves the final accepted chat turn to its closing line", () => {
    expect(
      resolveAcceptedConversationTurn({
        turnIndex: 3,
        requiredTurns: 4,
        pendingCocoLine:
          "Sushi sounds delicious! Thanks for talking with me. See you next time!",
      }),
    ).toEqual({
      kind: "closing",
      closingLine:
        "Sushi sounds delicious! Thanks for talking with me. See you next time!",
    });
  });

  it("fails closed when the final accepted turn has no closing line", () => {
    expect(
      resolveAcceptedConversationTurn({
        turnIndex: 3,
        requiredTurns: 4,
        pendingCocoLine: "   ",
      }),
    ).toEqual({ kind: "unavailable" });
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
