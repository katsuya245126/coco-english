"use client";

import { useState } from "react";
import Link from "next/link";
import type { TeacherClass } from "@/server/classroom/class-service";
import { archiveClassAction } from "@/app/teacher/classes/actions";
import { ClassForm } from "@/components/teacher/ClassForm";
import { ShareClassDialog } from "@/components/teacher/ShareClassDialog";

type ClassListProps = {
  classes: TeacherClass[];
};

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; classId: string; name: string }
  | { kind: "share"; classId: string; name: string; joinCode: string | null }
  | { kind: "archive"; classId: string; name: string };

// Class-list surface (UI-SPEC "Teacher Dashboard"): repeated rows (not nested
// cards) with name, roster count, join code, Share join link, Show QR code, edit,
// and archive. Row height stays stable across hover/focus. No homework buckets,
// review tabs, mission counts, or completion charts (D-03).
export function ClassList({ classes }: ClassListProps) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive(classId: string) {
    setArchiving(true);
    setError(null);
    const formData = new FormData();
    formData.set("classId", classId);
    const result = await archiveClassAction(formData);
    setArchiving(false);
    if (result.ok) {
      setDialog({ kind: "none" });
    } else {
      setError(result.error);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>
          Classes
        </h1>
        <button
          type="button"
          onClick={() => setDialog({ kind: "create" })}
          style={primaryButtonStyle}
        >
          Create class
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ fontSize: 14, color: "#B42318", margin: "0 0 16px" }}>
          {error}
        </p>
      ) : null}

      {classes.length === 0 ? (
        <section
          aria-label="Class list"
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            padding: 48,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25, margin: 0 }}>
            No classes yet
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.5, color: "#4B5563", margin: "8px 0 0" }}>
            Create your first class to add students and share a join code.
          </p>
        </section>
      ) : (
        <section
          aria-label="Class list"
          style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {classes.map((classItem, index) => (
            <div
              key={classItem.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: 16,
                minHeight: 64,
                borderTop: index === 0 ? "none" : "1px solid #E5E7EB",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#111827" }}>
                  {classItem.name}
                </p>
                <p style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 0" }}>
                  <Link
                    href={`/teacher/classes/${classItem.id}`}
                    style={{ color: "#2563EB", textDecoration: "none" }}
                  >
                    {classItem.rosterCount}{" "}
                    {classItem.rosterCount === 1 ? "student" : "students"}
                  </Link>
                  {" · "}
                  <span
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {classItem.joinCode ?? "—"}
                  </span>
                </p>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({
                      kind: "share",
                      classId: classItem.id,
                      name: classItem.name,
                      joinCode: classItem.joinCode,
                    })
                  }
                  style={secondaryButtonStyle}
                >
                  Share join link
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({
                      kind: "share",
                      classId: classItem.id,
                      name: classItem.name,
                      joinCode: classItem.joinCode,
                    })
                  }
                  style={secondaryButtonStyle}
                >
                  Show QR code
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({
                      kind: "edit",
                      classId: classItem.id,
                      name: classItem.name,
                    })
                  }
                  style={secondaryButtonStyle}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({
                      kind: "archive",
                      classId: classItem.id,
                      name: classItem.name,
                    })
                  }
                  style={destructiveTextButtonStyle}
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {dialog.kind === "create" ? (
        <ClassForm onClose={() => setDialog({ kind: "none" })} />
      ) : null}

      {dialog.kind === "edit" ? (
        <ClassForm
          classId={dialog.classId}
          initialName={dialog.name}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}

      {dialog.kind === "share" ? (
        <ShareClassDialog
          classId={dialog.classId}
          className={dialog.name}
          joinCode={dialog.joinCode}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}

      {dialog.kind === "archive" ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Archive class"
          style={overlayStyle}
          onKeyDown={(event) => {
            if (event.key === "Escape") setDialog({ kind: "none" });
          }}
        >
          <div style={panelStyle}>
            <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25, margin: "0 0 16px" }}>
              Archive class
            </h2>
            <p style={{ fontSize: 16, color: "#4B5563", margin: "0 0 24px", lineHeight: 1.5 }}>
              Archive {dialog.name}? Students will no longer see it for new entry,
              but class history stays saved.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDialog({ kind: "none" })}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleArchive(dialog.classId)}
                disabled={archiving}
                style={destructiveButtonStyle}
              >
                Archive class
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer",
  minHeight: 44,
};

const destructiveTextButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "none",
  color: "#B42318",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};

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
  maxWidth: 400,
};

const destructiveButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#B42318",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};
