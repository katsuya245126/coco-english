"use client";

/**
 * Turn progress bar (FLOW-01, D-12).
 *
 * Shows "Turn {current} of {total}" label and a horizontal progress bar
 * with role="progressbar" and proper aria attributes. Fill width represents
 * the completed fraction (current - 1) / total since the current turn is
 * in-progress (not yet completed).
 */

import { labelStyle, progressTrackStyle, progressFillStyle } from "@/components/student/styles";

type TurnProgressBarProps = {
  current: number;
  total: number;
};

export function TurnProgressBar({ current, total }: TurnProgressBarProps) {
  // Completed turns are turns before the current one.
  const completedFraction = Math.max(0, (current - 1) / total);
  const fillPercent = Math.min(completedFraction * 100, 100);

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
