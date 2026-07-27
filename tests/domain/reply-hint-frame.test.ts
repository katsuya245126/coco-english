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

  // In "What do you like about that?" the preposition GOVERNS the questioned
  // thing — the answer belongs after "about", not before it. Treating it as
  // optional trailing context produced "I like ____ about that.", which the
  // student read aloud as "I like it's fun about that." (UAT 2026-07-27,
  // attempt db9a4297 T4). Same defect class as the who-bug: the blank was
  // placed by position instead of by role.
  describe("about is the questioned thing, not trailing context", () => {
    it.each([
      ["What do you like about that?", "I like ____."],
      ["What do you think about that?", "I think ____."],
      ["What do you know about that game?", "I know ____."],
    ])("drops the about clause so the blank ends the frame: %s", (prompt, frame) => {
      expect(buildReplyHintFrame(prompt)).toBe(frame);
    });

    it("drops a long about tail rather than stranding the blank", () => {
      // Topic anchoring is deliberately sacrificed: a child reads the frame
      // aloud, so the blank must be the last slot.
      expect(
        buildReplyHintFrame("What do you like about playing games at the PC room?"),
      ).toBe("I like ____.");
    });

    it("handles the exact UAT regression with Coco's reaction attached", () => {
      expect(
        buildReplyHintFrame("Thanks for telling me! What do you like about that?"),
      ).toBe("I like ____.");
    });

    // Only "about" changes meaning this way. Other prepositions still carry
    // genuine context and must keep trailing the blank, byte-identical.
    it.each([
      ["What food do you eat for breakfast?", "I eat ____ for breakfast."],
      ["What do you do in that game?", "I ____ in that game."],
      ["What games do you play inside?", "I play ____ inside."],
    ])("leaves other trailing context untouched: %s", (prompt, frame) => {
      expect(buildReplyHintFrame(prompt)).toBe(frame);
    });
  });

  // Coco's "tell me" is the student's "tell you". cleanPhrase flipped "your"
  // and "yourself" but never "me", so the student was shown "I want to tell me
  // bye." (UAT 2026-07-27, attempt db9a4297 T5).
  describe("first-person pronouns flip to the student's voice", () => {
    it.each([
      ["What else do you want to tell me?", "I want to tell you ____."],
      ["What do you want to show me?", "I want to show you ____."],
      ["What do you want to give me?", "I want to give you ____."],
    ])("flips me to you: %s", (prompt, frame) => {
      expect(buildReplyHintFrame(prompt)).toBe(frame);
    });

    it("handles the exact UAT regression with Coco's reaction attached", () => {
      expect(
        buildReplyHintFrame("Thanks for trying! What else do you want to tell me?"),
      ).toBe("I want to tell you ____.");
    });

    it("does not corrupt words that merely contain me", () => {
      expect(buildReplyHintFrame("What games do you play at home?")).toBe(
        "I play ____ at home.",
      );
    });
  });

  // Class invariants: guard the whole shape, not just the cases enumerated
  // above. A frame is spoken by the STUDENT, so "me" can never appear in it,
  // and an "about" fragment can never trail the blank.
  it.each([
    "What do you like about that?",
    "What do you think about that?",
    "What do you know about that game?",
    "What do you like about playing games at the PC room?",
    "What else do you want to tell me?",
    "What do you want to show me?",
    "What do you want to give me?",
  ])("never speaks in Coco's voice or strands an about clause: %s", (prompt) => {
    const frame = buildReplyHintFrame(prompt);
    expect(frame).not.toBeNull();
    expect(frame).not.toMatch(/\bme\b/iu);
    expect(frame).not.toMatch(/____.*\babout\b/iu);
  });

  // The who-path reaches WHO_TRAILING_CONTEXT_PATTERN, which also lists
  // "about". This pins that the present-what fix left it byte-identical.
  it.each([
    ["Who do you talk about at school?", "I talk ____."],
    ["Who do you play with?", "I play with ____."],
    ["Who do you talk to at school?", "I talk to ____."],
    ["Who do you go with to the PC room?", "I go to the PC room with ____."],
  ])("leaves who-question frames unchanged: %s", (prompt, frame) => {
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
