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
  conversationTurnInputSchema,
  generatedCocoReplySchema,
  parseGeneratedCocoReply,
  buildConversationPrompt,
  type GenerateCocoReplyInput,
  type GeneratedCocoReply,
} from "@/domain/ai/conversation-generation";

const DEFAULT_CONVERSATION_MODEL = "gpt-4.1-mini";

export type GenerateCocoReplyError =
  | "missing_api_key"
  | "provider_failed"
  | "schema_failed";

export type GenerateCocoReplyResult =
  | { ok: true; reply: GeneratedCocoReply }
  | { ok: false; error: GenerateCocoReplyError };

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
  "Keep the whole line under 12 words and ask exactly one question.",
  "Treat every detail in conversationHistory as already known.",
  "Acknowledge or react specifically to the latest studentResponse before asking a follow-up.",
  "Ask exactly one short question for genuinely new information whose answer is not present or directly implied anywhere in conversationHistory.",
  "After a meaningful answer, ask an open question that connects directly to the answer and invites a short phrase or sentence.",
  "Treat a short answer as meaningful when it adds a real detail; after 'Inside.', ask an expandable question such as 'What games do you play inside?'.",
  "Do not default to yes/no or either/or questions after a meaningful answer.",
  "Treat vague replies such as 'anything', 'something', or 'stuff' as minimally informative; do not echo the vague word as if it were a meaningful detail.",
  "Acknowledge lightly, then ask one short scene-relevant narrowing question. Use two concrete child-friendly choices only when the latest response is vague, unclear, or shows the learner is stuck.",
  "Do not shame the learner or demand a more specific answer.",
  "Example: after 'What do you and Minju talk about?' -> 'Anything.', do not say 'Talking about anything is fun.'; say 'Lots of things! Do you talk about games or school?'.",
  "Do not mechanically rotate through who, what, where, when, why, or how when that repeats a known person, place, activity, preference, or fact.",
  "Example: after 'Who do you talk with at school?' -> 'I talk with Minju.' -> 'Where do you talk with Minju?' -> 'In the classroom.', 'Who do you talk with in class?' is invalid because Minju is already known; ask a new detail such as 'What do you and Minju talk about?'.",
  "Keep the current subject while a natural unanswered detail remains; otherwise transition gently to a nearby part of the scene.",
  "Treat targetPattern as soft lesson context only, never as a next-line template — do not steer the student back into the targetPattern format.",
  "Reject a follow-up that merely swaps in a new noun or activity to repeat targetPattern; the follow-up must connect to the student's actual answer.",
  "Begin winding down and gently steering toward a close when turnsRemaining <= 2 (windDown is true).",
  "If turnOrder equals hardCap, deliver a closing line — this is the last turn of the conversation.",
  "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
  "Return only data matching the schema.",
].join(" ");

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
    return { ok: false, error: "schema_failed" };
  }

  const apiKey = resolveApiKey(deps);
  if (!deps?.client && !apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  try {
    const client = deps?.client ?? createClient(apiKey);
    const response = await client.responses.parse({
      model: resolveModel(deps),
      input: [
        {
          role: "system",
          content: CONVERSATION_SYSTEM_MESSAGE,
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

    return { ok: true, reply: parsed.reply };
  } catch {
    log("error", "ai.conversation_generation_failed", { error: "provider_failed" });
    return { ok: false, error: "provider_failed" };
  }
}
