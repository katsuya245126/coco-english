import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listIncompleteForTeacher } from "@/server/teacher/assignment-operations";
import { TeacherIncompleteGroups } from "@/components/teacher/TeacherQueueViews";

export const dynamic = "force-dynamic";
export default async function IncompletePage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const [profile, query] = await Promise.all([requireTeacherProfile(), searchParams]);
  const result = await listIncompleteForTeacher({ teacherId: profile.id });
  const classes = [...new Set(result.groups.flatMap((group) => group.items.map((item) => item.className)))];
  const groups = query.class ? result.groups.map((group) => ({ ...group, items: group.items.filter((item) => item.className === query.class) })).filter((group) => group.items.length > 0) : result.groups;
  return <TeacherIncompleteGroups groups={groups} classes={classes}/>;
}
