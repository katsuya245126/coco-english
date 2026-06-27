"use client";

/**
 * Step 2: Improved sentence + required repeat (FLOW-04, FLOW-05, D-03).
 *
 * Shows the student's original answer (read-only), the improved target-form
 * sentence from the snapshot (never generated — FLOW-04), the repeat
 * instruction, and a labeled text input for the required repeat.
 * All text is rendered as React text nodes (no raw innerHTML — V5, T-04-13).
 * No AI client import (AI-06).
 */

import { useState, useId } from "react";
import {
  stepCardStyle,
  improvedSentenceCardStyle,
  labelStyle,
  inputStyle,
  primaryButtonStyle,
  errorTextStyle,
} from "@/components/student/styles";

type StepImprovedRepeatProps = {
  originalAnswer: string;
  improvedSentenceIntro: string;
  targetExample: string;
  repeatInstruction: string;
  onSubmitRepeat: (repeat: string) => void;
  isSubmitting: boolean;
};

export function StepImprovedRepeat({
  originalAnswer,
  improvedSentenceIntro,
  targetExample,
  repeatInstruction,
  onSubmitRepeat,
  isSubmitting,
}: StepImprovedRepeatProps) {
  const [repeat, setRepeat] = useState("");
  const [showError, setShowError] = useState(false);
  const errorId = useId();

  function handleSubmit() {
    const trimmed = repeat.trim();
    if (trimmed.length === 0) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onSubmitRepeat(trimmed);
  }

  return (
    <div style={stepCardStyle} aria-live="polite">
      {/* Student's original answer (read-only) */}
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
          Your answer:
        </p>
        <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
          {originalAnswer}
        </p>
      </div>

      {/* Improved sentence area */}
      <div style={{ ...improvedSentenceCardStyle, marginTop: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
          {improvedSentenceIntro}
        </p>
        <p style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.25 }}>
          {targetExample}
        </p>
      </div>

      {/* Repeat instruction */}
      <p style={{ fontSize: 16, color: "#4B5563", margin: "16px 0 8px", lineHeight: 1.5 }}>
        {repeatInstruction}
      </p>

      {/* Repeat input area */}
      <div>
        <label htmlFor="repeat-input" style={labelStyle}>
          Your repeat
        </label>
        <input
          id="repeat-input"
          type="text"
          style={inputStyle}
          placeholder="Type the sentence above"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
            if (showError) setShowError(false);
          }}
          disabled={isSubmitting}
          aria-describedby={showError ? errorId : undefined}
        />
        {showError && (
          <p id={errorId} style={errorTextStyle} role="alert">
            Type the sentence before submitting.
          </p>
        )}
      </div>

      {/* Submit button */}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          style={{
            ...primaryButtonStyle,
            opacity: isSubmitting ? 0.7 : 1,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Submitting..." : "Submit repeat"}
        </button>
      </div>
    </div>
  );
}
