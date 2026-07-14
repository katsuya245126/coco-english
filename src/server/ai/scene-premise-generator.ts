/**
 * Server-only scene-premise generation adapter (Coco Chat, Phase 11, SCENE-01).
 *
 * Standalone, net-new adapter. Mirrors the deps/client/resolveApiKey/
 * createClient/typed-result-union shape established by conversation-generator.ts.
 * Used both by a future draft flow and by 11-05's manual "Generate premise"
 * action.
 *
 * Tests inject a fake Responses client so automated verification never calls
 * the paid OpenAI API.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { log } from "@/server/logging/logger";
import {
  scenePremiseInputSchema,
  generatedScenePremiseSchema,
  parseGeneratedScenePremise,
  type ScenePremiseInput,
  type GeneratedScenePremise,
} from "@/domain/ai/scene-premise";

const DEFAULT_SCENE_PREMISE_MODEL = "gpt-4.1-mini";

export type GenerateScenePremiseError = "missing_api_key" | "provider_error" | "schema_failed";

export type GenerateScenePremiseResult =
  | { ok: true; scenePremise: GeneratedScenePremise["scenePremise"] }
  | { ok: false; error: GenerateScenePremiseError };

export type ScenePremiseResponsesClient = {
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

export type GenerateScenePremiseDeps = {
  apiKey?: string;
  model?: string;
  client?: ScenePremiseResponsesClient;
};

function resolveApiKey(deps?: GenerateScenePremiseDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: GenerateScenePremiseDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_SCENE_PREMISE_MODEL?.trim() ||
    DEFAULT_SCENE_PREMISE_MODEL
  );
}

function createClient(apiKey: string): ScenePremiseResponsesClient {
  return new OpenAI({ apiKey }) as ScenePremiseResponsesClient;
}

const SCENE_PREMISE_SYSTEM_MESSAGE = [
  "Generate a short, classroom-appropriate scene premise for an elementary ESL",
  "speaking practice conversation, derived from the given target grammar pattern.",
  'Example format: "You arrive at school and meet Coco — introduce yourself."',
  "Keep it to one or two short sentences, at most 280 characters.",
  "Elementary ESL classroom-safe. No student names, PINs, audio keys, or private data.",
  "Return only data matching the schema.",
].join(" ");

function buildScenePremisePrompt(input: ScenePremiseInput) {
  return {
    targetPattern: input.targetPattern,
    level: input.level,
    instructions: [
      "Write a short scene premise that gives the student a reason to practice the target pattern.",
      "The premise should be concrete and situational, not abstract.",
    ],
  };
}

/**
 * Generate a short classroom-appropriate scene premise from a target grammar
 * pattern and level. Server-only, uses the injectable-fake-client pattern
 * (deps.client defaults to a real OpenAI client), and returns a typed result
 * union mirroring generateCocoReply's error shape.
 */
export async function generateScenePremise(
  input: ScenePremiseInput,
  deps?: GenerateScenePremiseDeps,
): Promise<GenerateScenePremiseResult> {
  const validInput = scenePremiseInputSchema.safeParse(input);
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
          content: SCENE_PREMISE_SYSTEM_MESSAGE,
        },
        {
          role: "user",
          content: JSON.stringify(buildScenePremisePrompt(validInput.data)),
        },
      ],
      text: {
        format: zodTextFormat(generatedScenePremiseSchema, "scene_premise"),
      },
    });

    const parsed = parseGeneratedScenePremise(response.output_parsed);
    if (!parsed.ok) {
      return { ok: false, error: "schema_failed" };
    }

    return { ok: true, scenePremise: parsed.scenePremise.scenePremise };
  } catch {
    log("error", "ai.scene_premise_generation_failed", { error: "provider_error" });
    return { ok: false, error: "provider_error" };
  }
}
