import { describe, expect, it } from "vitest";
import {
  CANNED_CLOSING_FALLBACK_LINE,
  selectClosingFallbackLine,
} from "@/domain/conversation/fallback-lines";

describe("conversation fallback lines", () => {
  it("provides a static no-question closing with no interpolation", () => {
    expect(selectClosingFallbackLine()).toBe(
      "That was fun! Thanks for talking with me. See you next time!",
    );
    expect(selectClosingFallbackLine()).toBe(CANNED_CLOSING_FALLBACK_LINE);
    expect(selectClosingFallbackLine()).not.toContain("?");
  });
});
