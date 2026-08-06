"use client";

import { useEffect, useState, type ReactNode } from "react";

type FlashVariant = "success" | "info" | "warning" | "error";

const variants: Record<FlashVariant, { accent: string; bg: string; fg: string; icon: string }> = {
  success: { accent: "#22C55E", bg: "#DCFCE7", fg: "#16A34A", icon: "✓" },
  info:    { accent: "#3B82F6", bg: "#DBEAFE", fg: "#2563EB", icon: "i" },
  warning: { accent: "#F59E0B", bg: "#FEF3C7", fg: "#D97706", icon: "!" },
  error:   { accent: "#EF4444", bg: "#FEE2E2", fg: "#DC2626", icon: "✕" },
};

type FlashNoticeProps = {
  message: string;
  variant?: FlashVariant;
  children?: ReactNode;
  action?: ReactNode;
  autoHideMs?: number;
  onDismiss?: () => void;
};

export function FlashNotice({
  message,
  variant = "success",
  children,
  action,
  autoHideMs = 4000,
  onDismiss,
}: FlashNoticeProps) {
  const [visible, setVisible] = useState(true);
  const v = variants[variant];

  useEffect(() => {
    if (autoHideMs <= 0) return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, autoHideMs);
    return () => clearTimeout(timer);
  }, [autoHideMs, onDismiss]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    onDismiss?.();
  }

  return (
    <div role="status" aria-live="polite" style={toastStyle}>
      <div style={{ ...accentBar, background: v.accent }} />
      <span style={{ ...iconStyle, background: v.bg, color: v.fg }}>{v.icon}</span>
      <div style={textWrap}>
        <strong style={titleStyle}>{message}</strong>
        {children ? <div style={childrenStyle}>{children}</div> : null}
      </div>
      {action}
      <button onClick={dismiss} aria-label="Dismiss" style={dismissStyle}>
        ✕
      </button>
    </div>
  );
}

const toastStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "#fff",
  borderRadius: 8,
  padding: "14px 16px",
  margin: 0,
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  zIndex: 1000,
  minWidth: 280,
  maxWidth: 440,
  overflow: "hidden",
};

const accentBar: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: 4,
  borderRadius: "8px 0 0 8px",
};

const iconStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "50%",
  fontSize: 14,
  fontWeight: 700,
  flexShrink: 0,
};

const textWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  flex: 1,
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const childrenStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6B7280",
};

const dismissStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
  color: "#9CA3AF",
  padding: 0,
  flexShrink: 0,
};
