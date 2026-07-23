/**
 * Server-only turn evaluation adapter.
 *
 * Tests inject a fake Responses client so automated verification never calls
 * the paid OpenAI API.
 */

import OpenAI from "openai";
import type { HangulSpan } from "@/domain/audio/hangul-romanization";
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
  evaluationMode: "preset" | "conversation";
  missionQuestion?: string;
  targetPattern: string;
  targetExample: string | null;
  level: MissionLevel;
  turnOrder?: number;
  transcript: string;
  requireCompleteSentenceAnswers?: boolean;
  /**
   * Korean words the student code-switched, kept verbatim in `transcript`.
   * The evaluator classifies each as a proper noun to accept or ordinary
   * vocabulary to teach. Empty for an all-English answer.
   */
  koreanSpans?: HangulSpan[];
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

const presetInstructions = [
  "Mark as correct (outcome: 'correct') if the target pattern appears anywhere in the answer — extra words, greetings, or extensions are fine and should not cause needs_correction.",
  "The targetExample is only one possible answer, not required content. For an open-ended question, accept any relevant answer that fills the target grammatical frame; the student's nouns, verbs, or details may differ from the example.",
  "Example: for 'What are you going to do after school?' with target pattern 'I'm going to _____', 'I am going to play games' is correct even if the targetExample says 'I'm going to do my homework.' Never replace a correct slot answer merely because its slot content differs.",
  "Use needs_correction only when the target pattern is missing or the sentence is unclear, not when the student adds extra correct English.",
  "If the transcript only repeats or echoes the missionQuestion back instead of answering it, that is NOT correct — use needs_correction with the assigned targetExample as the improvedSentence. This applies only when the target pattern itself is absent; a correct answer that also asks a question back (e.g. 'I'm fine, and you?' when the target is 'I'm fine.') still contains the target and must be marked correct, not treated as an echo.",
  "A clear off-topic English answer, wrong answer, or answer to a different question is NOT teacher_review; use needs_correction and provide the assigned targetExample as the improvedSentence.",
  "Short target examples such as 'Wow!' are valid complete answers; if the transcript is clear English but does not say the short target, use needs_correction with that short targetExample.",
];

const conversationInstructions = [
  "This is free dynamic conversation. Judge whether the transcript is a relevant response to missionQuestion and is understandable, grammatically valid English.",
  "Accept relevant and grammatically valid English even when it does not use the targetPattern, uses different vocabulary, or disagrees with the question's premise.",
  "Example: for missionQuestion 'How often do you play soccer?', 'I don't play soccer.' is correct even though it does not answer with a frequency phrase.",
  "Use targetPattern only as soft lesson context. Never require the child to repeat Coco's question or copy the targetPattern as an answer.",
  "When the student's meaning is relevant but the English is incorrect, use needs_correction and write one natural improvedSentence; preserve the student's intended meaning.",
  "Never use the missionQuestion as improvedSentence. Never substitute an authored example or a question-shaped targetPattern unless it genuinely states the student's intended answer.",
  "Example: correct 'I no play soccer.' to 'I don't play soccer.'; do not correct it to 'How often do you play soccer?'.",
  "For an information question (who, what, when, where, why, or how), do not expand yes/no into an auxiliary yes/no sentence such as 'Yes, I do.' because it does not answer the question.",
];

const conversationGenuineAmbiguityInstructions = [
  "If the student's meaning cannot be inferred without inventing content, return teacher_review with reviewReason ambiguous; do not invent an answer.",
  "improvedSentence must be one single declarative student answer: never append missionQuestion or any other question to it, and never copy an example sentence from these instructions into it.",
];

const correctionSeverityInstructions = [
  "Always set correctionSeverity. Set it to 'none' when no correction is needed, 'minor' for an accepted local function-word recast, and 'material' when repetition is required.",
  "Set correctionNeeded to false only for correctionSeverity 'none'. Set correctionNeeded to true for 'minor' and 'material'.",
  "For 'minor' and 'material', set outcome to 'needs_correction' and provide one non-empty declarative improvedSentence. For 'none', set outcome to 'correct' and improvedSentence to null.",
];

const conversationSeverityInstructions = [
  "A correction is minor only when meaning is clear and relevant, content words and their word classes are intact, required clause and verb structure is intact, and only a local function-word detail changes.",
  "Example: transcript \"I'm going to library\" may be minor with improvedSentence \"I'm going to the library.\" and must not require repetition.",
  "A correction is material when required clause or verb structure is missing or incorrect, a word has the wrong class or semantic category, content must be invented or replaced, or a complete sentence is required but missing.",
  "Example: \"I want read cartoon\" is material with \"I want to read cartoons.\" because the infinitive structure is missing.",
  "Example: \"I will go to the exercise\" is material with \"I will exercise.\" because exercise is used as the wrong destination-noun category.",
  "Never classify by edit distance, character count, token count, or the short length of an inserted word.",
];

const presetSeverityInstructions = [
  "For preset output compatibility, report correctionSeverity 'none' for a correct answer and 'material' for an answer that uses the existing needs_correction path; this field does not change preset acceptance rules.",
];

function buildOriginalPrompt(input: EvaluateOriginalTurnInput) {
  const isConversationMode = input.evaluationMode === "conversation";
  const modeInstructions = isConversationMode
    ? conversationInstructions
    : presetInstructions;
  const requireCompleteSentenceAnswers =
    isConversationMode && input.requireCompleteSentenceAnswers !== false;
  const completeSentenceInstructions = isConversationMode
    ? requireCompleteSentenceAnswers
      ? [
          "When a relevant fragment has an understandable meaning, use needs_correction and write one short complete declarative improvedSentence in the student's own words.",
          "Example: missionQuestion 'Where do you like to play soccer?' plus transcript 'School.' becomes improvedSentence 'I like to play soccer at school.'; do not route that understandable fragment to teacher_review.",
        ]
      : [
          "When complete sentences are not required, accept a relevant understandable fragment even when it is not a complete sentence.",
        ]
    : [];

  // A Korean learner who names a local place or friend is answering the
  // question; one who says 축구 for "soccer" is reaching for vocabulary they
  // have not learned yet. Those need opposite responses, so the evaluator
  // classifies each span rather than blanket-accepting it. Spans arrive in
  // Hangul because the transcript stores what the child actually said (see
  // src/domain/audio/hangul-romanization.ts).
  const koreanSpans = input.koreanSpans ?? [];
  const koreanSpanInstructions =
    koreanSpans.length > 0
      ? [
          `The student spoke ${koreanSpans.length === 1 ? "one Korean word" : `${koreanSpans.length} Korean words`} inside an otherwise English answer: ${koreanSpans
            .map((span) => `"${span.hangul}" (romanized: ${span.romanized})`)
            .join(", ")}.`,
          "Classify each Korean word before judging the answer. Ask: does this word name one particular thing, or is it the ordinary word for a whole category?",
          "A word is a NAME only if it identifies one specific thing and an English speaker would use the Korean word for it too: a particular place (거제도, 부산, 한강), a particular person's name (민준), or a Korean dish English has no word for (김밥, 떡볶이).",
          "A place name keeps its Korean geographic ending — 도 (island), 강 (river), 산 (mountain), 시 (city). 제주도, 거제도, 한강 and 남산 are each one place name and are always NAME, never VOCABULARY. Do not split such a word into a name plus a common noun.",
          "A word that begins with a place name but ends in an ordinary institution word (서울초등학교 = Seoul + elementary school) still names one specific school the child attends. Treat it as a NAME.",
          "A word is VOCABULARY if it is the everyday word for a category of things, even when the category is a place, a building, or a kind of person. 초등학교 = elementary school, 선생님 = teacher, 학교 = school, 도서관 = library, 병원 = hospital, 축구 = soccer, 강아지 = puppy are all VOCABULARY: they name a kind of thing, not one particular thing, and each has a plain English word the student should learn.",
          "A title or role a child uses for someone (선생님 = teacher, 엄마 = mom) is VOCABULARY, not a personal name, unless it appears as part of a specific person's name.",
          "If every Korean word is a NAME, the student answered the question. Judge only the surrounding English grammar, and treat the Korean name as correct content. Never mark it a spelling error, a mistake, or non_english. If the surrounding grammar is correct, outcome is correct with improvedSentence null.",
          "If any Korean word is VOCABULARY, use needs_correction with correctionSeverity 'material'. Write improvedSentence as the student's own sentence with the English word substituted for the Korean one, so the student hears and repeats the word they were missing.",
          'Example: transcript "I like 축구 after school." becomes improvedSentence "I like soccer after school."',
          'Example: transcript "I\'m going to 거제도 this summer." is correct as-is, because 거제도 is a place name; improvedSentence is null.',
          "When a NAME appears in an improvedSentence you write for some other reason, keep the Korean word exactly as the student said it. Never swap in a different name.",
        ]
      : [];

  return {
    evaluationMode: input.evaluationMode,
    missionQuestion: input.missionQuestion ?? null,
    targetPattern: input.targetPattern,
    targetExample: input.targetExample,
    level: input.level,
    turnOrder: input.turnOrder ?? null,
    transcript: input.transcript,
    requireCompleteSentenceAnswers,
    koreanSpans,
    instructions: [
      "Evaluate only this transcript against the assigned ESL turn.",
      koreanSpans.length > 0
        ? // The transcript deliberately keeps the student's Korean words, so
          // the blanket non_english rule would discard a valid code-switched
          // answer. Only a wholly Korean answer is non_english.
          "Treat a transcript as non_english only when the whole answer is in another language. This answer has an English sentence frame with some Korean words inside it, so it is NOT non_english; classify those words as instructed below."
        : "Treat non-English transcripts as non_english and not successful practice.",
      "Common English phrasing variants (contractions like 'I am' vs 'I'm', minor word-order or article differences that preserve the same meaning) are equivalent and should not cause needs_correction.",
      ...koreanSpanInstructions,
      ...modeInstructions,
      ...completeSentenceInstructions,
      ...(isConversationMode ? conversationGenuineAmbiguityInstructions : []),
      ...correctionSeverityInstructions,
      ...(isConversationMode
        ? conversationSeverityInstructions
        : presetSeverityInstructions),
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
  const hasValidModeGrounding =
    input.evaluationMode === "conversation"
      ? input.targetExample === null &&
        (input.missionQuestion?.trim().length ?? 0) > 0
      : input.targetExample !== null && input.targetExample.trim().length > 0;

  return (
    missionLevelSchema.safeParse(input.level).success &&
    input.targetPattern.trim().length > 0 &&
    hasValidModeGrounding &&
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
