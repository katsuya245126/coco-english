import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  compareSubmissionRecency,
  countIncompleteItems,
  groupIncompleteAssignments,
  isSubmissionPendingReview,
  type ClassReviewPolicy,
} from "@/domain/teacher/assignment-operations";
import { assertTransitionRequest, type AssignmentStudentStatus } from "@/domain/foundation/status";
import {
  getOwnedAssignmentStudentForTeacher,
  listOwnedAssignmentProgressForClass,
  listOwnedAssignmentStudentsForTeacher,
  listOwnedAttemptsForTeacher,
  updateOwnedClassReviewPolicy,
} from "@/server/teacher/teacher-owned-queries";

type Client = ReturnType<typeof createSupabaseServiceClient>;

export type TeacherReviewRow = {
  attemptId: string; assignmentStudentId: string; studentName: string;
  assignmentTitle: string; className: string; classId: string; receivedAt: string;
  firstViewedAt: string | null; needsReviewReason: string | null;
};

export type TeacherActivityRow = TeacherReviewRow & {
  status: AssignmentStudentStatus; reviewedAt: string | null;
};

type TeacherIncompleteRow = {
  id: string; assignmentId: string; assignmentTitle: string; status: "assigned" | "started" | "missed";
  dueAt: string | null; studentName: string; classId: string; className: string;
};
export type IncompleteAssignmentGroup = ReturnType<typeof groupIncompleteAssignments<TeacherIncompleteRow>>[number];
export type TeacherQueueSnapshot = {
  version: 1; needsReviewCount: number; unreadCount: number;
  newest: { attemptId: string; studentName: string; assignmentTitle: string; className: string; href: string } | null;
};

type RawValue = string | number | boolean | null | RawRow | RawRow[];
interface RawRow { [key: string]: RawValue | undefined }
const one = (value: RawValue | undefined): RawRow => {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? item as RawRow : {};
};

type OwnedAttemptRow = TeacherReviewRow & {
  status: AssignmentStudentStatus;
  attemptStatus: string;
  reviewedAt: string | null;
  isLatestAttempt: boolean;
  reviewPolicy: ClassReviewPolicy;
};

function mapRow(row: RawRow): OwnedAttemptRow {
  const assignmentStudent = one(row.assignment_students);
  const assignment = one(assignmentStudent.assignments);
  const klass = one(assignment.classes);
  const receipt = one(row.submission_review_receipts) ?? {};
  return {
    attemptId: String(row.id),
    assignmentStudentId: String(assignmentStudent.id),
    studentName: String(one(assignmentStudent.students).display_name),
    assignmentTitle: String(assignment.title),
    className: String(klass.name),
    classId: String(klass.id),
    receivedAt: String(row.received_at ?? assignmentStudent.submitted_at ?? row.completed_at),
    firstViewedAt: receipt.first_viewed_at ? String(receipt.first_viewed_at) : null,
    reviewedAt: receipt.reviewed_at ? String(receipt.reviewed_at) : null,
    needsReviewReason: row.needs_review_reason ? String(row.needs_review_reason) : null,
    isLatestAttempt: assignmentStudent.latest_attempt_id === row.id,
    status: assignmentStudent.status as AssignmentStudentStatus,
    attemptStatus: String(row.status),
    reviewPolicy: klass.review_policy as ClassReviewPolicy,
  };
}

async function loadOwnedAttempts(teacherId: string, client: Client = createSupabaseServiceClient()) {
  const result = await listOwnedAttemptsForTeacher({ teacherId }, client);
  if (result.error) throw new Error(`Unable to load teacher assignment operations: ${result.error.message}`);
  return (result.data as RawRow[]).map(mapRow);
}

export async function listNeedsReviewForTeacher(input: { teacherId: string }, client?: Client): Promise<TeacherReviewRow[]> {
  const rows = await loadOwnedAttempts(input.teacherId, client);
  return rows.filter((row) => isSubmissionPendingReview(row)).sort(compareSubmissionRecency).map(({ status: _s, attemptStatus: _a, reviewedAt: _r, isLatestAttempt: _l, reviewPolicy: _p, ...row }) => row);
}

export async function listActivityForTeacher(input: { teacherId: string; offset?: number; limit?: number }, client?: Client): Promise<TeacherActivityRow[]> {
  const rows = (await loadOwnedAttempts(input.teacherId, client)).filter((row) => row.isLatestAttempt).sort(compareSubmissionRecency);
  return rows.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 50)).map(({ isLatestAttempt: _l, attemptStatus: _a, reviewPolicy: _p, ...row }) => row);
}

export async function listIncompleteForTeacher(input: { teacherId: string; now?: Date }, client: Client = createSupabaseServiceClient()) {
  const result = await listOwnedAssignmentStudentsForTeacher({
    teacherId: input.teacherId,
    statuses: ["assigned", "started", "missed"],
    onlyUndismissed: true,
  }, client);
  if (result.error) throw new Error(`Unable to load incomplete assignments: ${result.error.message}`);
  const groups = groupIncompleteAssignments((result.data as RawRow[]).map((row) => { const assignment = one(row.assignments); const klass = one(assignment.classes); return { id: String(row.id), assignmentId: String(assignment.id), assignmentTitle: String(assignment.title), status: row.status as TeacherIncompleteRow["status"], dueAt: assignment.due_at ? String(assignment.due_at) : null, studentName: String(one(row.students).display_name), classId: String(klass.id), className: String(klass.name) }; }) as TeacherIncompleteRow[], input.now ?? new Date());
  return { groups, itemCount: countIncompleteItems(groups) };
}

export type AssignmentProgress = { completed: number; teacherReview: number; started: number; needsRetry: number; assigned: number; missed: number; total: number };

export async function listAssignmentProgressForClass(input: { teacherId: string; classId: string }, client: Client = createSupabaseServiceClient()): Promise<Map<string, AssignmentProgress>> {
  const result = await listOwnedAssignmentProgressForClass({
    ...input,
    excludeCanceled: true,
  }, client);
  if (result.error) throw new Error(`Unable to load assignment progress: ${result.error.message}`);
  const progress = new Map<string, AssignmentProgress>();
  for (const raw of result.data) {
    const assignmentId = String(raw.assignment_id);
    const entry = progress.get(assignmentId) ?? { completed: 0, teacherReview: 0, started: 0, needsRetry: 0, assigned: 0, missed: 0, total: 0 };
    entry.total += 1;
    const status = String(raw.status);
    if (status === "completed") entry.completed += 1;
    else if (status === "teacher_review") entry.teacherReview += 1;
    else if (status === "started") entry.started += 1;
    else if (status === "needs_retry") entry.needsRetry += 1;
    else if (status === "assigned") entry.assigned += 1;
    else if (status === "missed") entry.missed += 1;
    progress.set(assignmentId, entry);
  }
  return progress;
}

export async function getTeacherQueueSnapshot(input: { teacherId: string }, client?: Client): Promise<TeacherQueueSnapshot> {
  const rows = await listNeedsReviewForTeacher(input, client);
  const newest = rows[0];
  return { version: 1, needsReviewCount: rows.length, unreadCount: rows.filter((row) => row.firstViewedAt === null).length, newest: newest ? { attemptId: newest.attemptId, studentName: newest.studentName, assignmentTitle: newest.assignmentTitle, className: newest.className, href: `/teacher/evidence/${newest.attemptId}` } : null };
}

export async function updateClassReviewPolicy(
  input: { teacherId: string; classId: string; reviewPolicy: ClassReviewPolicy },
  client: Client = createSupabaseServiceClient(),
) {
  const result = await updateOwnedClassReviewPolicy(input, client);
  if (result.error) return { ok: false as const, error: "db_error" as const };
  if (!result.data) return { ok: false as const, error: "not_found" as const };
  return { ok: true as const };
}

async function loadOwnedAssignmentStudent(input: { teacherId: string; assignmentStudentId: string }, client: Client) {
  const result = await getOwnedAssignmentStudentForTeacher(input, client);
  if (result.error) throw new Error(`Unable to authorize teacher assignment student: ${result.error.message}`);
  return result.data as RawRow | null;
}

export type TeacherMutationResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "not_allowed" | "incomplete" | "failed" };

export type AssignedHomeworkChange =
  | { action: "request_retry"; reasonNote?: string }
  | { action: "dismiss"; reason?: string }
  | { action: "undo_dismiss" };

export type AttemptReviewAction =
  | "mark_viewed"
  | "mark_reviewed"
  | "reopen_review";

const attemptReviewRpc = {
  mark_viewed: "mark_submission_viewed",
  mark_reviewed: "mark_submission_reviewed",
  reopen_review: "reopen_submission_review",
} as const;
const uuidSchema = z.string().uuid();

export async function changeAttemptReview(input: {
  teacherId: string;
  attemptId: string;
  action: AttemptReviewAction;
}): Promise<TeacherMutationResult> {
  const rpcName = attemptReviewRpc[input.action];
  if (!rpcName || !uuidSchema.safeParse(input.teacherId).success || !uuidSchema.safeParse(input.attemptId).success) {
    return { ok: false, error: "not_allowed" };
  }

  const result = await createSupabaseServiceClient().rpc(rpcName, {
    p_teacher_id: input.teacherId,
    p_attempt_id: input.attemptId,
  });

  if (result.error) return { ok: false, error: "failed" };
  if (result.data === "ok") return { ok: true };
  if (result.data === "not_found") return { ok: false, error: "not_found" };
  if (result.data === "not_complete") return { ok: false, error: "incomplete" };
  if (result.data === "invalid_status") return { ok: false, error: "not_allowed" };
  return { ok: false, error: "failed" };
}

const incompleteStatuses = new Set(["assigned", "started", "missed"]);

export async function changeAssignedHomework(
  input: {
    teacherId: string;
    assignedHomeworkId: string;
  } & AssignedHomeworkChange,
): Promise<TeacherMutationResult> {
  if (
    !uuidSchema.safeParse(input.teacherId).success ||
    !uuidSchema.safeParse(input.assignedHomeworkId).success ||
    !["request_retry", "dismiss", "undo_dismiss"].includes(input.action)
  ) {
    return { ok: false, error: "not_allowed" };
  }

  const client = createSupabaseServiceClient();
  let row: RawRow | null;
  try {
    row = await loadOwnedAssignmentStudent({
      teacherId: input.teacherId,
      assignmentStudentId: input.assignedHomeworkId,
    }, client);
  } catch {
    return { ok: false, error: "failed" };
  }
  if (!row) return { ok: false, error: "not_found" };

  const status = row.status as AssignmentStudentStatus;
  const latestAttemptId = typeof row.latest_attempt_id === "string"
    ? row.latest_attempt_id
    : null;
  let result;

  try {
    if (input.action === "request_retry") {
      if (!latestAttemptId) return { ok: false, error: "not_allowed" };
      try {
        assertTransitionRequest({
          previousStatus: status,
          nextStatus: "needs_retry",
          actorType: "teacher",
          actorId: input.teacherId,
          reasonCode: "teacher_requested_retry",
          occurredAt: new Date().toISOString(),
        });
      } catch {
        return { ok: false, error: "not_allowed" };
      }
      result = await client.rpc("request_submission_retry", {
        p_teacher_id: input.teacherId,
        p_attempt_id: latestAttemptId,
        p_reason_note: input.reasonNote ?? "",
      });
    } else {
      const isIncomplete = incompleteStatuses.has(status);
      const isDismissed = row.dismissed_at !== null;
      if (!isIncomplete || (input.action === "dismiss" ? isDismissed : !isDismissed)) {
        return { ok: false, error: "not_allowed" };
      }

      if (input.action === "dismiss") {
        result = latestAttemptId
          ? await client.rpc("dismiss_assignment_student", {
              p_teacher_id: input.teacherId,
              p_attempt_id: latestAttemptId,
              p_reason: input.reason ?? "",
            })
          : await client.rpc("dismiss_assignment_student_by_id", {
              p_teacher_id: input.teacherId,
              p_assignment_student_id: input.assignedHomeworkId,
              p_reason: input.reason ?? "",
            });
      } else {
        result = latestAttemptId
          ? await client.rpc("undo_dismiss_assignment_student", {
              p_teacher_id: input.teacherId,
              p_attempt_id: latestAttemptId,
            })
          : await client.rpc("undo_dismiss_assignment_student_by_id", {
              p_teacher_id: input.teacherId,
              p_assignment_student_id: input.assignedHomeworkId,
            });
      }
    }
  } catch {
    return { ok: false, error: "failed" };
  }

  if (result.error) return { ok: false, error: "failed" };
  if (result.data === "ok") return { ok: true };
  if (result.data === "not_found") return { ok: false, error: "not_found" };
  if (result.data === "invalid_status") return { ok: false, error: "not_allowed" };
  return { ok: false, error: "failed" };
}
