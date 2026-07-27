"use client";

import { useEffect, useState } from "react";
import { buildWaveformBars } from "@/domain/audio/waveform";

type LiveRecorderWaveformProps = {
  stream: MediaStream | null;
  active: boolean;
};

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const WIDTH = 180;
const HEIGHT = 32;
const BAR_COUNT = 13;
const BAR_WIDTH = 6;
const BAR_GAP = 4;
const BAR_RADIUS = BAR_WIDTH / 2;
const SENSITIVITY = 1.6;
const FLAT_BARS = buildWaveformBars(null, {
  height: HEIGHT,
  bars: BAR_COUNT,
});

export function LiveRecorderWaveform({
  stream,
  active,
}: LiveRecorderWaveformProps) {
  const [bars, setBars] = useState(FLAT_BARS);

  useEffect(() => {
    if (!active || !stream || typeof window === "undefined") {
      setBars(FLAT_BARS);
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (!AudioContextCtor) {
      setBars(FLAT_BARS);
      return;
    }

    let frameId: number | null = null;
    let cancelled = false;
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    function tick() {
      analyser.getByteTimeDomainData(samples);
      setBars(
        buildWaveformBars(samples, {
          height: HEIGHT,
          bars: BAR_COUNT,
          sensitivity: SENSITIVITY,
        }),
      );
      if (!cancelled) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
      setBars(FLAT_BARS);
    };
  }, [active, stream]);

  const totalBarsWidth = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP;
  const startX = (WIDTH - totalBarsWidth) / 2;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      style={{
        display: "block",
        width: "min(180px, 100%)",
        height: HEIGHT,
      }}
    >
      {bars.map((barHeight, index) => (
        <rect
          key={index}
          x={startX + index * (BAR_WIDTH + BAR_GAP)}
          y={(HEIGHT - barHeight) / 2}
          width={BAR_WIDTH}
          height={barHeight}
          rx={BAR_RADIUS}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
