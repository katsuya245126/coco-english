import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listIncompleteForTeacher, listNeedsReviewForTeacher } from "@/server/teacher/assignment-operations";
import { TeacherReviewTable } from "@/components/teacher/TeacherQueueViews";
import { countIncompleteItems } from "@/domain/teacher/assignment-operations";
import { filterTeacherReviewRows, paginateTeacherReviewRows } from "@/domain/teacher/review-pagination";

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
  const [allRows, incomplete] = await Promise.all([
    listNeedsReviewForTeacher({ teacherId: profile.id }),
    listIncompleteForTeacher({ teacherId: profile.id }),
  ]);
  const { rows, counts } = filterTeacherReviewRows(allRows, { className: query.class, filter: query.filter });
  const paginated = paginateTeacherReviewRows(rows, Number(query.page), 10);
  return (
    <TeacherReviewTable
      rows={paginated.rows}
      classes={[...new Set(allRows.map((row) => row.className))]}
      page={paginated.page}
      totalPages={paginated.totalPages}
      query={{ className: query.class, filter: query.filter }}
      counts={counts}
      incomplete={{ count: incomplete.itemCount, missed: countIncompleteItems(incomplete.groups.filter((group) => group.urgency === "missed")) }}
      newestHref={rows[0] && `/teacher/evidence/${rows[0].attemptId}`}
    />
  );
}
