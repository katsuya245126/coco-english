"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeAssignedHomeworkAction } from "@/app/teacher/assignment-actions";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";

export function AssignmentStudentDismissControls({
  assignmentStudentId,
  className,
  dismissed,
}: {
  assignmentStudentId: string;
  className: string;
  dismissed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const incompleteHref = `/teacher/incomplete?class=${encodeURIComponent(className)}`;

  const markDone = () => startTransition(async () => {
    setError(false);
    try {
      const result = await changeAssignedHomeworkAction({ assignedHomeworkId: assignmentStudentId, action: "dismiss" });
      if (result.ok) router.push(incompleteHref);
      else setError(true);
    } catch {
      setError(true);
    }
  });

  const undo = () => startTransition(async () => {
    setError(false);
    try {
      const result = await changeAssignedHomeworkAction({ assignedHomeworkId: assignmentStudentId, action: "undo_dismiss" });
      if (result.ok) router.refresh();
      else setError(true);
    } catch {
      setError(true);
    }
  });

  return (
    <section aria-label="Assignment actions" style={sectionStyle}>
      <h2 style={headingStyle}>Teacher action</h2>
      {dismissed ? (
        <HoverButton
          type="button"
          disabled={pending}
          onClick={undo}
          style={secondaryButtonStyle}
          hoverStyle={secondaryHover}
        >
          Undo
        </HoverButton>
      ) : (
        <>
          <p style={helperStyle}>
            Removes this from your incomplete list. You can undo this.
          </p>
          <HoverButton
            type="button"
            disabled={pending}
            onClick={markDone}
            style={primaryButtonStyle}
            hoverStyle={primaryHover}
          >
            Mark as done
          </HoverButton>
        </>
      )}
      {error && (
        <p role="alert" style={errorStyle}>
          Could not update this assignment. Please try again.
        </p>
      )}
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 24,
  padding: 20,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#FFFFFF",
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 16,
  fontWeight: 600,
  color: "#111827",
};

const helperStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  color: "#4B5563",
  lineHeight: 1.5,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
};

const errorStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: "#B42318",
};
