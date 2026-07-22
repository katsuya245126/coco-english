/**
 * Static canned fallback/redirect line library (Coco Chat, Phase 11).
 *
 * Used on the shared moderation/generation-failure degrade path (D-10, D-11,
 * D-13): when Coco's generated line fails moderation twice, when the
 * student's own transcript is flagged, or when generation itself fails.
 * No AI call — selection is deterministic and instant.
 *
 * Every line must read as a natural conversational move in Coco's
 * established encouraging voice (see src/domain/character/profile.ts) and
 * never as a status/error message (RESEARCH.md Pitfall 5). The student must
 * never see any mention of "moderation," "flagged," "failed," or "retry"
 * (11-UI-SPEC.md Moderation Fallback contract).
 */

export const CANNED_FALLBACK_LINES: readonly string[] = [
  "That's interesting! Tell me more about that.",
  "Nice! What happens next?",
  "I hear you! Let's keep going.",
] as const;

/**
 * Deterministically select one canned fallback line. No AI/network call.
 * Given the same seed, always returns the same line (useful for tests and
 * for reproducible evidence-page review); omitting the seed defaults to the
 * primary fallback line.
 */
export function selectFallbackLine(seed?: number): string {
  if (seed === undefined) {
    return CANNED_FALLBACK_LINES[0];
  }
  const index = ((seed % CANNED_FALLBACK_LINES.length) + CANNED_FALLBACK_LINES.length) %
    CANNED_FALLBACK_LINES.length;
  return CANNED_FALLBACK_LINES[index];
}

export const CANNED_CLOSING_FALLBACK_LINE =
  "That was fun! Thanks for talking with me. See you next time!" as const;

export function selectClosingFallbackLine(): string {
  return CANNED_CLOSING_FALLBACK_LINE;
}
