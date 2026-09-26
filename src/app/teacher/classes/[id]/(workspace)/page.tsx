import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { TeacherReviewTable } from "@/components/teacher/TeacherQueueViews";
import { filterTeacherReviewRows } from "@/domain/teacher/review-pagination";
import { getNeedsReviewRows, getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

export default async function ClassNeedsReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string }> }) {
  const [{ id: classId }, query, profile] = await Promise.all([params, searchParams, requireTeacherProfile()]);
  const ownedClass = await getOwnedClass(classId);
  const classRows = (await getNeedsReviewRows(profile.id)).filter((row) => row.classId === classId);
  const { rows, counts } = filterTeacherReviewRows(classRows, { filter: query.filter });
  return <div className="class-review-queue"><TeacherReviewTable classes={[ownedClass.name]} rows={rows} counts={counts} query={{ filter: query.filter }} scoped/></div>;
}
