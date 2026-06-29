/**
 * Server-only turn evaluation adapter.
 *
 * Tests inject a fake Responses client so automated verification never calls
 * the paid OpenAI API.
 */

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  originalTurnEvaluationSchema,
  repeatTurnEvaluationSchema,
  type OriginalTurnEvaluation,
  type RepeatTurnEvaluation,
} from "@/domain/ai/turn-evaluation";
import { missionLevelSchema, type MissionLevel } from "@/domain/mission/schemas";

const DEFAULT_EVALUATION_MODEL = "gpt-4.1-mini";

export type TurnEvaluationError =
  | "missing_api_key"
  | "provider_failed"
  | "schema_failed";

export type OriginalTurnEvaluationResult =
  | { ok: true; evaluation: OriginalTurnEvaluation }
  | { ok: false; error: TurnEvaluationError };

export type RepeatTurnEvaluationResult =
  | { ok: true; evaluation: RepeatTurnEvaluation }
  | { ok: false; error: TurnEvaluationError };

export type TurnEvaluationResponsesClient = {
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

export type EvaluateOriginalTurnInput = {
  missionQuestion?: string;
  targetPattern: string;
  targetExample: string;
  level: MissionLevel;
  turnOrder?: number;
  transcript: string;
};

export type EvaluateRepeatTurnInput = {
  expectedSentence: string;
  level: MissionLevel;
  transcript: string;
};

export type TurnEvaluatorDeps = {
  apiKey?: string;
  model?: string;
  client?: TurnEvaluationResponsesClient;
};

function resolveApiKey(deps?: TurnEvaluatorDeps) {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function resolveModel(deps?: TurnEvaluatorDeps) {
  return (
    deps?.model?.trim() ||
    process.env.OPENAI_EVALUATION_MODEL?.trim() ||
    DEFAULT_EVALUATION_MODEL
  );
}

function createClient(apiKey: string): TurnEvaluationResponsesClient {
  return new OpenAI({ apiKey }) as TurnEvaluationResponsesClient;
}

function buildOriginalPrompt(input: EvaluateOriginalTurnInput) {
  return {
    missionQuestion: input.missionQuestion ?? null,
    targetPattern: input.targetPattern,
    targetExample: input.targetExample,
    level: input.level,
    turnOrder: input.turnOrder ?? null,
    transcript: input.transcript,
    instructions: [
      "Evaluate only this transcript against the assigned ESL turn.",
      "Treat non-English transcripts as non_english and not successful practice.",
      "Use needs_correction only when an understandable English answer needs a clearer target-form sentence.",
      "Use teacher_review for ambiguity, low confidence, or unsafe uncertainty.",
      "Do not include student names, PINs, audio keys, or private class data.",
    ],
  };
}

function buildRepeatPrompt(input: EvaluateRepeatTurnInput) {
  return {
    expectedSentence: input.expectedSentence,
    level: input.level,
    transcript: input.transcript,
    instructions: [
      "Evaluate whether the repeat is close enough for an elementary ESL learner.",
      "Use teacher_review for ambiguity, low confidence, or unsafe uncertainty.",
      "Do not score pronunciation numerically.",
    ],
  };
}

function validOriginalInput(input: EvaluateOriginalTurnInput) {
  return (
    missionLevelSchema.safeParse(input.level).success &&
    input.targetPattern.trim().length > 0 &&
    input.targetExample.trim().length > 0 &&
    input.transcript.trim().length > 0
  );
}

function validRepeatInput(input: EvaluateRepeatTurnInput) {
  return (
    missionLevelSchema.safeParse(input.level).success &&
    input.expectedSentence.trim().length > 0 &&
    input.transcript.trim().length > 0
  );
}

export async function evaluateOriginalTurn(
  input: EvaluateOriginalTurnInput,
  deps?: TurnEvaluatorDeps,
): Promise<OriginalTurnEvaluationResult> {
  if (!validOriginalInput(input)) {
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
            "Evaluate a child's guided ESL original answer. Return only data matching the schema.",
        },
        {
          role: "user",
          content: JSON.stringify(buildOriginalPrompt(input)),
        },
      ],
      text: {
        format: zodTextFormat(
          originalTurnEvaluationSchema,
          "original_turn_evaluation",
        ),
      },
    });
    const parsed = originalTurnEvaluationSchema.safeParse(response.output_parsed);

    if (!parsed.success) {
      return { ok: false, error: "schema_failed" };
    }

    return { ok: true, evaluation: parsed.data };
  } catch {
    return { ok: false, error: "provider_failed" };
  }
}

export async function evaluateRepeatTurn(
  input: EvaluateRepeatTurnInput,
  deps?: TurnEvaluatorDeps,
): Promise<RepeatTurnEvaluationResult> {
  if (!validRepeatInput(input)) {
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
            "Evaluate a child's guided ESL repeat attempt. Return only data matching the schema.",
        },
        {
          role: "user",
          content: JSON.stringify(buildRepeatPrompt(input)),
        },
      ],
      text: {
        format: zodTextFormat(
          repeatTurnEvaluationSchema,
          "repeat_turn_evaluation",
        ),
      },
    });
    const parsed = repeatTurnEvaluationSchema.safeParse(response.output_parsed);

    if (!parsed.success) {
      return { ok: false, error: "schema_failed" };
    }

    return { ok: true, evaluation: parsed.data };
  } catch {
    return { ok: false, error: "provider_failed" };
  }
}
