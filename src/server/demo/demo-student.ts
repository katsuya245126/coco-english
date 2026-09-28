import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type DemoStudent = {
  studentId: string;
  className: string;
  displayName: string;
};

// Creates one throwaway student (no PIN) holding every assignment in the demo
// class. The class id always comes from the server-side gate, never the request.
export async function createDemoStudent(classId: string): Promise<DemoStudent> {
  const { data, error } = await createSupabaseServiceClient().rpc(
    "create_demo_student",
    { p_class_id: classId },
  );
  const row = data?.[0];
  if (error || !row) throw new Error("create_demo_student failed");
  return {
    studentId: row.student_id,
    className: row.class_name,
    displayName: row.display_name,
  };
}

// Whether a signed-in demo student still exists (the nightly reset deletes them
// while their 8h cookie may still be valid).
export async function demoStudentExists(
  classId: string,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("class_id", classId)
    .maybeSingle();
  return !error && data !== null;
}
