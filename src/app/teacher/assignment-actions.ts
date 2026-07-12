"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/teacher/auth";
import {
  markSubmissionReviewed,
  markSubmissionViewed,
  reopenSubmissionReview,
  requestSubmissionRetry,
  updateClassReviewPolicy,
} from "@/server/teacher/assignment-operations";
import type { ClassReviewPolicy } from "@/domain/teacher/assignment-operations";

async function teacherId() { return (await requireTeacherProfile()).id; }
export async function markSubmissionViewedAction(attemptId: string) { return markSubmissionViewed({ teacherId: await teacherId(), attemptId }); }
export async function markSubmissionReviewedAction(attemptId: string) { const result = await markSubmissionReviewed({ teacherId: await teacherId(), attemptId }); if (result.ok) revalidatePath("/teacher"); return result; }
export async function reopenSubmissionReviewAction(attemptId: string) { const result = await reopenSubmissionReview({ teacherId: await teacherId(), attemptId }); if (result.ok) revalidatePath("/teacher"); return result; }
export async function requestSubmissionRetryAction(input: { attemptId: string; reasonNote?: string }) { const result = await requestSubmissionRetry({ teacherId: await teacherId(), ...input }); if (result.ok) revalidatePath("/teacher"); return result; }
export async function updateClassReviewPolicyAction(input: { classId: string; reviewPolicy: ClassReviewPolicy }) { const result = await updateClassReviewPolicy({ teacherId: await teacherId(), ...input }); if (result.ok) revalidatePath(`/teacher/classes/${input.classId}`); return result; }
