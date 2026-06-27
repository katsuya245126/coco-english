export const MAX_RECORDING_MS = 20000;

export const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

type MediaRecorderProbe = {
  isTypeSupported?: (mimeType: string) => boolean;
};

type RecorderScope = {
  navigator?: {
    mediaDevices?: {
      getUserMedia?: unknown;
    };
  };
  MediaRecorder?: unknown;
};

export function getSupportedAudioMimeType(
  mediaRecorderCtor: MediaRecorderProbe | undefined,
): string {
  if (typeof mediaRecorderCtor?.isTypeSupported !== "function") {
    return "";
  }

  return (
    AUDIO_MIME_CANDIDATES.find((mimeType) =>
      mediaRecorderCtor.isTypeSupported?.(mimeType),
    ) ?? ""
  );
}

export function canUseBrowserRecorder(scope: RecorderScope): boolean {
  return (
    typeof scope.navigator?.mediaDevices?.getUserMedia === "function" &&
    typeof scope.MediaRecorder !== "undefined"
  );
}
