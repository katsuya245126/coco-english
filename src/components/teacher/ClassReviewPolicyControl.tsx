"use client";
import { useTransition } from "react";
import { updateClassReviewPolicyAction } from "@/app/teacher/assignment-actions";
import type { ClassReviewPolicy } from "@/domain/teacher/assignment-operations";
export function ClassReviewPolicyControl({ classId, value }: { classId: string; value: ClassReviewPolicy }) {
  const [pending, startTransition] = useTransition();
  return <label className="review-policy-control"><span>Review setting</span><select aria-label="Class review policy" defaultValue={value} disabled={pending} onChange={(event) => startTransition(async () => { await updateClassReviewPolicyAction({ classId, reviewPolicy: event.target.value as ClassReviewPolicy }); })}><option value="every_submission">Review every submission</option><option value="flagged_only">Review flagged submissions only</option></select></label>;
}
