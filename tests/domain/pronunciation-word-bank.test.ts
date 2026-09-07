import { describe, expect, it } from "vitest";
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_SOUND_IDS,
} from "@/domain/pronunciation/practice";
import { PRONUNCIATION_WORD_BANK } from "@/domain/pronunciation/word-bank.generated";

describe("PRONUNCIATION_WORD_BANK", () => {
  it("contains ten verified words for every sound and difficulty", () => {
    expect(PRONUNCIATION_WORD_BANK).toHaveLength(150);

    for (const soundId of PRACTICE_SOUND_IDS) {
      for (const difficulty of PRACTICE_DIFFICULTIES) {
        expect(
          PRONUNCIATION_WORD_BANK.filter(
            (entry) =>
              entry.soundId === soundId && entry.difficulty === difficulty,
          ),
        ).toHaveLength(10);
      }
    }
  });

  it("stores a single target phone and a usable highlight for every word", () => {
    for (const entry of PRONUNCIATION_WORD_BANK) {
      expect(entry.text).toMatch(/^[a-z]+$/);
      expect(entry.highlightLength).toBeGreaterThan(0);
      expect(entry.phones.length).toBeGreaterThan(0);
      expect(entry.targetPhoneIndex).toBeGreaterThanOrEqual(0);
      expect(entry.targetPhoneIndex).toBeLessThan(entry.phones.length);
      expect(entry.phones.filter((phone) => phone === entry.targetArpabet)).toHaveLength(1);
    }
  });
});
