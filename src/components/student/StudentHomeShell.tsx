"use client";

import { useRouter } from "next/navigation";
import { clearStudentUnlockAction } from "@/app/join/actions";
import {
  bodyStyle,
  displayTitleStyle,
  headingStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";

// Verbatim UI-SPEC copy.
const NO_HOMEWORK_HEADING = "No homework yet";
const NO_HOMEWORK_BODY =
  "You are signed in for this class. Your teacher has not assigned speaking homework yet.";
const CLOSED_PLACEHOLDER =
  "This homework is not open right now. Ask your teacher what to do next.";

type StudentHomeShellProps = {
  className: string;
  displayName: string;
};

// Phase 2 student home shell (STUD-05, D-14).
//
// Shows ONLY class/name context, the no-homework state, and a reserved
// closed/expired placeholder. It deliberately contains NONE of: mission cards,
// recording controls, buddy chat, progress rings, scores, leaderboards, or
// review feedback (all out of scope for Phase 2). A small action returns the
// student to join entry / switches class.
export function StudentHomeShell({
  className,
  displayName,
}: StudentHomeShellProps) {
  const router = useRouter();

  async function handleSwitchClass() {
    await clearStudentUnlockAction();
    router.push("/join");
  }

  return (
    <div>
      <h1 style={displayTitleStyle}>{className}</h1>
      <p style={{ ...bodyStyle, marginBottom: 24 }}>
        Signed in as <strong>{displayName}</strong>
      </p>

      <section
        aria-live="polite"
        style={{
          background: "#F7F8FA",
          border: "1px solid #E5E7EB",
          borderRadius: 8,
          padding: 24,
          marginBottom: 16,
        }}
      >
        <h2 style={headingStyle}>{NO_HOMEWORK_HEADING}</h2>
        <p style={{ ...bodyStyle, marginBottom: 0 }}>{NO_HOMEWORK_BODY}</p>
      </section>

      {/* Reserved closed/expired placeholder — hidden until a future phase has
          assignment state to render. Kept in the DOM (visually hidden) so the
          copy contract is established now. */}
      <p hidden data-testid="closed-expired-placeholder">
        {CLOSED_PLACEHOLDER}
      </p>

      <button
        type="button"
        style={secondaryButtonStyle}
        onClick={handleSwitchClass}
      >
        Switch class
      </button>
    </div>
  );
}
