"use client";

import { useState } from "react";
import { resolveClassAction } from "@/app/join/actions";
import { PinForm } from "@/components/student/PinForm";
import { RememberedClassBanner } from "@/components/student/RememberedClassBanner";
import {
  bodyStyle,
  displayTitleStyle,
  errorTextStyle,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
} from "@/components/student/styles";

// Verbatim UI-SPEC generic mismatch copy (D-16). An unknown OR archived code
// shows this same copy — never "no such class" (would enable code enumeration).
const GENERIC_MISMATCH_COPY =
  "We could not match that class, name, and PIN. Try again or ask your teacher.";

type ResolvedClass = {
  classId: string;
  className: string;
  joinCode: string;
};

type JoinFormProps = {
  // When arriving via /join/[joinCode] the route pre-resolves the class and
  // passes it here so the flow opens straight at the name+PIN step.
  initialClass?: ResolvedClass;
  // Whether to offer a remembered class banner (manual /join entry only).
  showRemembered?: boolean;
};

// Manual class-code entry (STUD-01 fallback) that resolves the class then shows
// the name + PIN unlock step. Also surfaces the remembered-class banner so a
// returning device can re-enter with a fresh PIN (D-12/D-18).
export function JoinForm({ initialClass, showRemembered }: JoinFormProps) {
  const [resolved, setResolved] = useState<ResolvedClass | null>(
    initialClass ?? null,
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleResolve(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await resolveClassAction(code);
    setSubmitting(false);

    if (result.ok) {
      setResolved({
        classId: result.class.classId,
        className: result.class.className,
        joinCode: result.class.joinCode,
      });
      return;
    }

    // Unknown/archived code -> generic mismatch copy (D-16).
    setError(GENERIC_MISMATCH_COPY);
  }

  if (resolved) {
    return (
      <PinForm
        classId={resolved.classId}
        className={resolved.className}
        joinCode={resolved.joinCode}
      />
    );
  }

  return (
    <div>
      <h1 style={displayTitleStyle}>Join class</h1>
      <p style={bodyStyle}>
        Enter the class code from your teacher, or open the class link.
      </p>

      {showRemembered ? (
        <RememberedClassBanner
          onUse={(displayCode) => setCode(displayCode)}
        />
      ) : null}

      <form onSubmit={handleResolve} noValidate>
        <label htmlFor="class-code" style={labelStyle}>
          Class code
        </label>
        <input
          id="class-code"
          name="classCode"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-describedby={error ? "join-error" : undefined}
          aria-invalid={error ? true : undefined}
          style={inputStyle}
        />

        {error ? (
          <p
            id="join-error"
            role="alert"
            aria-live="polite"
            style={errorTextStyle}
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          style={{ ...primaryButtonStyle, marginTop: 16 }}
        >
          Continue
        </button>
      </form>
    </div>
  );
}
