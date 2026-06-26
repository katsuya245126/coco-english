"use client";

import { useEffect, useState } from "react";
import {
  clearRememberedClass,
  getRememberedClass,
  type RememberedClass,
} from "@/components/student/remembered-class";
import {
  bodyStyle,
  headingStyle,
  secondaryButtonStyle,
} from "@/components/student/styles";

type RememberedClassBannerProps = {
  // Called with the remembered display code so the parent can prefill the code
  // field. The student still types their name + PIN (D-13/D-17) — using the
  // banner only prefills the class code, it never unlocks homework.
  onUse: (displayCode: string) => void;
};

// Remembered-class banner (STUD-02, D-12, D-18).
//
// Offers a returning device its remembered class. The remembered record is keyed
// on the immutable class id and stored SEPARATELY from any live join code, so a
// teacher resetting the join code does NOT strand this device — the student can
// still come back and re-enter with a fresh PIN. The banner never skips the PIN
// step.
export function RememberedClassBanner({ onUse }: RememberedClassBannerProps) {
  const [remembered, setRemembered] = useState<RememberedClass | null>(null);

  useEffect(() => {
    setRemembered(getRememberedClass());
  }, []);

  if (!remembered) {
    return null;
  }

  return (
    <div
      style={{
        background: "#F7F8FA",
        border: "1px solid #E5E7EB",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <h2 style={headingStyle}>Welcome back</h2>
      <p style={bodyStyle}>
        Return to <strong>{remembered.className}</strong>. You will still enter
        your PIN.
      </p>
      <button
        type="button"
        style={secondaryButtonStyle}
        onClick={() => onUse(remembered.displayCode)}
      >
        Use this class
      </button>
      <button
        type="button"
        style={{
          ...secondaryButtonStyle,
          marginTop: 8,
          color: "#6B7280",
          border: "1px solid #D1D5DB",
        }}
        onClick={() => {
          clearRememberedClass();
          setRemembered(null);
        }}
      >
        Forget this class
      </button>
    </div>
  );
}
