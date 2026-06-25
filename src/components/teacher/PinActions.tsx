"use client";

import { useState } from "react";
import {
  resetStudentPinAction,
  setStudentPinAction,
} from "@/app/teacher/classes/[id]/actions";
import type { GeneratedPin } from "@/server/classroom/roster-service";

type PinActionsProps = {
  classId: string;
  studentId: string;
};

type PinState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "shown"; pin: string; copied: boolean }
  | { status: "error"; message: string };

// PIN row actions (CLASS-03, D-06/D-07). "Reset PIN" generates a new 4-digit
// PIN; "Change PIN" sets a teacher-chosen one. A generated/reset PIN is shown
// exactly once here with a copy action and a "record this now" treatment, then
// is never retrievable again (the server only stores the hash).
export function PinActions({ classId, studentId }: PinActionsProps) {
  const [state, setState] = useState<PinState>({ status: "idle" });
  const [changing, setChanging] = useState(false);

  function show(generated: GeneratedPin) {
    setState({ status: "shown", pin: generated.pin, copied: false });
    setChanging(false);
  }

  async function handleReset() {
    setState({ status: "working" });
    const result = await resetStudentPinAction(classId, studentId);
    if (result.status === "ok") {
      show(result.generated);
    } else {
      setState({ status: "error", message: result.message });
    }
  }

  async function handleChangeSubmit(formData: FormData) {
    setState({ status: "working" });
    const result = await setStudentPinAction(
      classId,
      studentId,
      undefined,
      formData,
    );
    if (result.status === "ok") {
      show(result.generated);
    } else {
      setState({ status: "error", message: result.message });
    }
  }

  async function copy(pin: string) {
    try {
      await navigator.clipboard.writeText(pin);
      setState({ status: "shown", pin, copied: true });
    } catch {
      // Clipboard may be unavailable; the PIN is still visible to record.
      setState({ status: "shown", pin, copied: true });
    }
  }

  if (state.status === "shown") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          aria-live="polite"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: 2,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {state.pin}
          </span>
          <button
            type="button"
            onClick={() => copy(state.pin)}
            style={secondaryButton}
          >
            {state.copied ? "Copied" : "Copy"}
          </button>
        </div>
        <span style={{ fontSize: 12, color: "#B45309" }}>
          Record this now — it will not be shown again.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={handleReset}
          disabled={state.status === "working"}
          style={secondaryButton}
        >
          Reset PIN
        </button>
        <button
          type="button"
          onClick={() => setChanging((value) => !value)}
          disabled={state.status === "working"}
          style={secondaryButton}
        >
          Change PIN
        </button>
      </div>

      {changing ? (
        <form action={handleChangeSubmit} style={{ display: "flex", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>4-digit PIN</span>
            <input
              name="pin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="off"
              aria-label="4-digit PIN"
              required
              style={{
                width: 80,
                padding: "6px 8px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                fontSize: 16,
                letterSpacing: 2,
              }}
            />
          </label>
          <button type="submit" style={secondaryButton}>
            Save
          </button>
        </form>
      ) : null}

      {state.status === "error" ? (
        <span role="alert" style={{ fontSize: 12, color: "#B42318" }}>
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

const secondaryButton: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 14,
  cursor: "pointer",
  color: "#111827",
};
