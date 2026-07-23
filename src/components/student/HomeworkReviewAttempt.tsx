"use client";

import { useState } from "react";
import { loadHistoryAudioAction } from "@/app/student/history/[assignmentStudentId]/actions";
import type { StudentRecapAttempt } from "@/server/student-access/student-history";
import { CompactAudioPlayer } from "./CompactAudioPlayer";
import styles from "./HomeworkReviewAttempt.module.css";

function ListenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.7 6.7a1 1 0 0 1 1.4 0L12 10.6l3.9-3.9a1 1 0 1 1 1.4 1.4L13.4 12l3.9 3.9a1 1 0 0 1-1.4 1.4L12 13.4l-3.9 3.9a1 1 0 0 1-1.4-1.4l3.9-3.9-3.9-3.9a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

export function HomeworkReviewAttempt({
  attempt,
}: {
  attempt: StudentRecapAttempt;
}) {
  const audio = attempt.audio;
  const clipId = audio?.id ?? null;
  const audioAvailable = audio?.playback === "available";
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [pendingClipId, setPendingClipId] = useState<string | null>(null);
  const [signedAudio, setSignedAudio] = useState<{
    clipId: string;
    signedUrl: string;
  } | null>(null);
  const [failedClipId, setFailedClipId] = useState<string | null>(null);
  const expanded = clipId !== null && expandedClipId === clipId;
  const pending = clipId !== null && pendingClipId === clipId;
  const signedUrl =
    clipId !== null && signedAudio?.clipId === clipId ? signedAudio.signedUrl : null;
  const loadFailed = clipId !== null && failedClipId === clipId;

  async function handleToggle() {
    if (pending || !audioAvailable || !audio) {
      return;
    }

    if (expanded) {
      setExpandedClipId(null);
      return;
    }

    if (signedUrl) {
      setFailedClipId(null);
      setExpandedClipId(audio.id);
      return;
    }

    setPendingClipId(audio.id);
    setFailedClipId(null);

    try {
      const result = await loadHistoryAudioAction(audio.id);

      if (!result.ok) {
        setFailedClipId(audio.id);
        return;
      }

      setSignedAudio({ clipId: audio.id, signedUrl: result.signedUrl });
      setExpandedClipId(audio.id);
    } catch {
      setFailedClipId(audio.id);
    } finally {
      setPendingClipId((currentClipId) =>
        currentClipId === audio.id ? null : currentClipId,
      );
    }
  }

  return (
    <div className={styles.bubble}>
      <div className={styles.transcriptRow}>
        <p className={styles.transcript}>{attempt.transcript}</p>
        {audioAvailable ? (
          <button
            className={styles.audioButton}
            type="button"
            aria-label={
              pending
                ? "Preparing this recording"
                : expanded
                  ? "Hide this recording"
                  : "Listen to this recording"
            }
            aria-expanded={expanded}
            disabled={pending}
            onClick={() => {
              void handleToggle();
            }}
          >
            <span className={styles.icon} aria-hidden="true">
              {expanded ? <CloseIcon /> : <ListenIcon />}
            </span>
            <span className={styles.srOnly}>
              {pending
                ? "Preparing this recording"
                : expanded
                  ? "Hide recording"
                  : "Listen to recording"}
            </span>
          </button>
        ) : null}
      </div>

      {pending ? (
        <p className={styles.feedback} role="status" aria-live="polite">
          Preparing recording…
        </p>
      ) : null}

      {expanded && signedUrl ? (
        <div className={styles.player}>
          <CompactAudioPlayer src={signedUrl} />
        </div>
      ) : null}

      {loadFailed ? (
        <p className={styles.feedback} role="alert">
          Recording unavailable
        </p>
      ) : null}

      {audio?.playback === "expired" ? (
        <p className={styles.feedback}>Recording expired</p>
      ) : null}

      {audio?.playback === "unavailable" ? (
        <p className={styles.feedback}>Recording unavailable</p>
      ) : null}
    </div>
  );
}
