"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { markSubmissionReviewedAction, requestSubmissionRetryAction } from "@/app/teacher/evidence/[attemptId]/actions";

export function SubmissionReviewControls({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const markReviewed = () => startTransition(async () => {
    const result = await markSubmissionReviewedAction(attemptId);
    if (result.ok) router.push(`/teacher?reviewed=${attemptId}`);
    else setError(true);
  });
  const requestRetry = () => startTransition(async () => {
    const result = await requestSubmissionRetryAction({ attemptId, reasonNote: note.trim() || undefined });
    if (result.ok) router.push("/teacher");
    else setError(true);
  });

  return <section aria-label="Submission review actions" style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
    <h2>Teacher action</h2>
    <div style={{ display: "flex", gap: 10 }}>
      <button type="button" disabled={pending} onClick={markReviewed}>Mark reviewed</button>
      <button type="button" disabled={pending} onClick={() => dialog.current?.showModal()}>Request retry</button>
    </div>
    {error && <p role="alert">Could not update this submission. Please try again.</p>}
    <dialog ref={dialog} aria-labelledby="retry-heading">
      <h2 id="retry-heading">Request retry?</h2>
      <p>The student can start a new attempt. This evidence stays available.</p>
      <label htmlFor="retry-note">Note (optional)</label>
      <textarea id="retry-note" value={note} onChange={(event) => setNote(event.target.value)} />
      <div><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button type="button" disabled={pending} onClick={requestRetry}>Request retry</button></div>
    </dialog>
  </section>;
}
