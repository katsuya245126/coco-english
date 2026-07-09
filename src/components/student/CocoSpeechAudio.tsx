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
  /** MASCOT-02: fired on each analyser tick while playing; omit to opt out. */
  onAmplitudeFrame?: (level: number) => void;
  /** MASCOT-02: fired on playing-state transitions (drives idle<->speaking). */
  onPlayingChange?: (playing: boolean) => void;
};

type PlaybackState = "loading" | "ready" | "playing" | "error";

type TtsRouteResult =
  | { ok: true; audioUrl: string; mimeType?: string }
  | { ok: false; error?: string };

let sharedAudioContext: AudioContext | null = null;
const sourceNodeCache = new WeakMap<
  HTMLMediaElement,
  MediaElementAudioSourceNode
>();
const analyserNodeCache = new WeakMap<HTMLMediaElement, AnalyserNode>();

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

async function resumeAudioContext() {
  const ctx = sharedAudioContext;
  if (ctx?.state === "suspended") {
    await ctx.resume().catch(() => {
      // Speech playback remains usable even if analyser data is unavailable.
    });
  }
}

function attachAnalyser(el: HTMLMediaElement): AnalyserNode {
  const cachedAnalyser = analyserNodeCache.get(el);
  if (cachedAnalyser) return cachedAnalyser;

  const ctx = getAudioContext();
  let source = sourceNodeCache.get(el);
  if (!source) {
    source = ctx.createMediaElementSource(el);
    sourceNodeCache.set(el, source);
    source.connect(ctx.destination);
  }

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  analyserNodeCache.set(el, analyser);
  return analyser;
}

function readAmplitude(
  analyser: AnalyserNode,
  data: Uint8Array<ArrayBuffer>,
): number {
  analyser.getByteFrequencyData(data);
  const total = data.reduce((sum, value) => sum + value, 0);
  return total / data.length / 255;
}

export function CocoSpeechAudio({
  assignmentStudentId,
  line,
  label = "Play Coco",
  onAmplitudeFrame,
  onPlayingChange,
}: CocoSpeechAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const amplitudeFrameRef = useRef<number | null>(null);
  const autoplayedUrlRef = useRef<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [state, setState] = useState<PlaybackState>("loading");

  function ensureAnalyserReady() {
    if (!onAmplitudeFrame) return;
    const el = audioRef.current;
    if (!el) return;

    try {
      const analyser = attachAnalyser(el);
      analyserRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      analyserRef.current = null;
      frequencyDataRef.current = null;
    }
  }

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

        // The signed URL is resolved, but the audio file itself still has to
        // download/buffer before it can play. Stay in "loading" so the speaker
        // button doesn't look ready-to-tap before sound is actually possible —
        // the <audio> element's onCanPlay handler promotes it to "ready" once
        // playback is genuinely possible (T-08 low-end-device UX, D-02/D-03).
        setAudioUrl(payload.audioUrl);
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

  useEffect(() => {
    if (state !== "playing" || !onAmplitudeFrame) return;
    const emitAmplitudeFrame = onAmplitudeFrame;

    function tick() {
      const analyser = analyserRef.current;
      const data = frequencyDataRef.current;
      if (analyser && data) {
        emitAmplitudeFrame(readAmplitude(analyser, data));
      }
      amplitudeFrameRef.current = requestAnimationFrame(tick);
    }

    amplitudeFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (amplitudeFrameRef.current !== null) {
        cancelAnimationFrame(amplitudeFrameRef.current);
        amplitudeFrameRef.current = null;
      }
    };
  }, [state, onAmplitudeFrame]);

  // Opportunistic autoplay (D-01) is attempted from the <audio> element's
  // onCanPlay handler (see below) rather than a ref-timing-dependent effect:
  // the element renders conditionally on audioUrl, so audioRef.current can still
  // be null in an effect that runs in the same commit. Driving autoplay off
  // canplay guarantees the element exists AND is buffered enough to play.
  function handleCanPlay() {
    // Promote to "ready" unless already playing (canplay can re-fire after a
    // buffer refill mid-playback).
    setState((prev) => (prev === "playing" ? prev : "ready"));

    if (!audioUrl) return;
    if (autoplayedUrlRef.current === audioUrl) return;
    const el = audioRef.current;
    if (!el) return;

    autoplayedUrlRef.current = audioUrl;
    // Do NOT attach the analyser or touch the AudioContext here. Autoplay is
    // not a user gesture, so AudioContext.resume() cannot reliably unlock —
    // creating/routing the context at this point leaves it permanently
    // suspended and silently mutes the <audio> element for its whole
    // lifetime once createMediaElementSource has captured it (that routing
    // can't be undone). Only attach once a real gesture (handleReplay) has
    // already unlocked the shared context — see the "running" guard on
    // onPlay/onPlaying below.
    el.play().catch(() => {
      // Autoplay blocked — remain ready so the student can tap replay (D-02).
      setState((prev) => (prev === "playing" ? prev : "ready"));
    });
  }

  async function handleReplay() {
    const el = audioRef.current;
    if (!el) return;
    ensureAnalyserReady();
    await resumeAudioContext();
    el.currentTime = 0;
    el.play().catch(() => {
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
        <SpeakerIcon state={state} />
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
          // Promote to "ready" only once the browser can actually play the
          // buffered audio — not merely when the signed URL was fetched. This
          // stops the speaker button from looking tappable before sound is
          // possible. Guard against clobbering the active "playing" state, since
          // canplay can fire again after buffering during playback.
          onCanPlay={handleCanPlay}
          // Mid-stream buffer starvation (common on low-end devices / slow
          // networks): drop back to a loading affordance until playback resumes.
          onWaiting={() => setState((prev) => (prev === "error" ? prev : "loading"))}
          onPlaying={() => {
            if (sharedAudioContext?.state === "running") {
              ensureAnalyserReady();
            }
            setState("playing");
            onPlayingChange?.(true);
          }}
          onPlay={() => {
            if (sharedAudioContext?.state === "running") {
              ensureAnalyserReady();
            }
            setState("playing");
            onPlayingChange?.(true);
          }}
          onEnded={() => {
            setState("ready");
            onPlayingChange?.(false);
          }}
          onError={() => {
            setState("error");
            onPlayingChange?.(false);
          }}
          style={hiddenAudioStyle}
        >
          Your browser does not support audio playback.
        </audio>
      ) : null}
    </span>
  );
}

function SpeakerIcon({ state }: { state: PlaybackState }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  if (state === "loading") {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    );
  }

  const speaker = <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />;

  if (state === "error") {
    return (
      <svg {...common}>
        {speaker}
        <line x1="16" y1="9" x2="22" y2="15" />
        <line x1="22" y1="9" x2="16" y2="15" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      {speaker}
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M18.36 5.64a9 9 0 0 1 0 12.73" />
    </svg>
  );
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
