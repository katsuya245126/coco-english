import { z } from "zod";

/**
 * Pure AI conversation-generation contracts (Coco Chat, Phase 11).
 *
 * Keep provider parsing and app decisions here; the server adapter
 * (src/server/ai/conversation-generator.ts) and UI copy live outside this
 * module. Mirrors the turn-evaluation.ts schema/parse-helper convention.
 */

export const HARD_TURN_CAP = 8 as const;

export const conversationTurnInputSchema = z.object({
  scenePremise: z.string().trim().min(1),
  targetPattern: z.string().trim().min(1),
  turnOrder: z.number().int().min(1),
  requiredTurns: z.number().int().min(3).max(8),
  hardCap: z.literal(HARD_TURN_CAP),
  windDown: z.boolean(),
  studentTranscript: z.string().trim().min(1),
  previousCocoLine: z.string().trim().min(1).nullable(),
});

export type GenerateCocoReplyInput = z.infer<typeof conversationTurnInputSchema>;

export const generatedCocoReplySchema = z.object({
  line: z.string().trim().min(1),
});

export type GeneratedCocoReply = z.infer<typeof generatedCocoReplySchema>;

export type ParseGeneratedCocoReplyResult =
  | { ok: true; reply: GeneratedCocoReply }
  | { ok: false; error: "schema_failed" };

/**
 * Validate a provider's structured-output payload against
 * generatedCocoReplySchema, mirroring the parseGeneratedMissionDraft
 * convention (schema_failed on any validation miss, including a
 * missing/empty line).
 */
export function parseGeneratedCocoReply(value: unknown): ParseGeneratedCocoReplyResult {
  const parsed = generatedCocoReplySchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: "schema_failed" };
  }
  return { ok: true, reply: parsed.data };
}

/**
 * Rebuild the full grounding payload fresh for every generation call
 * (CHAT-04 architectural guardrail — no chat-history blob, no
 * previous_response_id). Pure function, directly unit-testable.
 */
export function buildConversationPrompt(input: GenerateCocoReplyInput) {
  return {
    scenePremise: input.scenePremise,
    targetPattern: input.targetPattern,
    turnOrder: input.turnOrder,
    requiredTurns: input.requiredTurns,
    hardCap: HARD_TURN_CAP,
    turnsRemaining: HARD_TURN_CAP - input.turnOrder,
    windDown: input.windDown,
    lastStudentTranscript: input.studentTranscript,
    lastCocoLine: input.previousCocoLine ?? null,
    instructions: [
      "Stay anchored to the target grammar pattern every turn; do not drift into open-ended topics.",
      "Respond naturally to what the student said, but steer the reply back toward practicing the target pattern.",
      "If windDown is true, begin gently wrapping up the scene toward a natural close.",
      "If turnOrder === hardCap, deliver a closing line — this is the last turn.",
      "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
    ],
  };
}
