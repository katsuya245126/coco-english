import { describe, expect, it } from "vitest";
import { generateScenePremise } from "@/server/ai/scene-premise-generator";
import type { ScenePremiseResponsesClient } from "@/server/ai/scene-premise-generator";

// Standalone scene-premise adapter (SCENE-01). Zero references to the
// removed AI mission-draft feature — mirrors conversation-generator.test.ts's
// injected-fake-client convention so tests never call the paid OpenAI API.

function fakeClient(
  outputParsed: unknown,
): ScenePremiseResponsesClient {
  return {
    responses: {
      parse: async () => ({ output_parsed: outputParsed }),
    },
  };
}

function throwingClient(): ScenePremiseResponsesClient {
  return {
    responses: {
      parse: async () => {
        throw new Error("provider unavailable");
      },
    },
  };
}

describe("generateScenePremise", () => {
  it("returns a non-empty generated premise on success", async () => {
    const result = await generateScenePremise(
      { targetPattern: "Can I have ___, please?", level: "elementary" },
      {
        client: fakeClient({
          scenePremise: "You walk into Coco's coffee shop after school.",
        }),
      },
    );

    expect(result).toEqual({
      ok: true,
      scenePremise: "You walk into Coco's coffee shop after school.",
    });
  });

  it("fails schema_failed when the response is missing scenePremise", async () => {
    const result = await generateScenePremise(
      { targetPattern: "Can I have ___, please?", level: "elementary" },
      { client: fakeClient({}) },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
  });

  it("fails schema_failed when scenePremise is an empty string", async () => {
    const result = await generateScenePremise(
      { targetPattern: "Can I have ___, please?", level: "elementary" },
      { client: fakeClient({ scenePremise: "   " }) },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
  });

  it("fails schema_failed when scenePremise exceeds 280 characters", async () => {
    const result = await generateScenePremise(
      { targetPattern: "Can I have ___, please?", level: "elementary" },
      { client: fakeClient({ scenePremise: "x".repeat(281) }) },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
  });

  it("fails provider_error when the client throws", async () => {
    const result = await generateScenePremise(
      { targetPattern: "Can I have ___, please?", level: "elementary" },
      { client: throwingClient() },
    );

    expect(result).toEqual({ ok: false, error: "provider_error" });
  });

  it("fails schema_failed when the input itself is invalid (empty targetPattern)", async () => {
    const result = await generateScenePremise(
      { targetPattern: "", level: "elementary" },
      { client: fakeClient({ scenePremise: "Should never be reached." }) },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
  });

  it("fails missing_api_key when no client and no API key are provided", async () => {
    const result = await generateScenePremise(
      { targetPattern: "Can I have ___, please?", level: "elementary" },
      { apiKey: "" },
    );

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
  });
});
