import { describe, expect, it } from "vitest";
import { DEFAULT_BUDDY, getCharacterProfile } from "@/domain/character/profile";
import { DEFAULT_CHARACTER_ID } from "@/domain/mission/schemas";

describe("character profile module (CHAR-01/02/03/04, FLOW-02)", () => {
  it("resolves default-buddy to a profile with displayName Coco", () => {
    const profile = getCharacterProfile(DEFAULT_CHARACTER_ID);
    expect(profile.displayName).toBe("Coco");
    expect(profile.characterId).toBe(DEFAULT_CHARACTER_ID);
  });

  it("falls back to DEFAULT_BUDDY for unknown character ids", () => {
    const profile = getCharacterProfile("some-unknown-id");
    expect(profile).toBe(DEFAULT_BUDDY);
    expect(profile.displayName).toBe("Coco");
  });

  it("exposes the DEFAULT_BUDDY constant with the default-buddy id", () => {
    expect(DEFAULT_BUDDY.characterId).toBe(DEFAULT_CHARACTER_ID);
  });

  it("has a questionLabel field", () => {
    expect(DEFAULT_BUDDY.questionLabel).toBe("Coco asks:");
  });

  it("has an improvedSentenceIntro field", () => {
    expect(DEFAULT_BUDDY.improvedSentenceIntro).toBe(
      "Nice! Here is a better way to say it:",
    );
  });

  it("has a turnTransition field", () => {
    expect(DEFAULT_BUDDY.turnTransition).toBe(
      "Good job! Ready for the next one?",
    );
  });

  it("has a completionHeading field", () => {
    expect(DEFAULT_BUDDY.completionHeading).toBe("Mission complete!");
  });

  it("has a resumeNotice field", () => {
    expect(DEFAULT_BUDDY.resumeNotice).toBe(
      "Welcome back! Picking up where you left off.",
    );
  });

  it("has a questionIntro field", () => {
    expect(DEFAULT_BUDDY.questionIntro).toBe(
      "Hi! Let's practice together.",
    );
  });

  it("completionBody(3) includes the turn count", () => {
    const body = DEFAULT_BUDDY.completionBody(3);
    expect(body).toContain("3");
    expect(body).toContain("turns");
    expect(body).toContain("teacher");
  });

  it("completionBody(5) includes the turn count 5", () => {
    const body = DEFAULT_BUDDY.completionBody(5);
    expect(body).toContain("5");
  });

  // CHAR-03 guard: no disallowed substrings in static buddy copy
  it("static copy does not contain disallowed substrings (CHAR-03)", () => {
    const disallowed = [
      "love",
      "date",
      "kiss",
      "boyfriend",
      "girlfriend",
      "stupid",
      "dumb",
      "wrong",
    ];

    const staticLines = [
      DEFAULT_BUDDY.questionIntro,
      DEFAULT_BUDDY.questionLabel,
      DEFAULT_BUDDY.improvedSentenceIntro,
      DEFAULT_BUDDY.turnTransition,
      DEFAULT_BUDDY.completionHeading,
      DEFAULT_BUDDY.completionBody(3),
      DEFAULT_BUDDY.resumeNotice,
    ];

    for (const line of staticLines) {
      for (const word of disallowed) {
        expect(
          line.toLowerCase().includes(word),
          `"${line}" contains disallowed word "${word}"`,
        ).toBe(false);
      }
    }
  });
});
