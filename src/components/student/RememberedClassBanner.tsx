"use client";

import { useEffect, useState } from "react";
import {
  getRememberedClass,
  type RememberedClass,
} from "@/components/student/remembered-class";
import { primaryButtonStyle } from "@/components/student/styles";

type RememberedClassBannerProps = {
  // Called with the remembered class's IMMUTABLE id (D-18), so the parent can
  // resolve the CURRENT join code by id — never the cached, possibly-stale code.
  // The student still types their name + PIN (D-13/D-17); the banner only routes
  // to the class, it never unlocks homework.
  onUse: (classId: string) => void;
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
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "#F7F8FA",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <strong
        style={{
          minWidth: 0,
          color: "#111827",
          overflowWrap: "anywhere",
        }}
      >
        {remembered.className}
      </strong>
      <button
        className="student-primary-button"
        type="button"
        style={{
          ...primaryButtonStyle,
          width: "auto",
          minHeight: 42,
          padding: "10px 16px",
          borderRadius: 10,
          flex: "0 0 auto",
        }}
        onClick={() => onUse(remembered.classId)}
      >
        Login
      </button>
    </div>
  );
}
