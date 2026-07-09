import { describe, expect, it } from "vitest";
import {
  DEFAULT_COCO_TTS_VOICE,
  TTS_PROVIDER,
  TTS_MODEL,
  TTS_RESPONSE_FORMAT,
  TTS_CACHE_SCHEMA_VERSION,
  VOICE_ELIGIBLE_LINE_KINDS,
  buildTtsCacheHashInput,
  isVoiceEligibleLineKind,
} from "@/domain/audio/tts";

describe("TTS domain constants (VOICE-01, D-05..D-11)", () => {
  it("resolves the OpenAI provider, gpt-4o-mini-tts model, mp3 format, and marin default voice", () => {
    expect(TTS_PROVIDER).toBe("openai");
    expect(TTS_MODEL).toBe("gpt-4o-mini-tts");
    expect(TTS_RESPONSE_FORMAT).toBe("mp3");
    expect(DEFAULT_COCO_TTS_VOICE).toBe("marin");
  });

  it("declares voice-eligible line kinds matching D-06 through D-11", () => {
    expect(VOICE_ELIGIBLE_LINE_KINDS).toEqual(
      expect.arrayContaining([
        "mission_prompt", // D-06
        "improved_sentence", // D-07
        "coco_transition", // D-08
        "coco_feedback", // D-09
        "completion_celebration", // D-11
      ]),
    );
  });

  it("rejects student transcript/original recognition text as a voice line kind (D-10)", () => {
    expect(isVoiceEligibleLineKind("student_transcript")).toBe(false);
    expect(isVoiceEligibleLineKind("original_transcript")).toBe(false);
    expect(isVoiceEligibleLineKind("repeat_transcript")).toBe(false);
  });

  it("confirms every declared line kind is voice-eligible", () => {
    for (const kind of VOICE_ELIGIBLE_LINE_KINDS) {
      expect(isVoiceEligibleLineKind(kind)).toBe(true);
    }
  });
});

describe("canonical TTS cache hash input (VOICE-03)", () => {
  function baseInput() {
    return {
      text: "Good job! Ready for the next one?",
      characterId: "default-buddy",
      voice: DEFAULT_COCO_TTS_VOICE,
      provider: TTS_PROVIDER,
      model: TTS_MODEL,
      responseFormat: TTS_RESPONSE_FORMAT,
    };
  }

  it("includes normalized text, character id, voice, provider, model, response format, and schema version", () => {
    const hashInput = buildTtsCacheHashInput(baseInput());

    expect(hashInput).toMatchObject({
      schemaVersion: TTS_CACHE_SCHEMA_VERSION,
      provider: TTS_PROVIDER,
      model: TTS_MODEL,
      voice: DEFAULT_COCO_TTS_VOICE,
      responseFormat: TTS_RESPONSE_FORMAT,
      characterId: "default-buddy",
      text: "Good job! Ready for the next one?",
    });
  });

  it("normalizes equivalent whitespace to the same cache input", () => {
    const spaced = buildTtsCacheHashInput({
      ...baseInput(),
      text: "  Good   job!\nReady for   the next one?  ",
    });
    const normalized = buildTtsCacheHashInput(baseInput());

    expect(spaced).toEqual(normalized);
  });

  it("produces a different cache input when voice changes", () => {
    const first = buildTtsCacheHashInput(baseInput());
    const second = buildTtsCacheHashInput({ ...baseInput(), voice: "cedar" });

    expect(first).not.toEqual(second);
  });

  it("produces a different cache input when model changes", () => {
    const first = buildTtsCacheHashInput(baseInput());
    const second = buildTtsCacheHashInput({
      ...baseInput(),
      model: "tts-1",
    });

    expect(first).not.toEqual(second);
  });

  it("produces a different cache input when response format changes", () => {
    const first = buildTtsCacheHashInput(baseInput());
    const second = buildTtsCacheHashInput({
      ...baseInput(),
      responseFormat: "wav",
    });

    expect(first).not.toEqual(second);
  });

  it("produces a different cache input when character id changes", () => {
    const first = buildTtsCacheHashInput(baseInput());
    const second = buildTtsCacheHashInput({
      ...baseInput(),
      characterId: "some-other-buddy",
    });

    expect(first).not.toEqual(second);
  });
});
