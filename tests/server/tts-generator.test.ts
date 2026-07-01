import { describe, expect, it, vi } from "vitest";
import type { SpeechClient } from "@/server/audio/tts-generator";

type FakeSpeechClient = SpeechClient;

function createFakeClient(result: unknown): FakeSpeechClient {
  return {
    audio: {
      speech: {
        create: vi.fn(async () => result) as SpeechClient["audio"]["speech"]["create"],
      },
    },
  };
}

function fakeSpeechResponse() {
  return {
    arrayBuffer: async () => new ArrayBuffer(4),
  } as Response;
}

describe("generateTtsAudio (VOICE-01)", () => {
  it("calls the speech API with model, voice, input, instructions, and mp3 response format", async () => {
    const { generateTtsAudio } = await import("@/server/audio/tts-generator");
    const client = createFakeClient(fakeSpeechResponse());

    const result = await generateTtsAudio(
      {
        text: "Good job! Ready for the next one.",
        voice: "marin",
      },
      { apiKey: "test-key", client },
    );

    expect(result.ok).toBe(true);
    expect(client.audio.speech.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: "Good job! Ready for the next one.",
        response_format: "mp3",
        instructions: expect.any(String),
      }),
    );
  });

  it("produces a missing-key error and does not call the fake provider when OPENAI_API_KEY is absent", async () => {
    const { generateTtsAudio } = await import("@/server/audio/tts-generator");
    const client = createFakeClient(fakeSpeechResponse());

    const result = await generateTtsAudio(
      { text: "Hi! Let's practice together.", voice: "marin" },
      { apiKey: "", client },
    );

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
    expect(client.audio.speech.create).not.toHaveBeenCalled();
  });

  it("maps provider exceptions to a small app-owned failure result without exposing provider details", async () => {
    const { generateTtsAudio } = await import("@/server/audio/tts-generator");
    const client: FakeSpeechClient = {
      audio: {
        speech: {
          create: vi.fn(async () => {
            throw new Error("upstream provider exploded with sensitive detail");
          }) as SpeechClient["audio"]["speech"]["create"],
        },
      },
    };

    const result = await generateTtsAudio(
      { text: "Nice! Here is a better way to say it.", voice: "marin" },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "provider_failed" });
    expect(JSON.stringify(result)).not.toContain("sensitive detail");
  });
});
