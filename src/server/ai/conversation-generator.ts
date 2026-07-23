/**
 * Server-only dynamic Coco reply generation adapter (Coco Chat, Phase 11).
 *
 * Mirrors the deps/client/resolveApiKey/createClient/three-tier-error-union
 * shape established by turn-evaluator.ts. The key architectural guardrail
 * (CHAT-04) is that grounding is rebuilt fresh on every call via
 * buildConversationPrompt() — no provider-side response chaining, no stateful
 * Conversation object, no chat-history blob. Each call's exact input is
 * fully reconstructable and loggable from this app's own DB rows.
 *
 * Tests inject a fake Responses client so automated verification never
 * calls the paid OpenAI API.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { log } from "@/server/logging/logger";
import {
  conversationReplyMode,
  conversationTurnInputSchema,
  generatedCocoReplySchema,
  parseGeneratedCocoReply,
  buildConversationPrompt,
  validateGeneratedCocoReplyLine,
  type ConversationSafetyMode,
  type GenerateCocoReplyInput,
  type GeneratedCocoReply,
  type GeneratedCocoReplyLineViolation,
} from "@/domain/ai/conversation-generation";

const DEFAULT_CONVERSATION_MODEL = "gpt-4.1-mini";

export type GenerateCocoReplyError =
  | "invalid_input"
  | "missing_api_key"
  | "provider_failed"
  | "schema_failed"
  | "reply_policy_failed";

export type GenerateCocoReplyResult =
  | { ok: true; reply: GeneratedCocoReply }
  | {
      ok: false;
      error: Exclude<GenerateCocoReplyError, "reply_policy_failed">;
    }
  | {
      ok: false;
      error: "reply_policy_failed";
      violations: GeneratedCocoReplyLineViolation[];
    };

export type ConversationResponsesClient = {
  responses: {
    parse(input: {
      model: string;
      input: Array<{
        role: "system" | "user";
        content: string;
      }>;
      text: {
        format: unknown;
      };
    }): Promise<{ output_parsed?: unknown }>;
  };
};

export type GenerateCocoReplyDeps = {
  apiKey?: string;
  model?: string;
  client?: ConversationResponsesClient;
};

function resolveApiKey(deps?: GenerateCocoReplyDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: GenerateCocoReplyDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_CONVERSATION_MODEL?.trim() ||
    DEFAULT_CONVERSATION_MODEL
  );
}

function createClient(apiKey: string): ConversationResponsesClient {
  return new OpenAI({ apiKey }) as ConversationResponsesClient;
}

const CONVERSATION_SYSTEM_MESSAGE = [
  "Generate Coco's next line in a bounded ESL practice conversation.",
  "You are talking with a young ESL learner: use short, simple sentences and easy everyday words.",
  "Prefer one or two short, simple sentences.",
  "Follow replyMode from the user payload exactly.",
  "When replyMode is follow_up, acknowledge the latest studentResponse and ask exactly one relevant question.",
  "When replyMode is closing, acknowledge the latest studentResponse specifically, add a short friendly goodbye such as 'See you next time,' and ask no question.",
  "Write complete, correctly punctuated sentences. Put sentence-ending punctuation between a reaction and the follow-up question; never join them as a run-on.",
  "Treat every detail in conversationHistory as already known.",
  "Acknowledge or react specifically to the latest studentResponse before asking a follow-up.",
  "Before the closing turn, ask exactly one short question for genuinely new information whose answer is not present or directly implied anywhere in conversationHistory.",
  "Before the closing turn, after a meaningful answer, ask an open question that connects directly to the answer and invites a short phrase or sentence.",
  "Before the closing turn, treat a short answer as meaningful when it adds a real detail; after 'Inside.', ask an expandable question such as 'What games do you play inside?'.",
  "Prefer an open question after a meaningful answer. A single either-or question is allowed when both choices are relevant and child-friendly.",
  "Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
  "Before the closing turn, acknowledge lightly, then ask one short scene-relevant narrowing question. Use two concrete child-friendly choices only when the latest response is vague, unclear, or shows the learner is stuck.",
  "Do not shame the learner or demand a more specific answer.",
  "Example: after 'What do you and Minju talk about?' -> 'Anything.', do not say 'Talking about anything is fun.'; say 'Lots of things! Do you talk about games or school?'.",
  "Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
  "Example: after 'Who do you talk with at school?' -> 'I talk with Minju.' -> 'Where do you talk with Minju?' -> 'In the classroom.', 'Who do you talk with in class?' is invalid because Minju is already known; ask a new detail such as 'What do you and Minju talk about?'.",
  "Keep the current subject while a natural unanswered detail remains; otherwise transition gently to a nearby part of the scene.",
  "Keep the active activity from Coco's latest question as the topic; a person or place in the student's answer is a detail about that activity, not permission to switch activities.",
  "Example: after 'Who do you swim with?' -> 'With my friend.', ask 'What do you like about swimming together?'; 'What games do you play together?' is invalid because it drops the active activity, swimming.",
  "Treat targetPattern as soft lesson context only, never as a next-line template — do not steer the student back into the targetPattern format.",
  "Reject a follow-up that merely swaps in a new noun or activity to repeat targetPattern; the follow-up must connect to the student's actual answer.",
  "Begin winding down and gently steering toward a close when turnsRemaining <= 2 (windDown is true).",
  "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
  "Return only data matching the schema.",
].join(" ");

const SAFETY_RETRY_SYSTEM_MESSAGE =
  "The previous candidate was rejected by output moderation. Generate a different neutral, child-safe classroom line. Do not repeat, quote, or refer to the rejected candidate.";

function systemMessageFor(safetyMode: ConversationSafetyMode): string {
  return safetyMode === "retry"
    ? `${CONVERSATION_SYSTEM_MESSAGE} ${SAFETY_RETRY_SYSTEM_MESSAGE}`
    : CONVERSATION_SYSTEM_MESSAGE;
}

const VIOLATION_CORRECTION_HINTS: Record<
  GeneratedCocoReplyLineViolation,
  string
> = {
  question_format:
    "The previous candidate had the wrong punctuation: a line that expects a question must end in exactly one \"?\", and a closing line must have no \"?\" and end in \".\" or \"!\".",
  run_on_question:
    "The previous candidate ran a reaction straight into the question without sentence-ending punctuation between them. Put \".\", \"!\", or \"?\" between the reaction and the question.",
  either_or_question:
    "The previous candidate used an invalid either/or question after a meaningful student detail. Ask a single open question instead — do not offer a choice with \"or\".",
  topic_drift:
    "The previous candidate drifted away from the active topic (the student's latest answer and Coco's last question). Ask about a detail directly connected to what the student just said.",
};

function replyPolicyCorrection(
  expectsQuestion: boolean,
  violations: GeneratedCocoReplyLineViolation[],
) {
  return [
    ...violations.map((violation) => VIOLATION_CORRECTION_HINTS[violation]),
    expectsQuestion
      ? "Regenerate the full line once with complete, correctly punctuated sentences and one open question that stays on the active activity."
      : "Regenerate the full line once as one complete, correctly punctuated closing line with no question.",
    "Prefer one or two short, simple sentences and an open question. A single either-or question is allowed when both choices are relevant and child-friendly.",
    "Return only data matching the schema.",
  ].join(" ");
}

/**
 * Generate Coco's next dynamic reply for one conversation turn. Rebuilds
 * the full grounding payload fresh every call via buildConversationPrompt
 * — never reuses a provider-side response id or any stateful conversation object.
 * Conversation history is passed purely as data inside the JSON user
 * payload, never string-concatenated into system instructions
 * (prompt-injection mitigation, T-11-04).
 */
export async function generateCocoReply(
  input: GenerateCocoReplyInput,
  deps?: GenerateCocoReplyDeps,
): Promise<GenerateCocoReplyResult> {
  const validInput = conversationTurnInputSchema.safeParse(input);
  if (!validInput.success) {
    return { ok: false, error: "invalid_input" };
  }

  const apiKey = resolveApiKey(deps);
  if (!deps?.client && !apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  const systemMessage = systemMessageFor(validInput.data.safetyMode);

  try {
    const client = deps?.client ?? createClient(apiKey);
    const response = await client.responses.parse({
      model: resolveModel(deps),
      input: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: JSON.stringify(buildConversationPrompt(validInput.data)),
        },
      ],
      text: {
        format: zodTextFormat(generatedCocoReplySchema, "coco_reply"),
      },
    });

    const parsed = parseGeneratedCocoReply(response.output_parsed);
    if (!parsed.ok) {
      return { ok: false, error: "schema_failed" };
    }

    const latestResponse = validInput.data.conversationHistory.at(-1)?.studentResponse;
    const replyMode = conversationReplyMode(validInput.data);
    const expectsQuestion = replyMode === "follow_up";
    const activeQuestion = validInput.data.conversationHistory.at(-1)?.cocoLine;
    const linePolicy = validateGeneratedCocoReplyLine(parsed.reply.line, {
      expectsQuestion,
      activeQuestion,
      latestStudentResponse: latestResponse,
    });
    if (!linePolicy.ok) {
      log("warn", "ai.conversation_line_policy_rejected", {
        reasons: linePolicy.reasons,
        attempt: "first",
      });
      try {
        const correctedResponse = await client.responses.parse({
          model: resolveModel(deps),
          input: [
            {
              role: "system",
              content: `${systemMessage} ${replyPolicyCorrection(expectsQuestion, linePolicy.reasons)}`,
            },
            {
              role: "user",
              content: JSON.stringify(buildConversationPrompt(validInput.data)),
            },
          ],
          text: {
            format: zodTextFormat(generatedCocoReplySchema, "coco_reply"),
          },
        });
        const corrected = parseGeneratedCocoReply(correctedResponse.output_parsed);
        if (!corrected.ok) {
          return { ok: false, error: "schema_failed" };
        }
        const correctedPolicy = validateGeneratedCocoReplyLine(
          corrected.reply.line,
          {
            expectsQuestion,
            activeQuestion,
            latestStudentResponse: latestResponse,
          },
        );
        if (!correctedPolicy.ok) {
          log("warn", "ai.conversation_line_policy_rejected", {
            reasons: correctedPolicy.reasons,
            attempt: "corrected",
          });
          return {
            ok: false,
            error: "reply_policy_failed",
            violations: correctedPolicy.reasons,
          };
        }
        return { ok: true, reply: corrected.reply };
      } catch {
        log("error", "ai.conversation_generation_failed", { error: "provider_failed" });
        return { ok: false, error: "provider_failed" };
      }
    }

    return { ok: true, reply: parsed.reply };
  } catch {
    log("error", "ai.conversation_generation_failed", { error: "provider_failed" });
    return { ok: false, error: "provider_failed" };
  }
}
