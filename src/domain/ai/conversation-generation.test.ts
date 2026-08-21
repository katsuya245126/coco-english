import { describe, expect, it } from "vitest";
import {
  HARD_TURN_CAP,
  WITHHELD_STUDENT_RESPONSE,
  buildConversationPrompt,
  conversationReplyMode,
  conversationTurnInputSchema,
  mostRecentUnderstoodExchange,
  parseGeneratedCocoReply,
  withClosingSignOff,
  validateGeneratedCocoReplyParts,
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
  targetPattern: "I talk with ___ in ___.",
  turnOrder: 2,
  requiredTurns: 5,
  hardCap: HARD_TURN_CAP,
  safetyMode: "standard",
  conversationHistory: history,
  responseHandling: "normal",
};

function historyThrough(turnOrder: number) {
  return Array.from({ length: turnOrder }, (_, index) => ({
    turnOrder: index + 1,
    cocoLine:
      index === turnOrder - 1
        ? "What did you enjoy today?"
        : `Question ${index + 1}?`,
    studentResponse:
      index === turnOrder - 1
        ? "I enjoyed swimming."
        : `Answer ${index + 1}.`,
  }));
}

describe("closing sign-off", () => {
  function closingReply(reaction: string) {
    const parsed = parseGeneratedCocoReply({ reaction, focus: null, question: null });
    if (!parsed.ok) throw new Error("expected parseable closing");
    return parsed.reply;
  }

  it("appends the sign-off to a closing that has none", () => {
    expect(withClosingSignOff(closingReply("Sushi sounds tasty.")).line).toBe(
      "Sushi sounds tasty. See you next time!",
    );
  });

  it("does not double up when the model already wrote a goodbye", () => {
    expect(
      withClosingSignOff(closingReply("Sushi sounds tasty. See you next time!")).line,
    ).toBe("Sushi sounds tasty. See you next time!");
  });

  it("replaces a different farewell with the fixed sign-off", () => {
    expect(withClosingSignOff(closingReply("Great job today. See you later!")).line).toBe(
      "Great job today. See you next time!",
    );
  });

  it("is idempotent", () => {
    const once = withClosingSignOff(closingReply("Nice work."));
    expect(withClosingSignOff(once)).toEqual(once);
  });
});

describe("most recent understood conversation grounding", () => {
  it("selects the latest exchange during normal handling", () => {
    expect(
      mostRecentUnderstoodExchange({
        conversationHistory: history,
        responseHandling: "normal",
      }),
    ).toEqual(history.at(-1));
  });

  it("skips an unclear latest exchange and selects the earlier waterpark answer", () => {
    const waterparkHistory = [
      {
        turnOrder: 1,
        cocoLine: "Where are you going this summer?",
        studentResponse: "I'm going to the waterpark.",
      },
      {
        turnOrder: 2,
        cocoLine: "Who are you going with?",
        studentResponse: "Something unclear.",
      },
    ];

    expect(
      mostRecentUnderstoodExchange({
        conversationHistory: waterparkHistory,
        responseHandling: "review_pending",
      }),
    ).toEqual(waterparkHistory[0]);
  });

  it("returns no exchange for a first-turn unclear answer and keeps the saved opener as fallback grounding", () => {
    const prompt = buildConversationPrompt({
      ...input,
      turnOrder: 1,
      responseHandling: "review_pending",
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "Where are you going this summer?",
          studentResponse: "Something unclear.",
        },
      ],
    });

    expect(
      mostRecentUnderstoodExchange({
        conversationHistory: prompt.conversationHistory,
        responseHandling: "review_pending",
      }),
    ).toBeNull();
    expect(prompt).not.toHaveProperty("scenePremise");
    expect(prompt.instructions.join(" ")).toContain(
      "If no studentResponse is usable, ask one short neutral question grounded in Coco's saved opening question.",
    );
  });
});

describe("unclear-answer recovery generation", () => {
  it("builds recovery without the unclear transcript", () => {
    const recoveryInput: GenerateCocoReplyInput = {
      ...input,
      turnOrder: 2,
      requiredTurns: 2,
      responseHandling: "review_pending",
      generationPurpose: {
        kind: "unclear_recovery",
        attempt: 1,
        fallbackQuestion: "Who do you like to play soccer with?",
      },
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "What do you like to do after school?",
          studentResponse: "I play soccer.",
        },
        {
          turnOrder: 2,
          cocoLine: "Who do you like to play soccer with?",
          studentResponse: "garbled words must disappear",
        },
      ],
    };
    const prompt = buildConversationPrompt(recoveryInput);
    expect(conversationReplyMode(recoveryInput)).toBe("follow_up");
    expect(prompt.instructions.join(" ")).toContain(
      "Simplify the supplied fallbackQuestion",
    );
    expect(JSON.stringify(prompt)).not.toContain("garbled words must disappear");
  });

  it("allows a question-only concrete choice on recovery", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: null,
          focus: null,
          question: "Do you play soccer with friends or family?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Who do you like to play soccer with?",
          latestStudentResponse: "I play soccer.",
          allowClosedQuestion: true,
          questionOnly: true,
        },
      ),
    ).toEqual({ ok: true });
  });
});

describe("structured Coco reply parts", () => {
  it("assembles a follow-up while preserving reply.line for consumers", () => {
    expect(
      parseGeneratedCocoReply({
        reaction: "Nice plans!",
        focus: "swim",
        question: "Who will you swim with?",
      }),
    ).toEqual({
      ok: true,
      reply: {
        reaction: "Nice plans!",
        focus: "swim",
        question: "Who will you swim with?",
        line: "Nice plans! Who will you swim with?",
      },
    });
  });

  it("rejects closing parts that contain a focus or question", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "That sounds great. See you next time!",
          focus: "swim",
          question: null,
        },
        { expectsQuestion: false, latestStudentResponse: "I swim." },
      ).ok,
    ).toBe(false);
  });

  it("checks the generated question itself for topic drift", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Swimming sounds nice!",
          focus: null,
          question: "What color is the sky?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Who will you swim with?",
          latestStudentResponse: "I will swim with my family.",
        },
      ),
    ).toEqual({ ok: false, reasons: ["topic_drift"] });
  });

  it("does not let a reaction ground an unrelated contentless question", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Swimming sounds nice!",
          focus: null,
          question: "Who are you?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Who will you swim with?",
          latestStudentResponse: "I will swim with my family.",
        },
      ),
    ).toEqual({ ok: false, reasons: ["topic_drift"] });
  });

  it("treats an activity and its object as one focused detail", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Playing Jenga sounds fun!",
          focus: "Jenga",
          question: "Who taught you Jenga?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "What games do you play when you swim?",
          latestStudentResponse: "I play Jenga.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("does not reject an on-topic question for a paraphrased focus label", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "That sounds nice!",
          focus: "family meal",
          question: "What food will you eat with your family?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "What will you do at the beach?",
          latestStudentResponse:
            "I will swimming and my family eat 삼겹살.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a normal closing that ignores the latest food answer", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "I am glad you told me about your plans at the beach.",
          focus: null,
          question: null,
        },
        {
          expectsQuestion: false,
          requireClosingGrounding: true,
          latestStudentResponse: "watermelon and shrimp and 삼겹살 BBQ.",
        },
      ),
    ).toEqual({ ok: false, reasons: ["closing_ungrounded"] });
  });

  it.each([
    [
      {
        reaction: "Eating watermelon, swimming, and eating chicken sounds fun!",
        focus: "swimming",
        question: "Who will you swim with?",
      },
      "multi_detail_echo",
    ],
    [
      {
        reaction: "Eating watermelon swimming eating chicken!",
        focus: "swimming",
        question: "Who will you swim with?",
      },
      "response_summary",
    ],
    [
      {
        reaction: "That sounds delicious and fun!",
        focus: "swimming",
        question: "Who will you swim with?",
      },
      "stacked_generic_reaction",
    ],
  ])("reports %s deterministically", (parts, violation) => {
    const result = validateGeneratedCocoReplyParts(parts, {
      expectsQuestion: true,
      activeQuestion: "What will you do in the valley?",
      latestStudentResponse: "I will eat watermelon, swim, and eat chicken.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain(violation);
  });
});

describe("multi_detail_echo list-parrot scope (attempt 4c1f229e turn 4)", () => {
  it("accepts a specific acknowledgement of a short two-detail answer", () => {
    // The rejected reply from the attempt. The system prompt gives this exact
    // exchange as its worked example, so the policy was discarding the
    // documented desired output and serving a canned line instead.
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Playing games inside sounds fun.",
          focus: "games",
          question: "What games do you play inside?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Do you like to play games inside or outside?",
          latestStudentResponse: "I play games inside.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("allows a long answer whose reaction echoes only the declared focus", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "Swimming sounds fun!",
        focus: "swimming",
        question: "Who will you swim with?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What will you do in the valley?",
        latestStudentResponse: "I will eat watermelon, swim, and eat chicken.",
      },
    );

    if (!result.ok) expect(result.reasons).not.toContain("multi_detail_echo");
  });

  it("still rejects parroting a genuine list back at the child", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction:
          "You play soccer and basketball with Minju at school sounds fun!",
        focus: "soccer",
        question: "Who do you play soccer with?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What do you do after school?",
        latestStudentResponse:
          "I play soccer and basketball with Minju at school on Saturdays.",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("multi_detail_echo");
  });

  it("keeps response_summary independent of the focus exclusion", () => {
    // Guards against a future refactor collapsing the two checks: this echoes
    // every detail, so response_summary must fire even where focus-exclusion
    // drops multi_detail_echo below its threshold.
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "Watermelon swimming chicken!",
        focus: "watermelon",
        question: "Who will you swim with?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What will you do in the valley?",
        latestStudentResponse: "I will eat watermelon, swim, and eat chicken.",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("response_summary");
  });
});

/*
 * Evidence: inspect-attempts 2026-07-27. Six of twenty-five logged turns closed
 * a meaningful answer with an either/or or yes/no question, and in three of them
 * the closed question directly produced the next degenerate answer:
 *
 *   bbc0c5a7 t2 "Do you go swimming in the sea with your family or friends?"
 *     -> "Yes, I do."      (teacher_review, failed_schema)
 *   e947a05d t3 "Do you like to swim fast or slow?"
 *     -> "I can't swim."   (closed the topic)
 *   e947a05d t4 "Are you going to take swimming lessons?"
 *     -> "No, I'm not."    (nothing left to react to)
 *
 * The rule is contextual, not absolute: a closed question is the correct
 * recovery move when the learner is vague, stuck, or was not understood.
 */
describe("either/or is recovery-only after a meaningful answer (2026-07-27 log)", () => {
  it("rejects the logged Valorant either/or after a meaningful answer", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "You like to play Valorant with your friend.",
        focus: "Valorant",
        question:
          "Do you and your friend play Valorant at each other's homes or online?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "Where do you like to play Valorant with your friend?",
        latestStudentResponse: "I like to play Valorant with my friend.",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("either_or_question");
  });

  it("accepts the simplest WH question that asks for the same new detail", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "That sounds fun!",
          focus: "Valorant",
          question: "Where do you play Valorant?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Who do you like to play Valorant with this summer?",
          latestStudentResponse: "I like to play Valorant with my friend.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a yes/no follow-up after a meaningful answer", () => {
    // e947a05d turn 4. "Are you going to take swimming lessons?" can only be
    // answered "No, I'm not.", which is what the learner said.
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "That's okay. You can learn to swim this summer.",
        focus: "swimming",
        question: "Are you going to take swimming lessons?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "Do you like to swim fast or slow?",
        latestStudentResponse: "I can't swim.",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("either_or_question");
  });

  it("still allows either/or as a recovery move after a vague answer", () => {
    // The documented recovery from the system prompt's own worked example.
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Lots of things!",
          focus: null,
          question: "Do you talk about games or school?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "What do you and Minju talk about?",
          latestStudentResponse: "Anything.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("allows either/or when the latest response was withheld as not understood", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "That's okay!",
          focus: null,
          question: "Do you swim in the sea or in a pool?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Where do you like to swim?",
          latestStudentResponse: WITHHELD_STUDENT_RESPONSE,
        },
      ),
    ).toEqual({ ok: true });
  });

  it("allows either/or after an answer that only rejects the topic", () => {
    // "I don't know." carries no detail to build an open question on.
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "That's okay.",
          focus: null,
          question: "Do you want to go to the park or stay inside?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "What are you going to do this summer vacation?",
          latestStudentResponse: "I don't know.",
        },
      ),
    ).toEqual({ ok: true });
  });

  /*
   * A bare "Yes."/"No."/"Maybe."/"Hmm." answers the question but hands Coco no
   * detail to build an open question on — the same situation as a vague answer.
   * Treating those as meaningful locked recovery scaffolding out of exactly the
   * turns that need it most, since a one-word reply is the strongest signal the
   * learner is stuck.
   */
  it("allows either/or recovery after a bare 'Yes.'", () => {
    // bbc0c5a7 t2's actual degenerate answer. The next turn must be able to
    // offer two concrete choices rather than being forced open.
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Nice!",
          focus: null,
          question: "Do you swim with your family or your friends?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Do you go swimming in the sea with your family?",
          latestStudentResponse: "Yes.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("does not treat 'Maybe.' or 'Hmm.' as a meaningful answer", () => {
    for (const latestStudentResponse of ["Maybe.", "Hmm.", "No.", "Okay."]) {
      expect(
        validateGeneratedCocoReplyParts(
          {
            reaction: "That's okay!",
            focus: null,
            question: "Do you want to talk about games or school?",
          },
          {
            expectsQuestion: true,
            activeQuestion: "What do you like to do after school?",
            latestStudentResponse,
          },
        ),
      ).toEqual({ ok: true });
    }
  });

  it("still treats a real one-word answer as meaningful", () => {
    // "Soccer." and "At school." are short but carry a detail, so the closed
    // follow-up is still rejected and Coco must ask an open question.
    for (const latestStudentResponse of ["Soccer.", "At school."]) {
      const result = validateGeneratedCocoReplyParts(
        {
          reaction: "Nice!",
          focus: null,
          question: "Do you play soccer inside or outside?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "What do you like to do after school?",
          latestStudentResponse,
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain("either_or_question");
    }
  });

  it("treats a minimal word as meaningful when a detail follows it", () => {
    // "Yes, I play soccer." leads with a minimal word but still gives Coco
    // something to explore, so the closed follow-up stays rejected.
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "Nice!",
        focus: null,
        question: "Do you play soccer inside or outside?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "Do you play soccer after school?",
        latestStudentResponse: "Yes, I play soccer.",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("either_or_question");
  });

  it("does not flag an open question that merely contains the word 'or'", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Sea swimming sounds cool!",
          focus: "sea",
          question: "What do you see in the sea or under the water?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Where do you like to swim?",
          latestStudentResponse: "I like to swim in the sea.",
        },
      ),
    ).toEqual({ ok: true });
  });
});

/*
 * Evidence: inspect-attempts 2026-07-27, three restatement reactions —
 *   ffeccaf0 t4 "You like to play Valorant with your friend."
 *   ffeccaf0 t5 "You usually play Valorant online with your friend."
 *   e947a05d t5 "I understand you are not going to take swimming lessons this summer."
 *
 * These mirror the learner's own sentence back in the second person and add
 * nothing. The check keys on that shape, not on detail overlap, so genuine
 * short acknowledgements that happen to reuse the learner's nouns still pass.
 */
describe("restatement reactions (2026-07-27 log)", () => {
  it("rejects a second-person mirror of the learner's answer", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "You like to play Valorant with your friend.",
        focus: "Valorant",
        question: "Where do you play Valorant?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "Who do you play Valorant with?",
        latestStudentResponse: "I like to play Valorant with my friend.",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("restatement_reaction");
  });

  it("rejects an 'I understand you ...' recap of the answer", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction:
          "I understand you are not going to take swimming lessons this summer.",
        focus: null,
        question: null,
      },
      {
        expectsQuestion: false,
        requireClosingGrounding: true,
        latestStudentResponse: "No, I'm not.",
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain("restatement_reaction");
  });

  it("accepts the natural short acknowledgement that must not regress", () => {
    // The 4c1f229e worked example. Reuses the learner's nouns but adds Coco's
    // own stance, so it is a reaction rather than a mirror.
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "Playing games inside sounds fun.",
          focus: "games",
          question: "What games do you play inside?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "Do you like to play games inside or outside?",
          latestStudentResponse: "I play games inside.",
        },
      ),
    ).toEqual({ ok: true });
  });

  /*
   * KNOWN GAP — pre-existing false positive, deliberately not fixed here.
   *
   * e829c7b1 turn 2 (2026-07-27 log): the learner said "I will swim and eat
   * very tasty food." and Coco's reaction "Swimming and eating tasty food
   * sounds great!" was discarded as multi_detail_echo + response_summary. The
   * learner was served a canned fallback instead, after two paid calls.
   *
   * That is a reasonable, natural acknowledgement and should be accepted. The
   * cause is the older echo rule, not the restatement rule added in this pass:
   * a three-detail answer trips the >=3-detail threshold even when the reaction
   * is a genuine reaction rather than a recap. Fixing it means retuning
   * multi_detail_echo/response_summary, which is out of scope for this change.
   *
   * This test asserts the CURRENT (wrong) behavior on purpose so the gap is
   * visible and the day it is fixed this test fails and gets flipped. It also
   * pins the one thing this pass is responsible for: restatement_reaction must
   * not be among the reasons.
   */
  it("documents the pre-existing echo false positive on a natural acknowledgement", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "Swimming and eating tasty food sounds great!",
        focus: "swim",
        question: "Who do you swim with at the beach?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What will you do at the beach this summer?",
        latestStudentResponse: "I will swim and eat very tasty food.",
      },
    );

    // Current behavior: rejected. Should be { ok: true } once the echo
    // thresholds are retuned — see the follow-up note above.
    expect(result).toEqual({
      ok: false,
      reasons: ["multi_detail_echo", "response_summary"],
    });
    if (!result.ok) {
      expect(result.reasons).not.toContain("restatement_reaction");
    }
  });

  it("accepts a second-person reaction that adds Coco's own stance", () => {
    expect(
      validateGeneratedCocoReplyParts(
        {
          reaction: "You sound excited about the beach!",
          focus: "beach",
          question: "What do you like most at the beach?",
        },
        {
          expectsQuestion: true,
          activeQuestion: "What will you do this summer?",
          latestStudentResponse: "I am going to the beach.",
        },
      ),
    ).toEqual({ ok: true });
  });
});

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
    expect(instructions).toContain(
      "Do not ask a yes/no or either/or question; those are for when the learner is vague, stuck, or was not understood.",
    );
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
          activeQuestion: "Where will you go with your family?",
          latestStudentResponse: "We will go to the beach together.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an either-or after a meaningful answer and still rejects either-or drift", () => {
    // Policy reversal (2026-07-27 attempt log): an either/or after a
    // meaningful answer is no longer allowed. "I play soccer at school."
    // is a real detail, so the follow-up must be an open question.
    expect(
      validateGeneratedCocoReplyLine(
        "Soccer sounds fun! Do you play inside or outside?",
        {
          expectsQuestion: true,
          activeQuestion: "Where do you play soccer?",
          latestStudentResponse: "I play soccer at school.",
        },
      ),
    ).toEqual({ ok: false, reasons: ["either_or_question"] });

    expect(
      validateGeneratedCocoReplyLine(
        "That sounds fun! Do you eat pizza or noodles?",
        {
          expectsQuestion: true,
          activeQuestion: "Where do you play soccer?",
          latestStudentResponse: "I play soccer at school.",
        },
      ),
      // Both apply: the question drifts off soccer *and* closes a meaningful
      // answer with a choice.
    ).toEqual({
      ok: false,
      reasons: ["topic_drift", "either_or_question"],
    });
  });

  it("rejects a comma before a new question clause as a run-on", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Swimming with your friend is fun, what do you like about it?",
        {
          expectsQuestion: true,
          activeQuestion: "Who do you swim with?",
          latestStudentResponse: "I swim with my friend.",
        },
      ),
    ).toEqual({ ok: false, reasons: ["run_on_question"] });
  });

  it("rejects the UAT run-on and accepts a punctuated on-topic reply", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Your friend is fun to swim with what games do you play together?",
        {
          expectsQuestion: true,
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["run_on_question"] });

    expect(
      validateGeneratedCocoReplyLine(
        "Swimming together is fun! What do you like about it?",
        {
          expectsQuestion: true,
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
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["topic_drift"] });
    expect(
      validateGeneratedCocoReplyLine(
        "That sounds fun! What games do you play together?",
        {
          expectsQuestion: true,
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["topic_drift"] });
  });

  it("allows a reply that engages with the student's newly introduced topic", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Minecraft is fun! What do you like to build?",
        {
          expectsQuestion: true,
          activeQuestion: "What are you going to do during summer vacation?",
          latestStudentResponse: "I like minecraft.",
        },
      ),
    ).toEqual({ ok: true });

    expect(
      validateGeneratedCocoReplyLine(
        "The beach sounds fun! Who do you go with?",
        {
          expectsQuestion: true,
          activeQuestion: "What happens next?",
          latestStudentResponse:
            "I will go to the beach with my family and play video games.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("still rejects drift when the reply matches neither the question nor the student's response", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Pizza is great! What toppings do you like?",
        {
          expectsQuestion: true,
          activeQuestion: "What are you going to do during summer vacation?",
          latestStudentResponse: "I like minecraft.",
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
          activeQuestion: "How often do you play soccer?",
          latestStudentResponse: "I don't play soccer.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("rejects echoing the student's vague word back as a real detail", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Talking about anything is fun! Do you talk about games or school?",
        {
          expectsQuestion: true,
          activeQuestion: "What do you and Minju talk about?",
          latestStudentResponse: "Anything.",
        },
      ),
    ).toEqual({ ok: false, reasons: ["vague_echo"] });
    expect(
      validateGeneratedCocoReplyLine(
        "Eating something sounds tasty! What do you eat at lunch?",
        {
          expectsQuestion: true,
          activeQuestion: "What do you eat for lunch?",
          latestStudentResponse: "Something.",
        },
      ),
    ).toEqual({ ok: false, reasons: ["vague_echo"] });
  });

  it("allows the recommended recovery from a vague answer", () => {
    expect(
      validateGeneratedCocoReplyLine(
        "Lots of things! Do you talk about games or school?",
        {
          expectsQuestion: true,
          activeQuestion: "What do you and Minju talk about?",
          latestStudentResponse: "Anything.",
        },
      ),
    ).toEqual({ ok: true });
  });

  it("allows a vague word Coco introduces when the student was not vague", () => {
    // Phrased as an open question that still contains "anything": after the
    // meaningful answer "I play soccer." a closed follow-up is rejected on its
    // own grounds, which would mask what this case is about — Coco may use a
    // vague word himself, he just may not echo the learner's.
    expect(
      validateGeneratedCocoReplyLine(
        "Soccer is fun! Why do you like playing soccer more than anything else?",
        {
          expectsQuestion: true,
          activeQuestion: "What do you do after school?",
          latestStudentResponse: "I play soccer.",
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
          activeQuestion: "Who do you swim with?",
        },
      ),
    ).toEqual({ ok: false, reasons: ["run_on_question"] });
  });

  it("accepts a complete final closing line and rejects a final question", () => {
    expect(
      validateGeneratedCocoReplyLine("Thanks for talking with me!", {
        expectsQuestion: false,
      }),
    ).toEqual({ ok: true });
    expect(
      validateGeneratedCocoReplyLine("What will you do next?", {
        expectsQuestion: false,
      }),
    ).toEqual({ ok: false, reasons: ["question_format"] });
  });

  it("requires exactly one correctly punctuated question", () => {
    expect(
      validateGeneratedCocoReplyLine("That sounds fun", {
        expectsQuestion: true,
      }),
    ).toEqual({ ok: false, reasons: ["question_format"] });
    expect(
      validateGeneratedCocoReplyLine(
        "That sounds fun! Where do you swim? Who teaches you?",
        { expectsQuestion: true },
      ),
    ).toEqual({ ok: false, reasons: ["question_format"] });
  });

  it("derives follow-up and closing roles from requiredTurns", () => {
    const followUp = buildConversationPrompt({
      ...input,
      turnOrder: 4,
      requiredTurns: 5,
      conversationHistory: historyThrough(4),
    });
    expect(followUp).toMatchObject({
      replyMode: "follow_up",
      turnsRemaining: 1,
      windDown: true,
    });
    expect(followUp.instructions.join(" ")).toContain("ask exactly one question");

    const closing = buildConversationPrompt({
      ...input,
      turnOrder: 5,
      requiredTurns: 5,
      conversationHistory: historyThrough(5),
    });
    expect(closing).toMatchObject({
      replyMode: "closing",
      turnsRemaining: 0,
      windDown: false,
    });
    const closingInstructions = closing.instructions.join(" ");
    expect(closingInstructions).toContain("Acknowledge the latest studentResponse");
    expect(closingInstructions).toContain("no goodbye");
    expect(closingInstructions).toContain("See you next time!");
    expect(closingInstructions).toContain("no question");
  });

  it("treats turn eight as a closing when requiredTurns is eight", () => {
    expect(
      conversationReplyMode({ turnOrder: 8, requiredTurns: 8 }),
    ).toBe("closing");
  });

  it("grounds an internally reviewed response without inventing its meaning", () => {
    const prompt = buildConversationPrompt({
      ...input,
      responseHandling: "review_pending",
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "Who do you play soccer with?",
          studentResponse: "I play with my friend.",
        },
        {
          turnOrder: 2,
          cocoLine: "Where do you play soccer?",
          studentResponse: "Something unclear.",
        },
      ],
    });
    const instructions = prompt.instructions.join(" ");

    expect(prompt.responseHandling).toBe("review_pending");
    expect(instructions).toContain("most recent earlier studentResponse");
    expect(instructions).toContain("Coco's saved opening question");
    expect(instructions).toContain("Do not invent");
    expect(instructions).toContain("has been withheld");
  });

  it("withholds the unusable transcript from a review_pending payload", () => {
    const prompt = buildConversationPrompt({
      ...input,
      responseHandling: "review_pending",
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "Who do you play soccer with?",
          studentResponse: "I play with my friend.",
        },
        {
          turnOrder: 2,
          cocoLine: "Where do you play soccer?",
          studentResponse: "playing soccer on the weekend",
        },
      ],
    });

    const latest = prompt.conversationHistory.at(-1);
    // The garbled decode must not reach the model at all — it reads as a
    // clean sentence, so any instruction to "use it only if clear" asks the
    // model to re-decide something the evaluator already ruled unusable.
    expect(latest?.studentResponse).not.toContain("weekend");
    expect(JSON.stringify(prompt)).not.toContain("playing soccer on the weekend");

    // The turn itself stays, so history remains contiguous and Coco still
    // knows the student answered something.
    expect(latest?.turnOrder).toBe(2);
    expect(latest?.cocoLine).toBe("Where do you play soccer?");

    // Earlier usable answers are untouched.
    expect(prompt.conversationHistory[0]?.studentResponse).toBe(
      "I play with my friend.",
    );
  });

  it("leaves history untouched when responseHandling is normal", () => {
    const prompt = buildConversationPrompt({
      ...input,
      responseHandling: "normal",
      conversationHistory: [
        {
          turnOrder: 1,
          cocoLine: "Where do you play soccer?",
          studentResponse: "playing soccer on the weekend",
        },
      ],
    });

    expect(prompt.conversationHistory[0]?.studentResponse).toBe(
      "playing soccer on the weekend",
    );
  });
});

describe("withheld-response instruction is unconditional", () => {
  const withheldHistoryInput = {
    targetPattern: "I'm going to ________",
    turnOrder: 3,
    requiredTurns: 3,
    hardCap: 8,
    safetyMode: "standard",
    responseHandling: "normal",
    conversationHistory: [
      {
        turnOrder: 1,
        cocoLine: "What games will you play?",
        studentResponse: "(not understood)",
      },
      {
        turnOrder: 2,
        cocoLine: "Do you play inside or outside?",
        studentResponse: "Inside.",
      },
      {
        turnOrder: 3,
        cocoLine: "What do you like about that?",
        studentResponse: "It's fun.",
      },
    ],
  } satisfies GenerateCocoReplyInput;

  it("explains the marker on a closing turn with responseHandling normal", () => {
    // reviewPendingInstructions is empty here, which is exactly the gap that
    // let the closing line recap a game the student never named.
    const prompt = buildConversationPrompt(withheldHistoryInput);

    expect(prompt.replyMode).toBe("closing");
    expect(
      prompt.instructions.some(
        (instruction) =>
          instruction.includes("(not understood)") &&
          instruction.includes("summarize"),
      ),
    ).toBe(true);
  });
});

describe("unresolved Korean nouns in Coco's reply (attempt 6406e6a5)", () => {
  it("rejects a reply that speaks a transliteration of the student's Korean", () => {
    // The child said 발로란트 (Valorant), transcribed 배달란트. Coco must not
    // read that back as "Baedalranteu" — no such word exists.
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "Baedalranteu sounds interesting!",
        focus: "Baedalranteu",
        question: "What do you do in Baedalranteu?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What games do you play?",
        latestStudentResponse: "배달란트",
      },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasons).toContain(
      "unresolved_korean_noun",
    );
  });

  it("accepts a reply that refers to the word instead of naming it", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "That sounds fun!",
        focus: "that game",
        question: "What do you do in that game?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What games do you play?",
        latestStudentResponse: "배달란트",
      },
    );
    expect(result.ok === false && result.reasons).not.toContain(
      "unresolved_korean_noun",
    );
  });
});

describe("raw Hangul in Coco's reply (attempt e30d80e7, 2026-07-27)", () => {
  // The child said "Valorant" with a Korean accent and the transcriber wrote
  // 발러런트 — itself a mishearing (the standard spelling is 발로란트). Rather
  // than transliterating it, the model copied the Hangul straight into its own
  // line, so Coco asked "Where do you play 발러런트?" and the derived hint
  // became "I play 발러런트 at ____.".
  //
  // The transliteration guard could not see this: it scans Latin words only,
  // and raw Hangul matches none of them. Coco speaks English by construction,
  // so any Hangul in his line is a failure regardless of which span it came
  // from.
  const respondedInKorean = {
    expectsQuestion: true,
    activeQuestion: "What games do you play?",
    latestStudentResponse: "I am going to play 발러런트.",
  } as const;

  it("rejects raw Hangul in the question", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "That sounds fun!",
        focus: "발러런트",
        question: "Where do you play 발러런트?",
      },
      respondedInKorean,
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasons).toContain(
      "unresolved_korean_noun",
    );
  });

  it("rejects raw Hangul in the reaction", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "발러런트 sounds fun!",
        focus: "that game",
        question: "Where do you play that game?",
      },
      respondedInKorean,
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasons).toContain(
      "unresolved_korean_noun",
    );
  });

  it("rejects raw Hangul on a closing turn", () => {
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "발러런트 sounds fun! Have a great summer!",
        focus: null,
        question: null,
      },
      {
        expectsQuestion: false,
        activeQuestion: "What games do you play?",
        latestStudentResponse: "I am going to play 발러런트.",
      },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasons).toContain(
      "unresolved_korean_noun",
    );
  });

  it("accepts referring to the unresolved noun as 'that game'", () => {
    // The escape hatch the correction hint asks for. Guards against an
    // over-broad fix that bans every Korean-adjacent reply.
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "That sounds fun!",
        focus: "that game",
        question: "Where do you play that game?",
      },
      respondedInKorean,
    );
    expect(result.ok).toBe(true);
  });

  it("still allows naming a span the evaluator genuinely resolved", () => {
    // "플레이 게임즈" comes back as real English ("play games"), so naming it
    // carries no invented word. This contract predates the raw-Hangul fix.
    const result = validateGeneratedCocoReplyParts(
      {
        reaction: "That sounds fun!",
        focus: "games",
        question: "Where do you play games?",
      },
      {
        expectsQuestion: true,
        activeQuestion: "What do you do after school?",
        latestStudentResponse: "I 플레이 게임즈 after school.",
      },
    );
    expect(result.ok === false && result.reasons).not.toContain(
      "unresolved_korean_noun",
    );
  });
});
