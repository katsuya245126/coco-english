/**
 * Fire-and-forget OpenAI structured-output schema warm-up.
 *
 * OpenAI compiles each response schema into a grammar on first use and
 * caches it for a short TTL (community reports put it around ~2 minutes of
 * inactivity). Without a warm-up, a student's first submission on a mission
 * pays that compile cost on top of normal evaluation latency. Calling both
 * evaluators once with trivial input when the mission page loads absorbs
 * that cost before the student finishes recording.
 *
 * Never awaited by callers — errors are swallowed and logged, never thrown,
 * since a failed warm-up must not affect the page render or the real
 * evaluation path.
 */

import { evaluateOriginalTurn, evaluateRepeatTurn } from "@/server/ai/turn-evaluator";
import { log } from "@/server/logging/logger";
import type { MissionLevel } from "@/domain/mission/schemas";

export function warmEvaluators(level: MissionLevel): void {
  evaluateOriginalTurn({
    evaluationMode: "preset",
    targetPattern: "warmup",
    targetExample: "This is a warm-up.",
    level,
    transcript: "This is a warm-up.",
  }).catch(() => {
    log("warn", "ai.evaluator_warmup_failed", { evaluator: "original" });
  });

  evaluateRepeatTurn({
    improvedSentence: "This is a warm-up.",
    level,
    repeatTranscript: "This is a warm-up.",
  }).catch(() => {
    log("warn", "ai.evaluator_warmup_failed", { evaluator: "repeat" });
  });
}
