import { describe, expect, it } from "vitest";
import { WITHHELD_STUDENT_RESPONSE } from "@/domain/ai/conversation-generation";
import {
  buildConversationHistory,
  selectUnclearRecoveryFallbackQuestion,
} from "@/server/student-access/conversation-history";

describe("selectUnclearRecoveryFallbackQuestion", () => {
  it("uses the active question for recovery 1", () => {
    expect(
      selectUnclearRecoveryFallbackQuestion({
        attempt: 1,
        activeQuestion: "Who do you like to play soccer with?",
        conversationHistory: [],
        ambiguityHistory: [],
      }),
    ).toBe("Who do you like to play soccer with?");
  });

  it("steps back to the latest understood exchange for recovery 2", () => {
    expect(
      selectUnclearRecoveryFallbackQuestion({
        attempt: 2,
        activeQuestion: "Do you play soccer with friends or family?",
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What do you like to do after school?",
            studentResponse: "I play soccer.",
          },
          {
            turnOrder: 2,
            cocoLine: "Do you play soccer with friends or family?",
            studentResponse: WITHHELD_STUDENT_RESPONSE,
          },
        ],
        ambiguityHistory: [{ question: "Who do you like to play soccer with?" }],
      }),
    ).toBe("What do you like to do after school?");
  });

  it("uses the saved opener for a turn-one second recovery", () => {
    expect(
      selectUnclearRecoveryFallbackQuestion({
        attempt: 2,
        activeQuestion: "Do you like soccer?",
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Do you like soccer?",
            studentResponse: WITHHELD_STUDENT_RESPONSE,
          },
        ],
        ambiguityHistory: [{ question: "What do you like to do after school?" }],
      }),
    ).toBe("What do you like to do after school?");
  });
});

describe("buildConversationHistory", () => {
  it("anchors the opener and chains persisted Coco lines in order", () => {
    const result = buildConversationHistory({
      openerLine: "Who do you talk with at school?",
      currentTurnOrder: 2,
      currentStudentResponse: "In the classroom.",
      priorTurns: [
        {
          turn_order: 1,
          original_transcript: "I talk Minju.",
          improved_sentence: "I talk with Minju.",
          coco_line: "Where do you talk with Minju?",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      history: [
        {
          turnOrder: 1,
          cocoLine: "Who do you talk with at school?",
          studentResponse: "I talk with Minju.",
        },
        {
          turnOrder: 2,
          cocoLine: "Where do you talk with Minju?",
          studentResponse: "In the classroom.",
        },
      ],
    });
  });

  it("grounds later Coco turns in a persisted accepted minor recast", () => {
    expect(
      buildConversationHistory({
        openerLine: "Where are you going?",
        currentTurnOrder: 2,
        currentStudentResponse: "I want a comic book.",
        priorTurns: [
          {
            turn_order: 1,
            original_transcript: "I'm going to library",
            improved_sentence: "I'm going to the library.",
            coco_line: "What do you want to read there?",
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      history: [
        { studentResponse: "I'm going to the library." },
        { studentResponse: "I want a comic book." },
      ],
    });
  });

  it("builds turn one with no persisted rows", () => {
    expect(
      buildConversationHistory({
        openerLine: "How often do you play soccer?",
        currentTurnOrder: 1,
        currentStudentResponse: "I don't play soccer.",
        priorTurns: [],
      }),
    ).toMatchObject({ ok: true, history: [{ turnOrder: 1 }] });
  });

  it.each([
    {
      label: "missing row",
      input: { currentTurnOrder: 2, priorTurns: [] },
    },
    {
      label: "wrong row order",
      input: {
        currentTurnOrder: 2,
        priorTurns: [
          {
            turn_order: 2,
            original_transcript: "Minju.",
            improved_sentence: null,
            coco_line: "Where?",
          },
        ],
      },
    },
    {
      label: "missing linking Coco line",
      input: {
        currentTurnOrder: 2,
        priorTurns: [
          {
            turn_order: 1,
            original_transcript: "Minju.",
            improved_sentence: null,
            coco_line: null,
          },
        ],
      },
    },
    {
      label: "blank prior response",
      input: {
        currentTurnOrder: 2,
        priorTurns: [
          {
            turn_order: 1,
            original_transcript: null,
            improved_sentence: null,
            coco_line: "Where?",
          },
        ],
      },
    },
  ])("fails closed for $label", ({ input }) => {
    expect(
      buildConversationHistory({
        openerLine: "Who do you talk with?",
        currentStudentResponse: "In class.",
        ...input,
      }),
    ).toEqual({ ok: false, error: "invalid_history" });
  });
});

describe("withholding turns that were never understood (attempt 4c1f229e)", () => {
  const priorTurn = (evaluation: unknown) => ({
    turn_order: 1,
    original_transcript: "발러런트",
    improved_sentence: null,
    coco_line: "Do you like to play games inside or outside?",
    evaluation,
  });

  const build = (evaluation: unknown) =>
    buildConversationHistory({
      openerLine: "What kind of games are you going to play this summer?",
      currentTurnOrder: 2,
      currentStudentResponse: "Inside.",
      priorTurns: [priorTurn(evaluation)],
    });

  it.each([["failed_schema"], ["provider_failed"], ["low_confidence"]])(
    "withholds a prior turn left for teacher review (%s)",
    (reviewReason) => {
      const result = build({ outcome: "teacher_review", reviewReason });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.history[0]?.studentResponse).toBe("(not understood)");
      // The current turn is untouched.
      expect(result.history[1]?.studentResponse).toBe("Inside.");
    },
  );

  it.each([
    ["the jsonb column default", {}],
    ["null", null],
    ["undefined", undefined],
    ["an unexpected array", []],
    ["an accepted turn", { outcome: "accepted_original" }],
    ["a corrected turn", { outcome: "needs_correction" }],
  ])("keeps the answer for %s", (_label, evaluation) => {
    const result = build(evaluation);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.history[0]?.studentResponse).toBe("발러런트");
  });

  it("keeps a withheld turn withheld on every later turn", () => {
    // The original defect: masking only the latest turn let an unusable answer
    // return as trusted grounding one turn later and reach the closing recap.
    const result = buildConversationHistory({
      openerLine: "What kind of games are you going to play this summer?",
      currentTurnOrder: 3,
      currentStudentResponse: "It's fun.",
      priorTurns: [
        priorTurn({ outcome: "teacher_review", reviewReason: "failed_schema" }),
        {
          turn_order: 2,
          original_transcript: "Inside",
          improved_sentence: "I like to play games inside.",
          coco_line: "Thanks for telling me! What do you like about that?",
          evaluation: { outcome: "accepted_repeat" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.history[0]?.studentResponse).toBe("(not understood)");
    expect(result.history[1]?.studentResponse).toBe(
      "I like to play games inside.",
    );
  });

  it("still rejects a prior turn with no transcript at all", () => {
    expect(
      buildConversationHistory({
        openerLine: "What will you do?",
        currentTurnOrder: 2,
        currentStudentResponse: "Inside.",
        priorTurns: [
          {
            turn_order: 1,
            original_transcript: null,
            improved_sentence: null,
            coco_line: "Where?",
            evaluation: { outcome: "teacher_review" },
          },
        ],
      }),
    ).toEqual({ ok: false, error: "invalid_history" });
  });
});
