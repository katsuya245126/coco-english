import { afterEach, describe, expect, it, vi } from "vitest";
import { structuredOutputCall } from "@/server/ai/structured-output";

// Shared seam behaviour (issue #69): every adapter's provider call crosses
// exactly this interface, so auth/client/normalization is verified once here
// instead of four times over fake-client boilerplate.

const baseArgs = {
  model: "test-model",
  systemMessage: "system",
  userContent: '{"payload":true}',
  format: { kind: "zod" },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("structuredOutputCall", () => {
  it("returns missing_api_key when no key and no client are available", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = await structuredOutputCall({ ...baseArgs });

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
  });

  it("falls back to the environment key when deps omit one", async () => {
    vi.stubEnv("OPENAI_API_KEY", "env-key");
    const parse = vi.fn(async () => ({ output_parsed: { fine: true } }));

    const result = await structuredOutputCall({
      ...baseArgs,
      deps: { client: { responses: { parse } } },
    });

    expect(result).toMatchObject({ ok: true, outputParsed: { fine: true } });
  });

  it("lets an injected client bypass the key requirement", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const parse = vi.fn(async () => ({
      output_parsed: { value: 42 },
      rawShape: "kept",
    }));

    const result = await structuredOutputCall({
      ...baseArgs,
      deps: { client: { responses: { parse } } },
    });

    expect(result).toEqual({
      ok: true,
      outputParsed: { value: 42 },
      response: { output_parsed: { value: 42 }, rawShape: "kept" },
    });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        input: [
          { role: "system", content: "system" },
          { role: "user", content: '{"payload":true}' },
        ],
        text: { format: { kind: "zod" } },
      }),
    );
  });

  it("normalizes a provider throw into provider_failed with the surfaced cause", async () => {
    const cause = Object.assign(new Error("upstream 503"), {
      name: "APIError",
      status: 503,
    });

    const result = await structuredOutputCall({
      ...baseArgs,
      deps: {
        apiKey: "key",
        client: {
          responses: {
            parse: vi.fn(async () => {
              throw cause;
            }),
          },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("provider_failed");
    expect(result.cause).toBe(cause);
  });
});
