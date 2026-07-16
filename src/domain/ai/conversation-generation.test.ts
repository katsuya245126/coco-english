import { describe, expect, it } from "vitest";
import {
  HARD_TURN_CAP,
  buildConversationPrompt,
  conversationTurnInputSchema,
  type GenerateCocoReplyInput,
} from "@/domain/ai/conversation-generation";

const history = [
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
];

const input: GenerateCocoReplyInput = {
  scenePremise: "Friends talk together during the school day.",
  targetPattern: "I talk with ___ in ___.",
  turnOrder: 2,
  requiredTurns: 5,
  hardCap: HARD_TURN_CAP,
  windDown: false,
  conversationHistory: history,
};

describe("conversation history generation contract", () => {
  it("accepts ordered history and places the complete history in the prompt", () => {
    expect(conversationTurnInputSchema.safeParse(input).success).toBe(true);
    expect(buildConversationPrompt(input)).toMatchObject({
      conversationHistory: history,
      turnOrder: 2,
    });
  });

  it.each([
    { label: "empty", value: [] },
    {
      label: "duplicate order",
      value: [history[0], { ...history[1], turnOrder: 1 }],
    },
    {
      label: "out of order",
      value: [history[1], history[0]],
    },
    {
      label: "blank response",
      value: [{ ...history[0], studentResponse: "   " }],
    },
    {
      label: "over hard cap",
      value: Array.from({ length: HARD_TURN_CAP + 1 }, (_, index) => ({
        turnOrder: index + 1,
        cocoLine: `Question ${index + 1}?`,
        studentResponse: `Answer ${index + 1}.`,
      })),
    },
  ])("rejects $label history", ({ value }) => {
    expect(
      conversationTurnInputSchema.safeParse({
        ...input,
        turnOrder: Math.max(1, value.length),
        conversationHistory: value,
      }).success,
    ).toBe(false);
  });

  it("rejects history whose final exchange is not the requested turn", () => {
    expect(
      conversationTurnInputSchema.safeParse({ ...input, turnOrder: 3 }).success,
    ).toBe(false);
  });

  it("requires a concrete narrowing question for a vague latest answer", () => {
    const prompt = buildConversationPrompt({
      ...input,
      conversationHistory: [
        history[0],
        {
          turnOrder: 2,
          cocoLine: "What do you and Minju talk about?",
          studentResponse: "Anything.",
        },
      ],
    });
    const instructions = prompt.instructions.join(" ");

    expect(instructions).toContain("minimally informative");
    expect(instructions).toContain("do not echo the vague word");
    expect(instructions).toContain("two concrete child-friendly choices");
    expect(instructions).toContain("Do not shame the learner");
  });
});
