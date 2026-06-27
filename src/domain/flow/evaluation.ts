/**
 * Placeholder evaluation shape (D-02 swap point).
 *
 * Phase 4 uses a deterministic accept-any-non-empty evaluation.
 * Phase 6 will swap this for real AI evaluation by checking
 * `evaluation.version` — "placeholder-v1" means Phase 4,
 * "ai-eval-v1" means Phase 6+.
 *
 * Pure domain module — no DB, server, or AI/LLM imports.
 *
 * Swap-point allowlist: placeholder-v1
 */

export const PLACEHOLDER_EVALUATION_VERSION = "placeholder-v1" as const;

export type PlaceholderEvaluation = {
  version: typeof PLACEHOLDER_EVALUATION_VERSION;
  meaningUnderstood: true;
  targetPatternAttempted: true;
  evaluatedAt: string;
};

export function buildPlaceholderEvaluation(
  now: string = new Date().toISOString(),
): PlaceholderEvaluation {
  return {
    version: PLACEHOLDER_EVALUATION_VERSION,
    meaningUnderstood: true,
    targetPatternAttempted: true,
    evaluatedAt: now,
  };
}
