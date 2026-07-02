"use client";

import { useState } from "react";
import {
  loadAudioClipUrlAction,
  type LoadAudioClipUrlActionResult,
} from "@/app/teacher/evidence/[attemptId]/actions";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover } from "@/components/ui/hover-styles";

type AudioClipPlayerProps = {
  audioClipId: string;
  label: string;
  unavailableCopy?: string;
};

export function AudioClipPlayer({
  audioClipId,
  label,
  unavailableCopy = "Audio is not available for this clip.",
}: AudioClipPlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadAudio() {
    setPending(true);
    setError(null);

    const result: LoadAudioClipUrlActionResult =
      await loadAudioClipUrlAction(audioClipId);

    setPending(false);

    if (result.ok) {
      setSignedUrl(result.signedUrl);
    } else {
      setError(unavailableCopy);
    }
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={labelStyle}>{label}</span>
        {!signedUrl ? (
          <HoverButton
            type="button"
            onClick={handleLoadAudio}
            disabled={pending}
            style={buttonStyle}
            hoverStyle={primaryHover}
          >
            {pending ? "Preparing audio..." : "Load audio"}
          </HoverButton>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      ) : null}

      {signedUrl ? (
        <audio controls src={signedUrl} style={audioStyle}>
          Your browser does not support audio playback.
        </audio>
      ) : null}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 12,
  background: "#FFFFFF",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#4B5563",
};

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "8px 14px",
  border: "1px solid #2563EB",
  borderRadius: 6,
  background: "#2563EB",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const audioStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 12,
};

const errorStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: "#B42318",
};
