// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRACTICE_SOUNDS } from "@/domain/pronunciation/practice";
import type { PronunciationWordBankEntry } from "@/domain/pronunciation/word-bank.generated";

vi.mock("@/app/teacher/students/[id]/pronunciation-practice/new/actions", () => ({
  assignPronunciationPracticeAction: vi.fn(),
  lookupCustomWordAction: vi.fn(),
  previewPronunciationWordAction: vi.fn(),
  suggestPronunciationWordsAction: vi.fn(),
}));

import { PronunciationPracticeForm } from "./PronunciationPracticeForm";

const words = Array.from({ length: 5 }, (_, index) =>
  ({
    soundId: "s",
    difficulty: "easy",
    text: ["sun", "sock", "sit", "soup", "star"][index],
    targetLetters: "s",
    highlightStart: 0,
    highlightLength: 1,
    targetArpabet: "S",
    phones: ["S", "AH1", "N"],
    targetPhoneIndex: 0,
    cmuVariant: 1,
  }) as PronunciationWordBankEntry,
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("PronunciationPracticeForm", () => {
  it("shows five ordered words, bounded custom-word guidance, and one assignment action", async () => {
    await act(async () => {
      root.render(
        <PronunciationPracticeForm
          studentId="student-1"
          studentName="Mina"
          soundOptions={Object.entries(PRACTICE_SOUNDS).map(([soundId, sound]) => ({
            soundId: soundId as keyof typeof PRACTICE_SOUNDS,
            label: sound.label,
            ipa: sound.ipa,
            available: true,
            weak: false,
          }))}
          initialSoundId="s"
          initialDifficulty="easy"
          suggestions={words}
        />,
      );
    });

    expect(container.textContent).toContain("Assign pronunciation practice");
    expect(container.textContent).not.toContain("Custom word");
    const replaceButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Replace",
    );
    await act(async () => replaceButton?.click());
    expect(container.textContent).toContain("Custom word");
    expect(container.textContent).toContain(
      "Names, phrases, and hyphenated words are not supported.",
    );
    expect(container.querySelectorAll("[data-word-order]")).toHaveLength(5);
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });
});
