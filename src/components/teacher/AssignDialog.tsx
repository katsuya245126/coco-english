"use client";

import { useEffect, useState } from "react";
import {
  assignMissionAction,
  type AssignMissionActionResult,
} from "@/app/teacher/missions/actions";
import type { AssignableClass } from "@/server/mission/assign-service";

type AssignDialogProps = {
  missionId: string;
  missionTitle: string;
  classes: AssignableClass[];
  onClose: () => void;
  onAssigned: (message: string) => void;
};

export function AssignDialog({
  missionId,
  missionTitle,
  classes,
  onClose,
  onAssigned,
}: AssignDialogProps) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedClass = classes.find((item) => item.id === classId) ?? null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("missionId", missionId);
    formData.set("classId", classId);
    formData.set("dueAt", dueAt);

    const result: AssignMissionActionResult = await assignMissionAction(formData);
    setSubmitting(false);

    if (result.ok) {
      onAssigned(
        `Homework assigned to ${result.className}. ${result.activeStudentCount} student(s) will see it on their next visit.`,
      );
      onClose();
    } else {
      setError(result.error);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Assign mission" style={overlayStyle}>
      <form onSubmit={handleSubmit} style={panelStyle}>
        <div style={headerStyle}>
          <h2 style={headingStyle}>Assign mission</h2>
          <button type="button" aria-label="Close" onClick={onClose} style={closeButtonStyle}>
            ×
          </button>
        </div>

        <p style={{ fontSize: 16, margin: "0 0 16px", color: "#111827" }}>
          {selectedClass
            ? `Assign "${missionTitle}" to ${selectedClass.name}? This will create homework for ${selectedClass.activeStudentCount} active student(s).`
            : missionTitle}
        </p>

        {classes.length === 0 ? (
          <p style={{ fontSize: 14, color: "#4B5563", margin: 0 }}>
            You have no classes with active students. Create a class and add students first.
          </p>
        ) : (
          <>
            <label htmlFor="assign-class" style={labelStyle}>
              Class
            </label>
            <select
              id="assign-class"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              aria-describedby={selectedClass ? "assign-student-count" : undefined}
              style={inputStyle}
            >
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name} ({classItem.activeStudentCount} active student
                  {classItem.activeStudentCount === 1 ? "" : "s"})
                </option>
              ))}
            </select>
            {selectedClass ? (
              <p id="assign-student-count" style={{ fontSize: 14, color: "#4B5563", margin: "8px 0 16px" }}>
                {selectedClass.activeStudentCount} active student(s) will receive homework
              </p>
            ) : null}

            <label htmlFor="due-at" style={labelStyle}>
              Due date (optional)
            </label>
            <input
              id="due-at"
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              aria-describedby="due-at-help"
              style={inputStyle}
            />
            <p id="due-at-help" style={{ fontSize: 14, color: "#4B5563", margin: "8px 0 0" }}>
              Leave blank for no deadline. Students can complete anytime.
            </p>
          </>
        )}

        {error ? (
          <p role="alert" style={{ fontSize: 14, color: "#B42318", margin: "16px 0 0" }}>
            {error}
          </p>
        ) : null}

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || classes.length === 0}
            style={primaryButtonStyle}
          >
            {submitting ? "Assigning..." : "Assign homework"}
          </button>
        </div>
      </form>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
  width: "100%",
  maxWidth: 480,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 16,
};

const headingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  margin: 0,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  padding: "10px 12px",
  fontSize: 16,
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  boxSizing: "border-box",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 24,
  flexWrap: "wrap",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer",
  minHeight: 44,
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
  color: "#6B7280",
  minWidth: 44,
  minHeight: 44,
};
