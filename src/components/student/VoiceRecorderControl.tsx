"use client";

import { useEffect, useRef, useState } from "react";
import {
  canUseBrowserRecorder,
  getSupportedAudioMimeType,
  MAX_RECORDING_MS,
} from "@/domain/audio/recorder";
import {
  primaryButtonStyle,
  recorderErrorStyle,
  recorderPanelStyle,
  recorderProcessingStyle,
  recorderRecordingStyle,
  recorderSuccessStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";

export type VoiceRecordingMetadata = {
  mimeType: string;
  durationMs: number;
};

type RecorderMode = "original" | "repeat";
type RecorderState =
  | "ready"
  | "waiting-permission"
  | "recording"
  | "processing"
  | "unsupported"
  | "permission-denied"
  | "failure"
  | "success";

type VoiceRecorderControlProps = {
  mode: RecorderMode;
  disabled?: boolean;
  maxSeconds?: number;
  onRecorded: (
    blob: Blob,
    metadata: VoiceRecordingMetadata,
  ) => void | Promise<void>;
};

const readyCopy: Record<RecorderMode, string> = {
  original: "Tap record and answer Coco.",
  repeat: "Tap record and repeat the sentence.",
};

export function VoiceRecorderControl({
  mode,
  disabled = false,
  maxSeconds,
  onRecorded,
}: VoiceRecorderControlProps) {
  const [state, setState] = useState<RecorderState>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(maxSeconds ?? 0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (
      !canUseBrowserRecorder({
        navigator: window.navigator,
        MediaRecorder: window.MediaRecorder,
      })
    ) {
      setState("unsupported");
    }

    return () => {
      clearStopTimer();
      clearCountdown();
      stopStream();
    };
  }, []);

  const isProcessing = disabled || state === "processing";
  const isError =
    state === "unsupported" ||
    state === "permission-denied" ||
    state === "failure";

  async function startRecording() {
    if (disabled || state === "unsupported") return;

    setErrorMessage(null);
    setState("waiting-permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType(window.MediaRecorder);
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        void handleRecorderStop(recorder.mimeType || mimeType);
      };

      recorder.onerror = () => {
        clearStopTimer();
        stopStream();
        setErrorMessage("We could not save that recording. Try again.");
        setState("failure");
      };

      recorder.start();
      setState("recording");

      const limitMs = maxSeconds ? maxSeconds * 1000 : MAX_RECORDING_MS;
      setSecondsLeft(maxSeconds ?? 0);
      stopTimerRef.current = setTimeout(() => {
        stopRecording();
      }, limitMs);

      if (maxSeconds) {
        let remaining = maxSeconds;
        countdownRef.current = setInterval(() => {
          remaining -= 1;
          setSecondsLeft(remaining);
          if (remaining <= 0) clearCountdown();
        }, 1000);
      }
    } catch (error) {
      stopStream();
      const isPermissionError =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      if (isPermissionError) {
        setErrorMessage(
          "Ask a grown-up to turn on the mic, then record again.",
        );
        setState("permission-denied");
      } else {
        setErrorMessage("We could not save that recording. Try again.");
        setState("failure");
      }
    }
  }

  function stopRecording() {
    clearStopTimer();
    clearCountdown();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function handleRecorderStop(mimeType: string) {
    const durationMs = Math.min(Date.now() - startedAtRef.current, MAX_RECORDING_MS);
    const blob = new Blob(chunksRef.current, {
      type: mimeType,
    });

    stopStream();
    setState("processing");

    try {
      await onRecorded(blob, {
        mimeType,
        durationMs,
      });
      setState("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "We could not save that recording. Try again.",
      );
      setState("failure");
    }
  }

  function clearStopTimer() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  function panelStyleForState() {
    if (state === "recording") return recorderRecordingStyle;
    if (isProcessing) return recorderProcessingStyle;
    if (state === "success") return recorderSuccessStyle;
    if (isError) return recorderErrorStyle;
    return recorderPanelStyle;
  }

  function statusText() {
    if (state === "unsupported") {
      return "Recording does not work in this browser. Try another browser or ask your teacher.";
    }
    if (state === "permission-denied") {
      return (
        errorMessage ??
        "Ask a grown-up to turn on the mic, then record again."
      );
    }
    if (state === "failure") {
      return errorMessage ?? "We could not save that recording. Try again.";
    }
    if (state === "waiting-permission") {
      return "Waiting for microphone permission...";
    }
    if (state === "recording") {
      return maxSeconds ? `Recording... ${secondsLeft}s left` : "Recording...";
    }
    if (isProcessing) {
      return "Listening to your answer...";
    }
    if (state === "success") {
      return "Listening to your answer...";
    }
    return readyCopy[mode];
  }

  function actionLabel() {
    if (state === "recording") return "Stop recording";
    if (isError) return "Record again";
    if (state === "success") {
      return mode === "original" ? "See the better sentence" : "Continue";
    }
    return "Start recording";
  }

  function handleAction() {
    if (state === "recording") {
      stopRecording();
      return;
    }
    if (state === "success" || isProcessing || state === "waiting-permission") {
      return;
    }
    void startRecording();
  }

  return (
    <div style={panelStyleForState()}>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.4,
          color: "#4B5563",
          margin: "0 0 8px",
        }}
      >
        {state === "waiting-permission"
          ? "Your browser will ask to use the microphone."
          : mode === "original"
            ? "Your answer"
            : "Your repeat"}
      </p>

      <p
        aria-live="polite"
        role={isError ? "alert" : undefined}
        style={{
          fontSize: 16,
          lineHeight: 1.5,
          color: isError ? "#B42318" : "#111827",
          margin: "0 0 16px",
        }}
      >
        {statusText()}
      </p>

      {state === "recording" && maxSeconds && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, borderRadius: 3, background: "#E5E7EB", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: secondsLeft <= 5 ? "#EF4444" : "#2563EB",
                width: `${(secondsLeft / maxSeconds) * 100}%`,
                transition: "width 1s linear, background 0.3s",
              }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        style={{
          ...(state === "recording" || isError
            ? secondaryButtonStyle
            : primaryButtonStyle),
          opacity: disabled || state === "waiting-permission" ? 0.7 : 1,
          cursor:
            disabled || state === "waiting-permission" || state === "success"
              ? "not-allowed"
              : "pointer",
        }}
        onClick={handleAction}
        disabled={disabled || state === "waiting-permission" || state === "success"}
      >
        {isProcessing ? "Saving your voice..." : actionLabel()}
      </button>
    </div>
  );
}
