import { describe, expect, it } from "vitest";
import { buildReplyHintFrame } from "@/domain/ai/reply-hint-frame";

describe("conversation reply hint frames", () => {
  it.each([
    ["What games do you like to play?", "I like to play ____."],
    ["What games do you like to play this summer?", "I like to play ____."],
    ["What food do you like to eat at home?", "I like to eat ____."],
    ["What shows do you like to watch after school?", "I like to watch ____."],
    ["What books do you like to read before bed?", "I like to read ____."],
  ])("drops optional context for like-to object questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["What games are you going to play this summer?", "I am going to play ____."],
    ["What are you going to do this summer vacation?", "I am going to ____."],
    ["What games will you play after school?", "I will play ____."],
    ["What food will you eat at home?", "I will eat ____."],
  ])("drops optional context for future-intent what questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["What do you do in that game?", "I ____ in that game."],
    ["What games do you play inside?", "I play ____ inside."],
    ["What food do you eat for breakfast?", "I eat ____ for breakfast."],
  ])("keeps necessary context for present-tense what-action questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["Who do you play with?", "I play with ____."],
    ["Who do you talk to at school?", "I talk to ____."],
  ])("keeps prepositions for who questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["Where do you play soccer?", "I play soccer at ____."],
    [
      "Where do you like to play Valorant with your friend?",
      "I like to play Valorant with my friend at ____.",
    ],
  ])("adds a location preposition for where questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    ["When do you usually play soccer?", "I usually play soccer ____."],
  ])("keeps the verb phrase for when questions: %s", (prompt, frame) => {
    expect(buildReplyHintFrame(prompt)).toBe(frame);
  });

  it.each([
    "Tell me more about that.",
    "Do you like soccer?",
    "Why do you like that game?",
    "How do you play that game?",
    "Which one is your favorite?",
    "What about your friend?",
  ])("returns null instead of guessing for unsupported prompts: %s", (prompt) => {
    expect(buildReplyHintFrame(prompt)).toBe(null);
  });

  it("uses the final question when Coco's line includes a reaction first", () => {
    expect(buildReplyHintFrame("Nice! What games do you like to play this summer?")).toBe(
      "I like to play ____.",
    );
  });
});
