import Link from "next/link";
import { ClassReviewPolicyControl } from "@/components/teacher/ClassReviewPolicyControl";
import { TeacherReviewTable } from "@/components/teacher/TeacherQueueViews";
import type { ClassReviewPolicy } from "@/domain/teacher/assignment-operations";
import type { TeacherReviewRow } from "@/server/teacher/assignment-operations";

type ClassAssignment = { id: string; title: string; dueAt: string | null };
type ClassStudent = { id: string; displayName: string };

function formatDate(value: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function ClassReviewWorkspace({ classId, className, joinCode, reviewPolicy, assignments, students, reviewRows }: { classId: string; className: string; joinCode: string | null; reviewPolicy: ClassReviewPolicy; assignments: ClassAssignment[]; students: ClassStudent[]; reviewRows: TeacherReviewRow[] }) {
  return <section className="class-review-workspace">
    <div className="class-review-header">
      <div><p className="class-review-eyebrow">Assignment Review</p><h1>{className}</h1><p>{students.length} active student{students.length === 1 ? "" : "s"} · {reviewPolicy === "every_submission" ? "Review every submission" : "Review flagged submissions only"}</p>{joinCode && <p className="class-review-joincode">Class code <code>{joinCode}</code></p>}</div>
      <ClassReviewPolicyControl classId={classId} value={reviewPolicy}/>
    </div>

    <nav aria-label="Class workspace" className="class-workspace-tabs">
      <a className="active" href="#needs-review">Needs review <span>{reviewRows.length}</span></a>
      <a href="#assignments">Assignments</a>
      <a href="#students">Students</a>
      <Link href={`/teacher/classes/${classId}/manage`}>Class settings</Link>
    </nav>

    <div className="class-review-queue" id="needs-review"><TeacherReviewTable rows={reviewRows} classes={[className]} scoped/></div>

    <section className="class-review-section" id="assignments">
      <div className="class-section-heading"><div><h2>Assignments</h2><p>Newest homework and due dates for this class.</p></div><span>{assignments.length}</span></div>
      {assignments.length === 0 ? <div className="class-empty"><strong>No assignments yet</strong><p>Assign a mission to this class to see student homework here.</p></div> : <div className="class-card-grid">{assignments.map((assignment) => <article className="class-assignment-card" key={assignment.id}><div><strong>{assignment.title}</strong><p>{formatDate(assignment.dueAt)}</p></div><Link href={`/teacher/classes/${classId}/review/${assignment.id}`}>View results →</Link></article>)}</div>}
    </section>

    <section className="class-review-section" id="students">
      <div className="class-section-heading"><div><h2>Students</h2><p>Open a student profile to review their sound history.</p></div><span>{students.length}</span></div>
      {students.length === 0 ? <div className="class-empty"><p>No students in this class yet.</p></div> : <div className="class-card-grid students">{students.map((student) => <Link className="class-student-card" href={`/teacher/students/${student.id}`} key={student.id}><span className="student-initial">{student.displayName.slice(0, 1).toUpperCase()}</span><strong>{student.displayName}</strong><span>View sounds →</span></Link>)}</div>}
    </section>
  </section>;
}
