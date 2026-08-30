"use client";

import type { FormEvent, ReactNode } from "react";
import { useState, useTransition } from "react";
import {
  loadPronunciationSampleAudioUrlAction,
  uploadPronunciationSampleAction,
} from "@/app/teacher/students/[id]/actions";
import type { PronunciationSample } from "@/server/teacher/pronunciation-samples";

type Tab = "sounds" | "samples";

type PronunciationSamplesPanelProps = {
  studentId: string;
  samples: PronunciationSample[];
  children?: ReactNode;
};

export function PronunciationSamplesPanel({
  studentId,
  samples,
  children,
}: PronunciationSamplesPanelProps) {
  const [tab, setTab] = useState<Tab>("sounds");

  return (
    <div>
      <div role="tablist" aria-label="Student pronunciation">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sounds"}
          onClick={() => setTab("sounds")}
          style={tabStyle(tab === "sounds")}
        >
          Sounds to work on
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "samples"}
          onClick={() => setTab("samples")}
          style={tabStyle(tab === "samples")}
        >
          Pronunciation samples
        </button>
      </div>

      <div role="tabpanel" style={{ marginTop: 20 }}>
        {tab === "sounds" ? (
          children
        ) : (
          <SamplesTab studentId={studentId} samples={samples} />
        )}
      </div>
    </div>
  );
}

function SamplesTab({
  studentId,
  samples,
}: {
  studentId: string;
  samples: PronunciationSample[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file) {
      setMessage("Choose an audio recording first.");
      return;
    }

    setMessage(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadPronunciationSampleAction(studentId, formData);
      if (result.ok) {
        form.reset();
        setFile(null);
        setMessage("Sample added. It is ready for review.");
        return;
      }
      setMessage(result.message);
    });
  }

  return (
    <section aria-label="Pronunciation samples">
      <div style={headerStyle}>
        <div>
          <h2 style={headingStyle}>Pronunciation samples</h2>
          <p style={subheadingStyle}>
            Add one short recording for this student. It stays pending until you
            review the wording.
          </p>
        </div>
      </div>

      <form onSubmit={submit} style={uploadFormStyle}>
        <label htmlFor="pronunciation-sample-file" style={labelStyle}>
          Audio recording
        </label>
        <input
          id="pronunciation-sample-file"
          aria-label="Audio recording"
          type="file"
          accept="audio/webm,audio/mp4,audio/m4a,audio/mpeg,audio/wav,audio/wave"
          onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
          disabled={isPending}
        />
        <button type="submit" disabled={isPending} style={primaryButtonStyle}>
          {isPending ? "Adding sample…" : "Add pronunciation sample"}
        </button>
      </form>

      {message ? (
        <p role="alert" style={messageStyle}>
          {message}
        </p>
      ) : null}

      {samples.length === 0 ? (
        <p style={emptyStyle}>No pronunciation samples yet.</p>
      ) : (
        <div style={sampleListStyle}>
          {samples.map((sample) => (
            <PronunciationSampleCard key={sample.id} sample={sample} />
          ))}
        </div>
      )}
    </section>
  );
}

function PronunciationSampleCard({ sample }: { sample: PronunciationSample }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const score = sample.provisionalResult;

  function loadAudio() {
    setError(null);
    startTransition(async () => {
      const result = await loadPronunciationSampleAudioUrlAction(sample.id);
      if (result.ok) {
        setAudioUrl(result.signedUrl);
      } else {
        setError("Audio is not available for this sample.");
      }
    });
  }

  return (
    <article style={sampleCardStyle}>
      <div style={sampleHeaderStyle}>
        <div>
          <p style={statusStyle}>
            {sample.status === "confirmed" ? "Confirmed" : "Pending confirmation"}
          </p>
          <p style={dateStyle}>Added {formatDate(sample.createdAt)}</p>
        </div>
        {sample.audioAvailable ? (
          audioUrl ? (
            <audio controls src={audioUrl} style={audioStyle}>
              Your browser does not support audio playback.
            </audio>
          ) : (
            <button
              type="button"
              onClick={loadAudio}
              disabled={isPending}
              style={secondaryButtonStyle}
            >
              {isPending ? "Preparing audio…" : "Play sample"}
            </button>
          )
        ) : (
          <span style={expiredStyle}>Audio expired</span>
        )}
      </div>

      <div style={transcriptBlockStyle}>
        <p style={labelStyle}>Automatic transcript</p>
        <p style={transcriptStyle}>{sample.automaticTranscript}</p>
      </div>

      <label style={transcriptBlockStyle}>
        <span style={labelStyle}>What was the student trying to say?</span>
        <textarea
          aria-label="What was the student trying to say?"
          defaultValue={sample.teacherConfirmedText ?? sample.automaticTranscript}
          rows={2}
          style={textareaStyle}
        />
      </label>

      <div style={resultBlockStyle}>
        <p style={labelStyle}>Provisional pronunciation analysis</p>
        {score ? (
          <p style={resultStyle}>
            Overall pronunciation: {Math.round(score.pronunciationScore)}/100 ·
            star band {score.starBand}
          </p>
        ) : (
          <p style={resultStyle}>Pronunciation analysis is not available yet.</p>
        )}
      </div>

      <p style={expiryStyle}>
        {sample.audioAvailable
          ? `Audio available until ${formatDate(sample.audioExpiresAt)}`
          : "The transcript and result remain available after audio expires."}
      </p>
      {error ? (
        <p role="alert" style={messageStyle}>
          {error}
        </p>
      ) : null}
    </article>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function tabStyle(selected: boolean): React.CSSProperties {
  return {
    minHeight: 44,
    padding: "8px 14px",
    border: "1px solid #D1D5DB",
    borderBottomColor: selected ? "#2563EB" : "#D1D5DB",
    background: selected ? "#EFF6FF" : "#FFFFFF",
    color: selected ? "#1D4ED8" : "#4B5563",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 16,
  flexWrap: "wrap",
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 600,
};

const subheadingStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 14,
  color: "#4B5563",
};

const uploadFormStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#6B7280",
  textTransform: "uppercase",
};

const primaryButtonStyle: React.CSSProperties = {
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

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "8px 14px",
  border: "1px solid #2563EB",
  borderRadius: 6,
  background: "#FFFFFF",
  color: "#2563EB",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const messageStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: "#B42318",
};

const emptyStyle: React.CSSProperties = {
  margin: "16px 0 0",
  padding: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
  fontSize: 14,
  color: "#4B5563",
};

const sampleListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 16,
};

const sampleCardStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const sampleHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const statusStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: "#92400E",
};

const dateStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#6B7280",
};

const expiredStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6B7280",
};

const audioStyle: React.CSSProperties = {
  display: "block",
  maxWidth: "100%",
};

const transcriptBlockStyle: React.CSSProperties = {
  marginTop: 16,
};

const transcriptStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  color: "#111827",
};

const textareaStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  minHeight: 64,
  padding: 10,
  border: "1px solid #9CA3AF",
  borderRadius: 6,
  font: "inherit",
  color: "#111827",
  resize: "vertical",
};

const resultBlockStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 12,
  borderTop: "1px solid #E5E7EB",
};

const resultStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#4B5563",
};

const expiryStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 13,
  color: "#6B7280",
};
