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
  return {
    responses: {
      parse: vi.fn(impl) as ConversationResponsesClient["responses"]["parse"],
    },
  };
}

const baseInput: GenerateCocoReplyInput = {
  scenePremise: "You are ordering lunch at a school cafeteria.",
  targetPattern: "I would like ___.",
  turnOrder: 2,
  requiredTurns: 4,
  hardCap: 8,
  windDown: false,
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
      output_parsed: { line: "Great choice! What would you like to drink?" },
    }));

    const result = await generateCocoReply(baseInput, {
      apiKey: "test-key",
      client,
      model: "test-conversation-model",
    });

    expect(result).toEqual({
      ok: true,
      reply: { line: "Great choice! What would you like to drink?" },
    });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-conversation-model" }),
    );
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
    expect(combined).not.toContain(
      "Stay anchored to the target grammar pattern every turn",
    );
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
    expect(combined).toContain("12 words");
    expect(combined).toContain("exactly one question");
    // Follow-ups seek new information from the student's actual answer
    // instead of mechanically rotating through 5-W prompts.
    expect(combined).toContain("who, what, where, when, why, or how");
    expect(combined).toContain("not present or directly implied");
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
    const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

    expect(combined).toContain("minimally informative");
    expect(combined).toContain("Do not shame the learner");
    expect(combined).toContain("Talking about anything is fun");
    expect(combined).toContain("Lots of things! Do you talk about games or school?");
    expect(JSON.stringify(call)).not.toContain("previous_response_id");
  });
});

describe("conversation-generator.ts source contract (stateless guarantee)", () => {
  it("contains no previous_response_id usage anywhere in the module source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(process.cwd(), "src/server/ai/conversation-generator.ts"),
      "utf-8",
    );
    expect(source).not.toContain("previous_response_id");
  });
});
