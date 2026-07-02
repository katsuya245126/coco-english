"use client";

import { useState } from "react";
import {
  addStudentsAction,
  archiveStudentAction,
} from "@/app/teacher/classes/[id]/actions";
import type {
  GeneratedPin,
  RosterStudent,
} from "@/server/classroom/roster-service";
import { RosterPasteForm } from "@/components/teacher/RosterPasteForm";
import { PinActions } from "@/components/teacher/PinActions";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";

type RosterEditorProps = {
  classId: string;
  roster: RosterStudent[];
};

type Mode = "paste" | "one";

// Roster editor (CLASS-02). Active roster table plus the two add modes from the
// UI-SPEC: "Paste names" (bulk) and "Add one" (single). Archived students are
// not shown here (the server's listRoster already excludes them); archiving a
// row soft-removes the student while preserving history.
export function RosterEditor({ classId, roster }: RosterEditorProps) {
  const [mode, setMode] = useState<Mode>("paste");
  const [addedPin, setAddedPin] = useState<GeneratedPin | null>(null);
  const [oneError, setOneError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAddOne(formData: FormData) {
    setOneError(null);
    const result = await addStudentsAction(classId, undefined, formData);
    if (result.status === "ok") {
      const generated = result.result.pins[0] ?? null;
      if (generated) {
        setAddedPin(generated);
      } else if (result.result.skippedExisting.length > 0) {
        setOneError("That student is already on the roster.");
      }
    } else {
      setOneError(result.message);
    }
  }

  async function handleArchive(studentId: string) {
    setBusyId(studentId);
    await archiveStudentAction(classId, studentId);
    setBusyId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section
        aria-label="Add students"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 8,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div role="tablist" aria-label="Add mode" style={{ display: "flex", gap: 8 }}>
          <HoverButton
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            onClick={() => setMode("paste")}
            style={mode === "paste" ? segmentActive : segment}
            hoverStyle={mode === "paste" ? primaryHover : secondaryHover}
          >
            Paste names
          </HoverButton>
          <HoverButton
            type="button"
            role="tab"
            aria-selected={mode === "one"}
            onClick={() => setMode("one")}
            style={mode === "one" ? segmentActive : segment}
            hoverStyle={mode === "one" ? primaryHover : secondaryHover}
          >
            Add one
          </HoverButton>
        </div>

        {mode === "paste" ? (
          <RosterPasteForm classId={classId} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <form action={handleAddOne} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Student name</span>
                {/* Single-name add reuses the bulk paste field name. */}
                <input
                  name="paste"
                  aria-label="Student name"
                  required
                  style={{
                    border: "1px solid #D1D5DB",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 16,
                    minWidth: 220,
                  }}
                />
              </label>
              <HoverButton type="submit" style={primaryButton} hoverStyle={primaryHover}>
                Add students
              </HoverButton>
            </form>
            {addedPin ? (
              <p aria-live="polite" style={{ fontSize: 14, color: "#177245", margin: 0 }}>
                Added {addedPin.displayName}. PIN{" "}
                <strong style={{ fontFamily: "ui-monospace, monospace", letterSpacing: 2 }}>
                  {addedPin.pin}
                </strong>{" "}
                — record this now, it will not be shown again.
              </p>
            ) : null}
            {oneError ? (
              <span role="alert" style={{ fontSize: 14, color: "#B42318" }}>
                {oneError}
              </span>
            ) : null}
          </div>
        )}
      </section>

      <section
        aria-label="Active roster"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 8,
          padding: 24,
        }}
      >
        {roster.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>No students yet</h2>
            <p style={{ fontSize: 16, color: "#4B5563", margin: "8px 0 0" }}>
              Paste student names or add one student at a time.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={thStyle}>Student name</th>
                <th style={thStyle}>PIN</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((student) => (
                <tr key={student.id}>
                  <td style={tdStyle}>{student.displayName}</td>
                  <td style={tdStyle}>
                    <PinActions classId={classId} studentId={student.id} />
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#177245" }}>Active</span>
                  </td>
                  <td style={tdStyle}>
                    <HoverButton
                      type="button"
                      onClick={() => handleArchive(student.id)}
                      disabled={busyId === student.id}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #D1D5DB",
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 14,
                        cursor: "pointer",
                        color: "#B42318",
                        transition: "background 0.15s ease, border-color 0.15s ease",
                      }}
                      hoverStyle={secondaryHover}
                    >
                      Archive student
                    </HoverButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const segment: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  color: "#4B5563",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const segmentActive: React.CSSProperties = {
  ...segment,
  background: "#2563EB",
  borderColor: "#2563EB",
  color: "#FFFFFF",
};

const primaryButton: React.CSSProperties = {
  padding: "8px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px",
  borderBottom: "1px solid #D1D5DB",
  fontWeight: 600,
  color: "#4B5563",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 8px",
  borderBottom: "1px solid #E5E7EB",
  color: "#111827",
  verticalAlign: "top",
};
