import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { generateJoinCode } from "@/domain/classroom/join-code";

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

// Postgres unique_violation — surfaced by PostgREST in error.code.
const UNIQUE_VIOLATION = "23505";
const JOIN_CODE_RETRY_LIMIT = 5;

// Create a class owned by the given teacher with a freshly generated unique join
// code. On the rare join_code collision (unique index), regenerate and retry.
export async function createClass(input: {
  teacherId: string;
  name: string;
}): Promise<TeacherClass> {
  const supabase = await createSupabaseServerClient();

  for (let attempt = 0; attempt < JOIN_CODE_RETRY_LIMIT; attempt += 1) {
    const joinCode = generateJoinCode();
    const inserted = await supabase
      .from("classes")
      .insert({
        teacher_id: input.teacherId,
        name: input.name,
        join_code: joinCode,
        data_mode: "real",
      })
      .select("id, name, join_code")
      .single();

    if (!inserted.error) {
      return {
        id: inserted.data.id,
        name: inserted.data.name,
        joinCode: inserted.data.join_code,
        rosterCount: 0,
      };
    }

    // Retry only on a join_code uniqueness collision; surface anything else.
    if (inserted.error.code !== UNIQUE_VIOLATION) {
      throw new Error(`Unable to create class: ${inserted.error.message}`);
    }
  }

  throw new Error(
    "Unable to create class: could not allocate a unique join code.",
  );
}

// Rename a class. RLS scopes the update to the owning teacher's row.
export async function updateClass(input: {
  classId: string;
  name: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("classes")
    .update({ name: input.name })
    .eq("id", input.classId);

  if (error) {
    throw new Error(`Unable to update class: ${error.message}`);
  }
}

// Archive a class by stamping archived_at. Archived classes drop out of the
// active list (D-03) but their history is preserved (no row deletion).
export async function archiveClass(input: { classId: string }): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("classes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.classId);

  if (error) {
    throw new Error(`Unable to archive class: ${error.message}`);
  }
}

// Reset a class join code: regenerate the code only (D-18). This changes the
// code/link used for NEW entry; it does NOT delete the class or any students, so
// devices that already remember the class context still reach it. Retries on the
// rare collision against the global join_code unique index.
export async function resetJoinCode(input: {
  classId: string;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();

  for (let attempt = 0; attempt < JOIN_CODE_RETRY_LIMIT; attempt += 1) {
    const joinCode = generateJoinCode();
    const updated = await supabase
      .from("classes")
      .update({ join_code: joinCode })
      .eq("id", input.classId)
      .select("join_code")
      .single();

    if (!updated.error) {
      return updated.data.join_code ?? joinCode;
    }

    if (updated.error.code !== UNIQUE_VIOLATION) {
      throw new Error(`Unable to reset join code: ${updated.error.message}`);
    }
  }

  throw new Error(
    "Unable to reset join code: could not allocate a unique join code.",
  );
}

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
