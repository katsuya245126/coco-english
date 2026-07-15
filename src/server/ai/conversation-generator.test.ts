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
  studentTranscript: "I would like a sandwich please.",
  previousCocoLine: "What would you like to eat today?",
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
        targetPattern: "How often do you _____?",
        previousCocoLine: "How often do you play soccer?",
        studentTranscript: "I don't play soccer.",
      },
      { apiKey: "test-key", client },
    );

    const call = vi.mocked(client.responses.parse).mock.calls[0]?.[0];
    const system = call?.input.find((message) => message.role === "system")?.content ?? "";
    const user = call?.input.find((message) => message.role === "user")?.content ?? "{}";
    const prompt = JSON.parse(user) as { instructions?: string[] };
    const combined = `${system} ${prompt.instructions?.join(" ") ?? ""}`;

    expect(combined).toContain("acknowledge or react to the student's meaning");
    expect(combined).toContain("Keep the current subject");
    expect(combined).toContain("soft lesson context");
    expect(combined).toContain("merely swaps in a new noun or activity");
    expect(combined).not.toContain(
      "Stay anchored to the target grammar pattern every turn",
    );
  });

  it("instructs short kid-friendly lines with one 5-W follow-up about the student's answer", async () => {
    const { generateCocoReply } = await import("@/server/ai/conversation-generator");
    const client = createFakeClient(async () => ({
      output_parsed: { line: "Fun! What games do you play?" },
    }));

    await generateCocoReply(
      {
        ...baseInput,
        previousCocoLine: "What do you do after school?",
        studentTranscript: "I play games.",
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
    // Follow-ups dig into the student's actual answer with 5-W questions,
    // instead of steering every turn back into the targetPattern format.
    expect(combined).toContain("who, what, where, when, why, or how");
    expect(combined).toContain("What games do you play?");
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
