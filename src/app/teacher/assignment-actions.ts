"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ClassReviewPolicy } from "@/domain/teacher/assignment-operations";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  type AssignedHomeworkChange,
  changeAttemptReview,
  changeAssignedHomework,
  type TeacherMutationResult,
  updateClassReviewPolicy,
} from "@/server/teacher/assignment-operations";

async function teacherId() { return (await requireTeacherProfile()).id; }
const assignedHomeworkChangeSchema = z.discriminatedUnion("action", [
  z.object({ assignedHomeworkId: z.string().uuid(), action: z.literal("request_retry"), reasonNote: z.string().optional() }),
  z.object({ assignedHomeworkId: z.string().uuid(), action: z.literal("dismiss"), reason: z.string().optional() }),
  z.object({ assignedHomeworkId: z.string().uuid(), action: z.literal("undo_dismiss") }),
]);

export async function changeAssignedHomeworkAction(
  input: { assignedHomeworkId: string } & AssignedHomeworkChange,
): Promise<TeacherMutationResult> {
  const parsed = assignedHomeworkChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_allowed" };
  return changeAssignedHomework({ teacherId: await teacherId(), ...parsed.data });
}

export async function reopenSubmissionReviewAction(attemptId: string) { const result = await changeAttemptReview({ teacherId: await teacherId(), attemptId, action: "reopen_review" }); if (result.ok) revalidatePath("/teacher"); return result; }
export async function updateClassReviewPolicyAction(input: { classId: string; reviewPolicy: ClassReviewPolicy }) {
  if (!["every_submission", "flagged_only"].includes(input.reviewPolicy)) {
    return { ok: false as const, error: "invalid_policy" as const };
  }
  const result = await updateClassReviewPolicy({ teacherId: await teacherId(), ...input });
  if (result.ok) {
    revalidatePath("/teacher");
    revalidatePath(`/teacher/classes/${input.classId}`);
  }
  return result;
}
