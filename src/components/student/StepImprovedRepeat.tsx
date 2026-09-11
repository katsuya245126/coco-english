"use client";

/**
 * Step 2: Improved sentence + required voice repeat (FLOW-04, FLOW-05, D-03).
 *
 * Shows the improved target-form sentence from the snapshot (never generated —
 * FLOW-04) and a reusable voice recorder control for the required repeat.
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
  /**
   * Short label above the target sentence (e.g. "Say") —
   * intentionally distinct from the character profile's fuller
   * `improvedSentenceIntro`, which Coco speaks via TTS.
   */
  improvedSentenceLabel: string;
  targetExample: string;
  onAmplitudeFrame?: (level: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  showCocoLine?: boolean;
  onVoiceRecorded: (recording: RepeatVoiceClip) => void | Promise<void>;
  isSubmitting: boolean;
  recorderDisabled?: boolean;
};

export function StepImprovedRepeat({
  assignmentStudentId,
  turnOrder,
  improvedSentenceLabel,
  targetExample,
  onAmplitudeFrame,
  onPlayingChange,
  showCocoLine = true,
  onVoiceRecorded,
  isSubmitting,
  recorderDisabled = false,
}: StepImprovedRepeatProps) {
  return (
    <div style={stepCardStyle} aria-live="polite">
      {/* Improved / model sentence area — voiced (D-07). */}
      {showCocoLine ? (
      <div style={improvedSentenceCardStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600, color: "#2563EB", margin: 0, lineHeight: 1.4 }}>
            {improvedSentenceLabel}
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

      {/* Repeat recorder area */}
      <div style={{ marginTop: showCocoLine ? 16 : 0 }}>
        <VoiceRecorderControl
          mode="repeat"
          maxSeconds={60}
          disabled={isSubmitting || recorderDisabled}
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
