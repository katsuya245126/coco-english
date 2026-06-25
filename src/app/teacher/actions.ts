"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { bootstrapTeacherProfile } from "@/server/auth/teacher-profile";
import {
  loginSchema,
  signupSchema,
  teacherProfileSchema,
} from "@/domain/classroom/schemas";

// Discriminated result for client forms. Generic auth-failure copy avoids
// account enumeration (no "email already registered" / "user not found").
export type AuthActionResult =
  | { status: "ok" }
  | { status: "verify_email" }
  | { status: "error"; message: string };

const GENERIC_AUTH_ERROR =
  "We could not complete that action. Check the details and try again.";

async function siteOrigin() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  if (origin) return origin;
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signupAction(
  _prev: AuthActionResult | undefined,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_AUTH_ERROR,
    };
  }

  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // Carry the display name so profile bootstrap can use it after verify.
      data: { display_name: parsed.data.displayName },
    },
  });

  if (error) {
    // Generic copy regardless of whether the email already exists.
    return { status: "error", message: GENERIC_AUTH_ERROR };
  }

  return { status: "verify_email" };
}

export async function loginAction(
  _prev: AuthActionResult | undefined,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_AUTH_ERROR,
    };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Generic copy: do not distinguish unknown email from wrong password.
    return { status: "error", message: GENERIC_AUTH_ERROR };
  }

  redirect("/teacher");
}

export async function bootstrapProfileAction(
  _prev: AuthActionResult | undefined,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = teacherProfileSchema.safeParse({
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? GENERIC_AUTH_ERROR,
    };
  }

  await bootstrapTeacherProfile(parsed.data.displayName);

  redirect("/teacher");
}
