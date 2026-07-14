import { describe, expect, it, vi } from "vitest";
import type { ModerationClient } from "@/server/ai/content-moderation";

function createFakeClient(
  impl: (input: { input: string; model?: string }) => Promise<{
    results: Array<Record<string, unknown>>;
  }>,
): ModerationClient {
  return {
    moderations: {
      create: vi.fn(impl) as ModerationClient["moderations"]["create"],
    },
  };
}

describe("isContentSafe (T-11-05, fail-closed child-safety gate)", () => {
  it("returns safe:true when the moderation result explicitly has flagged:false", async () => {
    const { isContentSafe } = await import("@/server/ai/content-moderation");
    const client = createFakeClient(async () => ({
      results: [{ flagged: false }],
    }));

    const result = await isContentSafe("I like playing soccer.", {
      apiKey: "test-key",
      client,
    });

    expect(result).toEqual({ safe: true, failedOpen: false });
    expect(client.moderations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "I like playing soccer.",
        model: "omni-moderation-latest",
      }),
    );
  });

  it("returns safe:false, failedOpen:false when the moderation result has flagged:true", async () => {
    const { isContentSafe } = await import("@/server/ai/content-moderation");
    const client = createFakeClient(async () => ({
      results: [{ flagged: true }],
    }));

    const result = await isContentSafe("some unsafe text", {
      apiKey: "test-key",
      client,
    });

    expect(result).toEqual({ safe: false, failedOpen: false });
  });

  it("fails closed (safe:false, failedOpen:true) when the client throws", async () => {
    const { isContentSafe } = await import("@/server/ai/content-moderation");
    const client = createFakeClient(async () => {
      throw new Error("network error");
    });

    const result = await isContentSafe("some text", {
      apiKey: "test-key",
      client,
    });

    expect(result).toEqual({ safe: false, failedOpen: true });
  });

  it("fails closed when results is an empty array", async () => {
    const { isContentSafe } = await import("@/server/ai/content-moderation");
    const client = createFakeClient(async () => ({ results: [] }));

    const result = await isContentSafe("some text", {
      apiKey: "test-key",
      client,
    });

    expect(result).toEqual({ safe: false, failedOpen: true });
  });

  it("fails closed when results[0] has a non-boolean flagged field", async () => {
    const { isContentSafe } = await import("@/server/ai/content-moderation");
    const client = createFakeClient(async () => ({
      results: [{ flagged: "yes" }],
    }));

    const result = await isContentSafe("some text", {
      apiKey: "test-key",
      client,
    });

    expect(result).toEqual({ safe: false, failedOpen: true });
  });

  it.each([
    { results: undefined },
    { results: [{}] },
    { results: [{ flagged: null }] },
    { results: [{ flagged: 1 }] },
    { results: [{ flagged: "true" }] },
    { results: [{ notFlagged: false }] },
    { results: [null] },
    {},
  ])(
    "held-out property case: arbitrary non-{flagged:boolean} shape %j always fails closed",
    async (malformed) => {
      const { isContentSafe } = await import("@/server/ai/content-moderation");
      const client = createFakeClient(async () => malformed as {
        results: Array<Record<string, unknown>>;
      });

      const result = await isContentSafe("some text", {
        apiKey: "test-key",
        client,
      });

      expect(result).toEqual({ safe: false, failedOpen: true });
    },
  );

  it("returns missing_api_key-equivalent fail-closed behavior when no apiKey and no client are provided", async () => {
    const { isContentSafe } = await import("@/server/ai/content-moderation");

    const result = await isContentSafe("some text", { apiKey: "" });

    expect(result).toEqual({ safe: false, failedOpen: true });
  });

  it("pins the model to omni-moderation-latest regardless of caller input", async () => {
    const { isContentSafe } = await import("@/server/ai/content-moderation");
    const client = createFakeClient(async () => ({
      results: [{ flagged: false }],
    }));

    await isContentSafe("hello", { apiKey: "test-key", client });

    const call = vi.mocked(client.moderations.create).mock.calls[0]?.[0];
    expect(call?.model).toBe("omni-moderation-latest");
  });
});
