import { describe, expect, it } from "vitest";

import { addDynamicTurnQuestions } from "./audio-evidence";

type TurnRow = Parameters<typeof addDynamicTurnQuestions>[1][number];

function turn(turnOrder: number, cocoLine: string | null): TurnRow {
  return {
    id: `turn-${turnOrder}`,
    turn_order: turnOrder,
    original_transcript: null,
    improved_sentence: null,
    repeat_transcript: null,
    target_attempted: null,
    repeat_accepted: null,
    evaluation: null,
    coco_line: cocoLine,
  };
}

describe("addDynamicTurnQuestions", () => {
  it("carries each turn's coco_line forward as the next turn's question", () => {
    // A free-talking snapshot only ships turn 1's prompt.
    const questions = addDynamicTurnQuestions(new Map([[1, "What did you do today?"]]), [
      turn(1, "Who did you go with?"),
      turn(2, "Where did you eat?"),
      turn(3, null),
    ]);

    expect(questions.get(1)).toBe("What did you do today?");
    expect(questions.get(2)).toBe("Who did you go with?");
    expect(questions.get(3)).toBe("Where did you eat?");
  });

  it("keeps preset snapshot prompts instead of overwriting them", () => {
    const questions = addDynamicTurnQuestions(
      new Map([
        [1, "Preset one"],
        [2, "Preset two"],
      ]),
      [turn(1, "ignored dynamic line")],
    );

    expect(questions.get(2)).toBe("Preset two");
  });

  it("ignores blank coco lines", () => {
    const questions = addDynamicTurnQuestions(new Map(), [turn(1, "   ")]);

    expect(questions.has(2)).toBe(false);
  });
});
