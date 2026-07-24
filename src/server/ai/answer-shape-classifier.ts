/**
 * Server-only save-time classifier: is each mission turn a fixed-answer turn
 * (a correct answer to match) or an open turn (opinion/preference/choice with
 * no wrong answer)? Decided once here so the evaluator never re-guesses it per
 * attempt. Fails safe to "open" — the lenient shape that never coerces a child.
 */
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { log } from "@/server/logging/logger";
import { answerShapeSchema, type AnswerShape } from "@/domain/mission/schemas";

const DEFAULT_MODEL = "gpt-4.1-mini";

const classificationSchema = z.object({
  shapes: z.array(answerShapeSchema),
});

export type AnswerShapeClient = {
  responses: {
    parse(input: {
      model: string;
      input: Array<{ role: "system" | "user"; content: string }>;
      text: { format: unknown };
    }): Promise<{ output_parsed?: unknown }>;
  };
};

export type ClassifyTurnsInput = {
  turns: Array<{ prompt: string; targetExample: string }>;
};

export type ClassifyTurnsDeps = {
  apiKey?: string;
  model?: string;
  client?: AnswerShapeClient;
};

function resolveApiKey(deps?: ClassifyTurnsDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: ClassifyTurnsDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_EVALUATION_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

function allOpen(count: number): AnswerShape[] {
  return Array.from({ length: count }, () => "open" as const);
}

export async function classifyTurnAnswerShapes(
  input: ClassifyTurnsInput,
  deps?: ClassifyTurnsDeps,
): Promise<AnswerShape[]> {
  const count = input.turns.length;
  if (count === 0) return [];

  const apiKey = resolveApiKey(deps);
  if (!apiKey) return allOpen(count);

  try {
    const client =
      deps?.client ?? (new OpenAI({ apiKey }) as AnswerShapeClient);
    const prompt = {
      instructions: [
        "Classify each ESL mission turn as 'fixed' or 'open'.",
        "'fixed' = the question has a single correct answer being drilled (e.g. 'How do you say hello?', 'What is the past tense of go?').",
        "'open' = there is no wrong answer: opinion, preference, favourite, feelings, personal facts, or a choice among options the question itself offers (e.g. 'Which ice cream is best: vanilla, strawberry, or chocolate?').",
        "The targetExample is only ONE possible answer; a different valid choice must still be 'open'.",
        "When unsure, choose 'open'.",
        "Return shapes in the same order as turns, one per turn.",
      ],
      turns: input.turns.map((t, i) => ({
        index: i,
        question: t.prompt,
        targetExample: t.targetExample,
      })),
    };
    const response = await client.responses.parse({
      model: resolveModel(deps),
      input: [
        {
          role: "system",
          content:
            "Classify children's ESL mission turns. Return only data matching the schema.",
        },
        { role: "user", content: JSON.stringify(prompt) },
      ],
      text: {
        format: zodTextFormat(classificationSchema, "answer_shape_classification"),
      },
    });
    const parsed = classificationSchema.safeParse(response.output_parsed);
    if (!parsed.success || parsed.data.shapes.length !== count) {
      return allOpen(count);
    }
    return parsed.data.shapes;
  } catch {
    log("error", "ai.answer_shape_classification_failed", { turnCount: count });
    return allOpen(count);
  }
}
