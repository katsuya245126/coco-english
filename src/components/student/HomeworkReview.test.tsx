import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StudentMissionRecap } from "@/server/student-access/student-history";
import { HomeworkReview } from "./HomeworkReview";

const recap: StudentMissionRecap = {
  assignmentStudentId: "as-1",
  title: "Talking About Weekend Plans",
  targetPattern: "I am going to...",
  completedAt: "2026-07-20T00:00:00.000Z",
  conversationMode: true,
  characterId: "default-buddy",
  finalCocoLine: "That was fun! Thanks for talking with me. See you next time!",
  turns: [
    {
      id: "turn-accepted",
      turnOrder: 1,
      cocoPrompt: "Where are you going this weekend?",
      transcript: "I am going to the park.",
      audio: null,
      pronunciation: null,
      original: { transcript: "I am going to the park.", audio: null, pronunciation: null },
      improvedSentence: null,
      repeat: null,
      reviewState: "accepted",
    },
    {
      id: "turn-minor",
      turnOrder: 2,
      cocoPrompt: "What will you do there?",
      transcript: "I go to library.",
      audio: null,
      pronunciation: null,
      original: { transcript: "I go to library.", audio: null, pronunciation: null },
      improvedSentence: "I go to the library.",
      repeat: null,
      reviewState: "accepted_minor",
    },
    {
      id: "turn-repeat",
      turnOrder: 3,
      cocoPrompt: "What do you want to do there?",
      transcript: "I want to read cartoons.",
      audio: null,
      pronunciation: null,
      original: { transcript: "I want read cartoon.", audio: null, pronunciation: null },
      improvedSentence: null,
      repeat: { transcript: "I want to read cartoons.", audio: null, pronunciation: null },
      reviewState: "repeat_accepted",
    },
    {
      id: "turn-neutral",
      turnOrder: 4,
      cocoPrompt: "Who are you going with?",
      transcript: "My friend and I go.",
      audio: null,
      pronunciation: null,
      original: { transcript: "My friend and I go.", audio: null, pronunciation: null },
      improvedSentence: null,
      repeat: null,
      reviewState: "neutral",
    },
  ],
};

describe("HomeworkReview", () => {
  it("renders the text-message recap with per-turn review states", () => {
    const availableAudio = (id: string) => ({
      id,
      playback: "available" as const,
    });

    const recapWithEvidence: StudentMissionRecap = {
      ...recap,
      turns: recap.turns.map((turn) => {
        if (turn.id === "turn-accepted") {
          return {
            ...turn,
            original: {
              transcript: "I am going to the park.",
              audio: availableAudio("clip-accepted"),
              pronunciation: { starBand: 3, words: [] },
            },
          };
        }

        if (turn.id === "turn-minor") {
          return {
            ...turn,
            original: {
              transcript: "I go to library.",
              audio: availableAudio("clip-minor"),
              pronunciation: {
                starBand: 2,
                words: [{ word: "library", label: "Needs practice" }],
              },
            },
          };
        }

        if (turn.id === "turn-repeat") {
          return {
            ...turn,
            original: {
              transcript: "I want read cartoon.",
              audio: availableAudio("clip-original"),
              pronunciation: { starBand: 1, words: [] },
            },
            repeat: {
              transcript: "I want to read cartoons.",
              audio: availableAudio("clip-repeat"),
              pronunciation: { starBand: 3, words: [] },
            },
          };
        }

        return turn;
      }),
    };

    const html = renderToStaticMarkup(
      <HomeworkReview recap={recapWithEvidence} studentDisplayName="Kyle" />,
    );

    expect(html).toContain("Homework Review");
    expect(html).not.toContain("Read-only recap");
    expect(html).toContain("Coco");
    expect(html).toContain("Kyle");
    expect(html).not.toContain(">K<");
    expect(html).toContain("Look back at your conversation with Coco.");
    expect(html.match(/Listen to this recording/g)).toHaveLength(4);
    expect(html).not.toContain("Pronunciation");
    expect(html).not.toContain("Words to practice");
    expect(html).not.toContain("Great job!");
    expect(html).toContain("I go to library.");
    expect(html).toMatch(/class="[^"]*changedWord[^"]*"[^>]*>the</);
    expect(html).toContain("This answer needed another try.");
    expect(html).toContain("I want read cartoon.");
    expect(html).toContain("I want to read cartoons.");
    expect(html.match(/✓ Good job!/g)).toHaveLength(3);
    expect(html).not.toContain("teacher_review");
    expect(html).not.toContain("ambiguous");
    expect(html).toContain(
      "That was fun! Thanks for talking with me. See you next time!",
    );
  });

  it("defines the required CSS module rules", () => {
    const cssPath = fileURLToPath(
      new URL("./HomeworkReview.module.css", import.meta.url),
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/max-width:\s*590px/);
    expect(css).toMatch(/grid-template-columns:\s*42px\s+minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/border-radius:\s*999px/);
    expect(css).toMatch(/text-decoration:\s*underline/);
    expect(css).toMatch(/\.retryMark/);
    expect(css).toMatch(/\.changedWord/);
    expect(css).toMatch(/\.goodJob/);
    expect(css).toMatch(/\.srOnly/);
    expect(css).not.toMatch(/\.pronunciation/);
  });
});
