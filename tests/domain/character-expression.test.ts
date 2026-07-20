import { describe, expect, it } from "vitest";
import type { FlowStep } from "@/components/student/MissionFlowShell";
import {
  deriveExpression,
  type MascotExpression,
} from "@/domain/character/expression";

type OriginalFeedbackKind =
  | "acceptedOriginal"
  | "needsCorrection"
  | "retryOriginal"
  | "retryFullSentence"
  | "teacherReview";

type RepeatFeedbackKind = "repeatAccepted" | "repeatRetry" | "repeatReview";

const allSteps: FlowStep[] = [
  "question",
  "cocoThinking",
  "aiFeedback",
  "repeat",
  "repeatFeedback",
  "transition",
  "reviewPending",
  "complete",
];

const originalFeedbackKinds: Array<OriginalFeedbackKind | undefined> = [
  undefined,
  "acceptedOriginal",
  "needsCorrection",
  "retryOriginal",
  "retryFullSentence",
  "teacherReview",
];

const repeatFeedbackKinds: Array<RepeatFeedbackKind | undefined> = [
  undefined,
  "repeatAccepted",
  "repeatRetry",
  "repeatReview",
];

const allowedExpressions: MascotExpression[] = [
  "idle",
  "happy",
  "celebrate",
  "encouraging",
  "thinking",
  "sad",
];

describe("deriveExpression (MASCOT-03)", () => {
  it("maps complete to celebrate before feedback kinds", () => {
    expect(
      deriveExpression({
        step: "complete",
        originalFeedbackKind: "acceptedOriginal",
        repeatFeedbackKind: "repeatAccepted",
      }),
    ).toBe("celebrate");
  });

  it("maps repeat feedback to celebrate, sad, or thinking", () => {
    expect(
      deriveExpression({
        step: "repeatFeedback",
        repeatFeedbackKind: "repeatAccepted",
      }),
    ).toBe("celebrate");
    expect(
      deriveExpression({
        step: "repeatFeedback",
        repeatFeedbackKind: "repeatRetry",
      }),
    ).toBe("sad");
    expect(
      deriveExpression({
        step: "repeatFeedback",
        repeatFeedbackKind: "repeatReview",
      }),
    ).toBe("thinking");
  });

  it("maps original feedback to celebrate, thinking, or sad", () => {
    expect(
      deriveExpression({
        step: "aiFeedback",
        originalFeedbackKind: "acceptedOriginal",
      }),
    ).toBe("celebrate");
    expect(
      deriveExpression({
        step: "aiFeedback",
        originalFeedbackKind: "needsCorrection",
      }),
    ).toBe("thinking");
    expect(
      deriveExpression({
        step: "aiFeedback",
        originalFeedbackKind: "retryOriginal",
      }),
    ).toBe("sad");
  });

  it("keeps the full-sentence retry encouraging, never sad", () => {
    expect(
      deriveExpression({
        step: "aiFeedback",
        originalFeedbackKind: "retryFullSentence",
      }),
    ).toBe("encouraging");
  });

  it("keeps teacher-review outcomes non-committal", () => {
    expect(
      deriveExpression({
        step: "aiFeedback",
        originalFeedbackKind: "teacherReview",
      }),
    ).toBe("thinking");
    expect(
      deriveExpression({
        step: "repeatFeedback",
        repeatFeedbackKind: "repeatReview",
      }),
    ).toBe("thinking");
  });

  it("cheers on the retry recorder screen with encouraging", () => {
    // The repeat step is only reached when the student is re-recording the
    // corrected sentence, so Coco is encouraging there regardless of prior
    // feedback kind (which no longer applies once the flow advances).
    expect(deriveExpression({ step: "repeat" })).toBe("encouraging");
    expect(
      deriveExpression({
        step: "repeat",
        originalFeedbackKind: "needsCorrection",
      }),
    ).toBe("encouraging");
  });

  it("uses the thinking expression while Coco generates a reply", () => {
    expect(deriveExpression({ step: "cocoThinking" })).toBe("thinking");
  });

  it("maps neutral flow steps with no feedback to idle", () => {
    const neutralSteps = allSteps.filter(
      (candidate) =>
        candidate !== "complete" &&
        candidate !== "repeat" &&
        candidate !== "cocoThinking",
    );
    for (const step of neutralSteps) {
      expect(deriveExpression({ step })).toBe("idle");
    }
  });

  it("always returns one of the approved expression assets", () => {
    for (const step of allSteps) {
      for (const originalFeedbackKind of originalFeedbackKinds) {
        for (const repeatFeedbackKind of repeatFeedbackKinds) {
          const expression = deriveExpression({
            step,
            originalFeedbackKind,
            repeatFeedbackKind,
          });

          expect(allowedExpressions).toContain(expression);
        }
      }
    }
  });
});
