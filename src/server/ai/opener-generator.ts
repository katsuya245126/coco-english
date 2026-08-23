import { zodTextFormat } from "openai/helpers/zod";
import {
  structuredOutputCall,
  type StructuredOutputClient,
  type StructuredOutputDeps,
} from "@/server/ai/structured-output";
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
  "missing_api_key" | "provider_failed" | "schema_failed";

export type GenerateOpenerResult =
  | { ok: true; opener: GeneratedCocoOpener["opener"] }
  | { ok: false; error: GenerateOpenerError };

/** Shared wire shape since the structured-output seam (issue #69). */
export type OpenerResponsesClient = StructuredOutputClient;

export type GenerateOpenerDeps = StructuredOutputDeps;

function resolveModel(deps?: GenerateOpenerDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_OPENER_MODEL?.trim() ||
    DEFAULT_OPENER_MODEL
  );
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
    targetPattern: input.targetPattern,
    instructions: [
      "Ground Coco's opening in this target pattern.",
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

  const result = await structuredOutputCall({
    deps,
    model: resolveModel(deps),
    systemMessage: OPENER_SYSTEM_MESSAGE,
    userContent: JSON.stringify(buildOpenerPrompt(validInput.data)),
    format: zodTextFormat(generatedCocoOpenerSchema, "coco_opener"),
  });
  if (!result.ok) {
    if (result.error === "provider_failed") {
      log("error", "ai.coco_opener_generation_failed", {
        error: "provider_failed",
      });
    }
    return { ok: false, error: result.error };
  }

  const parsed = parseGeneratedCocoOpener(result.outputParsed);
  if (!parsed.ok) {
    return { ok: false, error: "schema_failed" };
  }

  return { ok: true, opener: parsed.opener.opener };
}
