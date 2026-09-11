"use client";

/**
 * Step 1: Buddy question + student voice answer + hint area (FLOW-02, CHAR-01/02).
 *
 * Renders the buddy speech card with the snapshot turn prompt, the hint area
 * (HintRevealer), and a reusable voice recorder control.
 * All text is rendered as React text nodes (no raw innerHTML — V5, T-04-13).
 * No AI client import (AI-06).
 */

import { useEffect, useState } from "react";
import {
  stepCardStyle,
  buddyCardStyle,
  hintCardStyle,
  tintedHintButtonStyle,
} from "@/components/student/styles";
import { HintRevealer } from "@/components/student/HintRevealer";
import type { HintLadder } from "@/domain/mission/schemas";
import { CocoSpeechAudio } from "@/components/student/CocoSpeechAudio";
import {
  VoiceRecorderControl,
  type RecorderState,
  type VoiceRecordingMetadata,
} from "@/components/student/VoiceRecorderControl";

export type RecordedVoiceClip = VoiceRecordingMetadata & {
  blob: Blob;
};

type AnswerHelpProps =
  | {
      hintLadder: HintLadder;
      hintLevel: number;
      onRevealHint: (nextLevel: number) => void;
    }
  | {
      hintLadder?: never;
      hintLevel?: never;
      onRevealHint?: never;
    };

type StepBuddyQuestionProps = AnswerHelpProps & {
  assignmentStudentId: string;
  turnOrder: number;
  prompt: string;
  replyHintFrame?: string | null;
  onAmplitudeFrame?: (level: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  showCocoLine?: boolean;
  onRecorderStateChange?: (state: RecorderState) => void;
  onVoiceRecorded: (recording: RecordedVoiceClip) => void | Promise<void>;
  isSubmitting: boolean;
  recorderDisabled?: boolean;
};

export function StepBuddyQuestion({
  assignmentStudentId,
  turnOrder,
  prompt,
  replyHintFrame,
  hintLadder,
  hintLevel,
  onAmplitudeFrame,
  onPlayingChange,
  showCocoLine = true,
  onRecorderStateChange,
  onRevealHint,
  onVoiceRecorded,
  isSubmitting,
  recorderDisabled = false,
}: StepBuddyQuestionProps) {
  const [replyHintVisible, setReplyHintVisible] = useState(false);

  useEffect(() => {
    setReplyHintVisible(false);
  }, [replyHintFrame]);

  return (
    <div style={stepCardStyle} aria-live="polite">
      {showCocoLine ? (
        <div style={buddyCardStyle}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            {/* Voice the mission prompt (D-06). Text above renders regardless. */}
            <CocoSpeechAudio
              assignmentStudentId={assignmentStudentId}
              line={{ lineKind: "mission_prompt", turnOrder }}
              onAmplitudeFrame={onAmplitudeFrame}
              onPlayingChange={onPlayingChange}
            />
          </div>
          <p style={{ fontSize: 20, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.25 }}>
            {prompt}
          </p>
        </div>
      ) : null}

      {replyHintFrame ? (
        <div style={{ marginTop: showCocoLine ? 16 : 0 }}>
          <button
            type="button"
            className="student-tinted-button"
            aria-expanded={replyHintVisible}
            onClick={() => setReplyHintVisible((visible) => !visible)}
            style={tintedHintButtonStyle}
          >
            {replyHintVisible ? "Hide hint" : "Show hint"}
          </button>

          <div
            aria-hidden={!replyHintVisible}
            style={{
              ...hintCardStyle,
              display: replyHintVisible ? "block" : "none",
              marginTop: 8,
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#4B5563",
                margin: "0 0 4px",
                lineHeight: 1.4,
              }}
            >
              Try:
            </p>
            <p
              style={{
                fontSize: 16,
                color: "#111827",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {replyHintFrame}
            </p>
          </div>
        </div>
      ) : null}

      {hintLadder && hintLevel !== undefined && onRevealHint ? (
        <div style={{ marginTop: showCocoLine ? 16 : 0 }}>
          <HintRevealer
            hintLadder={hintLadder}
            hintLevel={hintLevel}
            onReveal={onRevealHint}
          />
        </div>
      ) : null}

      {/* Answer recorder area */}
      <div style={{ marginTop: 16 }}>
        <VoiceRecorderControl
          mode="original"
          maxSeconds={60}
          disabled={isSubmitting || recorderDisabled}
          onStateChange={onRecorderStateChange}
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
