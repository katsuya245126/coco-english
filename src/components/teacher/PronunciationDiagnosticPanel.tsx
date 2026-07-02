"use client";

import { useState } from "react";
import type { AttemptPronunciationScoreEvidence } from "@/server/teacher/audio-evidence";

type PronunciationDiagnosticPanelProps = {
  pronunciationScore?: AttemptPronunciationScoreEvidence | null;
};

const UNAVAILABLE_COPY =
  "Pronunciation detail is not available for this attempt.";

export function PronunciationDiagnosticPanel({
  pronunciationScore,
}: PronunciationDiagnosticPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!pronunciationScore) {
    return (
      <div style={containerStyle}>
        <p style={unavailableStyle}>{UNAVAILABLE_COPY}</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          style={toggleButtonStyle}
        >
          {expanded ? "Hide pronunciation detail" : "Show pronunciation detail"}
        </button>
      </div>

      <div
        aria-hidden={!expanded}
        style={{
          ...contentStyle,
          display: expanded ? "block" : "none",
        }}
      >
        <p style={headingStyle}>Pronunciation breakdown</p>
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
