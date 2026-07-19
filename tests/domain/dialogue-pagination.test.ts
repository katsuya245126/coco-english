import { describe, expect, it } from "vitest";
import {
  DIALOGUE_PAGE_PACK_WORD_LIMIT,
  DIALOGUE_PAGE_WORD_LIMIT,
  findDialoguePageIndex,
  paginateDialogueText,
} from "@/domain/conversation/dialogue-pagination";

describe("paginateDialogueText", () => {
  it("locks the approved word limits", () => {
    expect(DIALOGUE_PAGE_WORD_LIMIT).toBe(16);
    expect(DIALOGUE_PAGE_PACK_WORD_LIMIT).toBe(10);
  });

  it("keeps a short line on one exact page", () => {
    const text = "What games do you play inside?";
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: text.length, text },
    ]);
  });

  it("splits the phone UAT line into two sentence-aligned pages", () => {
    const text =
      "It's almost summer vacation! What are you going to do during summer vacation?";
    const secondStart = text.indexOf("What");
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: secondStart, text: "It's almost summer vacation! " },
      {
        start: secondStart,
        end: text.length,
        text: "What are you going to do during summer vacation?",
      },
    ]);
  });

  it("computes pages from source text alone so Hint cannot move them", () => {
    expect(paginateDialogueText.length).toBe(1);
  });

  it("packs very short sentences up to the ten-word budget", () => {
    const packed = "Great job! Let's keep going.";
    expect(paginateDialogueText(packed)).toEqual([
      { start: 0, end: packed.length, text: packed },
    ]);

    const three = "I ran fast. You ran fast. We all won.";
    expect(paginateDialogueText(three)).toHaveLength(1);

    const overBudget =
      "One two three four five six. Seven eight nine ten eleven.";
    expect(paginateDialogueText(overBudget).map((page) => page.text)).toEqual([
      "One two three four five six. ",
      "Seven eight nine ten eleven.",
    ]);
  });

  it("keeps a lone eleven-to-sixteen-word sentence whole on its own page", () => {
    const text =
      "One two three four five six seven eight nine ten eleven twelve.";
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: text.length, text },
    ]);
  });

  it("splits an over-limit sentence at clause punctuation first", () => {
    const clauses =
      "One two three four five six seven eight nine, ten eleven twelve thirteen fourteen fifteen sixteen seventeen.";
    expect(paginateDialogueText(clauses).map((page) => page.text)).toEqual([
      "One two three four five six seven eight nine, ",
      "ten eleven twelve thirteen fourteen fifteen sixteen seventeen.",
    ]);
  });

  it("falls back to whitespace for one over-limit clause and preserves the source", () => {
    const text = Array.from(
      { length: 20 },
      (_, index) => `word${index + 1}`,
    ).join(" ");
    const pages = paginateDialogueText(text);

    expect(pages).toHaveLength(2);
    expect(pages[0]?.text.trim().split(/\s+/u)).toHaveLength(16);
    expect(pages.map((page) => page.text).join("")).toBe(text);
  });

  it("never packs fragments of a split sentence with a following sentence", () => {
    const longSentence = Array.from(
      { length: 20 },
      (_, index) => `word${index + 1}`,
    ).join(" ");
    const text = `${longSentence}. Nice job.`;
    const pages = paginateDialogueText(text).map((page) => page.text);

    expect(pages).toHaveLength(3);
    expect(pages[2]).toBe("Nice job.");
    expect(pages.join("")).toBe(text);
  });

  it("handles empty, whitespace-only, and over-limit single-word input", () => {
    expect(paginateDialogueText("")).toEqual([]);
    expect(paginateDialogueText("   ")).toEqual([
      { start: 0, end: 3, text: "   " },
    ]);
    const longWord = "x".repeat(200);
    expect(paginateDialogueText(longWord)[0]?.text).toBe(longWord);
  });

  it("finds and clamps the page containing a full-source offset", () => {
    const pages = paginateDialogueText(
      Array.from({ length: 20 }, (_, index) => `word${index + 1}`).join(" "),
    );
    expect(findDialoguePageIndex(pages, 0)).toBe(0);
    expect(findDialoguePageIndex(pages, pages[1]?.start ?? 0)).toBe(1);
    expect(findDialoguePageIndex(pages, Number.MAX_SAFE_INTEGER)).toBe(1);
  });
});
