"use client";

import type { ChangeEvent } from "react";
import { inputStyle, labelStyle } from "@/components/student/styles";

type NameFormProps = {
  value: string;
  onChange: (value: string) => void;
  describedById?: string;
  invalid?: boolean;
};

// Typed student-name entry (STUD-03, D-11).
//
// This is a FREE-TEXT input only. There is deliberately NO roster selector,
// dropdown, datalist, or autocomplete of other students' names — exposing the
// roster would leak classmates' identities (threat T-02-14). The student types
// their own name; the server normalizes and matches it.
export function NameForm({
  value,
  onChange,
  describedById,
  invalid,
}: NameFormProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor="student-name" style={labelStyle}>
        Your name
      </label>
      <input
        id="student-name"
        name="studentName"
        type="text"
        autoComplete="off"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
        style={inputStyle}
        aria-describedby={describedById}
        aria-invalid={invalid ? true : undefined}
      />
    </div>
  );
}
