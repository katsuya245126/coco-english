import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listActivityForTeacher } from "@/server/teacher/assignment-operations";
import { TeacherActivityTable } from "@/components/teacher/TeacherQueueViews";

export const dynamic = "force-dynamic";
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ class?: string; filter?: string; page?: string; reviewed?: string }> }) {
  const [profile, query] = await Promise.all([requireTeacherProfile(), searchParams]);
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  let rows = await listActivityForTeacher({ teacherId: profile.id, offset: (page - 1) * 50, limit: 50 });
  const classes = [...new Set(rows.map((row) => row.className))];
  if (query.class) rows = rows.filter((row) => row.className === query.class);
  if (query.filter === "reviewed") rows = rows.filter((row) => row.reviewedAt !== null);
  if (query.filter === "retries") rows = rows.filter((row) => row.status === "needs_retry");
  return <TeacherActivityTable rows={rows} classes={classes} reviewedAttemptId={query.reviewed}/>;
}
