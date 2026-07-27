"use client";

/**
 * Mission completion step card (FLOW-06, D-06).
 *
 * Displays "Mission complete!" heading, a body message summarizing
 * the finished turns, and a "Back to homework" button that navigates
 * to /student/home.
 *
 * No AI import; all text is static from the character profile.
 */

import { useRouter } from "next/navigation";
import { primaryButtonStyle } from "@/components/student/styles";
import { CocoSpeechAudio } from "@/components/student/CocoSpeechAudio";

export type StepMissionCompleteProps = {
  assignmentStudentId: string;
  completionHeading: string;
  completionBody: string;
  onAmplitudeFrame?: (level: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  showCocoLine?: boolean;
};

export function StepMissionComplete({
  assignmentStudentId,
  completionHeading,
  completionBody,
  onAmplitudeFrame,
  onPlayingChange,
  showCocoLine = true,
}: StepMissionCompleteProps) {
  const router = useRouter();

  return (
    <div style={{ textAlign: "center", padding: 24 }} aria-live="polite">
      {showCocoLine ? (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#111827",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {completionHeading}
        </h2>
        {/* Voice the completion celebration line (D-11). */}
        <CocoSpeechAudio
          assignmentStudentId={assignmentStudentId}
          line={{ lineKind: "completion_celebration" }}
          onAmplitudeFrame={onAmplitudeFrame}
          onPlayingChange={onPlayingChange}
        />
      </div>
      ) : null}
      <p
        style={{
          fontSize: 16,
          color: "#4B5563",
          margin: "8px 0 0",
          lineHeight: 1.5,
        }}
      >
        {completionBody}
      </p>
      <button
        className="student-primary-button"
        type="button"
        style={{ ...primaryButtonStyle, marginTop: 24 }}
        onClick={() => router.push("/student/home")}
      >
        Back to homework
      </button>
    </div>
  );
}
