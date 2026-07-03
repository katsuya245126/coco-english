import { describe, expect, it, vi } from "vitest";
import type { TranscriptionClient } from "@/server/audio/transcription";

type FakeTranscriptionClient = TranscriptionClient;

function createFakeClient(result: unknown): FakeTranscriptionClient {
  return {
    audio: {
      transcriptions: {
        create: vi.fn(async () => result) as TranscriptionClient["audio"]["transcriptions"]["create"],
      },
    },
  };
}

describe("transcribeAudioFile", () => {
  it("returns transcript text from an injected client", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I like apples." });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        model: "test-transcribe",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: true, text: "I like apples." });
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-transcribe",
      }),
    );
  });

  it("pins the transcription language to English so a mid-sentence Korean word doesn't flip the whole transcript to Korean", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "I like apples." });

    await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        model: "test-transcribe",
      },
      { apiKey: "test-key", client },
    );

    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "en",
      }),
    );
  });

  it("uses the configured transcription model when none is provided", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "Hello Coco." });

    await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client, model: "env-transcribe" },
    );

    expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "env-transcribe",
      }),
    );
  });

  it("maps missing API key before creating a provider request", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "Should not run" });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "", client },
    );

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
    expect(client.audio.transcriptions.create).not.toHaveBeenCalled();
  });

  it("maps empty transcripts to a retryable adapter error", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client = createFakeClient({ text: "   " });

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "empty_transcript" });
  });

  it("maps provider failures without exposing provider details", async () => {
    const { transcribeAudioFile } = await import("@/server/audio/transcription");
    const client: FakeTranscriptionClient = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => {
            throw new Error("provider unavailable");
          }) as TranscriptionClient["audio"]["transcriptions"]["create"],
        },
      },
    };

    const result = await transcribeAudioFile(
      {
        file: new Blob(["voice"], { type: "audio/webm" }),
        mimeType: "audio/webm",
      },
      { apiKey: "test-key", client },
    );

    expect(result).toEqual({ ok: false, error: "transcription_failed" });
  });
});
