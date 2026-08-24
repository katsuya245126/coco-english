import { describe, expect, it } from "vitest";

import {
  classifyStoredConversationRecovery,
  isStoredTeacherReview,
  parseStoredEvaluation,
  storedOriginalMetadataOf,
  storedTurnWasUnderstood,
} from "./stored-evaluation";

const legacyOriginal = {
  version: "ai-eval-v1",
  outcome: "needs_correction",
  correctionSeverity: "material",
  improvedSentence: "I like games.",
  hangulInterpretations: [],
};

const legacyRepeat = {
  version: "ai-eval-v1",
  outcome: "repeat_accepted",
  repeatCloseEnough: true,
  repeatAccepted: true,
  hangulInterpretations: [],
};

describe("parseStoredEvaluation", () => {
  it("classifies a freshly stamped original record by its kind", () => {
    const parsed = parseStoredEvaluation({
      ...legacyOriginal,
      kind: "original",
    });
    expect(parsed).toMatchObject({ ok: true, kind: "original" });
    if (parsed.ok && parsed.kind === "original") {
      expect(parsed.evaluation.outcome).toBe("needs_correction");
    }
  });

  it("classifies a freshly stamped repeat record by its kind", () => {
    const parsed = parseStoredEvaluation({ ...legacyRepeat, kind: "repeat" });
    expect(parsed).toMatchObject({ ok: true, kind: "repeat" });
  });

  it("falls back to the legacy field rule for originals written before the discriminant", () => {
    expect(parseStoredEvaluation(legacyOriginal)).toMatchObject({
      ok: true,
      kind: "original",
    });
  });

  it("falls back to the legacy field rule for repeats written before the discriminant", () => {
    expect(parseStoredEvaluation(legacyRepeat)).toMatchObject({
      ok: true,
      kind: "repeat",
    });
  });

  it("leaves a bare outcome-and-reason record unrecognized", () => {
    expect(
      parseStoredEvaluation({
        outcome: "teacher_review",
        reviewReason: "low_confidence",
      }),
    ).toEqual({
      ok: false,
      reason: "unrecognized",
    });
  });

  it("reports the jsonb column default as unrecognized instead of guessing a kind", () => {
    expect(parseStoredEvaluation({})).toEqual({
      ok: false,
      reason: "unrecognized",
    });
  });

  it("reports an object with no known fields as unrecognized", () => {
    expect(parseStoredEvaluation({ somethingElse: true })).toEqual({
      ok: false,
      reason: "unrecognized",
    });
  });

  it("reports Phase-4 placeholder evaluations as unrecognized — they are neither original nor repeat evidence", () => {
    expect(
      parseStoredEvaluation({
        version: "placeholder-v1",
        meaningUnderstood: true,
        targetPatternAttempted: true,
        evaluatedAt: "2026-08-23T00:00:00Z",
      }),
    ).toEqual({ ok: false, reason: "unrecognized" });
  });

  it.each([null, ["original"], "original", 42])(
    "reports %p as malformed",
    (value) => {
      expect(parseStoredEvaluation(value)).toEqual({
        ok: false,
        reason: "malformed",
      });
    },
  );
});

describe("isStoredTeacherReview", () => {
  it("is true for a teacher-reviewed original or repeat", () => {
    expect(
      isStoredTeacherReview({ ...legacyOriginal, outcome: "teacher_review" }),
    ).toBe(true);
    expect(
      isStoredTeacherReview({
        ...legacyRepeat,
        outcome: "teacher_review",
        reviewReason: "failed_schema",
      }),
    ).toBe(true);
  });

  it("is false for any other recognized outcome", () => {
    expect(isStoredTeacherReview(legacyOriginal)).toBe(false);
    expect(isStoredTeacherReview(legacyRepeat)).toBe(false);
  });

  it("is false for unrecognized or malformed rows rather than guessing review", () => {
    expect(isStoredTeacherReview({})).toBe(false);
    expect(isStoredTeacherReview(null)).toBe(false);
    expect(isStoredTeacherReview(["teacher_review"])).toBe(false);
  });

  it("fails closed for an unrecognized row that carries a review reason", () => {
    expect(isStoredTeacherReview({ reviewReason: "low_confidence" })).toBe(
      true,
    );
    expect(storedTurnWasUnderstood({ reviewReason: "low_confidence" })).toBe(
      false,
    );
  });
});

describe("storedTurnWasUnderstood", () => {
  it("mirrors the review check for recognized rows", () => {
    expect(storedTurnWasUnderstood(legacyOriginal)).toBe(true);
    expect(
      storedTurnWasUnderstood({ ...legacyOriginal, outcome: "teacher_review" }),
    ).toBe(false);
  });

  it("defaults to understood for unrecognized and malformed rows, preserving legacy behavior", () => {
    expect(storedTurnWasUnderstood({})).toBe(true);
    expect(storedTurnWasUnderstood(undefined)).toBe(true);
    expect(storedTurnWasUnderstood(3)).toBe(true);
  });
});

describe("storedOriginalMetadataOf", () => {
  it("selects the nested original metadata one level down under a repeat", () => {
    const nested = { hangulInterpretations: [{ span: "게임" }] };
    expect(
      storedOriginalMetadataOf({ ...legacyRepeat, originalEvaluation: nested }),
    ).toEqual(nested);
  });

  it("uses the record itself when no repeat overwrote the top level", () => {
    expect(storedOriginalMetadataOf(legacyOriginal)).toEqual(legacyOriginal);
  });

  it("returns null for unrecognized and malformed rows so readers fail safe", () => {
    expect(storedOriginalMetadataOf({})).toBeNull();
    expect(storedOriginalMetadataOf("junk")).toBeNull();
  });
});

describe("classifyStoredConversationRecovery", () => {
  const original = {
    ...legacyOriginal,
    kind: "original" as const,
    outcome: "retry_original" as const,
    retryReason: "unclear_meaning" as const,
  };

  it.each([
    [
      "ambiguity attempt 1",
      { ...original, ambiguityRetries: 1 },
      { kind: "ambiguity", attempt: 1 },
    ],
    [
      "ambiguity attempt 2",
      { ...original, ambiguityRetries: 2 },
      { kind: "ambiguity", attempt: 2 },
    ],
    [
      "free low-confidence audio retry",
      { ...original, lowConfidenceAudioRetries: 1 },
      { kind: "low_confidence_audio_retry", attempt: 1 },
    ],
    [
      "second free low-confidence audio retry",
      { ...original, lowConfidenceAudioRetries: 2 },
      { kind: "low_confidence_audio_retry", attempt: 2 },
    ],
    [
      "carried ambiguity through incomplete recording",
      {
        ...original,
        retryReason: "incomplete_recording",
        ambiguityRetries: 1,
      },
      {
        kind: "carried_ambiguity",
        retryReason: "incomplete_recording",
        attempt: 1,
      },
    ],
    [
      "carried ambiguity through minimal effort",
      {
        ...original,
        retryReason: "minimal_effort",
        ambiguityRetries: 2,
      },
      { kind: "carried_ambiguity", retryReason: "minimal_effort", attempt: 2 },
    ],
    [
      "prompt echo wins over recovery counters",
      {
        ...original,
        ambiguityRetries: 1,
        lowConfidenceAudioRetries: 1,
        contractViolations: ["prompt_echo"],
      },
      { kind: "prompt_echo" },
    ],
    [
      "both valid counters keep the ambiguity interpretation",
      { ...original, ambiguityRetries: 2, lowConfidenceAudioRetries: 1 },
      { kind: "ambiguity", attempt: 2 },
    ],
  ] as const)("classifies %s", (_name, evaluation, expected) => {
    expect(classifyStoredConversationRecovery(evaluation)).toEqual(expected);
  });

  it.each([
    ["malformed", null],
    ["unrecognized", {}],
    ["repeat", { ...legacyRepeat, kind: "repeat" }],
    [
      "accepted stale counters",
      { ...original, outcome: "accepted_original", ambiguityRetries: 1 },
    ],
    [
      "review stale counters",
      { ...original, outcome: "teacher_review", ambiguityRetries: 1 },
    ],
    ["zero ambiguity counter", { ...original, ambiguityRetries: 0 }],
    ["fractional ambiguity counter", { ...original, ambiguityRetries: 1.5 }],
    ["out-of-range ambiguity counter", { ...original, ambiguityRetries: 3 }],
    ["non-finite ambiguity counter", { ...original, ambiguityRetries: Number.NaN }],
    ["zero low-confidence counter", { ...original, lowConfidenceAudioRetries: 0 }],
    [
      "fractional low-confidence counter",
      { ...original, lowConfidenceAudioRetries: 1.5 },
    ],
    [
      "out-of-range low-confidence counter",
      { ...original, lowConfidenceAudioRetries: 3 },
    ],
    [
      "non-finite low-confidence counter",
      { ...original, lowConfidenceAudioRetries: Number.POSITIVE_INFINITY },
    ],
    ["unsupported retry reason", { ...original, retryReason: "non_english" }],
  ] as const)("returns no recovery for %s", (_name, evaluation) => {
    expect(classifyStoredConversationRecovery(evaluation)).toEqual({
      kind: "none",
    });
  });

  it("returns prompt echo for a reviewed echo so callers can keep it unanswered", () => {
    expect(
      classifyStoredConversationRecovery({
        ...original,
        outcome: "teacher_review",
        contractViolations: ["prompt_echo"],
      }),
    ).toEqual({ kind: "prompt_echo" });
  });
});
