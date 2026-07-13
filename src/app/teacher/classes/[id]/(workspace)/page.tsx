import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { TeacherReviewTable } from "@/components/teacher/TeacherQueueViews";
import { getNeedsReviewRows, getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

export default async function ClassNeedsReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: classId }, profile] = await Promise.all([params, requireTeacherProfile()]);
  const ownedClass = await getOwnedClass(classId);
  const rows = (await getNeedsReviewRows(profile.id)).filter((row) => row.classId === classId);
  return <div className="class-review-queue"><TeacherReviewTable classes={[ownedClass.name]} rows={rows} scoped/></div>;
}
