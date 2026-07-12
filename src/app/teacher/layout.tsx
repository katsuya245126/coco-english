import type { ReactNode } from "react";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import { listClassesForTeacher } from "@/server/classroom/class-service";
import { getTeacherQueueSnapshot, listIncompleteForTeacher } from "@/server/teacher/assignment-operations";
import { TeacherWorkspaceShell } from "@/components/teacher/TeacherWorkspaceShell";
import "./teacher-workspace.css";

export const dynamic = "force-dynamic";

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const profile = await requireTeacherProfile();
  const [classes, snapshot, incomplete] = await Promise.all([
    listClassesForTeacher({ teacherId: profile.id }),
    getTeacherQueueSnapshot({ teacherId: profile.id }),
    listIncompleteForTeacher({ teacherId: profile.id }),
  ]);
  return <TeacherWorkspaceShell profileName={profile.display_name ?? "Teacher"} classes={classes} initialSnapshot={snapshot} incompleteCount={incomplete.itemCount}>{children}</TeacherWorkspaceShell>;
}
