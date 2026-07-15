/**
 * Server-only turn evaluation adapter.
 *
 * Tests inject a fake Responses client so automated verification never calls
 * the paid OpenAI API.
 */

import OpenAI from "openai";
import { log } from "@/server/logging/logger";
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
  targetExample: string | null;
  level: MissionLevel;
  turnOrder?: number;
  transcript: string;
};

export type EvaluateRepeatTurnInput = {
  originalTranscript?: string;
  improvedSentence?: string;
  targetPattern?: string;
  level: MissionLevel;
  repeatTranscript?: string;
  expectedSentence?: string;
  transcript?: string;
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
  const targetExampleInstructions =
    input.targetExample === null
      ? [
          "This is a dynamic chat turn with no authored target example. Ground relevance and correction on the real missionQuestion plus targetPattern.",
          "If correction is needed, produce a concrete improvedSentence that answers the missionQuestion while using the targetPattern; do not invent or refer to a target example.",
          "Use needs_correction only when the target pattern is missing or the sentence is unclear, not when the student adds extra correct English.",
        ]
      : [
          "The targetExample is only one possible answer, not required content. For an open-ended question, accept any relevant answer that fills the target grammatical frame; the student's nouns, verbs, or details may differ from the example.",
          "Example: for 'What are you going to do after school?' with target pattern 'I'm going to _____', 'I am going to play games' is correct even if the targetExample says 'I'm going to do my homework.' Never replace a correct slot answer merely because its slot content differs.",
          "Use needs_correction only when the target pattern is missing or the sentence is unclear, not when the student adds extra correct English.",
          "If the transcript only repeats or echoes the missionQuestion back instead of answering it, that is NOT correct — use needs_correction with the assigned targetExample as the improvedSentence. This applies only when the target pattern itself is absent; a correct answer that also asks a question back (e.g. 'I'm fine, and you?' when the target is 'I'm fine.') still contains the target and must be marked correct, not treated as an echo.",
          "A clear off-topic English answer, wrong answer, or answer to a different question is NOT teacher_review; use needs_correction and provide the assigned targetExample as the improvedSentence.",
          "Short target examples such as 'Wow!' are valid complete answers; if the transcript is clear English but does not say the short target, use needs_correction with that short targetExample.",
        ];

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
      "Mark as correct (outcome: 'correct') if the target pattern appears anywhere in the answer — extra words, greetings, or extensions are fine and should not cause needs_correction.",
      "Common English phrasing variants (contractions like 'I am' vs 'I'm', minor word-order or article differences that preserve the same meaning) are equivalent and should not cause needs_correction.",
      ...targetExampleInstructions,
      "Use teacher_review for ambiguity, low confidence, or unsafe uncertainty.",
      "Do not include student names, PINs, audio keys, or private class data.",
    ],
  };
}

function buildRepeatPrompt(input: EvaluateRepeatTurnInput) {
  const improvedSentence = input.improvedSentence ?? input.expectedSentence ?? "";
  const repeatTranscript = input.repeatTranscript ?? input.transcript ?? "";

  return {
    originalTranscript: input.originalTranscript ?? null,
    improvedSentence,
    targetPattern: input.targetPattern ?? null,
    level: input.level,
    repeatTranscript,
    instructions: [
      "Evaluate whether the repeat is close enough for an elementary ESL learner.",
      "Compare the repeat transcript to the improved sentence, not to the child's original answer.",
      "Use teacher_review for ambiguity, low confidence, or unsafe uncertainty.",
      "Do not score pronunciation numerically.",
    ],
  };
}

function validOriginalInput(input: EvaluateOriginalTurnInput) {
  const hasValidTargetExample =
    input.targetExample === null
      ? (input.missionQuestion?.trim().length ?? 0) > 0
      : input.targetExample.trim().length > 0;

  return (
    missionLevelSchema.safeParse(input.level).success &&
    input.targetPattern.trim().length > 0 &&
    hasValidTargetExample &&
    input.transcript.trim().length > 0
  );
}

function validRepeatInput(input: EvaluateRepeatTurnInput) {
  const improvedSentence = input.improvedSentence ?? input.expectedSentence ?? "";
  const repeatTranscript = input.repeatTranscript ?? input.transcript ?? "";

  return (
    missionLevelSchema.safeParse(input.level).success &&
    improvedSentence.trim().length > 0 &&
    repeatTranscript.trim().length > 0
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
    log("error", "ai.evaluation_failed", { turnKind: "original", error: "provider_failed" });
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
    log("error", "ai.evaluation_failed", { turnKind: "repeat", error: "provider_failed" });
    return { ok: false, error: "provider_failed" };
  }
}
