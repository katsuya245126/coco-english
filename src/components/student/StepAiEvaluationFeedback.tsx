"use client";

import type { CSSProperties } from "react";
import {
  evaluationErrorStyle,
  evaluationReviewStyle,
  evaluationSuccessStyle,
  improvedSentenceCardStyle,
  primaryButtonStyle,
  stepCardStyle,
} from "@/components/student/styles";

type OriginalOutcome =
  | "checking"
  | "acceptedOriginal"
  | "needsCorrection"
  | "retryOriginal"
  | "teacherReview";

type RepeatOutcome = "repeatAccepted" | "repeatRetry" | "repeatReview";

type StepAiEvaluationFeedbackProps = {
  mode: "original" | "repeat";
  outcome: OriginalOutcome | RepeatOutcome;
  transcript?: string | null;
  improvedSentence?: string | null;
  onContinue?: () => void | Promise<void>;
  onRetry?: () => void;
  isSubmitting?: boolean;
};

export function StepAiEvaluationFeedback({
  mode,
  outcome,
  transcript,
  improvedSentence,
  onContinue,
  onRetry,
  isSubmitting = false,
}: StepAiEvaluationFeedbackProps) {
  if (outcome === "checking") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <p style={{ fontSize: 16, color: "#4B5563", margin: 0 }}>
          {mode === "original" ? "Checking your answer..." : "Checking your repeat..."}
        </p>
      </div>
    );
  }

  if (outcome === "acceptedOriginal") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} />
        <div style={evaluationSuccessStyle}>
          <h2 style={headingInlineStyle}>Nice answer!</h2>
          <p style={bodyInlineStyle}>
            You used the English practice well. Let&apos;s keep going.
          </p>
        </div>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue mission
        </button>
      </div>
    );
  }

  if (outcome === "needsCorrection") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} />
        <div style={{ ...improvedSentenceCardStyle, marginTop: transcript ? 16 : 0 }}>
          <h2 style={headingInlineStyle}>Nice try! Here is a clearer way to say it:</h2>
          <p style={sentenceStyle}>{improvedSentence}</p>
        </div>
        <p style={{ ...bodyInlineStyle, marginTop: 16 }}>
          Now repeat this sentence.
        </p>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 8 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue practice
        </button>
      </div>
    );
  }

  if (outcome === "retryOriginal") {
    return (
      <div style={stepCardStyle} aria-live="polite" role="alert">
        <Transcript transcript={transcript} />
        <div style={{ ...evaluationErrorStyle, marginTop: transcript ? 16 : 0 }}>
          <h2 style={headingInlineStyle}>Try that in English.</h2>
          <p style={bodyInlineStyle}>Record your answer again using English.</p>
        </div>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16 }}
          onClick={onRetry}
        >
          Record again
        </button>
      </div>
    );
  }

  if (outcome === "teacherReview" || outcome === "repeatReview") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <Transcript transcript={transcript} />
        <div style={{ ...evaluationReviewStyle, marginTop: transcript ? 16 : 0 }}>
          <p style={badgeStyle}>Teacher review</p>
          <h2 style={headingInlineStyle}>Your teacher will check this answer.</h2>
          <p style={bodyInlineStyle}>
            Keep going. Your teacher can review this turn later.
          </p>
        </div>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue mission
        </button>
      </div>
    );
  }

  if (outcome === "repeatAccepted") {
    return (
      <div style={stepCardStyle} aria-live="polite">
        <div style={evaluationSuccessStyle}>
          <h2 style={headingInlineStyle}>Good repeat.</h2>
        </div>
        <button
          type="button"
          style={{ ...primaryButtonStyle, marginTop: 16 }}
          onClick={onContinue}
          disabled={isSubmitting}
        >
          Continue practice
        </button>
      </div>
    );
  }

  return (
    <div style={stepCardStyle} aria-live="polite" role="alert">
      <div style={evaluationErrorStyle}>
        <h2 style={headingInlineStyle}>Try the repeat again.</h2>
        <p style={bodyInlineStyle}>
          Listen to the sentence and record it one more time.
        </p>
      </div>
      <button
        type="button"
        style={{ ...primaryButtonStyle, marginTop: 16 }}
        onClick={onRetry}
      >
        Record again
      </button>
    </div>
  );
}

function Transcript({ transcript }: { transcript?: string | null }) {
  if (!transcript) return null;
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
        We heard:
      </p>
      <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
        {transcript}
      </p>
    </div>
  );
}

const headingInlineStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: "#111827",
  margin: "0 0 8px",
  lineHeight: 1.25,
};

const bodyInlineStyle: CSSProperties = {
  fontSize: 16,
  color: "#4B5563",
  margin: 0,
  lineHeight: 1.5,
};

const sentenceStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: "#111827",
  margin: 0,
  lineHeight: 1.25,
};

const badgeStyle: CSSProperties = {
  display: "inline-block",
  fontSize: 14,
  fontWeight: 600,
  color: "#B45309",
  margin: "0 0 8px",
};
