import type { CSSProperties } from "react";

// Shared mobile-first student styles (UI-SPEC: max content width 420px, 24px
// page padding, 44px minimum controls, accent #2563EB, neutral palette).

export const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#F7F8FA",
  display: "flex",
  justifyContent: "center",
  padding: 24,
  boxSizing: "border-box",
};

export const panelStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
  boxSizing: "border-box",
  alignSelf: "flex-start",
};

export const displayTitleStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1.2,
  color: "#111827",
  margin: "0 0 8px",
};

export const headingStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  color: "#111827",
  margin: "0 0 8px",
};

export const bodyStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  color: "#4B5563",
  margin: "0 0 16px",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  color: "#111827",
  marginBottom: 8,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "10px 12px",
  fontSize: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  boxSizing: "border-box",
};

export const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "12px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

export const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "12px 16px",
  background: "none",
  color: "#2563EB",
  border: "1px solid #2563EB",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

export const errorTextStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.4,
  color: "#B42318",
  margin: "8px 0 0",
};
