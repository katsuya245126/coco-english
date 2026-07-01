import { describe, expect, it, vi } from "vitest";
import type { MissionResponsesClient } from "@/server/ai/mission-generator";

type FakeMissionResponsesClient = MissionResponsesClient;

function createFakeClient(result: unknown): FakeMissionResponsesClient {
  return {
    responses: {
      parse: vi.fn(async () => result) as MissionResponsesClient["responses"]["parse"],
    },
  };
}

const providerDraft = {
  title: "After-school likes",
  targetPattern: "I like ___ing.",
  topic: "After school",
  level: "elementary",
  requiredTurns: 1,
  turns: [
    {
      prompt: "What do you like doing after school?",
      targetExample: "I like playing soccer after school.",
      hintLadder: {
        tier1: "I like ___ing.",
        tier2: "like, playing, soccer",
        tier3: "I like playing soccer after school.",
      },
    },
  ],
  targetExamples: ["I like playing soccer after school."],
};

describe("generateMissionDraft server adapter (D-08, D-09, D-10)", () => {
  it("uses an injected fake Responses client and returns a validated D-08 editable draft", async () => {
    const { generateMissionDraft } = await import("@/server/ai/mission-generator");
    const client = createFakeClient({
      output_parsed: providerDraft,
    });

    const result = await generateMissionDraft(
      {
        targetPattern: "I like ___ing.",
        topic: "After school",
        level: "elementary",
        requiredTurns: 1,
        dueAt: "2026-07-10T09:00:00.000Z",
      },
      { apiKey: "test-key", client, model: "test-model" },
    );

    expect(result).toEqual({ ok: true, draft: providerDraft });
    expect(client.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
      }),
    );
  });

  it("maps missing API key before any D-10 paid provider request", async () => {
    const { generateMissionDraft } = await import("@/server/ai/mission-generator");
    const client = createFakeClient({ output_parsed: providerDraft });

    const result = await generateMissionDraft(
      {
        targetPattern: "I like ___ing.",
        topic: "After school",
        level: "elementary",
        requiredTurns: 1,
      },
      { apiKey: "", client },
    );

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
    expect(client.responses.parse).not.toHaveBeenCalled();
  });

  it("maps provider failures without exposing raw model details or tokens", async () => {
    const { generateMissionDraft } = await import("@/server/ai/mission-generator");
    const client: FakeMissionResponsesClient = {
      responses: {
        parse: vi.fn(async () => {
          throw new Error("provider unavailable: token trace");
        }) as MissionResponsesClient["responses"]["parse"],
      },
    };

    const result = await generateMissionDraft(
      {
        targetPattern: "I like ___ing.",
        topic: "After school",
        level: "elementary",
        requiredTurns: 1,
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "provider_failed" });
  });

  it("rejects D-09 failed-schema output before a generated draft can become assignable", async () => {
    const { generateMissionDraft } = await import("@/server/ai/mission-generator");
    const client = createFakeClient({
      output_parsed: {
        ...providerDraft,
        requiredTurns: 2,
      },
    });

    const result = await generateMissionDraft(
      {
        targetPattern: "I like ___ing.",
        topic: "After school",
        level: "elementary",
        requiredTurns: 2,
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
  });
});
