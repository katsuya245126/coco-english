import { notFound } from "next/navigation";
import { ClassReviewWorkspace } from "@/components/teacher/ClassReviewWorkspace";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listRoster } from "@/server/classroom/roster-service";
import { listNeedsReviewForTeacher } from "@/server/teacher/assignment-operations";

export const dynamic = "force-dynamic";

type AssignmentRow = { id: string; title: string; due_at: string | null; created_at: string };

export default async function ClassReviewDashboard({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireTeacherProfile();
  const { id: classId } = await params;
  const supabase = await createSupabaseServerClient();

  const classResult = await supabase.from("classes").select("id, name, review_policy").eq("id", classId).maybeSingle();
  if (classResult.error) throw new Error(`Unable to load class: ${classResult.error.message}`);
  if (!classResult.data) notFound();
  const ownedClass = classResult.data;

  const [roster, assignmentsResult, teacherReviewRows] = await Promise.all([
    listRoster(classId),
    supabase.from("assignments").select("id, title, due_at, created_at").eq("class_id", classId).is("canceled_at", null).order("due_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    listNeedsReviewForTeacher({ teacherId: profile.id }),
  ]);
  if (assignmentsResult.error) throw new Error(`Unable to load assignments: ${assignmentsResult.error.message}`);
  const assignments: AssignmentRow[] = assignmentsResult.data ?? [];

  return <ClassReviewWorkspace
    assignments={assignments.map((assignment) => ({ id: assignment.id, title: assignment.title, dueAt: assignment.due_at }))}
    classId={classId}
    className={ownedClass.name}
    reviewPolicy={ownedClass.review_policy}
    reviewRows={teacherReviewRows.filter((row) => row.className === ownedClass.name)}
    students={roster.map((student) => ({ id: student.id, displayName: student.displayName }))}
  />;
}
