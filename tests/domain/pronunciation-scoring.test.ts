import { describe, expect, it } from "vitest";
import {
  computeBandScore,
  errorTypeToLabel,
  scoreToStarBand,
  STAR_BAND_COPY,
} from "@/domain/pronunciation/scoring";

describe("scoreToStarBand", () => {
  it("maps high scores to 3 stars", () => {
    expect(scoreToStarBand(85)).toBe(3);
  });

  it("maps mid scores to 2 stars", () => {
    expect(scoreToStarBand(70)).toBe(2);
  });

  it("maps low scores to 1 star", () => {
    expect(scoreToStarBand(40)).toBe(1);
  });

  it("resolves the >=80 boundary to 3 stars", () => {
    expect(scoreToStarBand(80)).toBe(3);
  });

  it("resolves the >=60 boundary to 2 stars", () => {
    expect(scoreToStarBand(60)).toBe(2);
  });

  it("resolves just below the 60 boundary to 1 star", () => {
    expect(scoreToStarBand(59.9)).toBe(1);
  });

  it("never returns 0 or a failure state for a zero score", () => {
    expect(scoreToStarBand(0)).toBe(1);
  });

  it("never returns 0 or a failure state for a negative score", () => {
    expect(scoreToStarBand(-5)).toBe(1);
  });
});

describe("computeBandScore", () => {
  it("blends accuracy and fluency 60/40", () => {
    // 0.6*85 + 0.4*40 = 67
    expect(computeBandScore(85, 40)).toBeCloseTo(67, 5);
  });

  it("lifts a well-pronounced but halting read (acc 85 / flu 40) to a 2-star band", () => {
    expect(scoreToStarBand(computeBandScore(85, 40))).toBe(2);
  });

  it("keeps a genuinely unintelligible read (acc 52 / flu 32) at 1 star", () => {
    // 0.6*52 + 0.4*32 = 44
    expect(scoreToStarBand(computeBandScore(52, 32))).toBe(1);
  });

  it("falls back to accuracy alone when fluency is null", () => {
    expect(computeBandScore(72, null)).toBe(72);
  });

  it("falls back to accuracy alone when fluency is undefined", () => {
    expect(computeBandScore(72, undefined)).toBe(72);
  });
});

describe("STAR_BAND_COPY", () => {
  it("maps 3 stars to encouraging copy", () => {
    expect(STAR_BAND_COPY[3]).toBe("Great job!");
  });

  it("maps 2 stars to encouraging copy", () => {
    expect(STAR_BAND_COPY[2]).toBe("Good try!");
  });

  it("maps 1 star to encouraging copy, never a failure word", () => {
    expect(STAR_BAND_COPY[1]).toBe("Keep practicing!");
  });
});

describe("errorTypeToLabel", () => {
  it("maps None to Clear", () => {
    expect(errorTypeToLabel("None")).toBe("Clear");
  });

  it("maps Omission to Skipped", () => {
    expect(errorTypeToLabel("Omission")).toBe("Skipped");
  });

  it("maps Insertion to Extra word", () => {
    expect(errorTypeToLabel("Insertion")).toBe("Extra word");
  });

  it("maps Mispronunciation to Mispronounced", () => {
    expect(errorTypeToLabel("Mispronunciation")).toBe("Mispronounced");
  });

  it("maps UnexpectedBreak to Pause", () => {
    expect(errorTypeToLabel("UnexpectedBreak")).toBe("Pause");
  });

  it("maps MissingBreak to Pause", () => {
    expect(errorTypeToLabel("MissingBreak")).toBe("Pause");
  });

  it("maps Monotone to Flat tone", () => {
    expect(errorTypeToLabel("Monotone")).toBe("Flat tone");
  });

  it("defaults an unknown ErrorType to Clear", () => {
    expect(errorTypeToLabel("SomeUnknownType")).toBe("Clear");
  });

  it("defaults an undefined ErrorType to Clear", () => {
    expect(errorTypeToLabel(undefined)).toBe("Clear");
  });
});
