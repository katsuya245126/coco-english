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
        text: "Good job! Ready for the next one?",
        voice: "marin",
      },
      { apiKey: "test-key", client },
    );

    expect(result.ok).toBe(true);
    expect(client.audio.speech.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: "Good job! Ready for the next one?",
        response_format: "mp3",
        instructions: expect.any(String),
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        timeout: expect.any(Number),
        maxRetries: 0,
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

  it("aborts a hung provider request at the configured timeout", async () => {
    const { generateTtsAudio, TTS_PROVIDER_TIMEOUT_MS } = await import(
      "@/server/audio/tts-generator"
    );
    let aborted = false;
    const client: FakeSpeechClient = {
      audio: {
        speech: {
          create: vi.fn((_input, options) =>
            new Promise((_resolve, reject) => {
              options?.signal?.addEventListener("abort", () => {
                aborted = true;
                reject(new Error("aborted"));
              });
            }),
          ) as SpeechClient["audio"]["speech"]["create"],
        },
      },
    };

    vi.useFakeTimers();
    try {
      const pending = generateTtsAudio(
        { text: "Hello", voice: "marin" },
        { apiKey: "test-key", client },
      );
      await vi.advanceTimersByTimeAsync(TTS_PROVIDER_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({
        ok: false,
        error: "provider_failed",
      });
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
