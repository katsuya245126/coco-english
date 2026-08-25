import { describe, expect, it, vi } from "vitest";
import type { StoredConversationRecoveryState } from "@/domain/ai/stored-evaluation";
import type { GenerateCocoReplyResult } from "@/server/ai/conversation-generator";
import {
  orchestrateConversationTurn,
  type ConversationOrchestratorPorts,
  type ConversationOrchestratorInput,
} from "@/server/student-access/conversation-orchestrator";

const evaluation = {
  kind: "original" as const,
  version: "ai-eval-v1" as const,
  outcome: "accepted_original" as const,
  confidence: "high" as const,
  reviewReason: null,
  meaningUnderstood: true,
  targetPatternAttempted: true,
  englishLanguage: "english" as const,
  correctionNeeded: false,
  correctionSeverity: "none" as const,
  correctionReason: "none" as const,
  improvedSentence: null,
  requireRepeat: false,
  policyVersion: "natural-conversation-v1" as const,
  evaluationModel: "test-evaluator",
  evaluationSource: "model" as const,
  transcriptionModel: "test-transcriber",
  transcriptionConfidence: null,
  runtimeVersion: "test-runtime",
  hangulInterpretations: [],
};

const baseInput: ConversationOrchestratorInput = {
  conversationMode: true,
  turnOrder: 1,
  requiredTurns: 3,
  targetPattern: "How often do you _____?",
  title: "Soccer chat",
  characterId: "default-buddy",
  openerLine: "How often do you play soccer?",
  missionQuestion: "How often do you play soccer?",
  transcript: "I play soccer every day.",
  priorTurns: [],
  evaluation,
  recoveryState: { kind: "none" },
  lowConfidenceGateRetryApplied: false,
};

function generated(line: string): GenerateCocoReplyResult {
  return {
    ok: true,
    reply: { reaction: null, focus: null, question: null, line },
  };
}

function ports(
  generate: ConversationOrchestratorPorts["generateCocoReply"],
  isContentSafe: ConversationOrchestratorPorts["isContentSafe"],
  overrides: Partial<
    Pick<ConversationOrchestratorPorts, "persistCocoLine" | "warmCocoLine">
  > = {},
): ConversationOrchestratorPorts {
  return {
    generateCocoReply: generate,
    isContentSafe,
    persistCocoLine:
      overrides.persistCocoLine ??
      vi.fn(async () => ({ ok: true as const })),
    warmCocoLine:
      overrides.warmCocoLine ?? vi.fn(async () => undefined),
  };
}

describe("conversation turn orchestrator", () => {
  it("returns persistence and TTS intent after provider sequencing", async () => {
    const generate = vi.fn(async () => generated("That sounds fun!"));
    const moderate = vi.fn(async () => ({ safe: true as const, failedOpen: false as const }));

    const result = await orchestrateConversationTurn(
      baseInput,
      ports(generate, moderate),
    );

    expect(result).toMatchObject({
      kind: "reply",
      cocoLine: "That sounds fun!",
      persistence: {
        kind: "record_coco_line",
        cocoLine: "That sounds fun!",
      },
      tts: {
        characterId: "default-buddy",
        text: "That sounds fun!",
      },
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(moderate).toHaveBeenCalledWith("I play soccer every day.");
    expect(moderate).toHaveBeenCalledWith("That sounds fun!");
  });

  it("uses the typed recovery state for the free first retry without provider work", async () => {
    const generate = vi.fn();
    const moderate = vi.fn();
    const recoveryState: StoredConversationRecoveryState = {
      kind: "ambiguity",
      attempt: 1,
    };

    const result = await orchestrateConversationTurn(
      { ...baseInput, recoveryState },
      ports(generate, moderate),
    );

    expect(result).toMatchObject({
      kind: "reply",
      cocoLine: "Hmm... can you say it again?",
      persistence: { kind: "record_coco_line" },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
  });

  it("keeps preset missions outside conversation provider sequencing", async () => {
    const generate = vi.fn();
    const moderate = vi.fn();

    const result = await orchestrateConversationTurn(
      { ...baseInput, conversationMode: false },
      ports(generate, moderate),
    );

    expect(result).toMatchObject({
      kind: "skip",
      cocoLine: null,
      persistence: null,
      tts: null,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
  });

  it("retries an explicitly unsafe Coco line and returns the moderation event", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(generated("unsafe candidate"))
      .mockResolvedValueOnce(generated("safe candidate"));
    const moderate = vi
      .fn()
      .mockResolvedValueOnce({ safe: true as const, failedOpen: false as const })
      .mockResolvedValueOnce({ safe: false as const, failedOpen: false as const })
      .mockResolvedValueOnce({ safe: true as const, failedOpen: false as const });

    const result = await orchestrateConversationTurn(
      baseInput,
      ports(generate, moderate),
    );

    expect(result).toMatchObject({
      kind: "reply",
      cocoLine: "safe candidate",
      moderationEvent: { kind: "retried" },
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].safetyMode).toBe("retry");
  });

  it("acknowledges a review-pending continuation without warming Coco TTS", async () => {
    const generate = vi.fn(async () => generated("What do you do after school?"));
    const moderate = vi.fn(async () => ({
      safe: true as const,
      failedOpen: false as const,
    }));

    const result = await orchestrateConversationTurn(
      {
        ...baseInput,
        evaluation: {
          ...evaluation,
          outcome: "teacher_review",
          reviewReason: "ambiguous",
        },
      },
      ports(generate, moderate),
    );

    expect(result).toMatchObject({
      kind: "reply",
      cocoLine: "Okay! No worries! What do you do after school?",
      tts: null,
    });
  });

  it("skips prompt-echo recovery after the typed classifier has resolved it", async () => {
    const generate = vi.fn();
    const moderate = vi.fn();

    const result = await orchestrateConversationTurn(
      { ...baseInput, recoveryState: { kind: "prompt_echo" } },
      ports(generate, moderate),
    );

    expect(result.kind).toBe("skip");
    expect(generate).not.toHaveBeenCalled();
    expect(moderate).not.toHaveBeenCalled();
  });

  it("persists before TTS, blocks TTS on persistence failure, and tolerates TTS failure", async () => {
    const generate = vi.fn(async () => generated("That sounds fun!"));
    const moderate = vi.fn(async () => ({
      safe: true as const,
      failedOpen: false as const,
    }));
    const events: string[] = [];
    const persist = vi.fn(async () => {
      events.push("persist");
      return { ok: true as const };
    });
    const warm = vi.fn(async () => {
      events.push("tts");
    });

    const successful = await orchestrateConversationTurn(
      baseInput,
      ports(generate, moderate, {
        persistCocoLine: persist,
        warmCocoLine: warm,
      }),
    );
    expect(successful.kind).toBe("reply");
    expect(events).toEqual(["persist", "tts"]);

    const failedPersistence = vi.fn(async () => ({
      ok: false as const,
      error: "db_error" as const,
    }));
    const blockedTts = vi.fn(async () => undefined);
    const failed = await orchestrateConversationTurn(
      baseInput,
      ports(generate, moderate, {
        persistCocoLine: failedPersistence,
        warmCocoLine: blockedTts,
      }),
    );
    expect(failed).toMatchObject({
      kind: "error",
      error: "persistence_failed",
      persistenceError: "db_error",
    });
    expect(blockedTts).not.toHaveBeenCalled();

    const rejectingTts = vi.fn(async () => {
      throw new Error("tts unavailable");
    });
    const nonFatal = await orchestrateConversationTurn(
      baseInput,
      ports(generate, moderate, { warmCocoLine: rejectingTts }),
    );
    expect(nonFatal.kind).toBe("reply");
    expect(rejectingTts).toHaveBeenCalledOnce();
  });
});
