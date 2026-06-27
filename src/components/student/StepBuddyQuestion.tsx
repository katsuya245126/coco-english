"use client";

/**
 * Step 1: Buddy question + student answer input + hint area (FLOW-02, CHAR-01/02).
 *
 * Renders the buddy speech card with the snapshot turn prompt, the hint area
 * (HintRevealer from Task 3), and a labeled text input with validation error.
 * All text is rendered as React text nodes (no raw innerHTML — V5, T-04-13).
 * No AI client import (AI-06).
 */

import { useState, useId } from "react";
import type { HintLadder } from "@/domain/mission/schemas";
import {
  stepCardStyle,
  buddyCardStyle,
  labelStyle,
  inputStyle,
  primaryButtonStyle,
  errorTextStyle,
} from "@/components/student/styles";
import { HintRevealer } from "@/components/student/HintRevealer";

type StepBuddyQuestionProps = {
  questionLabel: string;
  prompt: string;
  hintLadder: HintLadder;
  hintLevel: number;
  onRevealHint: (nextLevel: number) => void;
  onSubmitAnswer: (answer: string) => void;
  isSubmitting: boolean;
};

export function StepBuddyQuestion({
  questionLabel,
  prompt,
  hintLadder,
  hintLevel,
  onRevealHint,
  onSubmitAnswer,
  isSubmitting,
}: StepBuddyQuestionProps) {
  const [answer, setAnswer] = useState("");
  const [showError, setShowError] = useState(false);
  const errorId = useId();

  function handleSubmit() {
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onSubmitAnswer(trimmed);
  }

  return (
    <div style={stepCardStyle} aria-live="polite">
      {/* Buddy speech area */}
      <div style={buddyCardStyle}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
          {questionLabel}
        </p>
        <p style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.25 }}>
          {prompt}
        </p>
      </div>

      {/* Hint area */}
      <div style={{ marginTop: 16 }}>
        <HintRevealer
          hintLadder={hintLadder}
          hintLevel={hintLevel}
          onReveal={onRevealHint}
        />
      </div>

      {/* Answer input area */}
      <div style={{ marginTop: 16 }}>
        <label htmlFor="answer-input" style={labelStyle}>
          Your answer
        </label>
        <input
          id="answer-input"
          type="text"
          style={inputStyle}
          placeholder="Type your answer here"
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            if (showError) setShowError(false);
          }}
          disabled={isSubmitting}
          aria-describedby={showError ? errorId : undefined}
        />
        {showError && (
          <p id={errorId} style={errorTextStyle} role="alert">
            Type an answer before submitting.
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
          {isSubmitting ? "Submitting..." : "Submit answer"}
        </button>
      </div>
    </div>
  );
}
