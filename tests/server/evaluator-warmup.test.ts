import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConsume, mockEvaluateOriginalTurn, mockEvaluateRepeatTurn } =
  vi.hoisted(() => ({
    mockConsume: vi.fn(),
    mockEvaluateOriginalTurn: vi.fn(),
    mockEvaluateRepeatTurn: vi.fn(),
  }));

vi.mock("@/server/security/request-budget", () => ({
  consumeRequestBudget: mockConsume,
}));

vi.mock("@/server/ai/turn-evaluator", () => ({
  evaluateOriginalTurn: mockEvaluateOriginalTurn,
  evaluateRepeatTurn: mockEvaluateRepeatTurn,
}));

vi.mock("@/server/logging/logger", () => ({ log: vi.fn() }));

describe("evaluator warm-up budget", () => {
  beforeEach(() => {
    vi.resetModules();
    mockConsume.mockReset();
    mockEvaluateOriginalTurn.mockReset();
    mockEvaluateRepeatTurn.mockReset();
  });

  it("skips both evaluators when the global warm-up budget is denied", async () => {
    mockConsume.mockResolvedValue({ allowed: false, retryAfterSeconds: 45 });

    const { warmEvaluators } = await import("@/server/ai/evaluator-warmup");
    await warmEvaluators("elementary");

    expect(mockConsume).toHaveBeenCalledWith({
      actorId: "global-evaluator-warmup",
      operation: "evaluator_warmup",
    });
    expect(mockEvaluateOriginalTurn).not.toHaveBeenCalled();
    expect(mockEvaluateRepeatTurn).not.toHaveBeenCalled();
  });

  it("dispatches both existing warm-ups after admission", async () => {
    mockConsume.mockResolvedValue({ allowed: true });
    mockEvaluateOriginalTurn.mockResolvedValue({ ok: false });
    mockEvaluateRepeatTurn.mockResolvedValue({ ok: false });

    const { warmEvaluators } = await import("@/server/ai/evaluator-warmup");
    await warmEvaluators("elementary");

    expect(mockEvaluateOriginalTurn).toHaveBeenCalledTimes(1);
    expect(mockEvaluateRepeatTurn).toHaveBeenCalledTimes(1);
  });

  it("never rejects when an admitted evaluator fails", async () => {
    mockConsume.mockResolvedValue({ allowed: true });
    mockEvaluateOriginalTurn.mockRejectedValue(new Error("provider down"));
    mockEvaluateRepeatTurn.mockRejectedValue(new Error("provider down"));

    const { warmEvaluators } = await import("@/server/ai/evaluator-warmup");
    await expect(warmEvaluators("elementary")).resolves.toBeUndefined();
  });

  it("keeps the mission page's non-blocking warm-up call", () => {
    const pageSource = readFileSync(
      join(
        process.cwd(),
        "src/app/student/missions/[assignmentStudentId]/page.tsx",
      ),
      "utf8",
    );
    expect(pageSource).toContain("after(() => warmEvaluators(snapshot.level));");
  });
});
