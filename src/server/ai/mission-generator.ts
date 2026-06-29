/**
 * Server-only mission generation adapter.
 *
 * Tests inject a fake Responses client so automated verification never calls
 * the paid OpenAI API.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  generatedMissionDraftSchema,
  missionDraftInputSchema,
  parseGeneratedMissionDraft,
  type GenerateMissionDraftInput,
  type GeneratedMissionDraft,
  type ParsedGenerateMissionDraftInput,
} from "@/domain/ai/mission-generation";

const DEFAULT_MISSION_MODEL = "gpt-4.1-mini";

export type GenerateMissionDraftError =
  | "missing_api_key"
  | "provider_failed"
  | "schema_failed";

export type GenerateMissionDraftResult =
  | { ok: true; draft: GeneratedMissionDraft }
  | { ok: false; error: GenerateMissionDraftError };

export type MissionResponsesClient = {
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

export type GenerateMissionDraftDeps = {
  apiKey?: string;
  model?: string;
  client?: MissionResponsesClient;
};

function resolveApiKey(deps?: GenerateMissionDraftDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: GenerateMissionDraftDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_MISSION_MODEL?.trim() ||
    DEFAULT_MISSION_MODEL
  );
}

function createClient(apiKey: string): MissionResponsesClient {
  return new OpenAI({ apiKey }) as MissionResponsesClient;
}

function buildPrompt(input: ParsedGenerateMissionDraftInput) {
  return {
    targetPattern: input.targetPattern,
    topic: input.topic,
    level: input.level,
    requiredTurns: input.requiredTurns,
    dueAt: input.dueAt,
    constraints: [
      "Elementary ESL classroom-safe speaking homework.",
      "Create short buddy questions tied to the target pattern and topic.",
      "Each turn needs one target-form example and three ordered hints.",
      "No student names, transcripts, audio, PINs, or private class data.",
      "The number of turns must equal requiredTurns.",
    ],
  };
}

export async function generateMissionDraft(
  input: GenerateMissionDraftInput,
  deps?: GenerateMissionDraftDeps,
): Promise<GenerateMissionDraftResult> {
  const parsedInput = missionDraftInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: "schema_failed" };
  }

  const apiKey = resolveApiKey(deps);
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  try {
    const client = deps?.client ?? createClient(apiKey);
    const response = await client.responses.parse({
      model: resolveModel(deps),
      input: [
        {
          role: "system",
          content:
            "Generate a concise, safe ESL speaking mission draft. Return only data matching the schema.",
        },
        {
          role: "user",
          content: JSON.stringify(buildPrompt(parsedInput.data)),
        },
      ],
      text: {
        format: zodTextFormat(
          generatedMissionDraftSchema,
          "mission_draft",
        ),
      },
    });
    const parsedDraft = parseGeneratedMissionDraft(response.output_parsed);

    if (!parsedDraft.ok) {
      return { ok: false, error: "schema_failed" };
    }

    return { ok: true, draft: parsedDraft.draft };
  } catch {
    return { ok: false, error: "provider_failed" };
  }
}
