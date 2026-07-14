/**
 * Scene-premise card (SCENE-01, D-08, D-09).
 *
 * Renders once above turn 1 at mission start when the mission snapshot has a
 * scene premise. Deliberately unvoiced (D-09) — no CocoSpeechAudio import, no
 * TTS wiring. Omitted entirely when scenePremise is null (D-08 forward-only,
 * no placeholder/empty state for pre-Phase-11 missions).
 */

import type { CSSProperties } from "react";
import { buddyCardStyle } from "@/components/student/styles";

type ScenePremiseCardProps = {
  scenePremise: string | null;
};

export function ScenePremiseCard({ scenePremise }: ScenePremiseCardProps) {
  if (!scenePremise) return null;

  return (
    <div style={cardStyle}>
      <span style={eyebrowStyle}>The scene:</span>
      <p style={bodyStyle}>{scenePremise}</p>
    </div>
  );
}

const cardStyle: CSSProperties = {
  ...buddyCardStyle,
  marginTop: 16,
};

const eyebrowStyle: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  color: "#1D4ED8",
  marginBottom: 4,
};

const bodyStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.5,
  color: "#111827",
  margin: 0,
};
