import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Student class lookup (STUD-01, D-10).
//
// Students have NO Supabase Auth session, so RLS (rooted in auth.uid()) cannot
// scope their reads. Student access is therefore app-owned: this module uses the
// server-only SERVICE-ROLE client, which bypasses RLS, and returns ONLY a
// minimal, non-sensitive class context (id + display name). It never returns the
// roster, the teacher, PINs, or any other student-identifying data.
//
// SECURITY: this module is server-only by construction (it imports the
// service-role client). It must NEVER be imported into a client component or any
// "use client" module — doing so would leak the service-role key into the
// browser bundle (threat T-02-15).

export type StudentClassContext = {
  classId: string;
  // The class display name, shown to the student after a safe code resolution.
  className: string;
  // The persisted join code that resolved this class. The browser stores this
  // separately from any "remembered class" key (D-18) — see the join UI.
  joinCode: string;
};

// Resolve a class by its join code for student entry. Returns minimal context
// for ACTIVE (non-archived) classes only. Returns null for unknown OR archived
// codes WITHOUT revealing which (the caller shows a generic message). The code
// is matched case-insensitively against the uppercase stored value.
export async function resolveClassByJoinCode(
  rawJoinCode: string,
): Promise<StudentClassContext | null> {
  const joinCode = rawJoinCode.trim().toUpperCase();
  if (joinCode.length === 0) {
    return null;
  }

  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("classes")
    .select("id, name, join_code, archived_at")
    .eq("join_code", joinCode)
    .is("archived_at", null)
    .maybeSingle();

  // Any error or no row -> null. We deliberately do not distinguish "no such
  // code" from "archived" from "query error" to the caller (D-16 spirit at the
  // class-resolution boundary).
  if (error || !data || !data.join_code) {
    return null;
  }

  return {
    classId: data.id,
    className: data.name,
    joinCode: data.join_code,
  };
}
