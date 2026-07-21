import { isMinimalEffortAnswer } from "@/domain/ai/minimal-effort-detection";

export type MinimalEffortKind = "dont_know" | "short_answer";

const DONT_KNOW_ANSWERS = new Set([
  "i don't know",
  "i dont know",
  "i dunno",
  "dunno",
  "idk",
  "don't know",
  "dont know",
]);

function normalizeAnswer(answer: string) {
  return answer
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’‘]/gu, "'")
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ");
}

export function classifyMinimalEffortFeedback(
  answer: string,
): MinimalEffortKind | null {
  if (!isMinimalEffortAnswer(answer)) return null;

  return DONT_KNOW_ANSWERS.has(normalizeAnswer(answer))
    ? "dont_know"
    : "short_answer";
}

function usableTargetExample(targetExample: string | null | undefined) {
  if (!targetExample) return false;
  const normalized = targetExample.trim();
  return (
    normalized.length > 0 &&
    !normalized.endsWith("?") &&
    !isMinimalEffortAnswer(normalized)
  );
}

function resolveHowOftenExample(question: string) {
  const match = question.trim().match(/^how often do you\s+(.+?)\??$/iu);
  const rawPredicate = match?.[1]?.trim().replace(/[.!?]+$/u, "");
  if (!rawPredicate || /\byou\b/iu.test(rawPredicate) || /^and\b/iu.test(rawPredicate)) {
    return null;
  }
  const predicate = rawPredicate
    .replace(/[.!?]+$/u, "")
    .replace(/\byourself\b/giu, "myself")
    .replace(/\byours\b/giu, "mine")
    .replace(/\byour\b/giu, "my");
  return `I ${predicate} sometimes.`;
}

export function resolveMinimalEffortRetryExample(input: {
  evaluationMode: "preset" | "conversation";
  missionQuestion: string;
  targetExample?: string | null;
}) {
  if (
    input.evaluationMode === "preset" &&
    usableTargetExample(input.targetExample)
  ) {
    return input.targetExample!.trim();
  }

  if (input.evaluationMode === "conversation") {
    return resolveHowOftenExample(input.missionQuestion);
  }

  return null;
}
