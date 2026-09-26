"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inputStyle, labelStyle, primaryButtonStyle } from "@/components/student/styles";
import {
  teacherProfileSchema,
  type TeacherProfileInput,
} from "@/domain/classroom/schemas";
import {
  bootstrapProfileAction,
  type AuthActionResult,
} from "@/app/teacher/actions";

const fieldLabelStyle = { ...labelStyle, marginTop: 16 };

const errorStyle = { color: "#B42318", fontSize: 14, marginTop: 4 };

export function ProfileForm({ defaultName }: { defaultName?: string }) {
  const [state, formAction, pending] = useActionState<
    AuthActionResult | undefined,
    FormData
  >(bootstrapProfileAction, undefined);

  const {
    register,
    formState: { errors },
  } = useForm<TeacherProfileInput>({
    resolver: zodResolver(teacherProfileSchema),
    mode: "onBlur",
    defaultValues: { displayName: defaultName ?? "" },
  });

  return (
    <form action={formAction} noValidate>
      <label style={fieldLabelStyle} htmlFor="profile-display-name">
        Display name
      </label>
      <input
        id="profile-display-name"
        style={inputStyle}
        aria-invalid={Boolean(errors.displayName)}
        {...register("displayName")}
      />
      {errors.displayName ? (
        <p style={errorStyle}>{errors.displayName.message}</p>
      ) : null}

      {state?.status === "error" ? (
        <p role="alert" style={{ ...errorStyle, marginTop: 16 }}>
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="student-primary-button"
        style={{
          ...primaryButtonStyle,
          marginTop: 24,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
