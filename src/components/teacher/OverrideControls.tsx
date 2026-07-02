"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { overrideAssignmentStatusAction } from "@/app/teacher/evidence/[attemptId]/actions";
import type { AssignmentStudentStatus } from "@/domain/foundation/status";
import { HoverButton } from "@/components/ui/HoverButton";
import { secondaryHover } from "@/components/ui/hover-styles";

// ─── Types ───

type OverrideNextStatus = "completed" | "needs_retry" | "teacher_review";

type OverrideButtonConfig = {
  nextStatus: OverrideNextStatus;
  label: string;
  ariaLabel: string;
  background: string;
  color: string;
  dialogHeading: string;
  dialogBody: string;
  showReason: boolean;
};

// ─── Config ───

const OVERRIDE_BUTTONS: OverrideButtonConfig[] = [
  {
    nextStatus: "completed",
    label: "Mark complete",
    ariaLabel: "Mark attempt complete",
    background: "#111827",
    color: "#FFFFFF",
    dialogHeading: "Mark this attempt complete?",
    dialogBody:
      "This will count the student's homework as done. You can change it later if needed.",
    showReason: false,
  },
  {
    nextStatus: "needs_retry",
    label: "Send for retry",
    ariaLabel: "Mark attempt for retry",
    background: "#1D4ED8",
    color: "#FFFFFF",
    dialogHeading: "Send this attempt for retry?",
    dialogBody:
      "The student will be able to re-record from the beginning. Their previous attempt stays saved.",
    showReason: true,
  },
  {
    nextStatus: "teacher_review",
    label: "Keep in review",
    ariaLabel: "Mark attempt keep in review",
    background: "#92400E",
    color: "#FFFFFF",
    dialogHeading: "Keep in review?",
    dialogBody:
      "This attempt will stay in your review queue with no change to the student's status.",
    showReason: true,
  },
];

// ─── Helpers ───

/**
 * Returns true if the given nextStatus is a legal target from the current attemptStatus
 * for a teacher override action.
 */
function isButtonEnabled(
  nextStatus: OverrideNextStatus,
  attemptStatus: AssignmentStudentStatus,
): boolean {
  // Teacher can mark complete or send for retry when in teacher_review, started, or completed
  if (nextStatus === "completed" || nextStatus === "needs_retry") {
    return (
      attemptStatus === "teacher_review" ||
      attemptStatus === "started" ||
      attemptStatus === "completed"
    );
  }
  // Teacher can "keep in review" when in completed or started
  if (nextStatus === "teacher_review") {
    return attemptStatus === "completed" || attemptStatus === "started";
  }
  return false;
}

// ─── Component ───

export function OverrideControls({
  assignmentStudentId,
  attemptStatus,
}: {
  assignmentStudentId: string;
  attemptStatus: AssignmentStudentStatus;
}) {
  const router = useRouter();
  const [pendingButton, setPendingButton] =
    useState<OverrideButtonConfig | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = "override-dialog-heading";

  // Trap focus inside dialog when open
  useEffect(() => {
    if (!pendingButton) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = dialog.querySelectorAll<HTMLElement>(
      "button, textarea, [tabindex]",
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPendingButton(null);
        setReasonNote("");
        setFeedback(null);
        return;
      }
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pendingButton]);

  async function handleConfirm() {
    if (!pendingButton) return;
    setSubmitting(true);
    setFeedback(null);

    const result = await overrideAssignmentStatusAction({
      assignmentStudentId,
      nextStatus: pendingButton.nextStatus,
      reasonNote: reasonNote.trim() || undefined,
    });

    setSubmitting(false);

    if (result.ok) {
      setFeedback("success");
      setPendingButton(null);
      setReasonNote("");
      router.refresh();
    } else {
      setFeedback("error");
    }
  }

  function handleCancel() {
    setPendingButton(null);
    setReasonNote("");
    setFeedback(null);
  }

  return (
    <section style={overrideSectionStyle} aria-label="Teacher action">
      <h2 style={overrideHeadingStyle}>Teacher action</h2>
      <p style={overrideHelpStyle}>
        Manually set the outcome for this attempt after reviewing the evidence
        above.
      </p>

      <div style={buttonGroupStyle}>
        {OVERRIDE_BUTTONS.map((btn) => {
          const enabled = isButtonEnabled(btn.nextStatus, attemptStatus);
          return (
            <button
              key={btn.nextStatus}
              type="button"
              aria-label={btn.ariaLabel}
              disabled={!enabled || submitting}
              onClick={() => {
                setFeedback(null);
                setPendingButton(btn);
              }}
              style={{
                ...overrideButtonBase,
                background: enabled ? btn.background : "#9CA3AF",
                color: btn.color,
                cursor: enabled && !submitting ? "pointer" : "not-allowed",
                opacity: !enabled ? 0.6 : 1,
              }}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {feedback === "success" && (
        <p style={feedbackSuccessStyle}>Status updated.</p>
      )}
      {feedback === "error" && (
        <p style={feedbackErrorStyle}>
          Could not update status. Please try again.
        </p>
      )}

      {pendingButton && (
        <div style={dialogOverlayStyle} onClick={handleCancel}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-labelledby={headingId}
            aria-modal="true"
            style={dialogBoxStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={headingId} style={dialogHeadingStyle}>
              {pendingButton.dialogHeading}
            </h2>
            <p style={dialogBodyStyle}>{pendingButton.dialogBody}</p>

            {pendingButton.showReason && (
              <>
                <label style={reasonLabelStyle} htmlFor="override-reason">
                  Reason (optional)
                </label>
                <textarea
                  id="override-reason"
                  rows={3}
                  placeholder="Optional: add a note about this decision"
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  disabled={submitting}
                  style={reasonTextareaStyle}
                />
              </>
            )}

            <div style={dialogActionsStyle}>
              <HoverButton
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                style={cancelButtonStyle}
                hoverStyle={secondaryHover}
              >
                Cancel
              </HoverButton>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                style={{
                  ...confirmButtonStyle,
                  background: pendingButton.background,
                  opacity: submitting ? 0.7 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Styles ───

const overrideSectionStyle: React.CSSProperties = {
  marginTop: 32,
  paddingTop: 24,
  borderTop: "1px solid #E5E7EB",
};

const overrideHeadingStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  color: "#111827",
};

const overrideHelpStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 14,
  lineHeight: 1.4,
  color: "#4B5563",
};

const buttonGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const overrideButtonBase: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
};

const feedbackSuccessStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: "#065F46",
  fontWeight: 600,
};

const feedbackErrorStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: 14,
  color: "#B91C1C",
  fontWeight: 600,
};

const dialogOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogBoxStyle: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  padding: 24,
  maxWidth: 480,
  width: "100%",
  margin: "0 16px",
};

const dialogHeadingStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 20,
  fontWeight: 600,
  lineHeight: 1.25,
  color: "#111827",
};

const dialogBodyStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 16,
  lineHeight: 1.5,
  color: "#4B5563",
};

const reasonLabelStyle: React.CSSProperties = {
  display: "block",
  margin: "0 0 6px",
  fontSize: 14,
  fontWeight: 600,
  color: "#4B5563",
};

const reasonTextareaStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  padding: "8px 12px",
  fontSize: 16,
  lineHeight: 1.5,
  color: "#111827",
  resize: "vertical",
  fontFamily: "inherit",
  marginBottom: 16,
};

const dialogActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
};

const cancelButtonStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

const confirmButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 600,
  color: "#FFFFFF",
};
