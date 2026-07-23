"use client";

import { useRef, useState } from "react";
import styles from "./CompactAudioPlayer.module.css";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
    </svg>
  );
}

export function CompactAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing) {
      await audio.play();
      setPlaying(true);
      return;
    }
    audio.pause();
    setPlaying(false);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div className={styles.player}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      >
        Audio unavailable
      </audio>
      <button
        className={styles.playButton}
        type="button"
        aria-label={playing ? "Pause recording" : "Play recording"}
        onClick={() => {
          void togglePlayback();
        }}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className={styles.time} aria-live="off">
        {formatTime(currentTime)}
      </span>
      <input
        className={styles.progress}
        type="range"
        aria-label="Recording position"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        disabled={!duration}
        onChange={(event) => seek(Number(event.currentTarget.value))}
      />
      <span className={styles.time}>{formatTime(duration)}</span>
    </div>
  );
}
