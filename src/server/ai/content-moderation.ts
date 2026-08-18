/**
 * Server-only content-moderation adapter (T-11-05, CHAT-05 child-safety gate).
 *
 * Wraps client.moderations.create() (model: omni-moderation-latest) for both
 * directions: student transcripts before they reach the conversation
 * generator, and Coco's generated lines before display/storage/TTS.
 *
 * CRITICAL divergence from the other AI adapters in this codebase: this
 * wrapper must never fail open. Any thrown error, empty results array, or
 * non-boolean flagged field is treated as unsafe (failedOpen:true), routing
 * to the canned-fallback path — the opposite default of a typical adapter's
 * optimistic "assume happy path" error handling (RESEARCH.md Pitfall 3).
 *
 * Tests inject a fake moderation client so automated verification never
 * calls the paid/live OpenAI API. (Data-use posture recorded in
 * 11-MODERATION-DATA-USE.md before this module sends any student content.)
 */

import OpenAI from "openai";
import { log } from "@/server/logging/logger";

const MODERATION_MODEL = "omni-moderation-latest";

export type ModerationClient = {
  moderations: {
    create(input: { input: string; model?: string }): Promise<{
      results: Array<{ flagged?: unknown }>;
    }>;
  };
};

export type IsContentSafeDeps = {
  apiKey?: string;
  client?: ModerationClient;
};

export type IsContentSafeResult =
  | { safe: boolean; failedOpen: false }
  | { safe: false; failedOpen: true };

function resolveApiKey(deps?: IsContentSafeDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function createClient(apiKey: string): ModerationClient {
  return new OpenAI({ apiKey });
}

function failClosed(reason: string): IsContentSafeResult {
  log("warn", "ai.moderation_failed_closed", { reason });
  return { safe: false, failedOpen: true };
}

/**
 * Check whether text is safe to use (student transcript pre-generation, or
 * Coco's generated line pre-display/storage/TTS). Fails closed on any
 * ambiguous, malformed, or errored provider response — never resolves to
 * safe:true unless the moderation result explicitly says flagged === false.
 */
export async function isContentSafe(
  text: string,
  deps?: IsContentSafeDeps,
): Promise<IsContentSafeResult> {
  const apiKey = resolveApiKey(deps);
  const client = deps?.client;

  if (!client && !apiKey) {
    return failClosed("missing_api_key");
  }

  try {
    const resolvedClient = client ?? createClient(apiKey);
    const response = await resolvedClient.moderations.create({
      input: text,
      model: MODERATION_MODEL,
    });

    const flagged = response?.results?.[0]?.flagged;
    if (typeof flagged !== "boolean") {
      return failClosed("malformed_response");
    }

    return { safe: !flagged, failedOpen: false };
  } catch {
    return failClosed("provider_failed");
  }
}
