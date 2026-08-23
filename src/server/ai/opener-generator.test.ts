import { describe, expect, it } from "vitest";
import { generateOpener } from "@/server/ai/opener-generator";
import type { OpenerResponsesClient } from "@/server/ai/opener-generator";

function fakeClient(
  outputParsed: unknown,
  requests: unknown[] = [],
): OpenerResponsesClient {
  return {
    responses: {
      parse: async (input) => {
        requests.push(input);
        return { output_parsed: outputParsed };
      },
    },
  };
}

function throwingClient(): OpenerResponsesClient {
  return {
    responses: {
      parse: async () => {
        throw new Error("provider unavailable");
      },
    },
  };
}

describe("generateOpener", () => {
  it("returns a target-pattern-grounded Coco opener from an injected client", async () => {
    const requests: unknown[] = [];
    const result = await generateOpener(
      {
        targetPattern: "Can I have ___, please?",
      },
      {
        client: fakeClient(
          { opener: "Hi! I am choosing a snack. Can I have an apple, please? What would you like?" },
          requests,
        ),
      },
    );

    expect(result).toEqual({
      ok: true,
      opener: "Hi! I am choosing a snack. Can I have an apple, please? What would you like?",
    });
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0])).toContain("Can I have ___, please?");
  });

  it.each([{}, { opener: "   " }, { opener: "x".repeat(281) }])(
    "fails schema_failed for malformed opener output %#",
    async (output) => {
      const result = await generateOpener(
        { targetPattern: "I like ___." },
        { client: fakeClient(output) },
      );

      expect(result).toEqual({ ok: false, error: "schema_failed" });
    },
  );

  it("fails schema_failed for invalid input without calling the client", async () => {
    const requests: unknown[] = [];
    const result = await generateOpener(
      { targetPattern: "" },
      { client: fakeClient({ opener: "Should never be reached." }, requests) },
    );

    expect(result).toEqual({ ok: false, error: "schema_failed" });
    expect(requests).toHaveLength(0);
  });

  it("fails provider_failed when the injected client throws", async () => {
    const result = await generateOpener(
      { targetPattern: "I like ___." },
      { client: throwingClient() },
    );

    expect(result).toEqual({ ok: false, error: "provider_failed" });
  });

  it("fails missing_api_key without creating a provider client", async () => {
    const result = await generateOpener(
      { targetPattern: "I like ___." },
      { apiKey: "" },
    );

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
  });
});
