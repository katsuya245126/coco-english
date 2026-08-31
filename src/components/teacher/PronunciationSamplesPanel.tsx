"use client";

import type { FormEvent, ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmPronunciationSampleAction,
  loadPronunciationSampleAudioUrlAction,
  removePronunciationSampleAction,
  uploadPronunciationSampleAction,
} from "@/app/teacher/students/[id]/actions";
import {
  MAX_PRONUNCIATION_REFERENCE_CHARS,
  soundsToWorkOn,
  wordsToPractice,
} from "@/domain/pronunciation/scoring";
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

/** Load an owned teacher sample only when its source is expanded and requested. */
export function TeacherSamplePlayback({
  sampleId,
  sourceLabel,
}: {
  sampleId: string;
  sourceLabel: string;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{sourceLabel}</p>
      <SampleAudioPlayback sampleId={sampleId} />
    </div>
  );
}

function SampleAudioPlayback({ sampleId }: { sampleId: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function loadAudio() {
    setError(null);
    startTransition(async () => {
      const result = await loadPronunciationSampleAudioUrlAction(sampleId);
      if (result.ok) {
        setAudioUrl(result.signedUrl);
      } else {
        setError("Audio is not available for this sample.");
      }
    });
  }

  return (
    <>
      {audioUrl ? (
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
      )}
      {error ? (
        <p role="alert" style={messageStyle}>
          {error}
        </p>
      ) : null}
    </>
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmedText, setConfirmedText] = useState(
    sample.teacherConfirmedText ?? sample.automaticTranscript,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const score = sample.provisionalResult;

  function confirm() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await confirmPronunciationSampleAction(
        sample.id,
        confirmedText,
      );
      if (result.ok) {
        setMessage("Sample confirmed.");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function remove() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await removePronunciationSampleAction(sample.id);
      if (result.ok) {
        setMessage("Sample removed.");
        router.refresh();
      } else {
        setError(result.message);
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
          <SampleAudioPlayback sampleId={sample.id} />
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
          value={confirmedText}
          onChange={(event) => setConfirmedText(event.currentTarget.value)}
          maxLength={MAX_PRONUNCIATION_REFERENCE_CHARS}
          readOnly={sample.status === "confirmed"}
          rows={2}
          style={textareaStyle}
        />
      </label>

      {sample.status === "pending" ? (
        <button
          type="button"
          onClick={confirm}
          disabled={isPending}
          style={primaryButtonStyle}
        >
          {isPending ? "Confirming sample…" : "Confirm sample"}
        </button>
      ) : (
        <p style={confirmedStyle}>
          Confirmed by teacher
          {sample.confirmedAt ? ` on ${formatDate(sample.confirmedAt)}` : ""}
        </p>
      )}

      <button
        type="button"
        onClick={remove}
        disabled={isPending}
        style={secondaryButtonStyle}
      >
        {isPending ? "Removing sample…" : "Remove sample"}
      </button>

      <div style={resultBlockStyle}>
        <p style={labelStyle}>
          {sample.status === "confirmed"
            ? "Confirmed pronunciation analysis"
            : "Provisional pronunciation analysis"}
        </p>
        {score ? (
          <>
            <p style={resultStyle}>
              Overall pronunciation: {Math.round(score.pronunciationScore)}/100 ·
              star band {score.starBand}
            </p>
            {sample.status === "confirmed" ? (
              <ConfirmedEvidence score={score} />
            ) : null}
          </>
        ) : (
          <p style={resultStyle}>Pronunciation analysis is not available yet.</p>
        )}
      </div>

      <p style={expiryStyle}>
        {sample.audioAvailable
          ? `Audio available until ${formatDate(sample.audioExpiresAt)}`
          : `Audio expired on ${formatDate(sample.audioExpiresAt)}`}
      </p>
      {message ? <p role="status" style={successStyle}>{message}</p> : null}
      {error ? (
        <p role="alert" style={messageStyle}>
          {error}
        </p>
      ) : null}
    </article>
  );
}

function ConfirmedEvidence({
  score,
}: {
  score: NonNullable<PronunciationSample["provisionalResult"]>;
}) {
  const words = wordsToPractice(score.wordScores, score.referenceText);
  const sounds = soundsToWorkOn(score.wordScores, score.referenceText);

  return (
    <div style={evidenceStyle}>
      <p style={labelStyle}>Weak sounds and example words</p>
      {sounds.length === 0 ? (
        <p style={resultStyle}>No weak sounds in this sample.</p>
      ) : (
        <ul style={evidenceListStyle}>
          {sounds.map((sound) => (
            <li key={`${sound.label}-${sound.ipa}-${sound.exampleWord}`}>
              /{sound.ipa}/ in “{sound.exampleWord}”
              {sound.candidate
                ? ` — Expected /${sound.ipa}/; sounded closer to /${sound.candidate.ipa}/.`
                : ""}
            </li>
          ))}
        </ul>
      )}
      {words.length > 0 ? (
        <p style={resultStyle}>
          Example words: {words.map(({ word }) => `“${word}”`).join(", ")}
        </p>
      ) : null}
    </div>
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

const confirmedStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 13,
  color: "#166534",
};

const successStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: "#166534",
};

const evidenceStyle: React.CSSProperties = {
  marginTop: 12,
};

const evidenceListStyle: React.CSSProperties = {
  margin: "4px 0 8px",
  paddingLeft: 20,
  fontSize: 14,
  color: "#4B5563",
};

const expiryStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 13,
  color: "#6B7280",
};
