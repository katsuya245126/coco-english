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

const DAY_MS = 86_400_000;

// Past-due work that still has unfinished students is the teacher's cue to chase it.
function dueTag(dueAt: string | null, progress: AssignmentProgress | undefined, now = Date.now()) {
  const due = dueAt ? new Date(dueAt).getTime() : Number.NaN;
  if (Number.isNaN(due)) return { tone: "ok", label: formatDate(dueAt) };
  const unfinished = progress ? progress.completed < progress.total : false;
  if (due < now) return unfinished ? { tone: "late", label: `Past due · ${formatDate(dueAt)}` } : { tone: "ok", label: `Was due ${formatDate(dueAt)}` };
  if (due - now <= 3 * DAY_MS) return { tone: "soon", label: `Due soon · ${formatDate(dueAt)}` };
  return { tone: "ok", label: `Due ${formatDate(dueAt)}` };
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

function DueTag({ tone, label }: { tone: string; label: string }) {
  return <span className={`due-tag ${tone}`}>{label}</span>;
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
    <div className="class-section-heading"><div><h2>Assignments</h2><p>Due dates and student progress for this class.</p></div><span>{assignments.length}</span></div>
    {assignments.length === 0 ? <div className="class-empty"><strong>No assignments yet</strong><p>Assign a mission to this class to see student homework here.</p></div> : <div className="class-card-list">{assignments.map((assignment) => <article className="class-assignment-card" key={assignment.id}><div className="assignment-title"><strong>{assignment.title}</strong><DueTag {...dueTag(assignment.due_at, progressByAssignment.get(assignment.id))}/><p>{assignment.assignment_kind === "pronunciation" ? "Pronunciation practice" : "Conversation mission"}</p></div><AssignmentProgressSummary progress={progressByAssignment.get(assignment.id)}/><Link className="ghost-button" href={`/teacher/classes/${classId}/review/${assignment.id}`}>View results</Link></article>)}</div>}
  </section>;
}
