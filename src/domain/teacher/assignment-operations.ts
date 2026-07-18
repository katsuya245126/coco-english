export type ClassReviewPolicy = "every_submission" | "flagged_only";

export type ReviewEligibilityInput = {
  isLatestAttempt: boolean;
  reviewedAt: string | null;
  status: "completed" | "teacher_review" | "started" | "assigned" | "missed" | "needs_retry";
  attemptStatus: string;
  needsReviewReason: string | null;
  reviewPolicy: ClassReviewPolicy;
};

export function isSubmissionPendingReview(input: ReviewEligibilityInput): boolean {
  if (!input.isLatestAttempt || input.reviewedAt !== null) return false;
  const isCompleted = ["completed", "teacher_review"].includes(input.status)
    && ["completed", "teacher_review"].includes(input.attemptStatus);
  return isCompleted && (input.reviewPolicy === "every_submission" || input.needsReviewReason !== null);
}

export type IncompleteStatus = "assigned" | "started" | "missed" | "completed" | "needs_retry" | "teacher_review";
export type IncompleteProgress = "not_started" | "started";
export type IncompleteUrgency = "missed" | "due_soon" | "later";

export type IncompleteAssignmentRow = {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  status: IncompleteStatus;
  dueAt: string | null;
  dismissedAt?: string | null;
};

export type GroupedIncompleteItem<T extends IncompleteAssignmentRow = IncompleteAssignmentRow> = T & {
  progress: IncompleteProgress;
};

export type IncompleteAssignmentGroup<T extends IncompleteAssignmentRow = IncompleteAssignmentRow> = {
  assignmentId: string;
  assignmentTitle: string;
  urgency: IncompleteUrgency;
  items: GroupedIncompleteItem<T>[];
};

const urgencyOrder: Record<IncompleteUrgency, number> = { missed: 0, due_soon: 1, later: 2 };

export function groupIncompleteAssignments<T extends IncompleteAssignmentRow>(rows: T[], now: Date): IncompleteAssignmentGroup<T>[] {
  const groups = new Map<string, IncompleteAssignmentGroup<T>>();
  const dueSoonEnd = now.getTime() + 3 * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    if (row.dismissedAt != null) continue;
    if (["completed", "needs_retry", "teacher_review"].includes(row.status)) continue;
    const dueTime = row.dueAt === null ? null : new Date(row.dueAt).getTime();
    const urgency: IncompleteUrgency = row.status === "missed" || (dueTime !== null && dueTime <= now.getTime())
      ? "missed"
      : dueTime !== null && dueTime <= dueSoonEnd
        ? "due_soon"
        : "later";
    const key = `${urgency}:${row.assignmentId}`;
    const group = groups.get(key) ?? { assignmentId: row.assignmentId, assignmentTitle: row.assignmentTitle, urgency, items: [] };
    group.items.push({ ...row, progress: row.status === "started" ? "started" : "not_started" });
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || a.assignmentId.localeCompare(b.assignmentId));
}

// The Incomplete sidebar badge counts only time-pressing items ("missed" and
// "due_soon"); "later" work isn't due soon enough to demand attention yet.
export function countIncompleteItems(groups: IncompleteAssignmentGroup[]): number {
  return groups.reduce((total, group) => total + (group.urgency === "later" ? 0 : group.items.length), 0);
}

export type SubmissionRecency = { receivedAt: string; assignmentStudentId: string };

export function compareSubmissionRecency(a: SubmissionRecency, b: SubmissionRecency): number {
  return Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || b.assignmentStudentId.localeCompare(a.assignmentStudentId);
}
