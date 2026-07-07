import { describe, expect, it } from "vitest";
import {
  DEGRADE_SAMPLE_SIZE,
  DEGRADE_TRIGGER_RATIO,
  FRAME_BUDGET_MS,
  shouldDegrade,
} from "@/domain/character/mascot-perf-degrade";

function sample(overBudgetCount: number): number[] {
  return [
    ...Array(overBudgetCount).fill(FRAME_BUDGET_MS + 7),
    ...Array(DEGRADE_SAMPLE_SIZE - overBudgetCount).fill(16),
  ];
}

describe("shouldDegrade (MASCOT-04)", () => {
  it("returns false when there is not enough frame data", () => {
    expect(shouldDegrade(Array(DEGRADE_SAMPLE_SIZE - 1).fill(40))).toBe(false);
  });

  it("returns false for a healthy full sample", () => {
    expect(shouldDegrade(Array(DEGRADE_SAMPLE_SIZE).fill(16))).toBe(false);
  });

  it("returns true for a degraded full sample", () => {
    expect(shouldDegrade(Array(DEGRADE_SAMPLE_SIZE).fill(40))).toBe(true);
  });

  it("triggers only when the over-budget ratio is strictly above the threshold", () => {
    const atBoundary = DEGRADE_SAMPLE_SIZE * DEGRADE_TRIGGER_RATIO;

    expect(shouldDegrade(sample(atBoundary))).toBe(false);
    expect(shouldDegrade(sample(atBoundary + 1))).toBe(true);
  });
});
