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
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const audio = attempt.audio;
  const audioAvailable = audio?.playback === "available";

  async function handleToggle() {
    if (pending || !audioAvailable || !audio) {
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    if (signedUrl) {
      setLoadFailed(false);
      setExpanded(true);
      return;
    }

    setPending(true);
    setLoadFailed(false);
    const result = await loadHistoryAudioAction(audio.id);
    setPending(false);

    if (!result.ok) {
      setLoadFailed(true);
      return;
    }

    setSignedUrl(result.signedUrl);
    setExpanded(true);
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
                ? "Loading recording"
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
              {pending ? "Loading recording" : expanded ? "Hide recording" : "Listen to recording"}
            </span>
          </button>
        ) : null}
      </div>

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
