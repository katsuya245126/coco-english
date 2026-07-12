import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listNeedsReviewForTeacher } from "@/server/teacher/assignment-operations";
import { TeacherReviewTable } from "@/components/teacher/TeacherQueueViews";
import { paginateTeacherReviewRows } from "@/domain/teacher/review-pagination";

export const dynamic = "force-dynamic";
export default async function TeacherHome({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; filter?: string; page?: string }>;
}) {
  const [profile, query] = await Promise.all([
    requireTeacherProfile(),
    searchParams,
  ]);
  let rows = await listNeedsReviewForTeacher({ teacherId: profile.id });
  if (query.class) rows = rows.filter((row) => row.className === query.class);
  if (query.filter === "unread")
    rows = rows.filter((row) => row.firstViewedAt === null);
  if (query.filter === "flagged")
    rows = rows.filter((row) => row.needsReviewReason !== null);
  const paginated = paginateTeacherReviewRows(rows, Number(query.page), 10);
  return (
    <TeacherReviewTable
      rows={paginated.rows}
      classes={[...new Set(rows.map((row) => row.className))]}
      page={paginated.page}
      totalPages={paginated.totalPages}
      query={{ className: query.class, filter: query.filter }}
    />
  );
}
