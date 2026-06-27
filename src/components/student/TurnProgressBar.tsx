"use client";

/**
 * Turn progress bar (FLOW-01, D-12).
 *
 * Shows "Turn {current} of {total}" label and a horizontal progress bar
 * with role="progressbar" and proper aria attributes. Fill width represents
 * progress through the current turn (current / total), so the final turn
 * fills the bar to 100% rather than capping at (total - 1) / total.
 */

import { labelStyle, progressTrackStyle, progressFillStyle } from "@/components/student/styles";

type TurnProgressBarProps = {
  current: number;
  total: number;
};

export function TurnProgressBar({ current, total }: TurnProgressBarProps) {
  // Fill represents progress through the current turn, so the final turn
  // reaches 100% (Turn 1 of 2 → 50%, Turn 2 of 2 → 100%).
  const progressFraction = total > 0 ? Math.max(0, current / total) : 0;
  const fillPercent = Math.min(progressFraction * 100, 100);

  return (
    <div>
      <p style={{ ...labelStyle, color: "#4B5563", marginBottom: 4 }}>
        Turn {current} of {total}
      </p>
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Turn ${current} of ${total}`}
        style={progressTrackStyle}
      >
        <div
          style={{
            ...progressFillStyle,
            width: `${fillPercent}%`,
          }}
        />
      </div>
    </div>
  );
}
