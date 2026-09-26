"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inputStyle, labelStyle, primaryButtonStyle } from "@/components/student/styles";
import { signupSchema, type SignupInput } from "@/domain/classroom/schemas";
import { signupAction, type AuthActionResult } from "@/app/teacher/actions";

const fieldLabelStyle = { ...labelStyle, marginTop: 16 };

const errorStyle = { color: "#B42318", fontSize: 14, marginTop: 4 };

export function SignupForm() {
  const [state, formAction, pending] = useActionState<
    AuthActionResult | undefined,
    FormData
  >(signupAction, undefined);

  const {
    register,
    formState: { errors },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: "onBlur",
  });

  if (state?.status === "verify_email") {
    return (
      <p
        role="status"
        aria-live="polite"
        style={{
          color: "#B45309",
          fontSize: 16,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Check your email to verify your teacher account.
      </p>
    );
  }

  return (
    <form action={formAction} noValidate>
      <label style={fieldLabelStyle} htmlFor="signup-display-name">
        Display name
      </label>
      <input
        id="signup-display-name"
        style={inputStyle}
        aria-invalid={Boolean(errors.displayName)}
        {...register("displayName")}
      />
      {errors.displayName ? (
        <p style={errorStyle}>{errors.displayName.message}</p>
      ) : null}

      <label style={fieldLabelStyle} htmlFor="signup-email">
        Email
      </label>
      <input
        id="signup-email"
        type="email"
        autoComplete="email"
        style={inputStyle}
        aria-invalid={Boolean(errors.email)}
        {...register("email")}
      />
      {errors.email ? <p style={errorStyle}>{errors.email.message}</p> : null}

      <label style={fieldLabelStyle} htmlFor="signup-password">
        Password
      </label>
      <input
        id="signup-password"
        type="password"
        autoComplete="new-password"
        style={inputStyle}
        aria-invalid={Boolean(errors.password)}
        {...register("password")}
      />
      {errors.password ? (
        <p style={errorStyle}>{errors.password.message}</p>
      ) : null}

      <label style={fieldLabelStyle} htmlFor="signup-confirm-password">
        Confirm password
      </label>
      <input
        id="signup-confirm-password"
        type="password"
        autoComplete="new-password"
        style={inputStyle}
        aria-invalid={Boolean(errors.confirmPassword)}
        {...register("confirmPassword")}
      />
      {errors.confirmPassword ? (
        <p style={errorStyle}>{errors.confirmPassword.message}</p>
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
        {pending ? "Creating account..." : "Create teacher account"}
      </button>
    </form>
  );
}
