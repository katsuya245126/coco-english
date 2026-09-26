"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inputStyle, labelStyle, primaryButtonStyle } from "@/components/student/styles";
import { loginSchema, type LoginInput } from "@/domain/classroom/schemas";
import { loginAction, type AuthActionResult } from "@/app/teacher/actions";

const fieldLabelStyle = { ...labelStyle, marginTop: 16 };

const errorStyle = { color: "#B42318", fontSize: 14, marginTop: 4 };

export function LoginForm() {
  const [state, formAction, pending] = useActionState<
    AuthActionResult | undefined,
    FormData
  >(loginAction, undefined);

  const {
    register,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
  });

  return (
    <form action={formAction} noValidate>
      <label style={fieldLabelStyle} htmlFor="login-email">
        Email
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        style={inputStyle}
        aria-invalid={Boolean(errors.email)}
        {...register("email")}
      />
      {errors.email ? <p style={errorStyle}>{errors.email.message}</p> : null}

      <label style={fieldLabelStyle} htmlFor="login-password">
        Password
      </label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        style={inputStyle}
        aria-invalid={Boolean(errors.password)}
        {...register("password")}
      />
      {errors.password ? (
        <p style={errorStyle}>{errors.password.message}</p>
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
        {pending ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}
