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
  meaningful: "Thanks for telling me! What do you like about that?",
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
