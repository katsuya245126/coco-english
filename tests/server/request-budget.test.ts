import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("consumeRequestBudget", () => {
  it("uses the request-budget purpose and exact literal audio quota", async () => {
    vi.stubEnv("STUDENT_ACCESS_SECRET", "a".repeat(32));
    const rpc = vi.fn(async () => ({
      data: [{ permitted: true, retry_after_seconds: 0 }],
      error: null,
    }));
    const { consumeRequestBudget } = await import(
      "@/server/security/request-budget"
    );
    await expect(
      consumeRequestBudget(
        { actorId: "student-1", operation: "student_audio" },
        { rpc },
      ),
    ).resolves.toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith("consume_request_budget", {
      p_actor_digest: createHmac("sha256", "a".repeat(32))
        .update("request-budget:v1:student-1")
        .digest("base64url"),
      p_operation: "student_audio",
      p_request_limit: 24,
      p_window_seconds: 600,
    });
  });

  it("returns the database retry delay for a denied request", async () => {
    vi.stubEnv("STUDENT_ACCESS_SECRET", "b".repeat(32));
    const { consumeRequestBudget } = await import(
      "@/server/security/request-budget"
    );
    await expect(
      consumeRequestBudget(
        { actorId: "teacher-1", operation: "teacher_provider" },
        {
          rpc: vi.fn(async () => ({
            data: [{ permitted: false, retry_after_seconds: 321 }],
            error: null,
          })),
        },
      ),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 321 });
  });

  it.each(["", "short", "replace-with-a-random-secret-at-least-32-bytes"])(
    "fails closed without an RPC for invalid secret %j",
    async (secret) => {
      vi.stubEnv("STUDENT_ACCESS_SECRET", secret);
      const rpc = vi.fn();
      const { consumeRequestBudget } = await import(
        "@/server/security/request-budget"
      );
      await expect(
        consumeRequestBudget(
          { actorId: "student-1", operation: "student_helper" },
          { rpc },
        ),
      ).resolves.toEqual({ allowed: false, retryAfterSeconds: 600 });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("fails closed on RPC errors and malformed rows", async () => {
    vi.stubEnv("STUDENT_ACCESS_SECRET", "c".repeat(32));
    const { consumeRequestBudget } = await import(
      "@/server/security/request-budget"
    );
    // The last row is deliberately ill-typed: it proves the module validates
    // the shape at runtime rather than trusting the database's declared types.
    const malformedResults = [
      { data: null, error: new Error("db down") },
      { data: [], error: null },
      { data: [{ permitted: "yes", retry_after_seconds: -1 }], error: null },
    ] as unknown as Array<{
      data: Array<{ permitted: boolean; retry_after_seconds: number }> | null;
      error: unknown;
    }>;

    for (const result of malformedResults) {
      await expect(
        consumeRequestBudget(
          { actorId: "student-1", operation: "student_helper" },
          { rpc: vi.fn(async () => result) },
        ),
      ).resolves.toEqual({ allowed: false, retryAfterSeconds: 600 });
    }
  });
});
