import { describe, expect, it } from "vitest";
import {
  reconstructMissionFlow,
  transitionMissionFlow,
  type FlowState,
} from "@/domain/flow/mission-transitions";

const emptyState = (): FlowState =>
  reconstructMissionFlow({
    startingTurnIndex: 0,
    initialDynamicPrompt: null,
    initialReview: null,
  });

const presetContext = {
  conversationMode: false,
  requiredTurns: 2,
} as const;

const conversationContext = {
  conversationMode: true,
  requiredTurns: 3,
} as const;

function originalUpload(
  outcome: "accepted_original" | "needs_correction" | "teacher_review" | "retry_original",
  evaluationExtra: Record<string, unknown> = {},
  uploadExtra: Record<string, unknown> = {},
) {
  return {
    displayTranscript: "I like soccer.",
    evaluation: {
      kind: "original" as const,
      outcome,
      improvedSentence: outcome === "needs_correction" ? "I like playing soccer." : null,
      ...evaluationExtra,
    },
    ...uploadExtra,
  };
}

function repeatUpload(
  outcome: "accepted_repeat" | "retry_repeat" | "teacher_review" | "repeat_limit_reached",
) {
  return {
    displayTranscript: "I like playing soccer.",
    evaluation: {
      kind: "repeat" as const,
      outcome,
    },
  };
}

function conversationRepeatState(
  turnIndex: number,
  cocoLine: string,
): FlowState {
  const originalFeedback = transitionMissionFlow(
    { ...emptyState(), turnIndex },
    {
      type: "originalUploaded",
      ...conversationContext,
      upload: originalUpload(
        "needs_correction",
        {},
        { cocoLine },
      ),
    },
  );
  expect(originalFeedback).toMatchObject({
    kind: "apply",
    state: { step: "aiFeedback" },
  });

  const repeat = transitionMissionFlow(originalFeedback.state, {
    type: "continueOriginal",
    ...conversationContext,
  });
  expect(repeat).toMatchObject({ kind: "apply", state: { step: "repeat" } });
  return repeat.state;
}

describe("mission flow transitions", () => {
  it("interprets an accepted original upload as feedback before continuing", () => {
    expect(
      transitionMissionFlow(emptyState(), {
        type: "originalUploaded",
        conversationMode: false,
        requiredTurns: 2,
        upload: {
          displayTranscript: "I like soccer.",
          evaluation: {
            kind: "original",
            outcome: "accepted_original",
            improvedSentence: null,
          },
        },
      }),
    ).toEqual({
      kind: "apply",
      state: {
        ...emptyState(),
        step: "aiFeedback",
        originalTranscript: "I like soccer.",
        originalFeedback: {
          kind: "acceptedOriginal",
          transcript: "I like soccer.",
        },
      },
    });
  });

  it.each([
    ["retryOriginal", {}],
    ["retryIncompleteRecording", { retryReason: "incomplete_recording" }],
    ["retryMinimalEffort", { retryReason: "minimal_effort" }],
    ["retryUnclearMeaning", { retryReason: "unclear_meaning" }],
    ["teacherReview", { outcome: "teacher_review" }],
  ] as const)("maps original evaluation metadata to %s feedback", (expected, metadata) => {
    const evaluationOutcome = expected === "teacherReview"
      ? "teacher_review"
      : "retry_original";
    const decision = transitionMissionFlow(emptyState(), {
      type: "originalUploaded",
      ...presetContext,
      upload: originalUpload(
        evaluationOutcome as "retry_original" | "teacher_review",
        expected === "teacherReview" ? {} : metadata,
      ),
    });

    expect(decision).toMatchObject({
      kind: "apply",
      state: { step: "aiFeedback", originalFeedback: { kind: expected } },
    });
  });

  it.each([
    ["repeatAccepted", "accepted_repeat"],
    ["repeatRetry", "retry_repeat"],
    ["repeatReview", "teacher_review"],
    ["repeatLimitReached", "repeat_limit_reached"],
  ] as const)("maps %s repeat results", (expected, outcome) => {
    const decision = transitionMissionFlow(emptyState(), {
      type: "repeatUploaded",
      ...presetContext,
      upload: repeatUpload(outcome),
    });

    expect(decision).toMatchObject({
      kind: "apply",
      state: { step: "repeatFeedback", repeatFeedback: { kind: expected } },
    });
  });

  it("reconstructs a resumed feedback screen and clean Preset/Conversation states", () => {
    expect(
      reconstructMissionFlow({
        startingTurnIndex: 1,
        initialDynamicPrompt: {
          text: "Who do you play with?",
          sourceTurnOrder: 1,
        },
        initialReview: {
          step: "aiFeedback",
          outcome: "needsCorrection",
          transcript: "I play soccer.",
          improvedSentence: "I like playing soccer.",
          clipKind: "original_answer",
          cocoLine: "Who do you play with?",
        },
      }),
    ).toMatchObject({
      turnIndex: 1,
      step: "aiFeedback",
      originalTranscript: "I play soccer.",
      originalFeedback: {
        kind: "needsCorrection",
        improvedSentence: "I like playing soccer.",
      },
      cocoLine: "Who do you play with?",
      dynamicPrompt: {
        text: "Who do you play with?",
        sourceTurnOrder: 1,
      },
    });

    expect(
      reconstructMissionFlow({
        startingTurnIndex: 1,
        initialDynamicPrompt: null,
        initialReview: null,
      }),
    ).toEqual({ ...emptyState(), turnIndex: 1 });
  });

  it("keeps a same-turn conversation recovery question answerable", () => {
    const decision = transitionMissionFlow(emptyState(), {
      type: "originalUploaded",
      ...conversationContext,
      upload: originalUpload(
        "retry_original",
        { retryReason: "unclear_meaning" },
        { cocoLine: "Do you play soccer with friends or family?" },
      ),
    });

    expect(decision).toEqual({
      kind: "apply",
      state: {
        ...emptyState(),
        step: "question",
        hasRetriedThisTurn: true,
        dynamicPrompt: {
          text: "Do you play soccer with friends or family?",
          sourceTurnOrder: 1,
        },
      },
    });
  });

  it("reconstructs a persisted same-turn recovery without reopening feedback", () => {
    expect(
      reconstructMissionFlow({
        startingTurnIndex: 1,
        initialDynamicPrompt: {
          text: "Could you say that another way?",
          sourceTurnOrder: 2,
        },
        initialReview: {
          step: "aiFeedback",
          outcome: "retryUnclearMeaning",
          transcript: "Maybe.",
          improvedSentence: null,
          clipKind: "original_answer",
          cocoLine: "Could you say that another way?",
        },
      }),
    ).toEqual({
      ...emptyState(),
      turnIndex: 1,
      hasRetriedThisTurn: true,
      dynamicPrompt: {
        text: "Could you say that another way?",
        sourceTurnOrder: 2,
      },
    });
  });

  it("advances a corrected Preset turn through repeat and final completion", () => {
    const feedback = transitionMissionFlow(emptyState(), {
      type: "originalUploaded",
      ...presetContext,
      upload: originalUpload("needs_correction"),
    });
    expect(feedback.kind).toBe("apply");

    const repeat = transitionMissionFlow(feedback.state, {
      type: "continueOriginal",
      ...presetContext,
    });
    expect(repeat).toMatchObject({ kind: "apply", state: { step: "repeat" } });

    const repeatFeedback = transitionMissionFlow(repeat.state, {
      type: "repeatUploaded",
      ...presetContext,
      upload: repeatUpload("accepted_repeat"),
    });
    expect(repeatFeedback).toMatchObject({
      kind: "apply",
      state: { step: "repeatFeedback", repeatFeedback: { kind: "repeatAccepted" } },
    });

    const nextTurn = transitionMissionFlow(repeatFeedback.state, {
      type: "continueRepeat",
      ...presetContext,
    });
    expect(nextTurn).toEqual({
      kind: "apply",
      state: {
        ...emptyState(),
        turnIndex: 1,
      },
    });
  });

  it("returns a final Preset completion decision for accepted originals", () => {
    const state = { ...emptyState(), turnIndex: 1, step: "aiFeedback" as const,
      originalFeedback: { kind: "acceptedOriginal" as const, transcript: "I like soccer." },
      originalTranscript: "I like soccer.",
    };

    expect(
      transitionMissionFlow(state, {
        type: "continueOriginal",
        ...presetContext,
      }),
    ).toEqual({
      kind: "complete",
      state: { ...state, step: "complete" },
    });
  });

  it("returns review-pending only for a final Preset teacher-review result", () => {
    const state = { ...emptyState(), turnIndex: 1, step: "aiFeedback" as const,
      originalFeedback: { kind: "teacherReview" as const, transcript: "Maybe." },
      originalTranscript: "Maybe.",
    };

    expect(
      transitionMissionFlow(state, {
        type: "continueOriginal",
        ...presetContext,
      }),
    ).toEqual({
      kind: "reviewPending",
      state: { ...state, step: "reviewPending" },
    });
  });

  it.each(["acceptedOriginal", "teacherReview"] as const)(
    "opens the next clean Preset question after a non-final %s original",
    (kind) => {
      const state = {
        ...emptyState(),
        step: "aiFeedback" as const,
        originalTranscript: "Maybe.",
        originalFeedback: { kind, transcript: "Maybe." },
      };

      expect(
        transitionMissionFlow(state, {
          type: "continueOriginal",
          ...presetContext,
        }),
      ).toEqual({
        kind: "apply",
        state: { ...emptyState(), turnIndex: 1 },
      });
    },
  );

  it.each(["repeatReview", "repeatLimitReached"] as const)(
    "opens the next clean Preset question after a non-final %s repeat",
    (kind) => {
      const state = {
        ...emptyState(),
        step: "repeatFeedback" as const,
        repeatTranscript: "I like playing soccer.",
        repeatFeedback: { kind, transcript: "I like playing soccer." },
      };

      expect(
        transitionMissionFlow(state, {
          type: "continueRepeat",
          ...presetContext,
        }),
      ).toEqual({
        kind: "apply",
        state: { ...emptyState(), turnIndex: 1 },
      });
    },
  );

  it("advances accepted and reviewed Conversation turns without a transition card", () => {
    const accepted = transitionMissionFlow(emptyState(), {
      type: "originalUploaded",
      ...conversationContext,
      upload: originalUpload(
        "accepted_original",
        {},
        { cocoLine: "Tell me more about soccer." },
      ),
    });
    expect(accepted).toEqual({
      kind: "apply",
      state: {
        ...emptyState(),
        turnIndex: 1,
        dynamicPrompt: {
          text: "Tell me more about soccer.",
          sourceTurnOrder: 1,
        },
      },
    });

    const reviewed = transitionMissionFlow(accepted.state, {
      type: "originalUploaded",
      ...conversationContext,
      upload: originalUpload(
        "teacher_review",
        {},
        { cocoLine: "Who do you play with?" },
      ),
    });
    expect(reviewed).toMatchObject({
      kind: "apply",
      state: {
        turnIndex: 2,
        step: "question",
        dynamicPrompt: {
          text: "Who do you play with?",
          sourceTurnOrder: 2,
        },
      },
    });
  });

  it("returns the final Conversation closing only after the completion action succeeds", () => {
    const state = {
      ...emptyState(),
      turnIndex: 2,
      dynamicPrompt: { text: "What is your favorite sport?", sourceTurnOrder: 2 },
    };

    expect(
      transitionMissionFlow(state, {
        type: "originalUploaded",
        ...conversationContext,
        upload: originalUpload(
          "accepted_original",
          {},
          { cocoLine: "Thanks for talking with me. See you next time!" },
        ),
      }),
    ).toEqual({
      kind: "closing",
      state: {
        ...state,
        step: "closing",
        cocoLine: "Thanks for talking with me. See you next time!",
      },
    });
  });

  it.each([
    ["accepted", "accepted_repeat"],
    ["review", "teacher_review"],
    ["limit", "repeat_limit_reached"],
  ] as const)(
    "advances a live Conversation repeat upload with a %s result",
    (_label, outcome) => {
      const state = conversationRepeatState(1, "Ask me one more question.");

      expect(
        transitionMissionFlow(state, {
          type: "repeatUploaded",
          ...conversationContext,
          upload: repeatUpload(outcome),
        }),
      ).toEqual({
        kind: "apply",
        state: {
          ...emptyState(),
          turnIndex: 2,
          dynamicPrompt: {
            text: "Ask me one more question.",
            sourceTurnOrder: 2,
          },
        },
      });
    },
  );

  it.each([
    ["accepted", "accepted_repeat"],
    ["review", "teacher_review"],
    ["limit", "repeat_limit_reached"],
  ] as const)(
    "closes after a final live Conversation repeat upload with a %s result",
    (_label, outcome) => {
      const state = conversationRepeatState(
        2,
        "Thanks for talking with me. See you next time!",
      );

      expect(
        transitionMissionFlow(state, {
          type: "repeatUploaded",
          ...conversationContext,
          upload: repeatUpload(outcome),
        }),
      ).toEqual({
        kind: "closing",
        state: {
          ...state,
          step: "closing",
        },
      });
    },
  );

  it("fails closed when a Conversation upload has no owned Coco line", () => {
    const state = { ...emptyState(), turnIndex: 1 };

    expect(
      transitionMissionFlow(state, {
        type: "originalUploaded",
        ...conversationContext,
        upload: originalUpload("accepted_original"),
      }),
    ).toEqual({
      kind: "unavailable",
      state: {
        ...state,
        turnIndex: 2,
      },
    });
  });

  it("uses canonical resets after retries and hint changes only the hint field", () => {
    const state: FlowState = {
      ...emptyState(),
      step: "repeatFeedback",
      hintLevel: 2,
      originalTranscript: "I like soccer.",
      repeatTranscript: "I like playing soccer.",
      improvedSentence: "I like playing soccer.",
      originalFeedback: { kind: "needsCorrection", transcript: "I like soccer.", improvedSentence: "I like playing soccer." },
      repeatFeedback: { kind: "repeatRetry", transcript: "I like playing soccer." },
      hasRetriedThisTurn: false,
      cocoLine: "Try again.",
      dynamicPrompt: { text: "Tell me more.", sourceTurnOrder: 1 },
    };

    const retryEvents = [
      { type: "retryOriginal" },
      { type: "retryWithImprovedSentence" },
      { type: "retryRepeat" },
    ] as const;

    for (const event of retryEvents) {
      const decision = transitionMissionFlow(state, event);
      expect(decision.kind).toBe("apply");
      expect(decision.state.hasRetriedThisTurn).toBe(true);
      expect(decision.state.repeatTranscript).toBeNull();
      expect(decision.state.repeatFeedback).toBeNull();

      if (event.type === "retryOriginal") {
        expect(decision.state).toMatchObject({
          step: "question",
          originalTranscript: null,
          improvedSentence: null,
          originalFeedback: null,
        });
      } else {
        expect(decision.state).toMatchObject({
          step: "repeat",
          originalTranscript: state.originalTranscript,
          improvedSentence: state.improvedSentence,
          originalFeedback: state.originalFeedback,
        });
      }
    }
    expect(
      transitionMissionFlow(state, { type: "revealHint", hintLevel: 3 }),
    ).toEqual({ kind: "apply", state: { ...state, hintLevel: 3 } });
  });
});
