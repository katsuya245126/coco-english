import { describe, expect, it, vi } from "vitest";
import type {
  PronunciationRecognizerFactory,
  PronunciationScorerDeps,
} from "@/server/audio/pronunciation-scorer";
import type { TranscodeResult } from "@/server/audio/audio-transcode";

function createPcmWav(
  durationMs: number,
  dataChunkSize = Math.round((16_000 * durationMs) / 1_000) * 2,
) {
  const dataBytes = Math.round((16_000 * durationMs) / 1_000) * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataChunkSize, 40);
  return wav;
}

const FAKE_WAV = createPcmWav(4_000);

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

function fakeAzureResultWithCandidates() {
  return {
    ...fakeAzureResult(),
    words: [
      {
        word: "fan",
        accuracyScore: 35,
        errorType: "Mispronunciation",
        phonemes: [
          {
            phoneme: "f",
            accuracyScore: 35,
            candidates: [
              { phoneme: "p", score: 0.78 },
              { phoneme: "f", score: 0.22 },
            ],
          },
        ],
      },
    ],
  };
}

describe("scorePronunciation", () => {
  it("normalizes ranked phoneme candidates from injected recognizer output", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory(fakeAzureResultWithCandidates());
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(baseInput(), {
      apiKey: "test-key",
      region: "eastus",
      client,
      transcodeToWav,
    });

    expect(result).toMatchObject({
      ok: true,
      score: {
        wordScores: [
          {
            phonemes: [
              {
                phoneme: "f",
                accuracyScore: 35,
                candidates: [
                  { phoneme: "p", score: 0.78 },
                  { phoneme: "f", score: 0.22 },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(client).toHaveBeenCalledWith(
      expect.objectContaining({ includeCandidates: true }),
    );
  });

  it("accepts a phoneme with no optional candidate list", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory({
      ...fakeAzureResult(),
      words: [
        {
          word: "fan",
          accuracyScore: 35,
          errorType: "Mispronunciation",
          phonemes: [{ phoneme: "f", accuracyScore: 35 }],
        },
      ],
    });
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(baseInput(), {
      apiKey: "test-key",
      region: "eastus",
      client,
      transcodeToWav,
    });

    expect(result).toMatchObject({
      ok: true,
      score: {
        wordScores: [
          { phonemes: [{ phoneme: "f", accuracyScore: 35 }] },
        ],
      },
    });
  });

  it("fails safely when injected candidate evidence is malformed", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory({
      ...fakeAzureResult(),
      words: [
        {
          word: "fan",
          accuracyScore: 35,
          errorType: "Mispronunciation",
          phonemes: [
            {
              phoneme: "f",
              accuracyScore: 35,
              candidates: [{ phoneme: "p", score: "not-a-number" }],
            },
          ],
        },
      ],
    });
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(baseInput(), {
      apiKey: "test-key",
      region: "eastus",
      client,
      transcodeToWav,
    });

    expect(result).toEqual({ ok: false, error: "provider_failed" });
  });

  it("reports an Azure 429 or quota refusal as provider_limited", async () => {
    const { scorePronunciation, PronunciationProviderLimitError, isAzureLimitCancellation } =
      await import("@/server/audio/pronunciation-scorer");
    const sdk = await import("microsoft-cognitiveservices-speech-sdk");

    // What the SDK reports when the F0 resource throttles or runs out of free hours.
    expect(
      isAzureLimitCancellation(
        sdk.CancellationErrorCode.ConnectionFailure,
        "Unable to contact server. StatusCode: 429, undefined Reason: Too Many Requests",
      ),
    ).toBe(true);
    expect(isAzureLimitCancellation(sdk.CancellationErrorCode.TooManyRequests, "")).toBe(true);
    expect(isAzureLimitCancellation(sdk.CancellationErrorCode.Forbidden, "quota exceeded")).toBe(true);
    expect(
      isAzureLimitCancellation(
        sdk.CancellationErrorCode.ConnectionFailure,
        "Unable to contact server. StatusCode: 1006",
      ),
    ).toBe(false);

    const client = vi.fn(async () => {
      throw new PronunciationProviderLimitError("StatusCode: 429");
    }) as unknown as PronunciationRecognizerFactory;
    const result = await scorePronunciation(baseInput(), {
      apiKey: "test-key",
      region: "japaneast",
      client,
      transcodeToWav: createFakeTranscode({ ok: true, wav: FAKE_WAV }),
    });

    expect(result).toEqual({ ok: false, error: "provider_limited" });
  });

  it("uses actual transcoded WAV length when deciding candidate eligibility", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory(fakeAzureResultWithCandidates());
    const transcodeToWav = createFakeTranscode({
      ok: true,
      // The request says 4 seconds, but ffmpeg's pipe WAV contains >30 seconds.
      wav: createPcmWav(30_001, 0xffff_ffff),
    });

    const result = await scorePronunciation(
      baseInput(),
      { apiKey: "test-key", region: "eastus", client, transcodeToWav },
    );

    expect(result).toMatchObject({
      ok: true,
      score: {
        wordScores: [
          {
            phonemes: [{ phoneme: "f", accuracyScore: 35 }],
          },
        ],
      },
    });
    expect(client).toHaveBeenCalledWith(
      expect.objectContaining({ includeCandidates: false }),
    );
  });

  it("parses official-shaped NBestPhonemes JSON at the adapter boundary", async () => {
    const { parsePronunciationAssessmentJson } = await import(
      "@/server/audio/pronunciation-scorer"
    );

    expect(
      parsePronunciationAssessmentJson({
        NBest: [
          {
            Words: [
              {
                Word: "fan",
                PronunciationAssessment: {
                  AccuracyScore: 35,
                  ErrorType: "Mispronunciation",
                },
                Phonemes: [
                  {
                    Phoneme: "f",
                    PronunciationAssessment: {
                      AccuracyScore: 35,
                      NBestPhonemes: [
                        { Phoneme: "p", Score: 0.78 },
                        { Phoneme: "f", Score: 0.22 },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        word: "fan",
        accuracyScore: 35,
        errorType: "Mispronunciation",
        phonemes: [
          {
            phoneme: "f",
            accuracyScore: 35,
            candidates: [
              { phoneme: "p", score: 0.78 },
              { phoneme: "f", score: 0.22 },
            ],
          },
        ],
      },
    ]);
  });

  it("accepts official-shaped phonemes without optional candidates", async () => {
    const { parsePronunciationAssessmentJson } = await import(
      "@/server/audio/pronunciation-scorer"
    );

    expect(
      parsePronunciationAssessmentJson({
        NBest: [{
          Words: [{
            Word: "fan",
            PronunciationAssessment: { AccuracyScore: 35 },
            Phonemes: [{
              Phoneme: "f",
              PronunciationAssessment: { AccuracyScore: 35 },
            }],
          }],
        }],
      }),
    ).toMatchObject([{ phonemes: [{ phoneme: "f", accuracyScore: 35 }] }]);
  });

  it("rejects malformed official-shaped candidate evidence", async () => {
    const { parsePronunciationAssessmentJson } = await import(
      "@/server/audio/pronunciation-scorer"
    );

    expect(() => parsePronunciationAssessmentJson({
      NBest: [{
        Words: [{
          Word: "fan",
          PronunciationAssessment: { AccuracyScore: 35 },
          Phonemes: [{
            Phoneme: "f",
            PronunciationAssessment: {
              AccuracyScore: 35,
              NBestPhonemes: [{ Phoneme: "p", Score: "not-a-number" }],
            },
          }],
        }],
      }],
    })).toThrow();
  });

  it("resolves a derived star band from an injected fake recognizer and transcode", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");
    const { computeBandScore, scoreToStarBand } = await import("@/domain/pronunciation/scoring");

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
        // Band derives from the accuracy/fluency blend, not the raw Azure score.
        starBand: scoreToStarBand(computeBandScore(90, 88)),
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

  it("rejects audio longer than 60 seconds before any transcode or recognizer call", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");

    const client = createFakeRecognizerFactory(fakeAzureResult());
    const transcodeToWav = createFakeTranscode({ ok: true, wav: FAKE_WAV });

    const result = await scorePronunciation(
      { ...baseInput(), durationMs: 60_001 },
      { apiKey: "test-key", region: "eastus", client, transcodeToWav },
    );

    expect(result).toEqual({ ok: false, error: "audio_too_long" });
    expect(transcodeToWav).not.toHaveBeenCalled();
    expect(client).not.toHaveBeenCalled();
  });

  it("bands off the accuracy/fluency blend so a well-pronounced but halting read is not sunk to 1 star", async () => {
    const { scorePronunciation } = await import("@/server/audio/pronunciation-scorer");
    const { computeBandScore, scoreToStarBand } = await import("@/domain/pronunciation/scoring");

    // Real over-penalization case from D-04 calibration (student 2 - sample 3):
    // accuracy 85, fluency 40 -> Azure blended score 40 -> would be 1 star,
    // but the 60/40 accuracy-led blend lifts it to a 2-star band.
    const azureResult = fakeAzureResult({
      accuracyScore: 85,
      fluencyScore: 40,
      pronunciationScore: 40,
    });
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
      expect(result.score.starBand).toBe(scoreToStarBand(computeBandScore(85, 40)));
      // Blend bands strictly higher than the raw Azure score alone would.
      expect(result.score.starBand).toBeGreaterThan(scoreToStarBand(40));
      expect(result.score.starBand).toBe(2);
      // Raw score is still carried through as diagnostic detail, untouched.
      expect(result.score.pronunciationScore).toBe(40);
    }
  });
});
