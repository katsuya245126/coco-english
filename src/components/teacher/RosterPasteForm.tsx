"use client";

import { useMemo, useState } from "react";
import { addStudentsAction } from "@/app/teacher/classes/[id]/actions";
import type { AddStudentsResult } from "@/server/classroom/roster-service";
import {
  normalizeRosterName,
  parseRosterPaste,
} from "@/domain/classroom/roster-parser";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";

type RosterPasteFormProps = {
  classId: string;
};

type PreviewRow = {
  rowNumber: number;
  displayName: string;
  issue: "ok" | "blank" | "duplicate";
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; result: AddStudentsResult }
  | { status: "error"; message: string };

// Bulk paste form (CLASS-02, D-05). The live preview uses parseRosterPaste so
// blank lines and duplicate normalized names are surfaced as warnings/errors
// BEFORE save — they are never silently discarded. After save, the one-time
// generated PINs are shown for the teacher to record.
export function RosterPasteForm({ classId }: RosterPasteFormProps) {
  const [paste, setPaste] = useState("");
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  const preview = useMemo<PreviewRow[]>(() => {
    if (paste.trim().length === 0) return [];
    const lines = paste.split(/\r?\n/);
    const seen = new Set<string>();
    return lines.map((line, index) => {
      const trimmed = line.trim();
      let issue: PreviewRow["issue"] = "ok";
      if (trimmed.length === 0) {
        issue = "blank";
      } else {
        const key = normalizeRosterName(trimmed);
        if (seen.has(key)) {
          issue = "duplicate";
        } else {
          seen.add(key);
        }
      }
      return { rowNumber: index + 1, displayName: trimmed, issue };
    });
  }, [paste]);

  const parsed = useMemo(() => parseRosterPaste(paste), [paste]);
  const hasIssues = parsed.blankCount > 0 || parsed.duplicates.length > 0;
  const saveableCount = parsed.names.length;

  async function handleSubmit(formData: FormData) {
    setSave({ status: "saving" });
    const result = await addStudentsAction(classId, undefined, formData);
    if (result.status === "ok") {
      setSave({ status: "saved", result: result.result });
      setPaste("");
    } else {
      setSave({ status: "error", message: result.message });
    }
  }

  if (save.status === "saved") {
    return (
      <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 16, color: "#177245", margin: 0 }}>
          Added {save.result.added.length} student
          {save.result.added.length === 1 ? "" : "s"}. Record each PIN now — they
          will not be shown again.
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Student</th>
              <th style={thStyle}>PIN</th>
            </tr>
          </thead>
          <tbody>
            {save.result.pins.map((entry) => (
              <tr key={entry.studentId}>
                <td style={tdStyle}>{entry.displayName}</td>
                <td
                  style={{
                    ...tdStyle,
                    fontFamily: "ui-monospace, monospace",
                    letterSpacing: 2,
                    fontWeight: 600,
                  }}
                >
                  {entry.pin}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {save.result.skippedExisting.length > 0 ? (
          <p style={{ fontSize: 14, color: "#B45309", margin: 0 }}>
            Skipped {save.result.skippedExisting.length} name
            {save.result.skippedExisting.length === 1 ? "" : "s"} already on the
            roster: {save.result.skippedExisting.join(", ")}.
          </p>
        ) : null}
        <HoverButton type="button" onClick={() => setSave({ status: "idle" })} style={secondaryButton} hoverStyle={secondaryHover}>
          Add more students
        </HoverButton>
      </div>
    );
  }

  return (
    <form action={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          Paste student names (one per line)
        </span>
        <textarea
          name="paste"
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          rows={6}
          aria-label="Paste student names, one per line"
          style={{
            border: "1px solid #D1D5DB",
            borderRadius: 6,
            padding: 12,
            fontSize: 16,
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />
      </label>

      {preview.length > 0 ? (
        <div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.rowNumber}>
                  <td style={tdStyle}>{row.rowNumber}</td>
                  <td style={tdStyle}>
                    {row.issue === "blank" ? (
                      <em style={{ color: "#6B7280" }}>(blank)</em>
                    ) : (
                      row.displayName
                    )}
                  </td>
                  <td style={tdStyle}>
                    {row.issue === "ok" ? (
                      <span style={{ color: "#177245" }}>Ready</span>
                    ) : row.issue === "blank" ? (
                      <span style={{ color: "#B45309" }}>Blank line — skipped</span>
                    ) : (
                      <span style={{ color: "#B42318" }}>Duplicate — skipped</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasIssues ? (
            <p role="alert" style={{ fontSize: 14, color: "#B45309", marginTop: 8 }}>
              {parsed.blankCount > 0
                ? `${parsed.blankCount} blank line${parsed.blankCount === 1 ? "" : "s"} will be skipped. `
                : ""}
              {parsed.duplicates.length > 0
                ? `${parsed.duplicates.length} duplicate name${parsed.duplicates.length === 1 ? "" : "s"} will be skipped.`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {save.status === "error" ? (
        <span role="alert" style={{ fontSize: 14, color: "#B42318" }}>
          {save.message}
        </span>
      ) : null}

      <HoverButton
        type="submit"
        disabled={save.status === "saving" || saveableCount === 0}
        style={primaryButton}
        hoverStyle={primaryHover}
      >
        Add students
      </HoverButton>
    </form>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 8px",
  borderBottom: "1px solid #D1D5DB",
  fontWeight: 600,
  color: "#4B5563",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 8px",
  borderBottom: "1px solid #E5E7EB",
  color: "#111827",
};

const primaryButton: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const secondaryButton: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 14,
  cursor: "pointer",
  color: "#111827",
  alignSelf: "flex-start",
  transition: "background 0.15s ease, border-color 0.15s ease",
};
