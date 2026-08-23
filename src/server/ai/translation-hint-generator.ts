import { zodTextFormat } from "openai/helpers/zod";
import {
  hasApiKey,
  structuredOutputCall,
  type StructuredOutputClient,
  type StructuredOutputDeps,
} from "@/server/ai/structured-output";
import {
  parseTranslationHint,
  translationHintModelSchema,
  type TranslationHint,
} from "@/domain/ai/translation-hint";
import {
  missionLevelSchema,
  type MissionLevel,
} from "@/domain/mission/schemas";
import { log } from "@/server/logging/logger";

const DEFAULT_TRANSLATION_HINT_MODEL = "gpt-4.1-mini";

/** Shared wire shape since the structured-output seam (issue #69). */
export type TranslationHintResponsesClient = StructuredOutputClient;

export type GenerateTranslationHintInput = {
  sourceText: string;
  studentLevel: MissionLevel;
  targetLocale: string;
};

export type GenerateTranslationHintDeps = StructuredOutputDeps;

export type GenerateTranslationHintResult =
  | { ok: true; hint: TranslationHint }
  | {
      ok: false;
      error: "missing_api_key" | "provider_failed" | "schema_failed";
    };

function resolveModel(deps?: GenerateTranslationHintDeps): string {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_TRANSLATION_HINT_MODEL?.trim() ||
    DEFAULT_TRANSLATION_HINT_MODEL
  );
}

export async function generateTranslationHint(
  input: GenerateTranslationHintInput,
  deps?: GenerateTranslationHintDeps,
): Promise<GenerateTranslationHintResult> {
  if (
    !input.sourceText ||
    !missionLevelSchema.safeParse(input.studentLevel).success ||
    !input.targetLocale.trim()
  ) {
    return { ok: false, error: "schema_failed" };
  }

  if (!hasApiKey(deps)) return { ok: false, error: "missing_api_key" };

  const model = resolveModel(deps);
  const result = await structuredOutputCall({
    deps,
    model,
    systemMessage:
      "Translate Coco's English line into Korean phrase hints for a young ESL learner. Return only data matching the schema.",
    userContent: JSON.stringify({
      sourceText: input.sourceText,
      studentLevel: input.studentLevel,
      targetLocale: input.targetLocale,
      instructions: [
        "Cover the full sourceText with useful Korean meaning chunks in source order.",
        "Use natural meaning chunks, usually phrases or clauses, not word-by-word translations.",
        "For normal sentences longer than six words, prefer 2 to 4 chunks per sentence.",
        "Do not select a complete sentence as one phrase when that sentence has more than six words.",
        "For a line with a reaction and a question, include coverage for the question because it is the part the student must answer.",
        "Each phrase's source must be an exact substring copied verbatim from sourceText.",
        "Avoid selecting whitespace-only or punctuation-only spans.",
        "Do not translate word by word; translate each chunk's contextual meaning into targetLocale.",
        "Keep chunks short enough to fit inline, usually one clause or one natural phrase.",
      ],
    }),
    format: zodTextFormat(translationHintModelSchema, "translation_hint"),
  });
  if (!result.ok) {
    if (result.error === "provider_failed") {
      log("error", "ai.translation_hint_generation_failed", {
        provider: "openai",
        model,
        error: "provider_failed",
      });
    }
    return { ok: false, error: result.error };
  }

  return parseTranslationHint(input.sourceText, result.outputParsed);
}
