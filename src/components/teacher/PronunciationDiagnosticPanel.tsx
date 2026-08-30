"use client";

import { useState, useTransition } from "react";
import type { AttemptPronunciationScoreEvidence } from "@/server/teacher/audio-evidence";
import { reprocessPronunciationAction } from "@/app/teacher/evidence/[attemptId]/actions";

type PronunciationDiagnosticPanelProps = {
  pronunciationScore?: AttemptPronunciationScoreEvidence | null;
  audioClipId: string;
  attemptId: string;
};

const UNAVAILABLE_COPY =
  "Pronunciation scoring didn't run for this recording.";

export function PronunciationDiagnosticPanel({
  pronunciationScore,
  audioClipId,
  attemptId,
}: PronunciationDiagnosticPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rescoreError, setRescoreError] = useState<string | null>(null);

  if (!pronunciationScore) {
    const handleRescore = () => {
      setRescoreError(null);
      startTransition(async () => {
        const result = await reprocessPronunciationAction({
          audioClipId,
          attemptId,
        });
        if (!result.ok && result.error === "rate_limited") {
          setRescoreError(
            "You’ve made several AI requests. Wait a few minutes and try again.",
          );
          return;
        }
        if (!result.ok && result.error !== "already_scored") {
          setRescoreError(
            "Re-scoring didn't work this time. Please try again in a moment.",
          );
        }
      });
    };

    return (
      <div style={containerStyle}>
        <p style={unavailableStyle}>{UNAVAILABLE_COPY}</p>
        <button
          type="button"
          onClick={handleRescore}
          disabled={isPending}
          style={rescoreButtonStyle}
        >
          {isPending ? "Re-scoring…" : "Re-score pronunciation"}
        </button>
        {rescoreError && (
          <p role="alert" style={rescoreErrorStyle}>
            {rescoreError}
          </p>
        )}
      </div>
    );
  }

  const sounds = pronunciationScore.soundsToWorkOn;

  return (
    <div style={containerStyle}>
      {sounds.length > 0 ? (
        <div style={soundsSectionStyle}>
          <p style={headingStyle}>Sounds to work on</p>
          <div style={soundsRowStyle}>
            {sounds.map((sound, index) => (
              <div key={`${sound.label}-${index}`} style={soundChipStyle}>
                <span style={soundLabelStyle}>
                  &ldquo;{sound.label}&rdquo;
                </span>
                <span style={soundIpaStyle}>/{sound.ipa}/</span>
                <span style={soundExampleStyle}>
                  as in &ldquo;{sound.exampleWord}&rdquo;
                </span>
                {sound.candidate && (
                  <span style={soundCandidateStyle}>
                    Sounded closer to /{sound.candidate.ipa}/
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={cleanCopyStyle}>
          No specific sounds stood out — this read was clear.
        </p>
      )}

      <div style={headerStyle}>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          style={toggleButtonStyle}
        >
          {expanded
            ? "Hide word-by-word detail"
            : "Show word-by-word detail"}
        </button>
      </div>

      <div
        aria-hidden={!expanded}
        style={{
          ...contentStyle,
          display: expanded ? "block" : "none",
        }}
      >
        <div style={columnHeaderRowStyle}>
          <span style={columnLabelStyle}>Word</span>
          <span style={columnLabelStyle}>Result</span>
        </div>
        {pronunciationScore.words.map((entry, index) => (
          <div key={`${entry.word}-${index}`} style={wordRowStyle}>
            <span style={wordTextStyle}>{entry.word || "-"}</span>
            <span style={resultValueStyle(entry.label)}>{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function resultValueStyle(label: string): React.CSSProperties {
  if (label === "Clear") {
    return { ...resultBaseStyle, color: "#065F46" };
  }
  if (label === "Pause" || label === "Flat tone") {
    return { ...resultBaseStyle, color: "#92400E" };
  }
  // Mispronounced / Skipped / Extra word: encouraging-low, neutral, never red.
  return { ...resultBaseStyle, color: "#4B5563" };
}

const containerStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 12,
  background: "#FFFFFF",
  marginTop: 12,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const toggleButtonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "8px 0",
  background: "none",
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  color: "#2563EB",
  cursor: "pointer",
};

const contentStyle: React.CSSProperties = {
  marginTop: 12,
};

const soundsSectionStyle: React.CSSProperties = {
  marginBottom: 4,
};

const soundsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const soundChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  background: "#FEF3C7",
  border: "1px solid #FCD34D",
};

const soundLabelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#92400E",
};

const soundIpaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#B45309",
};

const soundExampleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#78716C",
};

const soundCandidateStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#92400E",
  fontWeight: 600,
};

const cleanCopyStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 14,
  color: "#065F46",
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  fontWeight: 600,
  color: "#4B5563",
};

const columnHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 6,
  paddingBottom: 4,
  borderBottom: "1px solid #E5E7EB",
};

const columnLabelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#6B7280",
};

const wordRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "6px 0",
};

const wordTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#111827",
};

const resultBaseStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
};

const unavailableStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#4B5563",
};

const rescoreButtonStyle: React.CSSProperties = {
  minHeight: 44,
  marginTop: 8,
  padding: "8px 16px",
  background: "#FFFFFF",
  border: "1px solid #2563EB",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  color: "#2563EB",
  cursor: "pointer",
};

const rescoreErrorStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: 14,
  color: "#B91C1C",
};
