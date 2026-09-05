import { createSupabaseServerClient } from "@/lib/supabase/server-auth";

// Class management service.
//
// Every read/write here goes through the RLS-bound SSR user client
// (createSupabaseServerClient), NEVER the service-role client. RLS rooted in
// teacher_profiles.auth_user_id = auth.uid() (migration 02) guarantees a teacher
// can only see or mutate their own classes (AUTH-04, D-15). The caller is also
// expected to have passed requireTeacherProfile() before reaching these.
//
// Keep per-query `.error` checks so partial Supabase failures never look successful.

export type TeacherClass = {
  id: string;
  name: string;
  joinCode: string | null;
  rosterCount: number;
};

// List the current teacher's non-archived classes with an active-student roster
// count. RLS limits the classes query to this teacher's rows; the roster count
// tallies active (non-archived) students per class. We tally in two queries
// rather than a PostgREST embed because the typed Database declares empty
// Relationships (see 02-01-SUMMARY), which would resolve an embedded count to
// `never`.
export async function listClassesForTeacher(input: {
  teacherId: string;
}): Promise<TeacherClass[]> {
  const supabase = await createSupabaseServerClient();

  const classes = await supabase
    .from("classes")
    .select("id, name, join_code")
    .eq("teacher_id", input.teacherId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (classes.error) {
    throw new Error(`Unable to list classes: ${classes.error.message}`);
  }

  const classRows = classes.data ?? [];
  if (classRows.length === 0) {
    return [];
  }

  const classIds = classRows.map((row) => row.id);
  const students = await supabase
    .from("students")
    .select("class_id")
    .in("class_id", classIds)
    .is("archived_at", null);

  if (students.error) {
    throw new Error(
      `Unable to count active students: ${students.error.message}`,
    );
  }

  const rosterCounts = new Map<string, number>();
  for (const student of students.data ?? []) {
    rosterCounts.set(
      student.class_id,
      (rosterCounts.get(student.class_id) ?? 0) + 1,
    );
  }

  return classRows.map((row) => ({
    id: row.id,
    name: row.name,
    joinCode: row.join_code,
    rosterCount: rosterCounts.get(row.id) ?? 0,
  }));
}
