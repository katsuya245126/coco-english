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

export type StepMissionCompleteProps = {
  completionHeading: string;
  completionBody: string;
};

export function StepMissionComplete({
  completionHeading,
  completionBody,
}: StepMissionCompleteProps) {
  const router = useRouter();

  return (
    <div style={{ textAlign: "center", padding: 24 }} aria-live="polite">
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
        type="button"
        style={{ ...primaryButtonStyle, marginTop: 24 }}
        onClick={() => router.push("/student/home")}
      >
        Back to homework
      </button>
    </div>
  );
}
