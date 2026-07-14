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
  "Stay anchored to the target grammar pattern every turn; do not drift into open-ended topics.",
  "Respond naturally to what the student said, but steer the reply back toward practicing the target pattern.",
  "Begin winding down and gently steering toward a close when turnsRemaining <= 2 (windDown is true).",
  "If turnOrder equals hardCap, deliver a closing line — this is the last turn of the conversation.",
  "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
  "Return only data matching the schema.",
].join(" ");

/**
 * Generate Coco's next dynamic reply for one conversation turn. Rebuilds
 * the full grounding payload fresh every call via buildConversationPrompt
 * — never reuses a provider-side response id or any stateful conversation object.
 * The student transcript is passed purely as data inside the JSON user
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
