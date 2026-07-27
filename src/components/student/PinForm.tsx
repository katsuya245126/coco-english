"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unlockStudentAction } from "@/app/join/actions";
import { NameForm } from "@/components/student/NameForm";
import {
  rememberClass,
  type RememberedClass,
} from "@/components/student/remembered-class";
import {
  bodyStyle,
  errorTextStyle,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
} from "@/components/student/styles";

// Verbatim UI-SPEC generic mismatch copy (D-16). The SAME string is shown for
// wrong code, wrong name, and wrong PIN — never a field-specific error.
const GENERIC_MISMATCH_COPY =
  "We could not match that class, name, and PIN. Try again or ask your teacher.";

type PinFormProps = {
  // The class context resolved by the join route. The joinCode is the CURRENT
  // live code used for the unlock attempt; remembering keys on classId (D-18).
  classId: string;
  className: string;
  joinCode: string;
};

// Name + 4-digit PIN unlock step (STUD-03, STUD-04, STUD-05, D-16).
//
// Renders the free-text NameForm (no roster selector) plus a 4-digit PIN field,
// calls the server unlock action, shows the single generic mismatch copy on any
// failure, and on success remembers the class (id-keyed, D-18) and navigates to
// the no-homework home shell. The PIN never persists locally; it is re-entered
// every visit (D-13/D-17).
export function PinForm({ classId, className, joinCode }: PinFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await unlockStudentAction({
      joinCode,
      typedName: name,
      pin,
    });

    if (result.ok) {
      const remembered: RememberedClass = {
        classId,
        displayCode: joinCode,
        className,
      };
      rememberClass(remembered);
      router.push("/student/home");
      return;
    }

    // Every failure shows the identical generic copy (D-16).
    setError(GENERIC_MISMATCH_COPY);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p style={bodyStyle}>
        Joining <strong>{className}</strong>. Enter your name and PIN.
      </p>

      <NameForm
        value={name}
        onChange={setName}
        describedById={error ? "unlock-error" : undefined}
        invalid={Boolean(error)}
      />

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="student-pin" style={labelStyle}>
          4-digit PIN
        </label>
        <input
          id="student-pin"
          name="pin"
          // numeric keyboard on mobile + paste support (UI-SPEC accessibility).
          type="text"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={4}
          value={pin}
          onChange={(event) =>
            setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
          }
          aria-label="4-digit PIN"
          aria-describedby={error ? "unlock-error" : undefined}
          aria-invalid={error ? true : undefined}
          style={inputStyle}
        />
      </div>

      {error ? (
        <p id="unlock-error" role="alert" aria-live="polite" style={errorTextStyle}>
          {error}
        </p>
      ) : null}

      <button
        className="student-primary-button"
        type="submit"
        disabled={submitting}
        style={{ ...primaryButtonStyle, marginTop: 16 }}
      >
        Unlock homework
      </button>
    </form>
  );
}
