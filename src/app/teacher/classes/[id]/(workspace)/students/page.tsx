import Link from "next/link";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { getClassRoster, getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

export default async function ClassStudentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }] = await Promise.all([params, requireTeacherProfile()]);
  await getOwnedClass(classId);
  const roster = await getClassRoster(classId);

  return <section className="class-review-section">
    <div className="class-section-heading"><div><h2>Students</h2><p>Open a student profile to review their sound history.</p></div><span>{roster.length}</span></div>
    {roster.length === 0 ? <div className="class-empty"><p>No students in this class yet.</p></div> : <div className="class-card-grid students">{roster.map((student) => <Link className="class-student-card" href={`/teacher/students/${student.id}`} key={student.id}><span className="student-initial">{student.displayName.slice(0, 1).toUpperCase()}</span><strong>{student.displayName}</strong><span>View sounds →</span></Link>)}</div>}
  </section>;
}
