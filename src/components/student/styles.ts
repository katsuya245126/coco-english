import type { CSSProperties } from "react";

// Shared mobile-first student styles (UI-SPEC: max content width 420px, 24px
// page padding, 44px minimum controls, accent #2563EB, neutral palette).
//
// Values written as var(--st-*, original) opt into the "sticker book" theme
// only under .sticker-theme (globals.css); every other screen keeps the
// original fallback.

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
  background: "var(--st-bg, #F7F8FA)",
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
  fontWeight: "var(--st-title-weight, 600)",
  lineHeight: 1.2,
  color: "var(--st-ink, #111827)",
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
  color: "var(--st-muted, #4B5563)",
  margin: "0 0 16px",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: "var(--st-label-weight, 600)",
  lineHeight: 1.4,
  color: "var(--st-ink, #111827)",
  marginBottom: 8,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "10px 12px",
  fontSize: 16,
  color: "var(--st-ink, inherit)",
  background: "var(--st-card, #FFFFFF)",
  border: "var(--st-input-border, 1px solid #D1D5DB)",
  borderRadius: "var(--st-radius-input, 6px)",
  boxSizing: "border-box",
};

export const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "var(--st-button-height, 44px)",
  padding: "12px 16px",
  background: "var(--st-primary-bg, #2563EB)",
  color: "var(--st-primary-fg, #FFFFFF)",
  border: "var(--st-border, none)",
  borderRadius: "var(--st-radius-button, 6px)",
  fontSize: "var(--st-button-size, 16px)",
  fontWeight: "var(--st-button-weight, 600)",
  cursor: "pointer",
};

export const secondaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: "var(--st-button-height, 44px)",
  padding: "12px 16px",
  background: "var(--st-secondary-bg, none)",
  color: "var(--st-secondary-fg, #2563EB)",
  border: "var(--st-border, 1px solid #2563EB)",
  borderRadius: "var(--st-radius-button, 6px)",
  fontSize: "var(--st-button-size, 16px)",
  fontWeight: "var(--st-button-weight, 600)",
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
  background: "var(--st-card, #FFFFFF)",
  border: "var(--st-border, 1px solid #D1D5DB)",
  borderRadius: "var(--st-radius-card, 8px)",
  boxShadow: "var(--st-shadow, none)",
  padding: 24,
  boxSizing: "border-box",
};

export const buddyCardStyle: CSSProperties = {
  background: "var(--st-sky-soft, #EFF6FF)",
  border: "var(--st-border, 1px solid #BFDBFE)",
  borderRadius: "var(--st-radius-card, 8px)",
  padding: 16,
  boxSizing: "border-box",
};

export const improvedSentenceCardStyle: CSSProperties = {
  background: "var(--st-sky-soft, #EFF6FF)",
  border: "var(--st-border, 1px solid #BFDBFE)",
  borderRadius: "var(--st-radius-card, 8px)",
  padding: 16,
  boxSizing: "border-box",
};

export const hintCardStyle: CSSProperties = {
  background: "var(--st-yellow-soft, #F9FAFB)",
  border: "var(--st-dashed-border, none)",
  borderRadius: "var(--st-radius-button, 8px)",
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
  background: "var(--st-yellow, #DBEAFE)",
  border: "var(--st-border, 1px solid #93C5FD)",
  borderRadius: "var(--st-radius-button, 999px)",
  padding: "8px 14px",
  minHeight: "var(--st-button-height, 40px)",
  fontSize: "var(--st-button-size, 15px)",
  fontWeight: "var(--st-button-weight, 600)",
  color: "var(--st-ink, #1E40AF)",
  cursor: "pointer",
  textAlign: "center",
};

// ─── Phase 5: Voice recorder tokens ───

export const recorderPanelStyle: CSSProperties = {
  background: "var(--st-panel-bg, #F9FAFB)",
  border: "none",
  borderRadius: "var(--st-radius-card, 8px)",
  padding: 16,
  boxSizing: "border-box",
};

// Saving is not a warning, so it keeps the plain panel (no yellow outline).
export const recorderProcessingStyle: CSSProperties = recorderPanelStyle;

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
  background: "var(--st-mint-soft, #F0FDF4)",
  border: "var(--st-border, 1px solid #BBF7D0)",
  borderRadius: "var(--st-radius-card, 8px)",
  boxShadow: "var(--st-shadow, none)",
  padding: 16,
  boxSizing: "border-box",
};

export const evaluationReviewStyle: CSSProperties = {
  background: "var(--st-yellow-soft, #FFFBEB)",
  border: "var(--st-border, 1px solid #FDE68A)",
  borderRadius: "var(--st-radius-card, 8px)",
  boxShadow: "var(--st-shadow, none)",
  padding: 16,
  boxSizing: "border-box",
};

export const evaluationErrorStyle: CSSProperties = {
  background: "var(--st-yellow-soft, #FFFBEB)",
  border: "var(--st-border, 1px solid #FDE68A)",
  borderRadius: "var(--st-radius-card, 8px)",
  boxShadow: "var(--st-shadow, none)",
  padding: 16,
  boxSizing: "border-box",
};

// ─── Phase 4: Progress bar tokens ───

export const progressTrackStyle: CSSProperties = {
  height: "var(--st-progress-height, 4px)",
  background: "var(--st-card, #E5E7EB)",
  border: "var(--st-progress-border, none)",
  boxSizing: "border-box",
  borderRadius: 9999,
  width: "100%",
  overflow: "hidden",
};

export const progressFillStyle: CSSProperties = {
  height: "100%",
  background: "var(--st-accent, #2563EB)",
  borderRadius: 9999,
  transition: "width 0.3s ease",
};

// ─── Phase 4: Resume notice ───

export const resumeNoticeStyle: CSSProperties = {
  background: "var(--st-yellow-soft, #F7F8FA)",
  border: "var(--st-border, 1px solid #E5E7EB)",
  borderRadius: "var(--st-radius-button, 8px)",
  padding: 12,
  boxSizing: "border-box",
};

// ─── Phase 10: Mascot stage tokens ("sticker book" B1 layout) ───
// The stage stacks a bordered scene card (backdrop + Coco, or the mission
// picture) over an in-flow speech bubble and a tool row. Only the mission
// flow renders it, and always inside .sticker-theme.

const INK = "#1B1B3A";
const stickerBorder = `3px solid ${INK}`;
const stickerShadow = `5px 5px 0 ${INK}`;

export const mascotStageStyle: CSSProperties = {
  width: "100%",
  maxWidth: MISSION_CONTENT_MAX_WIDTH,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  marginTop: 16,
  marginLeft: "auto",
  marginRight: "auto",
  boxSizing: "border-box",
};

export const mascotSceneStyle: CSSProperties = {
  position: "relative",
  height: 200,
  flexShrink: 0,
  overflow: "hidden",
  border: stickerBorder,
  borderRadius: 22,
  boxShadow: stickerShadow,
  background: "#F8FBFF",
};

export const mascotPictureSceneStyle: CSSProperties = {
  ...mascotSceneStyle,
  height: 240,
};

export const mascotBackdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundColor: "#F7F8FA",
  backgroundImage:
    "image-set(url(/images/backgrounds/default-classroom-background-640.webp) 1x, url(/images/backgrounds/default-classroom-background-1280.webp) 2x)",
  backgroundSize: "cover",
  backgroundPosition: "center center",
};

export const mascotPictureVisualStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  minHeight: 0,
  overflow: "hidden",
};

export const mascotPictureImageStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "block",
  width: "100%",
  height: "100%",
  padding: "10px 12px",
  objectFit: "contain",
  objectPosition: "center",
  boxSizing: "border-box",
};

export const mascotPictureFailureStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "min(calc(100% - 32px), 360px)",
  padding: 20,
  boxSizing: "border-box",
  textAlign: "center",
  border: "1px dashed #F59E0B",
  borderRadius: 12,
  background: "#FFFBEB",
};

export const mascotPictureFailureTextStyle: CSSProperties = {
  margin: 0,
  color: "#854F0B",
  fontSize: 15,
  fontWeight: 700,
};

export const mascotPictureFailureActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: 8,
  marginTop: 14,
};

export const mascotPictureRetryButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: "8px 13px",
  border: stickerBorder,
  borderRadius: 14,
  color: INK,
  background: "#FF8A3D",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export const mascotPictureBackButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: "8px 13px",
  border: stickerBorder,
  borderRadius: 14,
  color: INK,
  background: "#FFFFFF",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

export const mascotSpriteWrapStyle: CSSProperties = {
  position: "absolute",
  // Coco stands in the scene, cropped at the waist by the card edge.
  left: "calc(50% - 113px)",
  width: 226,
  bottom: -70,
  height: 270,
  transformOrigin: "bottom center",
};

export const mascotDialogueShellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const mascotDialogueBoxStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "18px 18px 10px",
  background: "#FFFFFF",
  border: stickerBorder,
  borderRadius: 22,
  boxShadow: stickerShadow,
  boxSizing: "border-box",
};

// Speech-bubble tail pointing up at Coco.
export const mascotDialogueTailStyle: CSSProperties = {
  position: "absolute",
  top: -14,
  left: "50%",
  marginLeft: -12,
  width: 20,
  height: 20,
  background: "#FFFFFF",
  borderTop: stickerBorder,
  borderLeft: stickerBorder,
  transform: "rotate(45deg)",
};

export const mascotNameTabStyle: CSSProperties = {
  position: "absolute",
  top: -16,
  left: 16,
  padding: "0 12px",
  border: `2px solid ${INK}`,
  borderRadius: 999,
  background: "#FF8A3D",
  color: INK,
  fontSize: 14,
  fontWeight: 800,
  lineHeight: "26px",
  transform: "rotate(-3deg)",
};

export const mascotDialogueToolsStyle: CSSProperties = {
  display: "grid",
  gridAutoColumns: "minmax(0, 1fr)",
  gridAutoFlow: "column",
  gap: 10,
};

export const mascotToolButtonStyle: CSSProperties = {
  width: "100%",
  height: 52,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "0 8px",
  border: stickerBorder,
  borderRadius: 14,
  background: "#FFFFFF",
  color: INK,
  fontSize: 17,
  fontWeight: 700,
  cursor: "pointer",
};

export const mascotToolButtonPressedStyle: CSSProperties = {
  background: INK,
  color: "#FFF4DE",
};

export const mascotDialoguePagerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 6,
};

export const mascotDialoguePrevButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  border: 0,
  borderRadius: 12,
  background: "transparent",
  color: INK,
  cursor: "pointer",
};

export const mascotDialogueNextButtonStyle: CSSProperties = {
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  padding: "0 12px 0 16px",
  border: `2.5px solid ${INK}`,
  borderRadius: 999,
  background: "#FF8A3D",
  color: INK,
  fontSize: 16,
  fontWeight: 800,
  cursor: "pointer",
};

export const mascotDialoguePageIndicatorStyle: CSSProperties = {
  minWidth: 40,
  textAlign: "center",
  color: INK,
  fontSize: 15,
  fontWeight: 700,
};

export const mascotHintSpinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  flexShrink: 0,
};

export const mascotDialogueTextStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.25,
  color: INK,
  margin: 0,
  minWidth: 0,
  overflowWrap: "anywhere",
};

export const mascotDialogueCopyStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
};

export const mascotPictureDialogueCopyStyle: CSSProperties = {
  ...mascotDialogueCopyStyle,
  display: "flex",
  alignItems: "center",
  gap: 12,
};

export const mascotCompactSpriteStyle: CSSProperties = {
  flex: "0 0 58px",
  display: "block",
  width: 58,
  height: 58,
  objectFit: "contain",
  objectPosition: "center bottom",
};

export const mascotPhraseButtonStyle: CSSProperties = {
  padding: "0 3px",
  border: `2px solid ${INK}`,
  borderRadius: 6,
  background: "#FFE89A",
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
  cursor: "pointer",
};

// Extra leading so phrase highlights on neighbouring lines never touch.
export const mascotDialogueHintTextStyle: CSSProperties = {
  ...mascotDialogueTextStyle,
  lineHeight: 1.9,
};

export const mascotTranslationAnchorStyle: CSSProperties = {
  display: "inline-block",
  width: 0,
  verticalAlign: "top",
  lineHeight: 0,
};

export const mascotTranslationBubbleStyle: CSSProperties = {
  display: "block",
  width: "max-content",
  boxSizing: "border-box",
  marginBottom: 6,
  padding: "6px 12px",
  borderRadius: 12,
  background: INK,
  color: "#FFF4DE",
  fontFamily: "var(--font-jua), sans-serif",
  fontSize: 17,
  fontWeight: 400,
  lineHeight: 1.35,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
};

export const mascotStatusTextStyle: CSSProperties = {
  margin: 0,
  color: "#4A4A66",
  fontSize: 15,
  fontWeight: 600,
};
