/**
 * Mascot low-end-device performance degrade (MASCOT-04, D-07).
 *
 * Pure domain module — takes an array of frame-time deltas (ms) already
 * measured by the caller's own requestAnimationFrame loop. No DOM import.
 */

export const FRAME_BUDGET_MS = 33;
export const DEGRADE_SAMPLE_SIZE = 30;
export const DEGRADE_TRIGGER_RATIO = 0.5;

export function shouldDegrade(recentFrameDeltas: number[]): boolean {
  if (recentFrameDeltas.length < DEGRADE_SAMPLE_SIZE) return false;

  const overBudgetCount = recentFrameDeltas.filter(
    (delta) => delta > FRAME_BUDGET_MS,
  ).length;

  return overBudgetCount / recentFrameDeltas.length > DEGRADE_TRIGGER_RATIO;
}
