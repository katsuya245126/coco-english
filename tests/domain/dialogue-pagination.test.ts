import { describe, expect, it } from "vitest";
import {
  DIALOGUE_PAGE_WORD_LIMIT,
  findDialoguePageIndex,
  paginateDialogueText,
} from "@/domain/conversation/dialogue-pagination";

describe("paginateDialogueText", () => {
  it("keeps a short line on one exact page", () => {
    const text = "What games do you play inside?";
    expect(DIALOGUE_PAGE_WORD_LIMIT).toBe(8);
    expect(paginateDialogueText(text)).toEqual([
      { start: 0, end: text.length, text },
    ]);
  });

  it("splits a typical 10-word mobile reply while keeping a short open question whole", () => {
    const mobileReply = "Playing inside is fun. What games do you play there?";
    const shortOpenQuestion = "What games do you play?";

    expect(paginateDialogueText(mobileReply).map((page) => page.text)).toEqual([
      "Playing inside is fun. ",
      "What games do you play there?",
    ]);
    expect(paginateDialogueText(shortOpenQuestion)).toEqual([
      { start: 0, end: shortOpenQuestion.length, text: shortOpenQuestion },
    ]);
  });

  it("prefers sentence and clause boundaries before whitespace", () => {
    const sentences =
      "One two three four five six. Seven eight nine ten eleven twelve thirteen fourteen.";
    const clauses =
      "One two three four five six, seven eight nine ten eleven twelve thirteen fourteen.";

    expect(paginateDialogueText(sentences).map((page) => page.text)).toEqual([
      "One two three four five six. ",
      "Seven eight nine ten eleven twelve thirteen fourteen.",
    ]);
    expect(paginateDialogueText(clauses).map((page) => page.text)).toEqual([
      "One two three four five six, ",
      "seven eight nine ten eleven twelve thirteen fourteen.",
    ]);
  });

  it("uses whitespace for one over-budget clause and preserves the source", () => {
    const text = Array.from({ length: 20 }, (_, index) => `word${index + 1}`).join(" ");
    const pages = paginateDialogueText(text);

    expect(pages).toHaveLength(3);
    expect(pages[0]?.text.trim().split(/\s+/u)).toHaveLength(8);
    expect(pages.map((page) => page.text).join("")).toBe(text);
  });

  it("moves a boundary before a protected phrase", () => {
    const words = Array.from({ length: 20 }, (_, index) => `word${index + 1}`);
    const text = words.join(" ");
    const source = "word15 word16 word17 word18";
    const start = text.indexOf(source);
    const pages = paginateDialogueText(text, [{ start, end: start + source.length }]);

    expect(pages.map((page) => page.text).join("")).toBe(text);
    expect(pages.some((page) => page.start > start && page.start < start + source.length)).toBe(false);
    expect(pages.some((page) => page.end > start && page.end < start + source.length)).toBe(false);
  });

  it("keeps an over-budget protected phrase intact", () => {
    const phrase = Array.from({ length: 18 }, (_, index) => `word${index + 1}`).join(" ");
    const text = `${phrase} tail`;
    const pages = paginateDialogueText(text, [{ start: 0, end: phrase.length }]);

    expect(pages[0]?.text).toBe(phrase);
    expect(pages.map((page) => page.text).join("")).toBe(text);
  });

  it("handles empty, whitespace-only, and over-budget single-word input", () => {
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
    expect(findDialoguePageIndex(pages, Number.MAX_SAFE_INTEGER)).toBe(2);
  });
});
