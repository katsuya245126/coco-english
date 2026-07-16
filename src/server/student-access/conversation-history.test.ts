import { describe, expect, it } from "vitest";
import { buildConversationHistory } from "@/server/student-access/conversation-history";

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
