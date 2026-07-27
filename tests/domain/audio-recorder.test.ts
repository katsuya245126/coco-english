import { describe, expect, it } from "vitest";
import {
  AUDIO_MIME_CANDIDATES,
  MAX_RECORDING_MS,
  canUseBrowserRecorder,
  getSupportedAudioMimeType,
} from "@/domain/audio/recorder";
import {
  buildWaveformBars,
  isMeaningfulWaveform,
} from "@/domain/audio/waveform";

describe("browser audio recorder helpers", () => {
  it("prefers the first supported audio MIME candidate", () => {
    const mediaRecorderCtor = {
      isTypeSupported: (mimeType: string) => mimeType === "audio/webm",
    };

    expect(getSupportedAudioMimeType(mediaRecorderCtor)).toBe("audio/webm");
  });

  it("falls back to the browser default when support probing is unavailable", () => {
    expect(getSupportedAudioMimeType({})).toBe("");
  });

  it("exposes the 60 second per-turn recording cap", () => {
    expect(MAX_RECORDING_MS).toBe(60000);
    expect(AUDIO_MIME_CANDIDATES).toEqual([
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ]);
  });

  it("renders quiet time-domain samples as flat rounded waveform bars", () => {
    const samples = new Uint8Array(32).fill(128);

    expect(isMeaningfulWaveform(samples)).toBe(false);
    expect(buildWaveformBars(samples, { height: 32, bars: 8 })).toEqual(
      new Array(8).fill(2),
    );
  });

  it("renders voiced time-domain samples as varying waveform bar heights", () => {
    const samples = new Uint8Array([
      128, 132, 148, 176, 145, 118, 96, 82, 112, 128, 142, 170, 156, 130, 104,
      88,
    ]);

    expect(isMeaningfulWaveform(samples)).toBe(true);
    expect(buildWaveformBars(samples, { height: 32, bars: 8 })).toEqual([
      2, 16, 14, 18, 14, 14, 18, 20,
    ]);
  });

  it("makes moderate microphone input visibly taller than the quiet baseline", () => {
    const samples = new Uint8Array([
      128, 130, 132, 134, 136, 138, 140, 142,
      128, 126, 124, 122, 120, 118, 116, 114,
    ]);

    expect(isMeaningfulWaveform(samples)).toBe(true);
    expect(
      Math.max(...buildWaveformBars(samples, { height: 32, bars: 8 })),
    ).toBeGreaterThanOrEqual(14);
  });

  it("lets recorder sensitivity make the same input more visible", () => {
    const samples = new Uint8Array([128, 132, 136, 140, 128, 124, 120, 116]);

    const normalBars = buildWaveformBars(samples, {
      height: 32,
      bars: 8,
      sensitivity: 1,
    });
    const sensitiveBars = buildWaveformBars(samples, {
      height: 32,
      bars: 8,
      sensitivity: 1.6,
    });

    expect(Math.max(...sensitiveBars)).toBeGreaterThan(Math.max(...normalBars));
  });

  it("falls back to flat bars when waveform samples are missing", () => {
    expect(isMeaningfulWaveform(null)).toBe(false);
    expect(buildWaveformBars(null, { height: 32, bars: 8 })).toEqual(
      new Array(8).fill(2),
    );
  });

  it("detects unsupported browser recorder scopes", () => {
    const mediaRecorderCtor = {
      isTypeSupported: () => true,
    };

    expect(
      canUseBrowserRecorder({
        navigator: {
          mediaDevices: {
            getUserMedia: async () => new MediaStream(),
          },
        },
        MediaRecorder: mediaRecorderCtor,
      }),
    ).toBe(true);

    expect(
      canUseBrowserRecorder({
        navigator: {
          mediaDevices: {},
        },
        MediaRecorder: mediaRecorderCtor,
      }),
    ).toBe(false);

    expect(
      canUseBrowserRecorder({
        navigator: {
          mediaDevices: {
            getUserMedia: async () => new MediaStream(),
          },
        },
        MediaRecorder: undefined,
      }),
    ).toBe(false);
  });
});
