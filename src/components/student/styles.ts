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

export const MISSION_CONTENT_MAX_WIDTH = 640;

export const missionPageStyle: CSSProperties = {
  ...pageStyle,
  padding: "clamp(16px, 3vw, 32px)",
};

export const missionContentStyle: CSSProperties = {
  width: "100%",
  maxWidth: MISSION_CONTENT_MAX_WIDTH,
  alignSelf: "flex-start",
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
  background: "#EFF6FF",
  border: "1px solid #BFDBFE",
  borderRadius: 8,
  padding: 16,
  boxSizing: "border-box",
};

export const hintCardStyle: CSSProperties = {
  background: "#F9FAFB",
  border: "none",
  borderRadius: 8,
  padding: 12,
  boxSizing: "border-box",
};

// ─── Phase 5: Voice recorder tokens ───

export const recorderPanelStyle: CSSProperties = {
  background: "#F9FAFB",
  border: "none",
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
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
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
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
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

export const badgeRetryStyle: CSSProperties = {
  ...statusBadgeBaseStyle,
  background: "#FEF3C7",
  color: "#92400E",
  border: "1px solid #FCD34D",
};

// ─── Phase 10: Mascot stage tokens ───

export const mascotStageStyle: CSSProperties = {
  width: "100%",
  maxWidth: MISSION_CONTENT_MAX_WIDTH,
  height: 300,
  position: "relative",
  marginTop: 16,
  marginLeft: "auto",
  marginRight: "auto",
  overflow: "hidden",
  borderRadius: 8,
  boxSizing: "border-box",
};

export const mascotBackdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, #EFF6FF 0%, #F7F8FA 100%)",
};

export const mascotSpriteWrapStyle: CSSProperties = {
  position: "absolute",
  // Preserve the desktop 226px character frame on standard phone widths.
  // Fixed 72px insets squeezed the frame to 133px on a 375px viewport and
  // changed the object-fit crop; the clamp keeps it centered and only shrinks
  // on screens too narrow to retain a 24px safety inset.
  left: "clamp(24px, calc((100% - 226px) / 2), 72px)",
  right: "clamp(24px, calc((100% - 226px) / 2), 72px)",
  // Sits behind the dialogue box (stage 300 tall, box top at y=164). The 16px
  // box overlap closes the transparent edge gap on portrait sprites without
  // moving Coco or clipping the ears during the speaking scale pulse.
  bottom: 120,
  height: 180,
  transformOrigin: "bottom center",
};

export const mascotDialogueShellStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 32,
  height: 104,
  overflow: "visible",
};

export const mascotDialogueBoxStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#FFFFFF",
  border: "2px solid #2563EB",
  borderRadius: 8,
  padding: 22,
  boxSizing: "border-box",
  overflowY: "auto",
};

export const mascotDialogueTabsStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  right: 8,
  top: -46,
  height: 48,
  zIndex: 2,
  display: "flex",
  alignItems: "flex-end",
  pointerEvents: "none",
};

const mascotAttachedTabStyle: CSSProperties = {
  height: 48,
  boxSizing: "border-box",
  border: "2px solid #2563EB",
  borderBottomColor: "transparent",
  borderRadius: "12px 12px 0 0",
  backgroundClip: "padding-box",
  pointerEvents: "auto",
};

export const mascotNameTabStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  height: 38,
  minWidth: 76,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#2563EB",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 700,
};

export const mascotDialogueActionsStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  overflow: "hidden",
  background: "#FFFFFF",
};

export const mascotHintTabStyle: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  border: 0,
  borderRight: "1px solid #BFDBFE",
  borderRadius: 0,
  background: "transparent",
  color: "#2563EB",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export const mascotVoiceTabStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
};

export const mascotDialogueTextStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.3,
  color: "#111827",
  margin: 0,
};

export const mascotPhraseButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: "8px 3px",
  margin: "-8px 0",
  border: "1px solid #93C5FD",
  borderRadius: 6,
  background: "#EFF6FF",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};

export const mascotTranslationBubbleStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "calc(100% + 6px)",
  transform: "translateX(-50%)",
  zIndex: 5,
  maxWidth: "calc(100vw - 32px)",
  boxSizing: "border-box",
  padding: "6px 10px",
  borderRadius: 8,
  background: "#1E3A8A",
  color: "#FFFFFF",
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.3,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
};

export const mascotSpeakerLabelStyle: CSSProperties = {
  ...labelStyle,
  color: "#2563EB",
  marginBottom: 4,
};
