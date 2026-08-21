import { describe, expect, it, vi } from "vitest";
import type { ConversationResponsesClient } from "@/server/ai/conversation-generator";
import type { GenerateCocoReplyInput } from "@/domain/ai/conversation-generation";

function createFakeClient(
  impl: (input: {
    model: string;
    input: Array<{ role: "system" | "user"; content: string }>;
    text: { format: unknown };
  }) => Promise<{ output_parsed?: unknown }>,
): ConversationResponsesClient {
  const legacyLineQuestionPattern =
    /\b(?:who|what|when|where|why|how|anything|(?:do|does|did|can|could|would|will|are|is|have|has)\s+(?:you|your|he|she|they|we|it))\b/iu;

  return {
    responses: {
      parse: vi.fn(async (input) => {
        const result = await impl(input);
        const value = result.output_parsed;
        if (
          typeof value === "object" &&
          value !== null &&
          "line" in value &&
          typeof value.line === "string" &&
          !("reaction" in value)
        ) {
          const match = value.line.match(legacyLineQuestionPattern);
          return {
            ...result,
            output_parsed: match
              ? {
                  reaction: value.line.slice(0, match.index).trim() || null,
                  focus: null,
                  question: value.line.slice(match.index).trim() || null,
                }
              : { reaction: value.line, focus: null, question: null },
          };
        }
        return result;
      }) as ConversationResponsesClient["responses"]["parse"],
    },
  };
}

const baseInput: GenerateCocoReplyInput = {
  targetPattern: "I would like ___.",
  turnOrder: 2,
  requiredTurns: 4,
  hardCap: 8,
  safetyMode: "standard",
  responseHandling: "normal",
  conversationHistory: [
    {
      turnOrder: 1,
      cocoLine: "What would you like to eat today?",
      studentResponse: "I would like a sandwich please.",
    },
    {
      turnOrder: 2,
      cocoLine: "Who do you eat lunch with?",
      studentResponse: "I eat with Minju.",
    },
  ],
};

describe("generateCocoReply server adapter (CHAT-04 stateless per-turn re-grounding)", () => {
  it("returns missing_api_key when no apiKey and no deps.client are provided", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");

    const result = await generateCocoReply(baseInput, { apiKey: "" });

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
  });

  it("returns ok:true with the parsed reply for a schema-valid fake client response", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "Eating with Minju is fun! What does Minju like to eat?",
      },
    }));

    const result = await generateCocoReply(baseInput, {
      apiKey: "test-key",
      client,
      model: "test-conversation-model",
    });

    expect(result).toMatchObject({
      ok: true,
      reply: {
        line: "Eating with Minju is fun! What does Minju like to eat?",
      },
    });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-conversation-model" }),
    );
  });

  it("returns structured reply parts while preserving the assembled line", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        reaction: "Nice plans!",
        focus: "swim",
        question: "Who will you swim with?",
      },
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What will you do at the beach?",
            studentResponse: "I will swim.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: {
        reaction: "Nice plans!",
        focus: "swim",
        question: "Who will you swim with?",
        line: "Nice plans! Who will you swim with?",
      },
    });
  });

  it("generates a question-only recovery", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        reaction: null,
        focus: null,
        question: "Do you play soccer with friends or family?",
      },
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        responseHandling: "review_pending",
        generationPurpose: {
          kind: "unclear_recovery",
          attempt: 1,
          fallbackQuestion: "Who do you like to play soccer with?",
        },
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Do you play soccer with friends or family?" },
    });
  });

  it("overrides follow-up acknowledgement instructions for recovery", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        reaction: null,
        focus: null,
        question: "Do you play soccer with friends or family?",
      },
    }));

    await generateCocoReply(
      {
        ...baseInput,
        responseHandling: "review_pending",
        generationPurpose: {
          kind: "unclear_recovery",
          attempt: 1,
          fallbackQuestion: "Who do you like to play soccer with?",
        },
      },
      { apiKey: "test-key", client },
    );

    const systemMessage = vi
      .mocked(client.responses.parse)
      .mock.calls[0]?.[0].input.find((message) => message.role === "system")
      ?.content;
    expect(systemMessage).toContain(
      "Recovery overrides the normal follow-up acknowledgement",
    );
    expect(systemMessage).toContain(
      "ask exactly one question with reaction and focus set to null",
    );
  });

  it("repairs a recovery reaction into a question-only line", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "That sounds fun!",
            focus: null,
            question: "Do you play soccer with friends or family?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: null,
            focus: null,
            question: "Do you play soccer with friends or family?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        responseHandling: "review_pending",
        generationPurpose: {
          kind: "unclear_recovery",
          attempt: 1,
          fallbackQuestion: "Who do you like to play soccer with?",
        },
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Do you play soccer with friends or family?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("repairs a multi-detail echo with the exact policy reason", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "Eating watermelon, swimming, and eating chicken sounds fun!",
            focus: "swimming",
            question: "Who will you swim with?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "Nice plans!",
            focus: "swim",
            question: "Who will you swim with?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What will you do in the valley?",
            studentResponse: "I will eat watermelon, swim, and eat chicken.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Nice plans! Who will you swim with?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
    const secondSystemMessage = vi
      .mocked(client.responses.parse)
      .mock.calls[1]?.[0].input.find((message) => message.role === "system")
      ?.content;
    expect(secondSystemMessage).toContain("multi_detail_echo");
  });

  it("repairs a review-pending reply from the latest understood waterpark answer", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "Okay, let's talk about your summer plans.",
            focus: "summer plans",
            question: "What else are you going to do this summer?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "That sounds fun!",
            focus: "waterpark",
            question: "What do you do at the waterpark?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 2,
        responseHandling: "review_pending",
        conversationHistory: [
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
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "That sounds fun! What do you do at the waterpark?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
    const repairPayload = JSON.parse(
      vi.mocked(client.responses.parse).mock.calls[1]?.[0].input.find(
        (message) => message.role === "user",
      )?.content ?? "{}",
    ) as {
      rejectedCandidate?: unknown;
      violations?: unknown;
    };
    expect(repairPayload).toMatchObject({
      rejectedCandidate: {
        reaction: "Okay, let's talk about your summer plans.",
        focus: "summer plans",
        question: "What else are you going to do this summer?",
      },
      violations: ["topic_drift"],
    });
    const repairSystemMessage = vi
      .mocked(client.responses.parse)
      .mock.calls[1]?.[0].input.find((message) => message.role === "system")
      ?.content;
    expect(repairSystemMessage).toContain(
      "The previous candidate was rejected. Do not repeat its question direction.",
    );
    expect(repairSystemMessage).toContain(
      "Use the most recent understood student response and ask one short, concrete WH-question about a different unanswered detail. Never invent a detail.",
    );
    expect(repairSystemMessage).toContain(
      "Choose at most one focus from the most recent understood studentResponse.",
    );
    expect(repairSystemMessage).not.toContain(
      "Choose at most one focus from the latest studentResponse.",
    );
    expect(result.ok && result.reply.line).not.toContain(
      "What else do you want to tell me?",
    );
    expect(result.ok && result.reply.line).not.toContain(
      "What do you like about that?",
    );
    expect(result.ok && result.reply.line).not.toContain(
      "What else are you going to do this summer?",
    );
    expect(result.ok && result.reply.line).not.toContain("pool");
    expect(result.ok && result.reply.line).not.toContain("hotel");
  });

  it("repairs an unrelated first-turn recovery using Coco's saved opener", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "Okay!",
            focus: "games",
            question: "What games do you play at home?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "Let's try another question.",
            focus: "eat",
            question: "What would you like to eat?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        responseHandling: "review_pending",
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What would you like to eat today?",
            studentResponse: "Something unclear.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(client.responses.parse).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      reply: {
        line: "Let's try another question. What would you like to eat?",
      },
    });
  });

  it("returns schema_failed when the fake client's output_parsed fails the schema", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "" },
    }));

    const result = await generateCocoReply(baseInput, { apiKey: "test-key", client });

    expect(result).toEqual({ ok: false, error: "schema_failed" });
  });

  it("returns provider_failed and logs when the fake client throws", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => {
      throw new Error("network error");
    });
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const result = await generateCocoReply(baseInput, { apiKey: "test-key", client });

    expect(result).toEqual({ ok: false, error: "provider_failed" });
    expect(stdoutSpy).toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  it("rebuilds the grounding payload fresh every call with no previous_response_id anywhere", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const { buildConversationPrompt } = await import("@/domain/ai/conversation-generation");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "Sounds good! Anything else?" },
    }));

    await generateCocoReply(baseInput, { apiKey: "test-key", client });

    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(JSON.stringify(call)).not.toContain("previous_response_id");

    const userMessage = call?.input.find((message) => message.role === "user");
    const expectedPrompt = buildConversationPrompt(baseInput);
    expect(JSON.parse(userMessage?.content ?? "{}")).toEqual(expectedPrompt);
  });

  it("prioritizes the student's meaning and topic over target-pattern repetition", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "Oh, what do you like to do instead?" },
    }));

    await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        targetPattern: "How often do you _____?",
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "How often do you play soccer?",
            studentResponse: "I don't play soccer.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const system = call?.input.find((message) => message.role === "system")?.content ?? "";
    const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
    const prompt = JSON.parse(user) as { instructions?: string[] };
    const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

    expect(combined).toContain("Acknowledge or react specifically");
    expect(combined).toContain("Keep the current subject");
    expect(combined).toContain("soft lesson context");
    expect(combined).toContain("merely swaps in a new noun or activity");
    expect(combined).toContain("active activity");
    expect(combined).toContain("complete, correctly punctuated sentences");
    expect(combined).toContain("What do you like about swimming together?");
    expect(combined).toContain("What games do you play together?");
    expect(combined).not.toContain(
      "Stay anchored to the target grammar pattern every turn",
    );
  });

  it("regenerates the UAT run-on once with an on-topic, punctuated reply", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Your friend is fun to swim with what games do you play together?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Swimming together is fun! What do you like about it?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Who do you swim with?",
            studentResponse: "With my friend.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Swimming together is fun! What do you like about it?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(client.responses.parse).mock.calls[1]?.[0].input[0]?.content,
    ).toContain("complete, correctly punctuated sentences");
  });

  it("regenerates a comma run-on once with a punctuated corrected reply", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Swimming with your friend is fun, what do you like about it?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Swimming together is fun! What do you like about it?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Who do you swim with?",
            studentResponse: "With my friend.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Swimming together is fun! What do you like about it?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("regenerates an on-topic either-or that closes a meaningful answer", async () => {
    // Policy reversal (2026-07-27 attempt log): staying on topic is no longer
    // enough. "I play soccer at school." is a real detail, so the follow-up
    // must be open even though the either-or was perfectly relevant.
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Soccer sounds fun! Do you play inside or outside?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Soccer sounds fun! Where do you play soccer at school?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Where do you play soccer?",
            studentResponse: "I play soccer at school.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Soccer sounds fun! Where do you play soccer at school?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(client.responses.parse).mock.calls[1]?.[0].input[0]?.content,
    ).toContain("closed a meaningful answer");
  });

  it("keeps an either-or when the learner's latest answer was vague", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "Lots of things! Do you talk about games or school?",
      },
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What do you and Minju talk about?",
            studentResponse: "Anything.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Lots of things! Do you talk about games or school?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(1);
  });

  it("uses a no-question closing policy at requiredTurns", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "Sushi sounds delicious! Thanks for talking with me. See you next time!",
      },
    }));
    const conversationHistory = Array.from({ length: 5 }, (_, index) => ({
      turnOrder: index + 1,
      cocoLine:
        index === 4 ? "What will you eat?" : `Question ${index + 1}?`,
      studentResponse:
        index === 4 ? "I will eat sushi." : `Answer ${index + 1}.`,
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 5,
        requiredTurns: 5,
        conversationHistory,
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: {
        line: "Sushi sounds delicious! Thanks for talking with me. See you next time!",
      },
    });
    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const combined = call?.input.map((message) => message.content).join(" ") ?? "";
    expect(combined).toContain("no goodbye");
    expect(combined).toContain("See you next time!");
    expect(combined).toContain("no question");
  });

  it("allows an eight-turn mission closing through the hard-cap boundary", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "Swimming was fun! See you next time!" },
    }));
    const history = Array.from({ length: 8 }, (_, index) => ({
      turnOrder: index + 1,
      cocoLine: `Question ${index + 1}?`,
      studentResponse:
        index === 7 ? "I enjoyed swimming." : `Answer ${index + 1}.`,
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 8,
        requiredTurns: 8,
        hardCap: 8,
        conversationHistory: history,
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({ ok: true });
    expect(client.responses.parse).toHaveBeenCalledTimes(1);
  });

  it("instructs short kid-friendly lines with one new-information follow-up", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "Fun! What games do you play?" },
    }));

    await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What do you do after school?",
            studentResponse: "I play games.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const system = call?.input.find((message) => message.role === "system")?.content ?? "";
    const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
    const prompt = JSON.parse(user) as { instructions?: string[] };
    const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

    // Kid-friendly register: short simple sentences, easy words, hard word cap.
    expect(combined).toContain("young ESL learner");
    expect(combined).toContain("one or two short, simple sentences");
    expect(combined).not.toContain("12 words");
    expect(combined).toContain("exactly one question");
    // Follow-ups seek new information from the student's actual answer
    // instead of mechanically rotating through 5-W prompts.
    expect(combined).toContain("who, what, where, when, why, or how");
    expect(combined).toContain("not present or directly implied");
  });

  it("prefers open follow-ups and reserves choices for stuck learners", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "Great! What games do you play inside?" },
    }));

    await generateCocoReply(baseInput, { apiKey: "test-key", client });
    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const system = call?.input.find((message) => message.role === "system")?.content ?? "";
    const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
    const prompt = JSON.parse(user) as { instructions?: string[] };

    // The system message must not re-grant what the policy now forbids: an
    // earlier version allowed "a single either-or question" while the domain
    // instructions banned it, and the model followed the permission.
    expect(system).not.toContain("either-or question is allowed");
    expect(system).toContain(
      "Do not ask an either-or or yes/no question; save those for when the learner is vague, stuck, or was not understood.",
    );
    for (const fragment of [
      "open question",
      "short phrase or sentence",
      "only when the latest response is vague, unclear, or shows the learner is stuck",
    ]) {
      expect(system).toContain(fragment);
      expect(prompt.instructions?.join(" ")).toContain(fragment);
    }
  });

  it("regenerates a drifting either-or follow-up after a meaningful response", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "That sounds fun! Do you eat pizza or noodles?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: { line: "Nice! What games do you play inside?" },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Where do you play?",
            studentResponse: "Inside.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Nice! What games do you play inside?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(client.responses.parse).mock.calls[1]?.[0].input[0]?.content,
    ).toContain("drifted away from the active topic");
  });

  it("regenerates when an initial line contains two question marks", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Do you read books or watch TV? What do you enjoy after school?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: { line: "Fun! What do you enjoy after school?" },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What do you do after school?",
            studentResponse: "I draw pictures.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Fun! What do you enjoy after school?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("rejects a corrected line that still has two question marks after a drifting first candidate", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Do you read books or watch TV?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Do you read books or watch TV? What do you enjoy after school?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What do you do after school?",
            studentResponse: "I draw pictures.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: false,
      error: "reply_policy_failed",
      // Both apply after the meaningful answer "I draw pictures.": two
      // question marks, and a closed opener where an open one is required.
      violations: ["question_format", "either_or_question"],
      rejectedAttempt: "corrected",
      rejectedCandidate: {
        reaction: null,
        focus: null,
        question:
          "Do you read books or watch TV? What do you enjoy after school?",
      },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("accepts a relevant two-choice follow-up without regeneration", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "No problem! Do you play games or read books?",
      },
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What do you do after school?",
            studentResponse: "I don't know.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "No problem! Do you play games or read books?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(1);
  });

  it("allows a relevant two-choice follow-up after a full-sentence response", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "No problem! Do you play Minecraft or soccer?",
      },
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "What games do you play inside?",
            studentResponse: "I don't know what games I play inside.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "No problem! Do you play Minecraft or soccer?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(1);
  });

  it("adds every detected violation hint to one correction prompt", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Do you read books or watch TV? What happens next?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: { line: "Swimming is fun! Who swims with you?" },
        }),
    );

    await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Where do you swim?",
            studentResponse: "At the pool.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    const correctionSystem = vi
      .mocked(client.responses.parse)
      .mock.calls[1][0].input.find((message) => message.role === "system")
      ?.content;
    expect(correctionSystem).toContain("wrong punctuation");
    expect(correctionSystem).toContain("drifted away from the active topic");
    expect(correctionSystem).not.toContain("12 words");
  });

  it("logs only reason codes and never the raw generated line", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const rejectedLine = "Pizza is great! What toppings do you like?";
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({ output_parsed: { line: rejectedLine } })
        .mockResolvedValueOnce({
          output_parsed: { line: "Soccer is fun! Who plays with you?" },
        }),
    );
    const chunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        chunks.push(String(chunk));
        return true;
      });

    await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "How often do you play soccer?",
            studentResponse: "I like soccer.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    const logged = chunks.join("");
    expect(logged).toContain("ai.conversation_line_policy_rejected");
    expect(logged).toContain("topic_drift");
    expect(logged).not.toContain(rejectedLine);
    stdoutSpy.mockRestore();
  });

  it("adds stronger system steering only in safety retry mode", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "Lunch sounds good! What will you eat?" },
    }));

    await generateCocoReply(
      { ...baseInput, safetyMode: "retry" },
      { apiKey: "test-key", client },
    );
    await generateCocoReply(
      { ...baseInput, safetyMode: "standard" },
      { apiKey: "test-key", client },
    );

    const retrySystem = vi
      .mocked(client.responses.parse)
      .mock.calls[0][0].input.find((message) => message.role === "system")
      ?.content;
    const standardSystem = vi
      .mocked(client.responses.parse)
      .mock.calls[1][0].input.find((message) => message.role === "system")
      ?.content;
    const safetySentence =
      "The previous candidate was rejected by output moderation.";
    expect(retrySystem).toContain(safetySentence);
    expect(standardSystem).not.toContain(safetySentence);
  });

  it("does not mistake an acknowledgement with or for an either-or question", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "You can play tag or hide. What game do you play?",
      },
    }));

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Where do you play?",
            studentResponse: "Inside.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "You can play tag or hide. What game do you play?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(1);
  });

  it("regenerates a reaction that restates the learner's answer back to them", async () => {
    // ffeccaf0 turn 4: "You like to play Valorant with your friend." repeated
    // the learner's own sentence in the second person and added nothing.
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "You like to play Valorant with your friend.",
            focus: "Valorant",
            question: "Where do you play Valorant?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            reaction: "That sounds fun!",
            focus: "Valorant",
            question: "Where do you play Valorant?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Who do you play Valorant with?",
            studentResponse: "I like to play Valorant with my friend.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "That sounds fun! Where do you play Valorant?" },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(client.responses.parse).mock.calls[1]?.[0].input[0]?.content,
    ).toContain("restated the student's own answer");
  });

  it("returns reply_policy_failed with reasons when correction still violates policy", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi.fn().mockResolvedValue({
        output_parsed: {
          line: "Pizza is great! What toppings do you like?",
        },
      }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Where do you play?",
            studentResponse: "Inside.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({
      ok: false,
      error: "reply_policy_failed",
      violations: ["topic_drift"],
      rejectedAttempt: "corrected",
      rejectedCandidate: {
        reaction: "Pizza is great!",
        focus: null,
        question: "What toppings do you like?",
      },
    });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("tells the correction prompt the specific violation instead of a generic list", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Pizza is great! What toppings do you like?",
          },
        })
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Soccer is fun! Who do you play soccer with?",
          },
        }),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "How often do you play soccer?",
            studentResponse: "I like soccer.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: { line: "Soccer is fun! Who do you play soccer with?" },
    });
    const secondCallArgs = vi.mocked(client.responses.parse).mock.calls[1][0];
    const systemMessage = secondCallArgs.input.find(
      (message) => message.role === "system",
    )?.content;
    expect(systemMessage).toContain("drifted away from the active topic");
    expect(systemMessage).not.toContain("it may be a run-on");
  });

  it("preserves provider_failed when the correction call throws", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(
      vi
        .fn()
        .mockResolvedValueOnce({
          output_parsed: {
            line: "Pizza is great! What toppings do you like?",
          },
        })
        .mockRejectedValueOnce(new Error("network error")),
    );

    const result = await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 1,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Where do you play?",
            studentResponse: "Inside.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "provider_failed" });
    expect(client.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("forbids asking for a fact already established in the conversation", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "Oh, in the classroom! What do you and Minju talk about?",
      },
    }));

    await generateCocoReply(
      {
        ...baseInput,
        turnOrder: 2,
        conversationHistory: [
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
      },
      { apiKey: "test-key", client },
    );

    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const system = call?.input.find((message) => message.role === "system")?.content ?? "";
    const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
    const prompt = JSON.parse(user) as {
      conversationHistory?: unknown;
      instructions?: string[];
    };
    const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

    expect(prompt.conversationHistory).toHaveLength(2);
    expect(combined).toContain("already known");
    expect(combined).toContain("not present or directly implied");
    expect(combined).toContain("Who do you talk with in class?");
    expect(combined).toContain("invalid");
    expect(JSON.stringify(call)).not.toContain("previous_response_id");
  });

  it("forbids echoing a vague answer and provides a concrete-choice example", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: {
        line: "Lots of things! Do you talk about games or school?",
      },
    }));

    await generateCocoReply(
      {
        ...baseInput,
        conversationHistory: [
          {
            turnOrder: 1,
            cocoLine: "Who do you talk with at school?",
            studentResponse: "I talk with Minju.",
          },
          {
            turnOrder: 2,
            cocoLine: "What do you and Minju talk about?",
            studentResponse: "Anything.",
          },
        ],
      },
      { apiKey: "test-key", client },
    );

    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const system = call?.input.find((message) => message.role === "system")?.content ?? "";
    const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
    const prompt = JSON.parse(user) as { instructions?: string[] };
    const instructions = prompt.instructions?.join(" ") ?? "";

    for (const fragment of [
      "minimally informative",
      "do not echo the vague word",
      "two concrete child-friendly choices",
      "Do not shame the learner",
    ]) {
      expect(system).toContain(fragment);
      expect(instructions).toContain(fragment);
    }
    expect(system).toContain("Talking about anything is fun");
    expect(system).toContain("Lots of things! Do you talk about games or school?");
    expect(JSON.stringify(call)).not.toContain("previous_response_id");
  });
});
