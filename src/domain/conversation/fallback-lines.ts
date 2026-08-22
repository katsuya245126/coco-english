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
 *
 * Follow-up fallback selection is bounded server-known response state, not a
 * turn-order rotation (Task 4, 2026-07-23 evaluation-follow-up-quality
 * repair): the same three lines a context-free rotation used to produce
 * gave students unanswerable prompts (RESEARCH.md Pitfall 5 UAT failures).
 */

export type FollowUpFallbackKind = "meaningful" | "vague_or_stuck" | "uncertain";

export const FOLLOW_UP_FALLBACK_LINES = {
  meaningful: "Thanks for telling me! What is it like?",
  vague_or_stuck: "That's okay! Can you give me one example?",
  uncertain: "Thanks for trying! What else do you want to tell me?",
} as const satisfies Record<FollowUpFallbackKind, string>;

const VAGUE_OR_STUCK_RESPONSES = new Set([
  "anything",
  "something",
  "stuff",
  "i don't know",
  "i dont know",
  "not sure",
  "maybe",
]);

function normalizeResponse(text: string) {
  return text
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ");
}

export function classifyFollowUpFallbackKind(input: {
  latestResponse: string;
  responseHandling: "normal" | "review_pending";
  inputUsable: boolean;
}): FollowUpFallbackKind {
  if (!input.inputUsable || input.responseHandling === "review_pending") {
    return "uncertain";
  }
  return VAGUE_OR_STUCK_RESPONSES.has(normalizeResponse(input.latestResponse))
    ? "vague_or_stuck"
    : "meaningful";
}

export function selectFollowUpFallbackLine(kind: FollowUpFallbackKind): string {
  return FOLLOW_UP_FALLBACK_LINES[kind];
}

export const CANNED_CLOSING_FALLBACK_LINE =
  "That was fun! Thanks for talking with me. See you next time!" as const;

export function selectClosingFallbackLine(): string {
  return CANNED_CLOSING_FALLBACK_LINE;
}

/**
 * Static same-turn retry line for the first unclear answer (2026-08-22
 * recovery ladder): cheaper and more natural for an elementary learner than
 * burning a generation call on a rephrased question. Never scored, never a
 * model sentence — it must not be confusable with the material-correction
 * repeat flow.
 */
export const SAY_IT_AGAIN_FALLBACK_LINE =
  "Hmm... can you say it again?" as const;

/**
 * Deterministic prefix for the continuation line Coco speaks after a turn is
 * flagged for teacher review in the background, so the handoff to the next
 * question reads as part of the conversation instead of a silent topic jump.
 */
export const REVIEW_PENDING_ACKNOWLEDGMENT_PREFIX = "Okay! No worries!" as const;

export function withReviewPendingAcknowledgment(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return trimmed;
  if (
    trimmed.toLocaleLowerCase("en-US").startsWith(
      REVIEW_PENDING_ACKNOWLEDGMENT_PREFIX.toLocaleLowerCase("en-US"),
    )
  ) {
    return trimmed;
  }
  return `${REVIEW_PENDING_ACKNOWLEDGMENT_PREFIX} ${trimmed}`;
}
