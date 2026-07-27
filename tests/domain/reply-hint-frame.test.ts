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

  // In a who question the blank marks the PERSON. Whatever follows "with" is
  // context, so the blank has to stay welded to "with" instead of being
  // appended after the trailing phrase. UAT 2026-07-27 attempt 992af2e2 showed
  // the failure: the student was shown "I usually go with to the PC room ____.",
  // said exactly that, and was correctly marked wrong by the evaluator.
  describe("who questions place the blank in the person slot", () => {
    it("moves a destination ahead of with instead of stranding the blank", () => {
      expect(
        buildReplyHintFrame(
          "A PC room is a good place to play. Who do you usually go with to the PC room?",
        ),
      ).toBe("I usually go to the PC room with ____.");
    });

    it.each([
      ["Who do you go with to the PC room?", "I go to the PC room with ____."],
      ["Who do you walk with to school?", "I walk to school with ____."],
      ["Who do you ride with to the mall?", "I ride to the mall with ____."],
    ])("relocates a to-destination: %s", (prompt, frame) => {
      expect(buildReplyHintFrame(prompt)).toBe(frame);
    });

    it.each([
      // Context that cannot sit naturally before "with" is dropped rather than
      // stranded. These outputs are unchanged from before the fix.
      ["Who do you eat lunch with at school?", "I eat lunch with ____."],
      ["Who do you talk with on the weekend?", "I talk with ____."],
      ["Who do you study with in the library?", "I study with ____."],
      ["Who do you go with during lunch?", "I go with ____."],
      ["Who do you play with over the weekend?", "I play with ____."],
      ["Who do you sit with by the window?", "I sit with ____."],
      ["Who do you travel with around the city?", "I travel with ____."],
      ["Who do you play games with while waiting?", "I play games with ____."],
      ["Who do you usually go with?", "I usually go with ____."],
      ["Who do you live with?", "I live with ____."],
      ["Who do you go to the PC room with?", "I go to the PC room with ____."],
    ])("drops unplaceable trailing context: %s", (prompt, frame) => {
      expect(buildReplyHintFrame(prompt)).toBe(frame);
    });

    it.each([
      ["Who do you help after school?", "I help ____."],
      ["Who do you help?", "I help ____."],
      ["Who do you visit on Sunday?", "I visit ____."],
    ])("still appends the blank when there is no with: %s", (prompt, frame) => {
      expect(buildReplyHintFrame(prompt)).toBe(frame);
    });

    // Guards the whole class rather than the shapes enumerated above: any
    // preposition stranded after "with" is a bug, whether or not we listed it.
    it.each([
      "Who do you go with to the PC room?",
      "Who do you usually go with to the PC room?",
      "Who do you go with at school?",
      "Who do you go with in the morning?",
      "Who do you go with on Saturday?",
      "Who do you go with from your class?",
      "Who do you speak with when you are sad?",
      "Who do you play Valorant with at the PC room?",
      "Who do you watch movies with on Friday?",
      "Who do you go shopping with every weekend?",
      "Who do you sit with in class?",
    ])("never strands a preposition after with: %s", (prompt) => {
      const frame = buildReplyHintFrame(prompt);
      expect(frame).not.toBeNull();
      // No "with to", "with at", "with in", "with on", etc.
      expect(frame).not.toMatch(/\bwith\s+(?!____)\S/iu);
      // The blank is the last slot, so nothing may follow it but the period.
      expect(frame).toMatch(/____\.$/u);
    });
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

  it("carries a referring phrase through untouched once Coco's line is clean", () => {
    // The hint is a pure function of Coco's question, so an unresolved Korean
    // noun can only reach it through Coco's line. Fixing the line upstream is
    // the whole fix; this pins that no Hangul handling is needed here.
    //
    // Backlog polish: consider whether "I play it at ____." reads better than
    // "I play that game at ____." Deliberately not changed in this pass.
    expect(buildReplyHintFrame("Where do you play that game?")).toBe(
      "I play that game at ____.",
    );
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
