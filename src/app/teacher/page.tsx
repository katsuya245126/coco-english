import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listNeedsReviewForTeacher } from "@/server/teacher/assignment-operations";
import { TeacherReviewTable } from "@/components/teacher/TeacherQueueViews";

export const dynamic = "force-dynamic";
export default async function TeacherHome({ searchParams }: { searchParams: Promise<{ class?: string; filter?: string }> }) {
  const [profile, query] = await Promise.all([requireTeacherProfile(), searchParams]);
  let rows = await listNeedsReviewForTeacher({ teacherId: profile.id });
  if (query.class) rows = rows.filter((row) => row.className === query.class);
  if (query.filter === "unread") rows = rows.filter((row) => row.firstViewedAt === null);
  if (query.filter === "flagged") rows = rows.filter((row) => row.needsReviewReason !== null);
  return <TeacherReviewTable rows={rows} classes={[...new Set(rows.map((row) => row.className))]}/>;
}
