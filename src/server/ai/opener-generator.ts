import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  generatedCocoOpenerSchema,
  openerGenerationInputSchema,
  parseGeneratedCocoOpener,
  type GeneratedCocoOpener,
  type OpenerGenerationInput,
} from "@/domain/ai/opener-generation";
import { log } from "@/server/logging/logger";

const DEFAULT_OPENER_MODEL = "gpt-4.1-mini";

export type GenerateOpenerError =
  | "missing_api_key"
  | "provider_error"
  | "schema_failed";

export type GenerateOpenerResult =
  | { ok: true; opener: GeneratedCocoOpener["opener"] }
  | { ok: false; error: GenerateOpenerError };

export type OpenerResponsesClient = {
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

export type GenerateOpenerDeps = {
  apiKey?: string;
  model?: string;
  client?: OpenerResponsesClient;
};

function resolveApiKey(deps?: GenerateOpenerDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: GenerateOpenerDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_OPENER_MODEL?.trim() ||
    DEFAULT_OPENER_MODEL
  );
}

function createClient(apiKey: string): OpenerResponsesClient {
  return new OpenAI({ apiKey }) as OpenerResponsesClient;
}

const OPENER_SYSTEM_MESSAGE = [
  "Write one short, friendly, classroom-safe opening line for Coco, an elementary ESL classmate.",
  "Coco must share first by modeling useful English tied to the target pattern, then give the child one natural thing to answer.",
  "Keep it to one or two short sentences and at most 280 characters.",
  "Do not include student names, PINs, audio keys, or other private class data.",
  "Return only data matching the schema.",
].join(" ");

function buildOpenerPrompt(input: OpenerGenerationInput) {
  return {
    scenePremise: input.scenePremise,
    targetPattern: input.targetPattern,
    instructions: [
      "Ground Coco's opening in this scene and target pattern.",
      "Coco shares before asking the child a single natural response question.",
    ],
  };
}

export async function generateOpener(
  input: OpenerGenerationInput,
  deps?: GenerateOpenerDeps,
): Promise<GenerateOpenerResult> {
  const validInput = openerGenerationInputSchema.safeParse(input);
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
        { role: "system", content: OPENER_SYSTEM_MESSAGE },
        {
          role: "user",
          content: JSON.stringify(buildOpenerPrompt(validInput.data)),
        },
      ],
      text: {
        format: zodTextFormat(generatedCocoOpenerSchema, "coco_opener"),
      },
    });
    const parsed = parseGeneratedCocoOpener(response.output_parsed);
    if (!parsed.ok) {
      return { ok: false, error: "schema_failed" };
    }

    return { ok: true, opener: parsed.opener.opener };
  } catch {
    log("error", "ai.coco_opener_generation_failed", { error: "provider_error" });
    return { ok: false, error: "provider_error" };
  }
}
