import { describe, expect, it } from "vitest";
import { validateGeneratedCocoReplyLine } from "@/domain/ai/conversation-generation";
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
    ["meaningful", "Thanks for telling me! Can you tell me one more thing?"],
    ["vague_or_stuck", "That's okay! Can you give me one example?"],
    ["uncertain", "Thanks for trying! What else do you want to tell me?"],
  ] as const)("returns the exact %s follow-up fallback", (kind, expected) => {
    const line = selectFollowUpFallbackLine(kind);
    expect(line).toBe(expected);
    expect(line.match(/\?/gu)).toHaveLength(1);
    expect(line.endsWith("?")).toBe(true);
  });

  it("asks for one bounded detail without an ambiguous reference", () => {
    const oldMeaningfulLine = "Thanks for telling me! What do you like about that?";
    const unboundedMeaningfulLine =
      "Thanks for telling me! What else can you tell me about it?";
    const line = selectFollowUpFallbackLine("meaningful");

    expect(line).not.toBe(oldMeaningfulLine);
    expect(line).not.toBe(unboundedMeaningfulLine);
    expect(line).toContain("one more thing");
    expect(line).not.toMatch(/\b(?:it|that)\b/iu);
    // A static line cannot carry dynamic lexical topic grounding without
    // interpolating learner text. Apply only the shared structural question
    // policy here; the production-shaped cases below cover answerability.
    expect(
      validateGeneratedCocoReplyLine(line, { expectsQuestion: true }),
    ).toEqual({ ok: true });
  });

  it.each([
    {
      name: "a sushi plan",
      latestStudentResponse: "I will eat sushi.",
    },
    {
      name: "a family fact",
      latestStudentResponse: "I have one sister.",
    },
  ])(
    "uses a bounded fallback for $name",
    (context) => {
      const kind = classifyFollowUpFallbackKind({
        latestResponse: context.latestStudentResponse,
        responseHandling: "normal",
        inputUsable: true,
      });
      const line = selectFollowUpFallbackLine(kind);

      expect(kind).toBe("meaningful");
      expect(line).toBe(
        "Thanks for telling me! Can you tell me one more thing?",
      );
      expect(line).not.toContain("What else can you tell me about it?");
      expect(line).not.toContain("What do you like about that?");
    },
  );

  it("keeps the uncertain fallback moving without another retry request", () => {
    const line = selectFollowUpFallbackLine("uncertain");
    expect(line).toBe(
      "Thanks for trying! What else do you want to tell me?",
    );
    expect(line).not.toContain("again");
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
