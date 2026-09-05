/**
 * Server-only save-time classifier: is each mission turn a fixed-answer turn
 * (a correct answer to match) or an open turn (opinion/preference/choice with
 * no wrong answer)? Decided once here so the evaluator never re-guesses it per
 * attempt. Fails safe to "open" — the lenient shape that never coerces a child.
 */
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import {
  hasApiKey,
  structuredOutputCall,
  type StructuredOutputClient,
  type StructuredOutputDeps,
} from "@/server/ai/structured-output";
import { log } from "@/server/logging/logger";
import { answerShapeSchema, type AnswerShape } from "@/domain/mission/schemas";

const DEFAULT_MODEL = "gpt-4.1-mini";

const classificationSchema = z.object({
  shapes: z.array(answerShapeSchema),
});

export type AnswerShapeClient = StructuredOutputClient;

export type ClassifyTurnsInput = {
  turns: Array<{ prompt: string; targetExample: string }>;
};

export type ClassifyTurnsDeps = StructuredOutputDeps;

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

  if (!hasApiKey(deps)) return allOpen(count);

  try {
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
    const result = await structuredOutputCall({
      deps,
      model: resolveModel(deps),
      systemMessage:
        "Classify children's ESL mission turns. Return only data matching the schema.",
      userContent: JSON.stringify(prompt),
      format: zodTextFormat(classificationSchema, "answer_shape_classification"),
    });
    if (!result.ok) {
      if (result.error === "provider_failed") {
        log("error", "ai.answer_shape_classification_failed", { turnCount: count });
      }
      return allOpen(count);
    }
    const parsed = classificationSchema.safeParse(result.outputParsed);
    if (!parsed.success || parsed.data.shapes.length !== count) {
      return allOpen(count);
    }
    return parsed.data.shapes;
  } catch {
    log("error", "ai.answer_shape_classification_failed", { turnCount: count });
    return allOpen(count);
  }
}
