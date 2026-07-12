"use server";

import { requireTeacherProfile } from "@/server/teacher/auth";
import {
  dismissAssignmentStudentById,
  undoDismissByAssignmentStudentId,
} from "@/server/teacher/assignment-operations";

export async function dismissAssignmentStudentByIdAction(input: {
  assignmentStudentId: string;
  reason?: string;
}) {
  const profile = await requireTeacherProfile();
  return dismissAssignmentStudentById({ teacherId: profile.id, ...input });
}

export async function undoDismissByAssignmentStudentIdAction(
  assignmentStudentId: string,
) {
  const profile = await requireTeacherProfile();
  return undoDismissByAssignmentStudentId({
    teacherId: profile.id,
    assignmentStudentId,
  });
}
