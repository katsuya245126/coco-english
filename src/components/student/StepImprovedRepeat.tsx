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
import { CocoSpeechAudio } from "@/components/student/CocoSpeechAudio";
import {
  VoiceRecorderControl,
  type VoiceRecordingMetadata,
} from "@/components/student/VoiceRecorderControl";

export type RepeatVoiceClip = VoiceRecordingMetadata & {
  blob: Blob;
};

type StepImprovedRepeatProps = {
  assignmentStudentId: string;
  turnOrder: number;
  originalTranscript: string | null;
  improvedSentenceIntro: string;
  targetExample: string;
  repeatInstruction: string;
  onAmplitudeFrame?: (level: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  showCocoLine?: boolean;
  onVoiceRecorded: (recording: RepeatVoiceClip) => void | Promise<void>;
  isSubmitting: boolean;
};

export function StepImprovedRepeat({
  assignmentStudentId,
  turnOrder,
  originalTranscript,
  improvedSentenceIntro,
  targetExample,
  repeatInstruction,
  onAmplitudeFrame,
  onPlayingChange,
  showCocoLine = true,
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

      {/* Improved / model sentence area — voiced (D-07). The transcript block
          above is deliberately NOT voiced (D-10). */}
      {showCocoLine ? (
      <div style={{ ...improvedSentenceCardStyle, marginTop: originalTranscript ? 16 : 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600, color: "#4B5563", margin: 0, lineHeight: 1.4 }}>
            {improvedSentenceIntro}
          </p>
          <CocoSpeechAudio
            assignmentStudentId={assignmentStudentId}
            line={{ lineKind: "improved_sentence", turnOrder }}
            onAmplitudeFrame={onAmplitudeFrame}
            onPlayingChange={onPlayingChange}
          />
        </div>
        <p style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.25 }}>
          {targetExample}
        </p>
      </div>
      ) : null}

      {/* Repeat instruction */}
      <p style={{ fontSize: 16, color: "#4B5563", margin: showCocoLine || originalTranscript ? "16px 0 8px" : "0 0 8px", lineHeight: 1.5 }}>
        {repeatInstruction}
      </p>

      {/* Repeat recorder area */}
      <div>
        <VoiceRecorderControl
          mode="repeat"
          maxSeconds={60}
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
