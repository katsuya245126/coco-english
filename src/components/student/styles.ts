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

// ─── Phase 4: Step card + buddy + improved sentence + hint tokens ───

export const stepCardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
  boxSizing: "border-box",
};

export const buddyCardStyle: CSSProperties = {
  background: "#EFF6FF",
  border: "1px solid #BFDBFE",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

export const improvedSentenceCardStyle: CSSProperties = {
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

export const hintCardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 12,
  boxSizing: "border-box",
};

// ─── Phase 5: Voice recorder tokens ───

export const recorderPanelStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

export const recorderRecordingStyle: CSSProperties = {
  ...recorderPanelStyle,
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
};

export const recorderProcessingStyle: CSSProperties = {
  ...recorderPanelStyle,
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
};

export const recorderSuccessStyle: CSSProperties = {
  ...recorderPanelStyle,
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
};

export const recorderErrorStyle: CSSProperties = {
  ...recorderPanelStyle,
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
};

// ─── Phase 6: AI evaluation feedback tokens ───

export const evaluationSuccessStyle: CSSProperties = {
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

export const evaluationReviewStyle: CSSProperties = {
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

export const evaluationErrorStyle: CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FCA5A5",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

// ─── Phase 4: Progress bar tokens ───

export const progressTrackStyle: CSSProperties = {
  height: 4,
  background: "#E5E7EB",
  borderRadius: 9999,
  width: "100%",
  overflow: "hidden",
};

export const progressFillStyle: CSSProperties = {
  height: "100%",
  background: "#2563EB",
  borderRadius: 9999,
  transition: "width 0.3s ease",
};

// ─── Phase 4: Resume notice ───

export const resumeNoticeStyle: CSSProperties = {
  background: "#F7F8FA",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 12,
  boxSizing: "border-box",
};

// ─── Phase 4: Status badge tokens ───

export const statusBadgeBaseStyle: CSSProperties = {
  borderRadius: 9999,
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 12,
  paddingRight: 12,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  display: "inline-block",
  textAlign: "center",
  whiteSpace: "nowrap",
};

export const badgeStartStyle: CSSProperties = {
  ...statusBadgeBaseStyle,
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
};

export const badgeContinueStyle: CSSProperties = {
  ...statusBadgeBaseStyle,
  background: "#FFFFFF",
  color: "#2563EB",
  border: "1px solid #2563EB",
};

export const badgeDoneStyle: CSSProperties = {
  ...statusBadgeBaseStyle,
  background: "#F0FDF4",
  color: "#177245",
  border: "1px solid #BBF7D0",
};

export const badgeClosedStyle: CSSProperties = {
  ...statusBadgeBaseStyle,
  background: "#F7F8FA",
  color: "#6B7280",
  border: "1px solid #E5E7EB",
};

export const badgeLateStyle: CSSProperties = {
  ...statusBadgeBaseStyle,
  background: "#FEF2F2",
  color: "#B91C1C",
  border: "1px solid #FECACA",
};
