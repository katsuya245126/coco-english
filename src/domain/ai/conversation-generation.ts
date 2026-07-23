import { z } from "zod";

/**
 * Pure AI conversation-generation contracts (Coco Chat, Phase 11).
 *
 * Keep provider parsing and app decisions here; the server adapter
 * (src/server/ai/conversation-generator.ts) and UI copy live outside this
 * module. Mirrors the turn-evaluation.ts schema/parse-helper convention.
 */

export const HARD_TURN_CAP = 8 as const;

export const conversationSafetyModeSchema = z.enum(["standard", "retry"]);
export type ConversationSafetyMode = z.infer<
  typeof conversationSafetyModeSchema
>;

export const conversationResponseHandlingSchema = z.enum([
  "normal",
  "review_pending",
]);
export type ConversationResponseHandling = z.infer<
  typeof conversationResponseHandlingSchema
>;

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
    safetyMode: conversationSafetyModeSchema,
    responseHandling: conversationResponseHandlingSchema,
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

export type GeneratedCocoReplyLineViolation =
  | "question_format"
  | "run_on_question"
  // Retained only so historical stored moderation events remain type-readable;
  // the validator no longer produces this reason (see Task 3 policy repair).
  | "either_or_question"
  | "topic_drift"
  | "vague_echo";

export type GeneratedCocoReplyLinePolicyResult =
  | { ok: true }
  | { ok: false; reasons: GeneratedCocoReplyLineViolation[] };

const QUESTION_STARTER_PATTERN =
  /\b(?:who|what|when|where|why|how|(?:do|does|did|can|could|would|will|are|is|have|has)\s+(?:you|your|he|she|they|we|it))\b/iu;

const TOPIC_STOP_WORDS = new Set([
  "who", "what", "when", "where", "why", "how", "do", "does", "did",
  "can", "could", "would", "will", "are", "is", "have", "has", "you",
  "your", "with", "to", "at", "in", "on", "for", "from", "about", "the",
  "a", "an", "and", "or", "often", "like", "want",
]);

function hasRunOnQuestion(line: string) {
  const match = line.match(QUESTION_STARTER_PATTERN);
  const index = match?.index ?? 0;
  if (!match || index === 0) return false;

  const prefix = line.slice(0, index).trimEnd();
  return !/[.!?]$/u.test(prefix);
}

function normalizedWords(text: string) {
  return text.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}']+/gu) ?? [];
}

/**
 * Words a learner reaches for when they have nothing specific to say. Echoing
 * one back ("Talking about anything is fun!") treats a non-answer as a real
 * detail, which reads as Coco not listening.
 */
const VAGUE_RESPONSE_WORDS = new Set([
  "anything", "something", "everything", "nothing",
  "stuff", "things", "whatever", "anywhere", "somewhere",
]);

/**
 * True when Coco's reaction repeats a vague word the student just used.
 *
 * Only the reaction is examined — the text before the question. A vague word
 * inside the question itself is fine and often the recommended recovery
 * ("Do you talk about games or anything else?"), and Coco may freely introduce
 * such a word when the student did not use one. The violation is specifically
 * mirroring the learner's non-answer back as though it were information.
 */
function echoesVagueResponse(line: string, latestStudentResponse?: string) {
  if (!latestStudentResponse) return false;

  const studentVagueWords = normalizedWords(latestStudentResponse).filter(
    (word) => VAGUE_RESPONSE_WORDS.has(word),
  );
  if (studentVagueWords.length === 0) return false;

  const questionIndex = line.search(QUESTION_STARTER_PATTERN);
  const reaction = questionIndex > 0 ? line.slice(0, questionIndex) : line;

  const reactionWords = new Set(normalizedWords(reaction));
  return studentVagueWords.some((word) => reactionWords.has(word));
}

function latestQuestionText(text: string) {
  const questions = text.match(/[^.!?]*\?/gu);
  return questions?.at(-1) ?? text;
}

function relatedTopicWord(left: string, right: string) {
  if (left === right || left.startsWith(right) || right.startsWith(left)) {
    return true;
  }
  return left.length >= 4 && right.length >= 4 && left.slice(0, 3) === right.slice(0, 3);
}

function staysOnActiveTopic(
  line: string,
  activeQuestion?: string,
  latestStudentResponse?: string,
) {
  if (!activeQuestion) return true;
  const normalizedResponse = latestStudentResponse
    ?.toLocaleLowerCase("en-US")
    .replace(/[’‘]/gu, "'");
  if (
    normalizedResponse &&
    /\b(?:don't|do not|doesn't|does not|didn't|did not|not|never)\b/u.test(
      normalizedResponse,
    )
  ) {
    return true;
  }
  const questionTopicWords = normalizedWords(
    latestQuestionText(activeQuestion),
  ).filter((word) => word.length >= 3 && !TOPIC_STOP_WORDS.has(word));
  const responseTopicWords = latestStudentResponse
    ? normalizedWords(latestStudentResponse).filter(
        (word) => word.length >= 3 && !TOPIC_STOP_WORDS.has(word),
      )
    : [];
  const topicWords = [...questionTopicWords, ...responseTopicWords];
  if (topicWords.length === 0) return true;

  const lineWords = normalizedWords(line);
  return topicWords.some((topicWord) =>
    lineWords.some((lineWord) => relatedTopicWord(topicWord, lineWord)),
  );
}

/** Deterministic format backstop for conversation-only provider output. */
export function validateGeneratedCocoReplyLine(
  line: string,
  options: {
    expectsQuestion: boolean;
    activeQuestion?: string;
    latestStudentResponse?: string;
  },
): GeneratedCocoReplyLinePolicyResult {
  const normalized = line.trim();
  const reasons: GeneratedCocoReplyLineViolation[] = [];
  const questionMarks = normalized.match(/\?/gu)?.length ?? 0;

  if (
    options.expectsQuestion
      ? questionMarks !== 1 || !normalized.endsWith("?")
      : questionMarks !== 0 || !/[.!]$/u.test(normalized)
  ) {
    reasons.push("question_format");
  }

  if (options.expectsQuestion && hasRunOnQuestion(normalized)) {
    reasons.push("run_on_question");
  }

  if (
    options.expectsQuestion &&
    !staysOnActiveTopic(
      normalized,
      options.activeQuestion,
      options.latestStudentResponse,
    )
  ) {
    reasons.push("topic_drift");
  }

  if (
    options.expectsQuestion &&
    echoesVagueResponse(normalized, options.latestStudentResponse)
  ) {
    reasons.push("vague_echo");
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

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

export type ConversationReplyMode = "follow_up" | "closing";

/**
 * The mission snapshot's requiredTurns owns conversational ending
 * semantics; HARD_TURN_CAP remains only the absolute safety ceiling
 * (see docs/superpowers/specs/2026-07-23-final-coco-closing-design.md).
 */
export function conversationReplyMode(input: {
  turnOrder: number;
  requiredTurns: number;
}): ConversationReplyMode {
  return input.turnOrder >= input.requiredTurns ? "closing" : "follow_up";
}

/**
 * Rebuild the full grounding payload fresh for every generation call
 * (CHAT-04 architectural guardrail — no chat-history blob, no
 * previous_response_id). Pure function, directly unit-testable.
 */
export function buildConversationPrompt(input: GenerateCocoReplyInput) {
  const replyMode = conversationReplyMode(input);
  const turnsRemaining = Math.max(0, input.requiredTurns - input.turnOrder);
  const windDown = replyMode === "follow_up" && turnsRemaining <= 1;
  const reviewPendingInstructions: string[] =
    input.responseHandling === "review_pending"
      ? [
          "The latest studentResponse is internally uncertain. Use the latest studentResponse only when its meaning is clear from Coco's active question; do not invent or state guessed details as facts.",
          "If the latest response is unclear, continue from the most recent earlier studentResponse with understandable meaning.",
          "If no studentResponse is usable, ask one short neutral question grounded in scenePremise.",
        ]
      : [];

  return {
    scenePremise: input.scenePremise,
    targetPattern: input.targetPattern,
    turnOrder: input.turnOrder,
    requiredTurns: input.requiredTurns,
    hardCap: HARD_TURN_CAP,
    replyMode,
    turnsRemaining,
    windDown,
    safetyMode: input.safetyMode,
    responseHandling: input.responseHandling,
    conversationHistory: input.conversationHistory,
    instructions: [
      "Speak to a young ESL learner: short, simple sentences with easy everyday words.",
      replyMode === "closing"
        ? "Acknowledge the latest studentResponse specifically, then add a short friendly goodbye. Write one or two short complete sentences with no question."
        : "Acknowledge the latest studentResponse, then ask exactly one relevant question for new information.",
      "Write complete, correctly punctuated sentences. Put sentence-ending punctuation between a reaction and the follow-up question; never join them as a run-on.",
      "Treat every detail in conversationHistory as already known.",
      ...reviewPendingInstructions,
      "Before the closing turn, acknowledge the latest studentResponse, then ask exactly one question for new information whose answer is not present or directly implied anywhere in conversationHistory.",
      "Before the closing turn, after a meaningful answer, ask an open question that connects directly to the answer and invites a short phrase or sentence.",
      "Before the closing turn, treat a short answer as meaningful when it adds a real detail; after 'Inside.', ask an expandable question such as 'What games do you play inside?'.",
      "Do not default to yes/no or either/or questions after a meaningful answer.",
      "Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
      "Before the closing turn, acknowledge lightly, then ask one short scene-relevant narrowing question. Use two concrete child-friendly choices only when the latest response is vague, unclear, or shows the learner is stuck.",
      "Do not shame the learner or demand a more specific answer.",
      "Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
      "If the current subject has no natural unanswered detail, transition gently to a nearby part of the scene.",
      "Keep the active activity from Coco's latest question as the topic; a person or place in the student's answer is a detail about that activity, not permission to switch activities.",
      "Example: after 'Who do you swim with?' -> 'With my friend.', ask 'What do you like about swimming together?'; 'What games do you play together?' is invalid because it drops the active activity, swimming.",
      "Treat targetPattern as soft lesson context only, never as a next-line template — do not steer the student back into the targetPattern format.",
      "Reject a follow-up that merely swaps in a new noun or activity to repeat targetPattern; the follow-up must connect to the student's actual answer.",
      "If windDown is true, begin gently wrapping up the scene toward a natural close.",
      "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
    ],
  };
}
