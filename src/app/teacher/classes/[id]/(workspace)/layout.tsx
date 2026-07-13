import type { ReactNode } from "react";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { ClassWorkspaceTabs } from "@/components/teacher/ClassWorkspaceTabs";
import { getClassRoster, getNeedsReviewRows, getOwnedClass } from "@/server/teacher/class-workspace-data";

export const dynamic = "force-dynamic";

export default async function ClassWorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const [{ id: classId }, profile] = await Promise.all([params, requireTeacherProfile()]);
  const ownedClass = await getOwnedClass(classId);
  const [roster, reviewRows] = await Promise.all([getClassRoster(classId), getNeedsReviewRows(profile.id)]);
  const needsReviewCount = reviewRows.filter((row) => row.classId === classId).length;

  return <section className="class-review-workspace">
    <div className="class-review-header">
      <div>
        <p className="class-review-eyebrow">Class</p>
        <h1>{ownedClass.name}</h1>
        <p>{roster.length} active student{roster.length === 1 ? "" : "s"}</p>
        {ownedClass.join_code && <p className="class-review-joincode">Class code <code>{ownedClass.join_code}</code></p>}
      </div>
    </div>
    <ClassWorkspaceTabs classId={classId} needsReviewCount={needsReviewCount}/>
    {children}
  </section>;
}
