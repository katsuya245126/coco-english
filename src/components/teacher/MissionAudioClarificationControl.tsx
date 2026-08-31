"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clarifyMissionAudioAction } from "@/app/teacher/evidence/[attemptId]/actions";
import { MAX_PRONUNCIATION_REFERENCE_CHARS } from "@/domain/pronunciation/scoring";

type MissionAudioClarificationControlProps = {
  audioClipId: string;
  attemptId: string;
  automaticTranscript: string | null;
  teacherConfirmedText: string | null;
  teacherConfirmedAt: string | null;
  clarificationAvailable: boolean;
};

export function MissionAudioClarificationControl({
  audioClipId,
  attemptId,
  automaticTranscript,
  teacherConfirmedText,
  teacherConfirmedAt,
  clarificationAvailable,
}: MissionAudioClarificationControlProps) {
  const [confirmedText, setConfirmedText] = useState(
    teacherConfirmedText ?? automaticTranscript ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!clarificationAvailable) {
    if (!teacherConfirmedText) return null;
    return (
      <div style={containerStyle}>
        <p style={labelStyle}>Teacher-confirmed wording</p>
        <p style={textStyle}>{teacherConfirmedText}</p>
        <ConfirmationMetadata
          confirmedAt={teacherConfirmedAt}
        />
      </div>
    );
  }

  function save() {
    const wording = confirmedText.trim();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await clarifyMissionAudioAction({
        audioClipId,
        attemptId,
        teacherConfirmedText: wording,
      });
      if (result.ok) {
        setConfirmedText(wording);
        setMessage("Teacher confirmation saved.");
        router.refresh();
        return;
      }
      setError(result.message);
    });
  }

  return (
    <div style={containerStyle}>
      <label>
        <span style={labelStyle}>What was the student trying to say?</span>
        <textarea
          aria-label="What was the student trying to say?"
          value={confirmedText}
          onChange={(event) => setConfirmedText(event.currentTarget.value)}
          maxLength={MAX_PRONUNCIATION_REFERENCE_CHARS}
          rows={2}
          style={textareaStyle}
          disabled={isPending}
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        style={buttonStyle}
      >
        {isPending ? "Saving clarification…" : "Save clarification"}
      </button>
      {teacherConfirmedAt ? (
        <ConfirmationMetadata confirmedAt={teacherConfirmedAt} />
      ) : null}
      {message ? (
        <p role="status" style={successStyle}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ConfirmationMetadata({
  confirmedAt,
}: {
  confirmedAt: string | null;
}) {
  if (!confirmedAt) return null;
  return (
    <p style={metadataStyle}>
      Confirmed by teacher{confirmedAt ? ` on ${formatDate(confirmedAt)}` : ""}.
    </p>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const containerStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 12,
  padding: 12,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 600,
  color: "#4B5563",
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  color: "#111827",
};

const textareaStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 8,
  border: "1px solid #9CA3AF",
  borderRadius: 6,
  font: "inherit",
  lineHeight: 1.4,
};

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  width: "fit-content",
  padding: "8px 14px",
  border: "1px solid #2563EB",
  borderRadius: 6,
  background: "#2563EB",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const metadataStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#065F46",
};

const successStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#065F46",
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#B42318",
};
