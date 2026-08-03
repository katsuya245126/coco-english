import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listAssignmentProgressForClass, type AssignmentProgress } from "@/server/teacher/assignment-operations";
import { getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function breakdown(progress: AssignmentProgress) {
  const parts = [
    progress.teacherReview > 0 ? `${progress.teacherReview} awaiting review` : null,
    progress.needsRetry > 0 ? `${progress.needsRetry} needs retry` : null,
    progress.started > 0 ? `${progress.started} in progress` : null,
    progress.assigned > 0 ? `${progress.assigned} not started` : null,
    progress.missed > 0 ? `${progress.missed} missed` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function AssignmentProgressSummary({ progress }: { progress: AssignmentProgress | undefined }) {
  if (!progress || progress.total === 0) return <p className="assignment-progress-breakdown">No students assigned</p>;
  const detail = breakdown(progress);
  return <div className="assignment-progress">
    <span className="assignment-progress-label">{progress.completed} of {progress.total} completed</span>
    <span aria-hidden className="assignment-progress-bar"><span style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}/></span>
    {detail && <span className="assignment-progress-breakdown">{detail}</span>}
  </div>;
}

export default async function ClassAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }, profile] = await Promise.all([params, requireTeacherProfile()]);
  await getOwnedClass(classId);
  const supabase = await createSupabaseServerClient();
  const [result, progressByAssignment] = await Promise.all([
    supabase.from("assignments").select("id, title, assignment_kind, due_at, created_at").eq("class_id", classId).is("canceled_at", null).order("due_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    listAssignmentProgressForClass({ teacherId: profile.id, classId }),
  ]);
  if (result.error) throw new Error(`Unable to load assignments: ${result.error.message}`);
  const assignments = result.data ?? [];

  return <section className="class-review-section">
    <div className="class-section-heading"><div><h2>Assignments</h2><p>Newest homework, due dates, and student progress for this class.</p></div><span>{assignments.length}</span></div>
    {assignments.length === 0 ? <div className="class-empty"><strong>No assignments yet</strong><p>Assign a mission to this class to see student homework here.</p></div> : <div className="class-card-grid">{assignments.map((assignment) => <article className="class-assignment-card" key={assignment.id}><div>{assignment.assignment_kind === "pronunciation" && <small>Pronunciation</small>}<strong>{assignment.title}</strong><p>{formatDate(assignment.due_at)}</p><AssignmentProgressSummary progress={progressByAssignment.get(assignment.id)}/></div><Link href={`/teacher/classes/${classId}/review/${assignment.id}`}>View results →</Link></article>)}</div>}
  </section>;
}
