import { cache } from "react";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { listRoster } from "@/server/classroom/roster-service";
import { listNeedsReviewForTeacher } from "@/server/teacher/assignment-operations";

// React.cache() dedupes these per request so the (workspace) layout and its
// child page share one fetch instead of querying twice.

export const getOwnedClass = cache(async (classId: string) => {
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("classes").select("id, name, join_code, review_policy").eq("id", classId).maybeSingle();
  if (result.error) throw new Error(`Unable to load class: ${result.error.message}`);
  if (!result.data) notFound();
  return result.data;
});

export const getClassRoster = cache(async (classId: string) => listRoster(classId));

export const getNeedsReviewRows = cache(async (teacherId: string) => listNeedsReviewForTeacher({ teacherId }));
