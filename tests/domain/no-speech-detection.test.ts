import { describe, expect, it } from "vitest";
import { detectNoSpeech } from "@/domain/audio/no-speech-detection";

const TRANSCRIPTION_PROMPT =
  "The student is a Korean ESL learner speaking English. Transcribe only the English words spoken.";

describe("detectNoSpeech", () => {
  it("detects the complete prompt and a Context-prefixed prompt echo", () => {
    expect(detectNoSpeech(TRANSCRIPTION_PROMPT, TRANSCRIPTION_PROMPT)).toBe(
      "prompt_echo",
    );
    expect(
      detectNoSpeech(`Context: ${TRANSCRIPTION_PROMPT}`, TRANSCRIPTION_PROMPT),
    ).toBe("prompt_echo");
  });

  it("detects lexical prompt overlap at the approved 70 percent boundary", () => {
    const prompt = "one two three four five six seven";

    expect(
      detectNoSpeech(
        "one two three four five six seven alpha beta gamma",
        prompt,
      ),
    ).toBe("prompt_echo");
    expect(
      detectNoSpeech(
        "one two three four five six alpha beta gamma delta",
        prompt,
      ),
    ).toBeNull();
  });

  it("does not apply overlap matching below five transcript tokens", () => {
    expect(
      detectNoSpeech("one two three four", "one two three four five six"),
    ).toBeNull();
  });

  it("keeps plausible speech that borrows prompt vocabulary without echoing most of the prompt", () => {
    expect(
      detectNoSpeech("The student is speaking English.", TRANSCRIPTION_PROMPT),
    ).toBeNull();
  });

  it("normalizes case, punctuation, and whitespace before matching", () => {
    expect(
      detectNoSpeech(
        "Context... THE   student says hello, Coco!",
        "The student says: hello Coco.",
      ),
    ).toBe("prompt_echo");
  });

  it.each([
    "thank you for watching",
    "Thanks for watching!",
    "subtitles by the amara org community",
    "Please subscribe.",
    "see you in the next video",
  ])("detects the exact normalized hallucination %s", (transcript) => {
    expect(detectNoSpeech(transcript, TRANSCRIPTION_PROMPT)).toBe(
      "known_hallucination",
    );
  });

  it.each([
    "Thank you.",
    "Bye.",
    "I said thank you for watching my game.",
    "Please subscribe to our class newsletter tomorrow.",
    "I like playing soccer after school.",
  ])("keeps plausible student speech %s", (transcript) => {
    expect(detectNoSpeech(transcript, TRANSCRIPTION_PROMPT)).toBeNull();
  });

  it("does not treat an empty prompt as a substring match", () => {
    expect(detectNoSpeech("I like apples.", "   ")).toBeNull();
  });
});
