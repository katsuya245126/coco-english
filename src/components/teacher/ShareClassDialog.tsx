"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  resetJoinCodeAction,
  type ClassActionResult,
} from "@/app/teacher/classes/actions";

type ShareClassDialogProps = {
  classId: string;
  className: string;
  joinCode: string | null;
  onClose: () => void;
};

// Builds the student join link from the current origin. The link carries the
// join code; D-18 reset changes this link for NEW entry only.
function buildJoinLink(joinCode: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join/${joinCode}`;
}

// Share dialog (UI-SPEC "Join Code, QR, And Link Sharing"): class name, large
// join code, copy-link action, QR on a plain white surface, and a teacher-only
// Reset join code destructive action in the dialog footer (not next to copy).
export function ShareClassDialog({
  classId,
  className,
  joinCode: initialJoinCode,
  onClose,
}: ShareClassDialogProps) {
  const [joinCode, setJoinCode] = useState<string | null>(initialJoinCode);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinLink = joinCode ? buildJoinLink(joinCode) : "";

  // Render the QR to a data URL only when the teacher asks for it (white surface
  // with a quiet-zone margin per UI-SPEC).
  useEffect(() => {
    if (!showQr || !joinLink) {
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(joinLink, {
      margin: 2,
      width: 240,
      color: { dark: "#111827", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("We could not render the QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [showQr, joinLink]);

  async function handleCopyLink() {
    if (!joinLink) return;
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("We could not copy the link. Copy it manually.");
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    const formData = new FormData();
    formData.set("classId", classId);
    const result: ClassActionResult = await resetJoinCodeAction(formData);
    setResetting(false);
    if (result.ok && result.joinCode) {
      setJoinCode(result.joinCode);
      setQrDataUrl(null);
      setConfirmingReset(false);
    } else if (!result.ok) {
      setError(result.error);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${className}`}
      style={overlayStyle}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div style={panelStyle}>
        <div style={headerRowStyle}>
          <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25, margin: 0 }}>
            {className}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={closeButtonStyle}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 8px" }}>
          Join code
        </p>
        <p
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: "0.15em",
            margin: "0 0 16px",
            color: "#111827",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {joinCode ?? "------"}
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button type="button" onClick={handleCopyLink} style={primaryButtonStyle}>
            Share join link
          </button>
          <button
            type="button"
            onClick={() => setShowQr((value) => !value)}
            style={secondaryButtonStyle}
            aria-expanded={showQr}
          >
            Show QR code
          </button>
        </div>

        <p aria-live="polite" style={{ fontSize: 14, color: "#177245", margin: 0, minHeight: 20 }}>
          {copied ? "Link copied." : ""}
        </p>

        {showQr ? (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              display: "flex",
              justifyContent: "center",
            }}
          >
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`QR code linking to the join page for ${className}`}
                width={240}
                height={240}
              />
            ) : (
              <span style={{ fontSize: 14, color: "#6B7280" }}>
                Generating QR code…
              </span>
            )}
          </div>
        ) : null}

        {error ? (
          <p role="alert" style={{ fontSize: 14, color: "#B42318", margin: "16px 0 0" }}>
            {error}
          </p>
        ) : null}

        <hr style={{ border: "none", borderTop: "1px solid #E5E7EB", margin: "24px 0 16px" }} />

        {confirmingReset ? (
          <div>
            <p style={{ fontSize: 14, color: "#4B5563", margin: "0 0 12px" }}>
              Reset join code? New students will need the new code or link.
              Remembered devices can still return to this class.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                style={destructiveButtonStyle}
              >
                Reset join code
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              style={destructiveTextButtonStyle}
            >
              Reset join code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
  width: "100%",
  maxWidth: 400,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 16,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer",
  minHeight: 44,
};

const destructiveButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#B42318",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

const destructiveTextButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "none",
  color: "#B42318",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
  color: "#6B7280",
  minWidth: 44,
  minHeight: 44,
};
