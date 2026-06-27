"use client";

/**
 * Turn transition step card (FLOW-05, D-03).
 *
 * Displays a success message and "Next turn" button between turns.
 * The callback advances the shell's turnIndex and resets the step
 * to "question" for the next turn, updating the progress bar.
 *
 * No AI import; text is static from the character profile.
 */

import { primaryButtonStyle } from "@/components/student/styles";

export type StepTurnTransitionProps = {
  transitionMessage: string;
  onNextTurn: () => void;
};

export function StepTurnTransition({
  transitionMessage,
  onNextTurn,
}: StepTurnTransitionProps) {
  return (
    <div style={{ textAlign: "center", padding: 24 }} aria-live="polite">
      <p
        style={{
          fontSize: 16,
          color: "#177245",
          margin: "0 0 16px",
          fontWeight: 400,
          lineHeight: 1.5,
        }}
      >
        {transitionMessage}
      </p>
      <button
        type="button"
        style={primaryButtonStyle}
        onClick={onNextTurn}
      >
        Next turn
      </button>
    </div>
  );
}
