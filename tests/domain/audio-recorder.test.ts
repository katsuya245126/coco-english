import { describe, expect, it } from "vitest";
import {
  AUDIO_MIME_CANDIDATES,
  MAX_RECORDING_MS,
  canUseBrowserRecorder,
  getSupportedAudioMimeType,
} from "@/domain/audio/recorder";

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

  it("exposes the 20 second per-turn recording cap", () => {
    expect(MAX_RECORDING_MS).toBe(20000);
    expect(AUDIO_MIME_CANDIDATES).toEqual([
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ]);
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
