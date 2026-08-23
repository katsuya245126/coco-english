import { describe, expect, it } from "vitest";

import {
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

  it("treats a bare outcome-and-reason record as a legacy original review", () => {
    expect(parseStoredEvaluation({ outcome: "teacher_review" })).toMatchObject({
      ok: true,
      kind: "original",
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
