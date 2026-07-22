/**
 * Mascot expression mapping (MASCOT-03, D-05).
 *
 * Pure domain module — no DB, server, or AI/LLM imports.
 * Maps existing mission-flow state signals to a fixed expression set.
 * Keeps no-harsh-failure mascot states structurally unreachable.
 */

import type { FlowStep } from "@/components/student/MissionFlowShell";

export type MascotExpression =
  | "idle"
  | "happy"
  | "celebrate"
  | "encouraging"
  | "thinking"
  | "sad";

type OriginalFeedbackKind =
  | "acceptedOriginal"
  | "needsCorrection"
  | "retryOriginal"
  | "retryMinimalEffort"
  | "teacherReview";

type RepeatFeedbackKind = "repeatAccepted" | "repeatRetry" | "repeatReview";

export function deriveExpression(input: {
  step: FlowStep;
  originalFeedbackKind?: OriginalFeedbackKind | null;
  repeatFeedbackKind?: RepeatFeedbackKind | null;
}): MascotExpression {
  if (input.step === "complete") return "celebrate";
  if (input.step === "cocoThinking") return "thinking";
  // Retry recorder screen: the student is re-recording the corrected sentence.
  // Coco cheers them on here (encouraging), distinct from the wrong-answer
  // result screen above it, which stays "thinking" (needsCorrection below).
  if (input.step === "repeat") return "encouraging";
  if (input.repeatFeedbackKind === "repeatAccepted") return "celebrate";
  if (input.repeatFeedbackKind === "repeatRetry") return "sad";
  if (input.repeatFeedbackKind === "repeatReview") return "thinking";
  if (input.originalFeedbackKind === "acceptedOriginal") return "celebrate";
  if (input.originalFeedbackKind === "needsCorrection") return "thinking";
  if (input.originalFeedbackKind === "retryOriginal") return "sad";
  // A supported retry is a nudge, not a failure — Coco cheers the student
  // toward a more useful answer.
  if (input.originalFeedbackKind === "retryMinimalEffort") return "encouraging";
  if (input.originalFeedbackKind === "teacherReview") return "thinking";
  return "idle";
}
