"use client";

import { useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/domain/classroom/schemas";
import { loginAction, type AuthActionResult } from "@/app/teacher/actions";

const fieldStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "8px 12px",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 16,
};

const labelStyle = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  margin: "16px 0 4px",
};

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
      <label style={labelStyle} htmlFor="login-email">
        Email
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        style={fieldStyle}
        aria-invalid={Boolean(errors.email)}
        {...register("email")}
      />
      {errors.email ? <p style={errorStyle}>{errors.email.message}</p> : null}

      <label style={labelStyle} htmlFor="login-password">
        Password
      </label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        style={fieldStyle}
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
        style={{
          marginTop: 24,
          width: "100%",
          padding: "10px 16px",
          background: "#2563EB",
          color: "#FFFFFF",
          border: "none",
          borderRadius: 6,
          fontSize: 16,
          fontWeight: 600,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Logging in..." : "Log in"}
      </button>
    </form>
  );
}
