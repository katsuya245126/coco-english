/**
 * "Coco is thinking…" step card (CHAT-02, D-12).
 *
 * Shown in place of the next step card while a conversation-mode server
 * round-trip is in flight (student-input moderation -> generation ->
 * output moderation -> TTS warmup). Reuses the SVG animateTransform spinner
 * pattern from CocoSpeechAudio.tsx's loading state — no spinner library.
 *
 * A real, separate component on purpose (not an inline conditional) so
 * Phase 10's mascot idle state can later host this wait state without a
 * refactor (UI-SPEC note 3).
 *
 * Presentational only — the parent step-card region already carries
 * aria-live="polite" (MissionFlowShell.tsx), so no additional live-region
 * is added here.
 */

import type { CSSProperties } from "react";
import { stepCardStyle } from "@/components/student/styles";

export function StepCocoThinking() {
  return (
    <div style={stepCardStyle}>
      <div style={rowStyle}>
        <ThinkingSpinner />
        <p style={textStyle}>Coco is thinking…</p>
      </div>
    </div>
  );
}

function ThinkingSpinner() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={spinnerStyle}
    >
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

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const spinnerStyle: CSSProperties = {
  color: "#2563EB",
  flexShrink: 0,
};

const textStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.5,
  color: "#4B5563",
  margin: 0,
};
