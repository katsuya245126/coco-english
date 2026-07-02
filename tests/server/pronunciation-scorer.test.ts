import { describe, expect, it, vi } from "vitest";
import type {
  PronunciationRecognizerFactory,
  PronunciationScorerDeps,
} from "@/server/audio/pronunciation-scorer";
import type { TranscodeResult } from "@/server/audio/audio-transcode";

const FAKE_WAV = Buffer.from("RIFF....WAVEfmt ");

function createFakeRecognizerFactory(
  result: unknown,
): PronunciationRecognizerFactory {
  return vi.fn(async () => result) as unknown as PronunciationRecognizerFactory;
}

function createFakeTranscode(result: TranscodeResult) {
  return vi.fn(async () => result);
}

function baseInput() {
  return {
    file: new Blob(["voice"], { type: "audio/webm" }),
    referenceText: "I like apples.",
    durationMs: 4000,
  };
}

function fakeAzureResult(overrides?: Partial<Record<string, number>>) {
  return {
    accuracyScore: overrides?.accuracyScore ?? 90,
    fluencyScore: overrides?.fluencyScore ?? 88,
    completenessScore: overrides?.completenessScore ?? 92,
    pronunciationScore: overrides?.pronunciationScore ?? 85,
    words: [
      { word: "I", accuracyScore: 95, errorType: "None" },
      { word: "like", accuracyScore: 90, errorType: "None" },
      { word: "apples", accuracyScore: 80, errorType: "Mispronunciation" },
    ],
  };
}

describe("scorePronunciation", () => {
  it("resolves a derived star band from an injected fake recognizer and transcode", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");
    const { scoreToStarBand } = await import("@/domain/pronunciation/scoring");

    const azureResult = fakeAzureResult({ pronunciationScore: 85 });
    const client = createFakeRecognizerFactory(azureResult);
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const deps: PronunciationScorerDeps = {
      apiKey: "test-key",
      region: "eastus",
      client,
      transcodeToWav,
    };

    const result = await scorePronunciation(baseInput(), deps);

    expect(result).toEqual({
      ok: true,
      score: {
        accuracyScore: 90,
        fluencyScore: 88,
        completenessScore: 92,
        pronunciationScore: 85,
        starBand: scoreToStarBand(85),
        referenceText: "I like apples.",
        wordScores: [
          { word: "I", accuracyScore: 95, errorType: "None" },
          { word: "like", accuracyScore: 90, errorType: "None" },
          { word: "apples", accuracyScore: 80, errorType: "Mispronunciation" },
        ],
      },
    });
    expect(transcodeToWav).toHaveBeenCalledTimes(1);
    expect(client).toHaveBeenCalledTimes(1);
  });

  it("maps missing API key before any transcode or recognizer call", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory(fakeAzureResult());
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(baseInput(), {
      apiKey: "",
      region: "eastus",
      client,
      transcodeToWav,
    });

    expect(result).toEqual({ ok: false, error: "missing_api_key" });
    expect(transcodeToWav).not.toHaveBeenCalled();
    expect(client).not.toHaveBeenCalled();
  });

  it("maps a transcode failure and never calls the recognizer", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory(fakeAzureResult());
    const transcodeToWav = createFakeTranscode({ ok: false, error: "transcode_failed" });

    const result = await scorePronunciation(baseInput(), {
      apiKey: "test-key",
      region: "eastus",
      client,
      transcodeToWav,
    });

    expect(result).toEqual({ ok: false, error: "transcode_failed" });
    expect(client).not.toHaveBeenCalled();
  });

  it("maps provider failures without exposing provider details", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = vi.fn(async () => {
      throw new Error("provider unavailable");
    }) as unknown as PronunciationRecognizerFactory;
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(baseInput(), {
      apiKey: "test-key",
      region: "eastus",
      client,
      transcodeToWav,
    });

    expect(result).toEqual({ ok: false, error: "provider_failed" });
  });

  it("rejects audio longer than 30 seconds before any transcode or recognizer call", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory(fakeAzureResult());
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(
      { ...baseInput(), durationMs: 30_001 },
      { apiKey: "test-key", region: "eastus", client, transcodeToWav },
    );

    expect(result).toEqual({ ok: false, error: "audio_too_long" });
    expect(transcodeToWav).not.toHaveBeenCalled();
    expect(client).not.toHaveBeenCalled();
  });

  it("carries the raw score only inside the internal detail, deriving starBand rather than passing a raw score through", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");
    const { scoreToStarBand } = await import("@/domain/pronunciation/scoring");

    const azureResult = fakeAzureResult({ pronunciationScore: 40 });
    const client = createFakeRecognizerFactory(azureResult);
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(baseInput(), {
      apiKey: "test-key",
      region: "eastus",
      client,
      transcodeToWav,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score.starBand).toBe(scoreToStarBand(40));
      expect(result.score.starBand).not.toBe(result.score.pronunciationScore);
      expect([1, 2, 3]).toContain(result.score.starBand);
    }
  });
});
