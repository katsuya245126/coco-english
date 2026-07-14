"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClassReviewPolicy } from "@/domain/teacher/assignment-operations";
import { updateClassReviewPolicyAction } from "@/app/teacher/assignment-actions";

const HELPER_TEXT: Record<ClassReviewPolicy, string> = {
  every_submission:
    "All completed submissions stay in Needs review until you mark them reviewed.",
  flagged_only:
    "Only submissions flagged by Coco stay in Needs review. Other completions remain in All activity.",
};

const ERROR_MESSAGE =
  "Could not update the review setting. Your previous setting is still active. Please try again.";

export function ClassReviewPolicyControl({
  classId,
  value,
}: {
  classId: string;
  value: ClassReviewPolicy;
}) {
  const router = useRouter();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [confirmedValue, setConfirmedValue] = useState(value);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setConfirmedValue(value);
  }, [value]);

  const updatePolicy = async (nextValue: ClassReviewPolicy) => {
    if (nextValue === confirmedValue || pending) return;

    setPending(true);
    setStatus("Saving review setting…");
    setError("");

    try {
      const result = await updateClassReviewPolicyAction({
        classId,
        reviewPolicy: nextValue,
      });

      if (result.ok) {
        setConfirmedValue(nextValue);
        setStatus("Review setting updated.");
        router.refresh();
      } else {
        setStatus("");
        setError(ERROR_MESSAGE);
      }
    } catch {
      setStatus("");
      setError(ERROR_MESSAGE);
    } finally {
      setPending(false);
      window.requestAnimationFrame(() => selectRef.current?.focus());
    }
  };

  return (
    <div className="review-policy-control">
      <label htmlFor={`class-review-policy-${classId}`}>Review setting</label>
      <select
        ref={selectRef}
        id={`class-review-policy-${classId}`}
        aria-label="Class review policy"
        value={confirmedValue}
        disabled={pending}
        onChange={(event) =>
          void updatePolicy(event.currentTarget.value as ClassReviewPolicy)
        }
      >
        <option value="every_submission">Review every submission</option>
        <option value="flagged_only">Review flagged submissions only</option>
      </select>
      <p className="review-policy-helper">{HELPER_TEXT[confirmedValue]}</p>
      <p className="review-policy-status" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="review-policy-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
