"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  markSubmissionReviewedAction,
} from "@/app/teacher/evidence/[attemptId]/actions";
import { changeAssignedHomeworkAction } from "@/app/teacher/assignment-actions";
import { HoverButton } from "@/components/ui/HoverButton";
import { primaryHover, secondaryHover } from "@/components/ui/hover-styles";
import { resolveTeacherEvidenceActions } from "@/domain/teacher/assignment-operations";

const INCOMPLETE_ERROR = "Some answers are missing. Request retry is available.";
const STALE_ERROR = "This homework changed. Refresh the page and try again.";
const SYSTEM_ERROR = "Could not update this homework. Try again.";

export function SubmissionReviewControls({
  attemptId,
  assignedHomeworkId,
  assignmentStudentStatus,
  classId,
  assignmentId,
  dismissed,
  allowRetry = true,
}: {
  attemptId: string;
  assignedHomeworkId: string;
  assignmentStudentStatus: string;
  classId: string;
  assignmentId: string;
  dismissed: boolean;
  allowRetry?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const actions = resolveTeacherEvidenceActions({
    status: assignmentStudentStatus,
    dismissed,
  });
  const markAsDoneAction = actions.find(
    (action): action is "mark_reviewed" | "dismiss" =>
      action === "mark_reviewed" || action === "dismiss",
  );
  const canRequestRetry = actions.includes("request_retry");
  const canUndo = actions.includes("undo_dismiss");
  const reviewHref = `/teacher/classes/${classId}/review/${assignmentId}`;

  const markDone = () => startTransition(async () => {
    setError(null);
    if (!markAsDoneAction) return;
    try {
      const result = markAsDoneAction === "mark_reviewed"
        ? await markSubmissionReviewedAction(attemptId)
        : await changeAssignedHomeworkAction({ assignedHomeworkId, action: "dismiss" });
      if (result.ok) router.push(reviewHref);
      else setError(errorMessageFor(result.error));
    } catch {
      setError(SYSTEM_ERROR);
    }
  });
  const undoDone = () => startTransition(async () => {
    setError(null);
    try {
      const result = await changeAssignedHomeworkAction({ assignedHomeworkId, action: "undo_dismiss" });
      if (result.ok) router.refresh();
      else setError(errorMessageFor(result.error));
    } catch {
      setError(SYSTEM_ERROR);
    }
  });
  const requestRetry = () => startTransition(async () => {
    setError(null);
    try {
      const result = await changeAssignedHomeworkAction({
        assignedHomeworkId,
        action: "request_retry",
        reasonNote: note.trim() || undefined,
      });
      if (result.ok) router.push("/teacher");
      else setError(errorMessageFor(result.error));
    } catch {
      setError(SYSTEM_ERROR);
    }
  });

  return <section aria-label="Submission review actions" style={sectionStyle}>
    <h2 style={headingStyle}>Teacher action</h2>
    {canUndo ? (
      <>
        <p style={helperStyle}>This assignment is marked done and hidden from your incomplete list.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <HoverButton type="button" disabled={pending} onClick={undoDone} style={secondaryButtonStyle} hoverStyle={secondaryHover}>Undo</HoverButton>
        </div>
      </>
    ) : markAsDoneAction === "dismiss" ? (
      <>
        <p style={helperStyle}>Removes this from your incomplete list. You can undo this.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <HoverButton type="button" disabled={pending} onClick={markDone} style={primaryButtonStyle} hoverStyle={primaryHover}>Mark as done</HoverButton>
        </div>
      </>
    ) : markAsDoneAction === "mark_reviewed" ? (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <HoverButton type="button" disabled={pending} onClick={markDone} style={primaryButtonStyle} hoverStyle={primaryHover}>Mark as done</HoverButton>
        {allowRetry && canRequestRetry && <HoverButton type="button" disabled={pending} onClick={() => dialog.current?.showModal()} style={secondaryButtonStyle} hoverStyle={secondaryHover}>Request retry</HoverButton>}
      </div>
    ) : null}
    {error && <p role="alert" style={errorStyle}>{error}</p>}
    {allowRetry && canRequestRetry && <dialog ref={dialog} aria-labelledby="retry-heading" style={dialogStyle}>
      <h2 id="retry-heading" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>Request retry?</h2>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4B5563", lineHeight: 1.5 }}>The student can start a new attempt. This evidence stays available.</p>
      <label htmlFor="retry-note" style={{ display: "block", marginBottom: 6, fontSize: 14, fontWeight: 600, color: "#4B5563" }}>Note (optional)</label>
      <textarea id="retry-note" value={note} onChange={(event) => setNote(event.target.value)} style={textareaStyle} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <HoverButton type="button" onClick={() => dialog.current?.close()} style={secondaryButtonStyle} hoverStyle={secondaryHover}>Cancel</HoverButton>
        <HoverButton type="button" disabled={pending} onClick={requestRetry} style={primaryButtonStyle} hoverStyle={primaryHover}>Request retry</HoverButton>
      </div>
    </dialog>}
  </section>;
}

function errorMessageFor(error: string) {
  if (error === "incomplete") return INCOMPLETE_ERROR;
  if (error === "not_allowed" || error === "not_found") return STALE_ERROR;
  return SYSTEM_ERROR;
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
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "none",
  color: "#111827",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const errorStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: "#B42318",
};

const dialogStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  padding: 24,
  width: "100%",
  maxWidth: 420,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 80,
  padding: 10,
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
