import { describe, expect, it } from "vitest";
import { findCustomPronunciations } from "@/server/pronunciation/cmudict";

describe("findCustomPronunciations", () => {
  it("rejects spaces before reading the dictionary", async () => {
    await expect(
      findCustomPronunciations({ word: "ice cream", soundId: "s" }),
    ).resolves.toEqual([]);
  });

  it("rejects hyphens before reading the dictionary", async () => {
    await expect(
      findCustomPronunciations({ word: "ice-cream", soundId: "s" }),
    ).resolves.toEqual([]);
  });

  it("finds the selected sound in a verified CMUdict pronunciation", async () => {
    await expect(
      findCustomPronunciations({ word: "fish", soundId: "f" }),
    ).resolves.toEqual([
      expect.objectContaining({
        word: "fish",
        phones: expect.arrayContaining(["F"]),
      }),
    ]);
  });

  it("accepts a light L onset before a vowel", async () => {
    await expect(
      findCustomPronunciations({ word: "light", soundId: "light_l" }),
    ).resolves.toEqual([
      expect.objectContaining({ word: "light", targetPhoneIndex: 0 }),
    ]);
  });

  it("rejects a dark or final L pronunciation", async () => {
    await expect(
      findCustomPronunciations({ word: "ball", soundId: "light_l" }),
    ).resolves.toEqual([]);
  });
});
