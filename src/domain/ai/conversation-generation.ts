import { z } from "zod";

/**
 * Pure AI conversation-generation contracts (Coco Chat, Phase 11).
 *
 * Keep provider parsing and app decisions here; the server adapter
 * (src/server/ai/conversation-generator.ts) and UI copy live outside this
 * module. Mirrors the turn-evaluation.ts schema/parse-helper convention.
 */

export const HARD_TURN_CAP = 8 as const;

export const conversationExchangeSchema = z.object({
  turnOrder: z.number().int().min(1).max(HARD_TURN_CAP),
  cocoLine: z.string().trim().min(1),
  studentResponse: z.string().trim().min(1),
});

export type ConversationExchange = z.infer<typeof conversationExchangeSchema>;

export const conversationHistorySchema = z
  .array(conversationExchangeSchema)
  .min(1)
  .max(HARD_TURN_CAP)
  .superRefine((history, context) => {
    history.forEach((exchange, index) => {
      if (exchange.turnOrder !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "turnOrder"],
          message: "conversation history must be contiguous and ordered",
        });
      }
    });
  });

export const conversationTurnInputSchema = z
  .object({
    scenePremise: z.string().trim().min(1),
    targetPattern: z.string().trim().min(1),
    turnOrder: z.number().int().min(1).max(HARD_TURN_CAP),
    requiredTurns: z.number().int().min(3).max(8),
    hardCap: z.literal(HARD_TURN_CAP),
    windDown: z.boolean(),
    conversationHistory: conversationHistorySchema,
  })
  .superRefine((input, context) => {
    if (input.conversationHistory.at(-1)?.turnOrder !== input.turnOrder) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conversationHistory"],
        message: "history must end at turnOrder",
      });
    }
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
    conversationHistory: input.conversationHistory,
    instructions: [
      "Speak to a young ESL learner: short, simple sentences with easy everyday words.",
      "Keep the whole line under 12 words and ask exactly one question.",
      "Treat every detail in conversationHistory as already known.",
      "Acknowledge the latest studentResponse, then ask exactly one question for new information whose answer is not present or directly implied anywhere in conversationHistory.",
      "After a meaningful answer, ask an open question that connects directly to the answer and invites a short phrase or sentence.",
      "Treat a short answer as meaningful when it adds a real detail; after 'Inside.', ask an expandable question such as 'What games do you play inside?'.",
      "Do not default to yes/no or either/or questions after a meaningful answer.",
      "Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
      "Acknowledge lightly, then ask one short scene-relevant narrowing question. Use two concrete child-friendly choices only when the latest response is vague, unclear, or shows the learner is stuck.",
      "Do not shame the learner or demand a more specific answer.",
      "Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
      "If the current subject has no natural unanswered detail, transition gently to a nearby part of the scene.",
      "Treat targetPattern as soft lesson context only, never as a next-line template — do not steer the student back into the targetPattern format.",
      "Reject a follow-up that merely swaps in a new noun or activity to repeat targetPattern; the follow-up must connect to the student's actual answer.",
      "If windDown is true, begin gently wrapping up the scene toward a natural close.",
      "If turnOrder === hardCap, deliver a closing line — this is the last turn.",
      "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
    ],
  };
}
