"use client";

/**
 * Step 2: Improved sentence + required voice repeat (FLOW-04, FLOW-05, D-03).
 *
 * Shows the student's original transcript when available, the improved target-form
 * sentence from the snapshot (never generated — FLOW-04), the repeat
 * instruction, and a reusable voice recorder control for the required repeat.
 * All text is rendered as React text nodes (no raw innerHTML — V5, T-04-13).
 * No AI client import (AI-06).
 */

import {
  stepCardStyle,
  improvedSentenceCardStyle,
} from "@/components/student/styles";
import {
  VoiceRecorderControl,
  type VoiceRecordingMetadata,
} from "@/components/student/VoiceRecorderControl";

export type RepeatVoiceClip = VoiceRecordingMetadata & {
  blob: Blob;
};

type StepImprovedRepeatProps = {
  originalTranscript: string | null;
  improvedSentenceIntro: string;
  targetExample: string;
  repeatInstruction: string;
  onVoiceRecorded: (recording: RepeatVoiceClip) => void | Promise<void>;
  isSubmitting: boolean;
};

export function StepImprovedRepeat({
  originalTranscript,
  improvedSentenceIntro,
  targetExample,
  repeatInstruction,
  onVoiceRecorded,
  isSubmitting,
}: StepImprovedRepeatProps) {
  return (
    <div style={stepCardStyle} aria-live="polite">
      {originalTranscript && (
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: "0 0 4px" }}>
            We heard:
          </p>
          <p style={{ fontSize: 16, color: "#111827", margin: 0, lineHeight: 1.5 }}>
            {originalTranscript}
          </p>
        </div>
      )}

      {/* Improved sentence area */}
      <div style={{ ...improvedSentenceCardStyle, marginTop: originalTranscript ? 16 : 0 }}>
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

      {/* Repeat recorder area */}
      <div>
        <VoiceRecorderControl
          mode="repeat"
          maxSeconds={20}
          disabled={isSubmitting}
          onRecorded={(blob, metadata) =>
            onVoiceRecorded({
              blob,
              ...metadata,
            })
          }
        />
      </div>
    </div>
  );
}
