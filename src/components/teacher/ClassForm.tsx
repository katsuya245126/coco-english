"use client";

import { useState } from "react";
import {
  createClassAction,
  updateClassAction,
  type ClassActionResult,
} from "@/app/teacher/classes/actions";
import { HoverButton } from "@/components/ui/HoverButton";
import {
  primaryHover,
  secondaryHover,
  subtleHover,
} from "@/components/ui/hover-styles";

type ClassFormProps = {
  // When editing, the existing class id + name; when creating, both omitted.
  classId?: string;
  initialName?: string;
  onClose: () => void;
};

// Compact create/rename editor presented as a modal on the dashboard (UI-SPEC:
// "Class create/edit can be a dedicated page or modal"). Validation appears
// beneath the field in 14px text; save is disabled only while submitting.
export function ClassForm({ classId, initialName, onClose }: ClassFormProps) {
  const isEditing = typeof classId === "string";
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    if (isEditing) {
      formData.set("classId", classId as string);
    }
    let result: ClassActionResult;
    if (isEditing) {
      result = await updateClassAction(formData);
    } else {
      result = await createClassAction(formData);
    }
    setSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setError(result.error);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit class" : "Create class"}
      style={overlayStyle}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div style={panelStyle}>
        <div style={headerRowStyle}>
          <h2 style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25, margin: 0 }}>
            {isEditing ? "Edit class" : "Create class"}
          </h2>
          <HoverButton
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={closeButtonStyle}
            hoverStyle={subtleHover}
          >
            ×
          </HoverButton>
        </div>

        <form action={handleSubmit}>
          <label
            htmlFor="class-name"
            style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#111827" }}
          >
            Class name
          </label>
          <input
            id="class-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            style={inputStyle}
            aria-describedby={error ? "class-name-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p
              id="class-name-error"
              role="alert"
              style={{ fontSize: 14, color: "#B42318", margin: "8px 0 0" }}
            >
              {error}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 24, justifyContent: "flex-end" }}>
            <HoverButton
              type="button"
              onClick={onClose}
              style={secondaryButtonStyle}
              hoverStyle={secondaryHover}
            >
              Cancel
            </HoverButton>
            <HoverButton
              type="submit"
              disabled={submitting}
              style={primaryButtonStyle}
              hoverStyle={primaryHover}
            >
              Save class
            </HoverButton>
          </div>
        </form>
      </div>
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
  maxWidth: 400,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 16,
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

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563EB",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 6,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 16,
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
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
  borderRadius: 6,
  transition: "background 0.15s ease",
};
