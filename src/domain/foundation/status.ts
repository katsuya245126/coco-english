export const ASSIGNMENT_STUDENT_STATUSES = [
  "assigned",
  "started",
  "completed",
  "missed",
  "needs_retry",
  "teacher_review",
] as const;

export type AssignmentStudentStatus =
  (typeof ASSIGNMENT_STUDENT_STATUSES)[number];

export type StatusActorType =
  | "system"
  | "teacher"
  | "student_session"
  | "job"
  | "ai_evaluator";

export type TransitionRequest = {
  previousStatus: AssignmentStudentStatus;
  nextStatus: AssignmentStudentStatus;
  actorType: StatusActorType;
  actorId?: string;
  reasonCode?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

export type MissedStatusInput = {
  status: AssignmentStudentStatus;
  dueAt: string | Date | null;
  latestAttemptStatus?:
    | "in_progress"
    | "completed"
    | "abandoned"
    | "needs_retry"
    | "teacher_review"
    | null;
  now?: string | Date;
};

const LEGAL_TRANSITIONS: Record<
  AssignmentStudentStatus,
  ReadonlySet<AssignmentStudentStatus>
> = {
  assigned: new Set(["started", "missed"]),
  started: new Set(["completed", "missed", "needs_retry", "teacher_review"]),
  completed: new Set(["teacher_review", "needs_retry"]),
  missed: new Set(["started"]),
  needs_retry: new Set(["started", "teacher_review"]),
  teacher_review: new Set(["completed", "needs_retry", "started"]),
};

export function canTransitionAssignmentStatus(
  previousStatus: AssignmentStudentStatus,
  nextStatus: AssignmentStudentStatus,
): boolean {
  return LEGAL_TRANSITIONS[previousStatus].has(nextStatus);
}

export function assertTransitionRequest(request: TransitionRequest): void {
  if (
    !canTransitionAssignmentStatus(request.previousStatus, request.nextStatus)
  ) {
    throw new Error(
      `Illegal assignment status transition: ${request.previousStatus} -> ${request.nextStatus}`,
    );
  }

  if (!request.reasonCode?.trim()) {
    throw new Error("Status transition requires reasonCode");
  }

  if (!request.occurredAt?.trim()) {
    throw new Error("Status transition requires occurredAt");
  }

  if (
    Number.isNaN(new Date(request.occurredAt).getTime())
  ) {
    throw new Error("Status transition requires a valid occurredAt timestamp");
  }

  if (request.actorType === "teacher" && !request.actorId?.trim()) {
    throw new Error("Teacher status overrides require actorId");
  }
}

export function shouldMarkMissed({
  status,
  dueAt,
  latestAttemptStatus,
  now = new Date(),
}: MissedStatusInput): boolean {
  if (status !== "assigned" && status !== "started") {
    return false;
  }

  if (status === "started" && latestAttemptStatus === "in_progress") {
    return false;
  }

  if (!dueAt) {
    return false;
  }

  const dueDate = new Date(dueAt);
  const nowDate = new Date(now);

  if (Number.isNaN(dueDate.getTime()) || Number.isNaN(nowDate.getTime())) {
    return false;
  }

  return dueDate.getTime() < nowDate.getTime();
}
