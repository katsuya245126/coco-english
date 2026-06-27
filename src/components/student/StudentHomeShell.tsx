"use client";

import { useRouter } from "next/navigation";
import { clearStudentUnlockAction } from "@/app/join/actions";
import {
  bodyStyle,
  displayTitleStyle,
  headingStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";
import { AssignmentListItem } from "@/components/student/AssignmentListItem";
import type { StudentAssignmentListItem } from "@/server/student-access/assignment-list";

// Verbatim UI-SPEC copy.
const NO_HOMEWORK_HEADING = "No homework yet";
const NO_HOMEWORK_BODY =
  "You are signed in for this class. Your teacher has not assigned speaking homework yet.";

type StudentHomeShellProps = {
  className: string;
  displayName: string;
  assignments: StudentAssignmentListItem[];
};

// Student home shell (STUD-05, D-14, FLOW-01).
//
// Renders the student's assignment list with per-item badge states, or falls
// back to the "No homework yet" empty state when no assignments exist (D-13).
// The assignment list is passed from the SSR page; no client-side data fetching.
export function StudentHomeShell({
  className,
  displayName,
  assignments,
}: StudentHomeShellProps) {
  const router = useRouter();

  async function handleSwitchClass() {
    await clearStudentUnlockAction();
    router.push("/join");
  }

  const hasAssignments = assignments.length > 0;

  return (
    <div>
      <h1 style={displayTitleStyle}>{className}</h1>
      <p style={{ ...bodyStyle, marginBottom: 24 }}>
        Signed in as <strong>{displayName}</strong>
      </p>

      {hasAssignments ? (
        <section aria-live="polite">
          <h2 style={{ ...headingStyle, marginBottom: 8 }}>Your homework</h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {assignments.map((item) => (
              <AssignmentListItem
                key={item.assignmentStudentId}
                item={item}
              />
            ))}
          </div>
        </section>
      ) : (
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
      )}

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
