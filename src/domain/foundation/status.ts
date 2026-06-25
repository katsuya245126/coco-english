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

export function canTransitionAssignmentStatus(): boolean {
  return false;
}

export function assertTransitionRequest(): void {
  throw new Error("Not implemented");
}

export function shouldMarkMissed(): boolean {
  return false;
}
