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

/**
 * Shared resting style for the student hint buttons — the conversation-mode
 * "Show hint" toggle and the preset HintRevealer. They are different
 * interactions but must read as the same affordance, so the palette lives
 * here rather than being copied into both. Pair with the
 * `.student-tinted-button` class in globals.css for press feedback.
 */
export const tintedHintButtonStyle: CSSProperties = {
  background: "#DBEAFE",
  border: "1px solid #93C5FD",
  borderRadius: 999,
  padding: "8px 12px",
  minHeight: 40,
  fontSize: 15,
  fontWeight: 600,
  color: "#1E40AF",
  cursor: "pointer",
  textAlign: "center",
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

// ─── Phase 10: Mascot stage tokens ───

export const mascotStageStyle: CSSProperties & {
  "--coco-dialogue-height": string;
} = {
  width: "100%",
  maxWidth: MISSION_CONTENT_MAX_WIDTH,
  height: 400,
  "--coco-dialogue-height": "clamp(144px, 44vw, 168px)",
  position: "relative",
  marginTop: 16,
  marginBottom: 22,
  marginLeft: "auto",
  marginRight: "auto",
  overflow: "visible",
  borderRadius: 8,
  boxSizing: "border-box",
};

export const mascotBackdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "#F7F8FA",
  backgroundImage:
    "image-set(url(/images/backgrounds/default-classroom-background-640.webp) 1x, url(/images/backgrounds/default-classroom-background-1280.webp) 2x)",
  backgroundSize: "cover",
  backgroundPosition: "center center",
  borderRadius: 8,
};

export const mascotSpriteWrapStyle: CSSProperties = {
  position: "absolute",
  // Cap Coco's centered frame at 226px on desktop while keeping a 24px safety
  // inset when the stage is too narrow. Normalized sprites are bottom-aligned
  // and overlap the main chatbox by 10px so their visible edges stay attached.
  left: "max(24px, calc((100% - 226px) / 2))",
  width: "min(226px, calc(100% - 48px))",
  bottom: "calc(var(--coco-dialogue-height) - 10px)",
  height: 180,
  transformOrigin: "bottom center",
};

export const mascotDialogueShellStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: "var(--coco-dialogue-height)",
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
  overflow: "visible",
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
  height: "clamp(40px, 10vw, 48px)",
  boxSizing: "border-box",
  border: "2px solid #2563EB",
  borderBottomColor: "transparent",
  borderRadius: "12px 12px 0 0",
  backgroundClip: "padding-box",
  pointerEvents: "auto",
};

export const mascotNameTabStyle: CSSProperties = {
  ...mascotAttachedTabStyle,
  height: "clamp(32px, 8.5vw, 38px)",
  minWidth: "clamp(64px, 17vw, 76px)",
  padding: "0 clamp(8px, 2.5vw, 12px)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#2563EB",
  color: "#FFFFFF",
  fontSize: "clamp(13px, 3.3vw, 14px)",
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
  ...mascotAttachedTabStyle,
  minHeight: "clamp(38px, 10vw, 44px)",
  padding: "0 clamp(8px, 2.5vw, 12px)",
  border: 0,
  borderRight: "1px solid #BFDBFE",
  borderRadius: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  color: "#2563EB",
  fontSize: "clamp(13px, 3.3vw, 14px)",
  fontWeight: 700,
  cursor: "pointer",
};

export const mascotDialoguePagerStyle: CSSProperties = {
  position: "absolute",
  left: 8,
  right: 8,
  bottom: -22,
  zIndex: 4,
  display: "grid",
  gridTemplateColumns: "44px 1fr 44px",
  alignItems: "center",
  pointerEvents: "none",
};

export const mascotDialoguePageButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  border: "2px solid #2563EB",
  borderRadius: "50%",
  background: "#2563EB",
  color: "#FFFFFF",
  fontSize: 24,
  fontWeight: 700,
  cursor: "pointer",
  pointerEvents: "auto",
  boxShadow: "0 2px 6px rgba(37, 99, 235, 0.35)",
};

export const mascotDialoguePageIndicatorStyle: CSSProperties = {
  justifySelf: "center",
  padding: "3px 8px",
  borderRadius: 999,
  background: "#FFFFFF",
  color: "#4B5563",
  fontSize: 13,
  fontWeight: 700,
};

export const mascotHintSpinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  flexShrink: 0,
};

export const mascotVoiceTabStyle: CSSProperties = {
  minHeight: "clamp(38px, 10vw, 44px)",
  minWidth: "clamp(38px, 10vw, 44px)",
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
  display: "inline",
  minHeight: "auto",
  padding: "2px 3px",
  margin: 0,
  border: "1px solid #93C5FD",
  borderRadius: 6,
  background: "#EFF6FF",
  color: "inherit",
  font: "inherit",
  whiteSpace: "normal",
  cursor: "pointer",
};

export const mascotTranslationBubbleStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "calc(100% + 6px)",
  transform: "translateX(-50%)",
  zIndex: 5,
  // max-content: an absolutely-positioned bubble otherwise shrinks to its
  // anchor phrase's width, rendering Korean one character per line.
  width: "max-content",
  maxWidth: "min(260px, calc(100vw - 32px))",
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
