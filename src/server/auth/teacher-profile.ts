import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { demoClassId } from "@/server/demo/demo-config";

export type TeacherProfile = {
  id: string;
  display_name: string | null;
};

// Auth gate for teacher routes. Validates the session via getClaims() (not
// getSession — server cookies can be spoofed per Supabase SSR guidance),
// redirects unauthenticated requests to /auth/login, and redirects verified
// users with no profile row to /auth/profile for first-login bootstrap.
// On the public demo every teacher gate refuses: server actions are callable by
// id from any path, so the /teacher middleware redirect alone is not enough.
export async function requireTeacherProfile(): Promise<TeacherProfile> {
  if (demoClassId()) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  const authUserId = data?.claims?.sub;
  if (error || !authUserId) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("teacher_profiles")
    .select("id, display_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `Unable to load teacher profile: ${profileError.message}`,
    );
  }

  if (!profile) {
    redirect("/auth/profile");
  }

  return profile;
}

// First-login bootstrap: create the teacher_profiles row bound to the verified
// auth user with their chosen display name (D-04: display name only). Idempotent
// per auth user via the auth_user_id unique constraint.
export async function bootstrapTeacherProfile(
  displayName: string,
): Promise<TeacherProfile> {
  if (demoClassId()) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  const authUserId = data?.claims?.sub;
  if (error || !authUserId) {
    redirect("/auth/login");
  }

  const existing = await supabase
    .from("teacher_profiles")
    .select("id, display_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      `Unable to check teacher profile: ${existing.error.message}`,
    );
  }

  if (existing.data) {
    return existing.data;
  }

  const inserted = await supabase
    .from("teacher_profiles")
    .insert({
      auth_user_id: authUserId,
      display_name: displayName,
    })
    .select("id, display_name")
    .single();

  if (inserted.error) {
    throw new Error(
      `Unable to create teacher profile: ${inserted.error.message}`,
    );
  }

  return inserted.data;
}
