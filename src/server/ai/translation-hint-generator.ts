import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
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

export type TranslationHintResponsesClient = {
  responses: {
    parse(input: {
      model: string;
      input: Array<{
        role: "system" | "user";
        content: string;
      }>;
      text: { format: unknown };
    }): Promise<{ output_parsed?: unknown }>;
  };
};

export type GenerateTranslationHintInput = {
  sourceText: string;
  studentLevel: MissionLevel;
  targetLocale: string;
};

export type GenerateTranslationHintDeps = {
  apiKey?: string;
  model?: string;
  client?: TranslationHintResponsesClient;
};

export type GenerateTranslationHintResult =
  | { ok: true; hint: TranslationHint }
  | {
      ok: false;
      error: "missing_api_key" | "provider_failed" | "schema_failed";
    };

function resolveApiKey(deps?: GenerateTranslationHintDeps): string {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: GenerateTranslationHintDeps): string {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_TRANSLATION_HINT_MODEL?.trim() ||
    DEFAULT_TRANSLATION_HINT_MODEL
  );
}

function createClient(apiKey: string): TranslationHintResponsesClient {
  return new OpenAI({ apiKey }) as TranslationHintResponsesClient;
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

  const apiKey = resolveApiKey(deps);
  if (!apiKey) return { ok: false, error: "missing_api_key" };

  const model = resolveModel(deps);
  try {
    const client = deps?.client ?? createClient(apiKey);
    const response = await client.responses.parse({
      model,
      input: [
        {
          role: "system",
          content:
            "Select and translate useful phrases for a young ESL learner. Return only data matching the schema.",
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceText: input.sourceText,
            studentLevel: input.studentLevel,
            targetLocale: input.targetLocale,
            instructions: [
              "Return zero to three useful semantic meaning units in source order.",
              "When the sentence has enough useful language, prefer two or three shorter chunks instead of one large chunk.",
              "Keep each selected chunk short, usually two to four words.",
              "Prefer contextual chunks, idioms, and level-appropriate difficult phrases.",
              "Do not select isolated function words such as do, the, or you.",
              "Do not cover every word or turn the complete sentence into clickable pieces.",
              "Never select one span that covers the whole sentence or the whole sentence except terminal punctuation.",
              "Each phrase's source must be an exact substring copied verbatim from sourceText.",
              "Translate only that phrase's contextual meaning into targetLocale.",
            ],
          }),
        },
      ],
      text: {
        format: zodTextFormat(translationHintModelSchema, "translation_hint"),
      },
    });

    return parseTranslationHint(input.sourceText, response.output_parsed);
  } catch {
    log("error", "ai.translation_hint_generation_failed", {
      provider: "openai",
      model,
      error: "provider_failed",
    });
    return { ok: false, error: "provider_failed" };
  }
}
