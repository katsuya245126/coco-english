"use client";

import { primaryButtonStyle, stepCardStyle } from "@/components/student/styles";

export type StepConversationClosingProps = {
  onFinish: () => void;
};

export function StepConversationClosing({
  onFinish,
}: StepConversationClosingProps) {
  return (
    <div style={{ ...stepCardStyle, textAlign: "center" }} aria-live="polite">
      <button
        type="button"
        style={primaryButtonStyle}
        onClick={onFinish}
      >
        Finish mission
      </button>
    </div>
  );
}
