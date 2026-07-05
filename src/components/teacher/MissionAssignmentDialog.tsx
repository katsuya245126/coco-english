"use client";

import { useEffect, useState, useTransition } from "react";
import {
  cancelMissionAssignmentAction,
  listMissionAssignmentsAction,
} from "@/app/teacher/missions/actions";
import type { MissionAssignmentSummary } from "@/server/mission/mission-service";
import { HoverButton } from "@/components/ui/HoverButton";
import { dangerHover, secondaryHover } from "@/components/ui/hover-styles";

type MissionAssignmentDialogProps = {
  missionId: string;
  missionTitle: string;
  onClose: () => void;
  onChanged: (message: string) => void;
};

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function MissionAssignmentDialog({
  missionId,
  missionTitle,
  onClose,
  onChanged,
}: MissionAssignmentDialogProps) {
  const [assignments, setAssignments] = useState<MissionAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listMissionAssignmentsAction(missionId).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) {
        setAssignments(result.assignments);
      } else {
        setError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [missionId]);

  function handleCancelAssignment(assignment: MissionAssignmentSummary) {
    const confirmed = window.confirm(
      `Cancel "${missionTitle}" for ${assignment.className}?`,
    );
    if (!confirmed) return;

    setError(null);
    setCancelingId(assignment.id);
    startTransition(async () => {
      const result = await cancelMissionAssignmentAction({
        missionId,
        assignmentId: assignment.id,
      });
      setCancelingId(null);
      if (result.ok) {
        setAssignments((current) =>
          current.filter((item) => item.id !== assignment.id),
        );
        onChanged(`Canceled assignment for ${assignment.className}.`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Manage assignments"
      style={overlayStyle}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div style={panelStyle}>
        <h2 style={titleStyle}>Manage assignments</h2>
        <p style={subtitleStyle}>{missionTitle}</p>

        {error ? (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        ) : null}

        {loading ? (
          <p style={bodyTextStyle}>Loading assignments...</p>
        ) : assignments.length === 0 ? (
          <p style={bodyTextStyle}>No active class assignments.</p>
        ) : (
          <div style={listStyle}>
            {assignments.map((assignment) => (
              <div key={assignment.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <p style={classNameStyle}>{assignment.className}</p>
                  <p style={metaStyle}>Due {formatDate(assignment.dueAt)}</p>
                </div>
                <HoverButton
                  type="button"
                  onClick={() => handleCancelAssignment(assignment)}
                  disabled={isPending || cancelingId === assignment.id}
                  style={dangerButtonStyle}
                  hoverStyle={dangerHover}
                >
                  {cancelingId === assignment.id ? "Canceling..." : "Cancel assignment"}
                </HoverButton>
              </div>
            ))}
          </div>
        )}

        <div style={footerStyle}>
          <HoverButton
            type="button"
            onClick={onClose}
            style={secondaryButtonStyle}
            hoverStyle={secondaryHover}
          >
            Close
          </HoverButton>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const panelStyle: React.CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "min(680px, calc(100dvh - 32px))",
  overflow: "auto",
  background: "#FFFFFF",
  borderRadius: 8,
  padding: 24,
  boxShadow: "0 24px 64px rgba(17, 24, 39, 0.22)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#4B5563",
  margin: "4px 0 20px",
};

const bodyTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#4B5563",
  margin: 0,
};

const errorStyle: React.CSSProperties = {
  color: "#B42318",
  fontSize: 14,
  margin: "0 0 16px",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 12,
  flexWrap: "wrap",
};

const classNameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "#111827",
  margin: 0,
};

const metaStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#4B5563",
  margin: "4px 0 0",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 20,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#B42318",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
