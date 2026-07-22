import { describe, expect, it } from "vitest";
import {
  HARD_TURN_CAP,
  buildConversationPrompt,
  conversationTurnInputSchema,
  validateGeneratedCocoReplyLine,
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
    expect(instructions).toContain(
      "only when the latest response is vague, unclear, or shows the learner is stuck",
    );
    expect(instructions).toContain("two concrete child-friendly choices");
    expect(instructions).toContain("Do not shame the learner");
  });

  it("asks expandable questions after meaningful short answers", () => {
    const prompt = buildConversationPrompt({
      ...input,
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "Where do you like to play games?",
          studentResponse: "Inside.",
        },
      ],
      turnOrder: 1,
    });
    const instructions = prompt.instructions.join(" ");

    expect(instructions).toContain("open question");
    expect(instructions).toContain("short phrase or sentence");
    expect(instructions).toContain("Do not default to yes/no or either/or questions");
    expect(instructions).toContain("What games do you play inside?");
  });

  it("pins the active activity and requires complete, punctuated sentences", () => {
    const instructions = buildConversationPrompt(input).instructions.join(" ");

    expect(instructions).toContain("active activity");
    expect(instructions).toContain("complete, correctly punctuated sentences");
    expect(instructions).toContain(
      "Who do you swim with?",
    );
    expect(instructions).toContain("What do you like about swimming together?");
    expect(instructions).toContain("What games do you play together?");
  });

  it("treats reply length as a soft preference", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "The beach sounds exciting! What will you play there with your family?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "Where will you go with your family?",
          latestStudentResponse: "We will go to the beach together.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("returns every deterministic violation in stable order", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Do you read books or watch TV? What happens next?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "Where do you swim?",
          latestStudentResponse: "At the pool.",
        },
      ),
    ).toEqual({
      ok: false,
      reasons: [
        "question_format",
        "either_or_question",
        "topic_drift",
      ],
    });
  });

  it("rejects the UAT run-on and accepts a punctuated on-topic reply", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Your friend is fun to swim with what games do you play together?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["run_on_question"] });

    expect(
      validateGeneratedCocoReplyLine(
        "Swimming together is fun! What do you like about it?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects punctuated topic drift independently of run-on formatting", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Your friend sounds fun! What games do you play together?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["topic_drift"] });
    expect(
      validateGeneratedCocoReplyLine(
        "That sounds fun! What games do you play together?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["topic_drift"] });
  });

  it("allows a nearby transition when the student rejects the active topic", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Okay! What do you like to do instead?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "How often do you play soccer?",
          latestStudentResponse: "I don't play soccer.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an auxiliary-question run-on independently of topic drift", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Swimming is fun do you swim every day?",
        {
          expectsQuestion: true,
          allowEitherOrQuestion: false,
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["run_on_question"] });
  });

  it("accepts a complete final closing line and rejects a final question", () => {
    expect(
      validateGeneratedCocoReplyLine("Thanks for talking with me!", {
        expectsQuestion: false,
        allowEitherOrQuestion: false,
      }),
    ).toEqual({ ok: true });
    expect(
      validateGeneratedCocoReplyLine("What will you do next?", {
        expectsQuestion: false,
        allowEitherOrQuestion: false,
      }),
    ).toEqual({ ok: false, reasons: ["question_format"] });
  });

  it("requires exactly one correctly punctuated question", () => {
    expect(
      validateGeneratedCocoReplyLine("That sounds fun", {
        expectsQuestion: true,
        allowEitherOrQuestion: false,
      }),
    ).toEqual({ ok: false, reasons: ["question_format"] });
    expect(
      validateGeneratedCocoReplyLine(
        "That sounds fun! Where do you swim? Who teaches you?",
        { expectsQuestion: true, allowEitherOrQuestion: false },
      ),
    ).toEqual({ ok: false, reasons: ["question_format"] });
  });
});
