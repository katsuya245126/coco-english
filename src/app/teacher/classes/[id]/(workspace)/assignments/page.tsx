import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server-auth";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export default async function ClassAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }] = await Promise.all([params, requireTeacherProfile()]);
  await getOwnedClass(classId);
  const supabase = await createSupabaseServerClient();
  const result = await supabase.from("assignments").select("id, title, due_at, created_at").eq("class_id", classId).is("canceled_at", null).order("due_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (result.error) throw new Error(`Unable to load assignments: ${result.error.message}`);
  const assignments = result.data ?? [];

  return <section className="class-review-section">
    <div className="class-section-heading"><div><h2>Assignments</h2><p>Newest homework and due dates for this class.</p></div><span>{assignments.length}</span></div>
    {assignments.length === 0 ? <div className="class-empty"><strong>No assignments yet</strong><p>Assign a mission to this class to see student homework here.</p></div> : <div className="class-card-grid">{assignments.map((assignment) => <article className="class-assignment-card" key={assignment.id}><div><strong>{assignment.title}</strong><p>{formatDate(assignment.due_at)}</p></div><Link href={`/teacher/classes/${classId}/review/${assignment.id}`}>View results →</Link></article>)}</div>}
  </section>;
}
