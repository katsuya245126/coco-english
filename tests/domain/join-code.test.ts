import { describe, expect, it } from "vitest";
import {
  generateJoinCode,
  JOIN_CODE_ALPHABET,
} from "@/domain/classroom/join-code";

// Ambiguous characters that must never appear in a classroom-friendly code:
// zero/oh, one/eye/ell are easy to misread on a shared screen or printout.
const AMBIGUOUS_CHARACTERS = ["0", "O", "1", "I", "L"] as const;

describe("join-code alphabet", () => {
  it.each(AMBIGUOUS_CHARACTERS)(
    "excludes the ambiguous character %s",
    (character) => {
      expect(JOIN_CODE_ALPHABET).not.toContain(character);
    },
  );

  it("uses only uppercase letters and digits", () => {
    expect(JOIN_CODE_ALPHABET).toMatch(/^[A-Z0-9]+$/);
  });

  it("has no duplicate characters", () => {
    const unique = new Set(JOIN_CODE_ALPHABET.split(""));
    expect(unique.size).toBe(JOIN_CODE_ALPHABET.length);
  });
});

describe("generateJoinCode", () => {
  it("returns a string of the default length", () => {
    expect(generateJoinCode()).toHaveLength(6);
  });

  it.each([4, 6, 8, 10] as const)(
    "returns a string of the requested length %i",
    (length) => {
      expect(generateJoinCode(length)).toHaveLength(length);
    },
  );

  it("uses only characters from JOIN_CODE_ALPHABET", () => {
    const allowed = new Set(JOIN_CODE_ALPHABET.split(""));
    for (let i = 0; i < 500; i += 1) {
      for (const character of generateJoinCode()) {
        expect(allowed.has(character)).toBe(true);
      }
    }
  });

  it("never emits an ambiguous character across many samples", () => {
    const ambiguous = new Set<string>(AMBIGUOUS_CHARACTERS);
    for (let i = 0; i < 1000; i += 1) {
      for (const character of generateJoinCode()) {
        expect(ambiguous.has(character)).toBe(false);
      }
    }
  });

  it("yields a high unique ratio over many samples (statistical sanity)", () => {
    const samples = 2000;
    const seen = new Set<string>();
    for (let i = 0; i < samples; i += 1) {
      seen.add(generateJoinCode());
    }
    // With a 32-char alphabet and length 6 (~1.07e9 space), 2000 samples should
    // be effectively collision-free. Allow a tiny margin for birthday paradox.
    expect(seen.size / samples).toBeGreaterThan(0.99);
  });
});
