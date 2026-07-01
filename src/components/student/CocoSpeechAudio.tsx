"use client";

/**
 * Inline Coco speech playback / replay control (VOICE-02, VOICE-04, D-01..D-15).
 *
 * Wired next to a visible Coco line (mission prompt, improved/model sentence,
 * transition, feedback, completion). On mount / descriptor change it fetches the
 * student-gated TTS route with a *line descriptor* only — never spoken text and
 * never a content hash (D-10, T-08-03) — assigns the returned signed URL to a
 * standard <audio> element, and opportunistically attempts autoplay (D-01). A
 * rejected `play()` promise (blocked autoplay) is caught and left in a ready
 * replay state (D-02), so the icon-only speaker button stays usable.
 *
 * This component NEVER renders the line's text — the parent card owns text so
 * that a route/audio failure degrades the speaker control only and never hides
 * the line or blocks the homework loop (D-03, D-06, D-15, T-08-06). It imports
 * ONLY domain types and calls the app route; no OpenAI / Supabase service /
 * server-audio import ever crosses this boundary (T-08-01, T-08-07).
 */

import { useEffect, useRef, useState } from "react";
import type { VoiceEligibleLineKind } from "@/domain/audio/tts";

/**
 * The bounded line descriptor a student browser may send. Mirrors the route's
 * request schema: which visible Coco line to speak, never arbitrary text.
 */
export type CocoSpeechLine = {
  lineKind: VoiceEligibleLineKind;
  turnOrder?: number;
  feedbackVariant?: string;
  characterId?: string;
};

type CocoSpeechAudioProps = {
  assignmentStudentId: string;
  line: CocoSpeechLine;
  /** Accessible label for the icon-only replay control. */
  label?: string;
};

type PlaybackState = "loading" | "ready" | "playing" | "error";

type TtsRouteResult =
  | { ok: true; audioUrl: string; mimeType?: string }
  | { ok: false; error?: string };

export function CocoSpeechAudio({
  assignmentStudentId,
  line,
  label = "Play Coco",
}: CocoSpeechAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [state, setState] = useState<PlaybackState>("loading");

  // Fetch the signed URL and attempt opportunistic autoplay whenever the
  // descriptor changes. A blocked autoplay leaves the control in a ready state.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setState("loading");
    setAudioUrl(null);

    async function loadLine() {
      try {
        const response = await fetch(
          `/student/missions/${assignmentStudentId}/tts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lineKind: line.lineKind,
              ...(line.turnOrder ? { turnOrder: line.turnOrder } : {}),
              ...(line.feedbackVariant
                ? { feedbackVariant: line.feedbackVariant }
                : {}),
              ...(line.characterId ? { characterId: line.characterId } : {}),
            }),
            signal: controller.signal,
          },
        );

        const payload = (await response
          .json()
          .catch(() => null)) as TtsRouteResult | null;

        if (cancelled) return;

        if (!response.ok || !payload || payload.ok !== true) {
          setState("error");
          return;
        }

        setAudioUrl(payload.audioUrl);
        setState("ready");
      } catch {
        // Aborted fetch (descriptor change/unmount) or network failure — the
        // speaker control degrades to an error affordance, text is untouched.
        if (!cancelled) setState("error");
      }
    }

    loadLine();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    assignmentStudentId,
    line.lineKind,
    line.turnOrder,
    line.feedbackVariant,
    line.characterId,
  ]);

  // Opportunistic autoplay (D-01). A rejected play() promise (blocked autoplay)
  // is caught so it never surfaces as an unhandled rejection (D-02, D-03).
  useEffect(() => {
    if (state !== "ready" || !audioUrl) return;
    const el = audioRef.current;
    if (!el) return;

    el.play()
      .then(() => {
        setState("playing");
      })
      .catch(() => {
        // Autoplay blocked — remain ready so the student can tap replay.
        setState("ready");
      });
  }, [state, audioUrl]);

  function handleReplay() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play()
      .then(() => {
        setState("playing");
      })
      .catch(() => {
        setState("error");
      });
  }

  const isError = state === "error";
  const isLoading = state === "loading";
  const isPlaying = state === "playing";

  return (
    <span style={containerStyle}>
      <button
        type="button"
        aria-label="Play Coco"
        title={label}
        onClick={handleReplay}
        disabled={isLoading || isError || !audioUrl}
        aria-busy={isLoading}
        style={{
          ...buttonStyle,
          ...(isError ? errorButtonStyle : null),
          ...(isPlaying ? playingButtonStyle : null),
        }}
      >
        <span aria-hidden="true">{iconForState(state)}</span>
      </button>

      {isError ? (
        <span role="status" style={errorTextStyle}>
          Voice unavailable
        </span>
      ) : null}

      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onEnded={() => setState("ready")}
          onError={() => setState("error")}
          style={hiddenAudioStyle}
        >
          Your browser does not support audio playback.
        </audio>
      ) : null}
    </span>
  );
}

function iconForState(state: PlaybackState): string {
  switch (state) {
    case "loading":
      return "…";
    case "playing":
      return "🔊";
    case "error":
      return "🔇";
    case "ready":
    default:
      return "🔈";
  }
}

const containerStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  verticalAlign: "middle",
};

const buttonStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: "1px solid #2563EB",
  borderRadius: 8,
  background: "#EFF4FF",
  color: "#2563EB",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};

const playingButtonStyle: React.CSSProperties = {
  background: "#2563EB",
  color: "#FFFFFF",
};

const errorButtonStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  background: "#F3F4F6",
  color: "#9CA3AF",
  cursor: "not-allowed",
};

const errorTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9CA3AF",
};

const hiddenAudioStyle: React.CSSProperties = {
  display: "none",
};
