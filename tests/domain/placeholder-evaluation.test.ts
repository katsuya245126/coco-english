import { describe, expect, it } from "vitest";
import {
  buildPlaceholderEvaluation,
  PLACEHOLDER_EVALUATION_VERSION,
} from "@/domain/flow/evaluation";

describe("placeholder evaluation shape (D-02 swap point)", () => {
  it("PLACEHOLDER_EVALUATION_VERSION is placeholder-v1", () => {
    expect(PLACEHOLDER_EVALUATION_VERSION).toBe("placeholder-v1");
  });

  it("buildPlaceholderEvaluation returns the versioned shape", () => {
    const result = buildPlaceholderEvaluation();
    expect(result.version).toBe("placeholder-v1");
    expect(result.meaningUnderstood).toBe(true);
    expect(result.targetPatternAttempted).toBe(true);
    expect(typeof result.evaluatedAt).toBe("string");
  });

  it("buildPlaceholderEvaluation accepts an explicit timestamp", () => {
    const now = "2026-06-27T00:00:00.000Z";
    const result = buildPlaceholderEvaluation(now);
    expect(result.evaluatedAt).toBe(now);
  });

  it("evaluatedAt is a valid ISO string by default", () => {
    const result = buildPlaceholderEvaluation();
    expect(() => new Date(result.evaluatedAt)).not.toThrow();
    expect(new Date(result.evaluatedAt).toISOString()).toBe(result.evaluatedAt);
  });
});
