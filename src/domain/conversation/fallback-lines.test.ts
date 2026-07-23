import { describe, expect, it } from "vitest";
import {
  CANNED_CLOSING_FALLBACK_LINE,
  classifyFollowUpFallbackKind,
  selectClosingFallbackLine,
  selectFollowUpFallbackLine,
} from "@/domain/conversation/fallback-lines";

describe("conversation fallback lines", () => {
  it("provides a static no-question closing with no interpolation", () => {
    expect(selectClosingFallbackLine()).toBe(
      "That was fun! Thanks for talking with me. See you next time!",
    );
    expect(selectClosingFallbackLine()).toBe(CANNED_CLOSING_FALLBACK_LINE);
    expect(selectClosingFallbackLine()).not.toContain("?");
  });

  it.each([
    ["meaningful", "Thanks for telling me! What do you like about that?"],
    ["vague_or_stuck", "That's okay! Can you give me one example?"],
    [
      "uncertain",
      "Let's try that question another way. Can you tell me one small detail?",
    ],
  ] as const)("returns the exact %s follow-up fallback", (kind, expected) => {
    const line = selectFollowUpFallbackLine(kind);
    expect(line).toBe(expected);
    expect(line.match(/\?/gu)).toHaveLength(1);
    expect(line.endsWith("?")).toBe(true);
  });

  it("classifies only bounded server-known response state", () => {
    expect(
      classifyFollowUpFallbackKind({
        latestResponse: "I will eat sushi.",
        responseHandling: "normal",
        inputUsable: true,
      }),
    ).toBe("meaningful");
    expect(
      classifyFollowUpFallbackKind({
        latestResponse: "Anything.",
        responseHandling: "normal",
        inputUsable: true,
      }),
    ).toBe("vague_or_stuck");
    expect(
      classifyFollowUpFallbackKind({
        latestResponse: "private raw text",
        responseHandling: "review_pending",
        inputUsable: true,
      }),
    ).toBe("uncertain");
    expect(
      classifyFollowUpFallbackKind({
        latestResponse: "private raw text",
        responseHandling: "normal",
        inputUsable: false,
      }),
    ).toBe("uncertain");
  });

  it("removes both rejected UAT lines", () => {
    const lines = [
      selectFollowUpFallbackLine("meaningful"),
      selectFollowUpFallbackLine("vague_or_stuck"),
      selectFollowUpFallbackLine("uncertain"),
    ];
    expect(lines).not.toContain("I hear you! Let's keep going.");
    expect(lines).not.toContain("Nice! What happens next?");
  });

  it("keeps the closing fallback byte-for-byte unchanged", () => {
    expect(selectClosingFallbackLine()).toBe(
      "That was fun! Thanks for talking with me. See you next time!",
    );
    expect(selectClosingFallbackLine()).toBe(CANNED_CLOSING_FALLBACK_LINE);
  });
});
