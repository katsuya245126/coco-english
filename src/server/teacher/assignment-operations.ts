import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  compareSubmissionRecency,
  countIncompleteItems,
  groupIncompleteAssignments,
  isSubmissionPendingReview,
  type ClassReviewPolicy,
} from "@/domain/teacher/assignment-operations";
import { assertTransitionRequest, type AssignmentStudentStatus } from "@/domain/foundation/status";

type Client = ReturnType<typeof createSupabaseServiceClient>;

export type TeacherReviewRow = {
  attemptId: string; assignmentStudentId: string; studentName: string;
  assignmentTitle: string; className: string; receivedAt: string;
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

type RawRow = Record<string, any>;
const one = (value: any) => Array.isArray(value) ? value[0] : value;

function mapRow(row: RawRow): TeacherReviewRow & { status: AssignmentStudentStatus; reviewedAt: string | null; reviewPolicy: ClassReviewPolicy; isLatestAttempt: boolean } {
  const assignmentStudent = one(row.assignment_students);
  const assignment = one(assignmentStudent.assignments);
  const klass = one(assignment.classes);
  const receipt = one(row.submission_review_receipts) ?? {};
  return {
    attemptId: row.id,
    assignmentStudentId: assignmentStudent.id,
    studentName: one(assignmentStudent.students).display_name,
    assignmentTitle: assignment.title,
    className: klass.name,
    receivedAt: row.received_at ?? assignmentStudent.submitted_at ?? row.completed_at,
    firstViewedAt: receipt.first_viewed_at ?? null,
    reviewedAt: receipt.reviewed_at ?? null,
    needsReviewReason: row.needs_review_reason ?? null,
    reviewPolicy: klass.review_policy,
    isLatestAttempt: assignmentStudent.latest_attempt_id === row.id,
    status: assignmentStudent.status,
  };
}

async function loadOwnedAttempts(teacherId: string, client: Client = createSupabaseServiceClient()) {
  const result = await client.from("attempts").select(`
    id, status, completed_at, needs_review_reason,
    assignment_students!attempts_assignment_student_id_fkey!inner(
      id, status, submitted_at, latest_attempt_id,
      students!inner(display_name),
      assignments!inner(id, title, due_at, classes!inner(id, name, teacher_id, review_policy))
    ),
    submission_review_receipts(first_viewed_at, reviewed_at)
  `).eq("assignment_students.assignments.classes.teacher_id", teacherId);
  if (result.error) throw new Error(`Unable to load teacher assignment operations: ${result.error.message}`);
  return ((result.data ?? []) as RawRow[]).map(mapRow);
}

export async function listNeedsReviewForTeacher(input: { teacherId: string }, client?: Client): Promise<TeacherReviewRow[]> {
  const rows = await loadOwnedAttempts(input.teacherId, client);
  return rows.filter((row) => isSubmissionPendingReview(row)).sort(compareSubmissionRecency).map(({ status: _s, reviewedAt: _r, reviewPolicy: _p, isLatestAttempt: _l, ...row }) => row);
}

export async function listActivityForTeacher(input: { teacherId: string; offset?: number; limit?: number }, client?: Client): Promise<TeacherActivityRow[]> {
  const rows = (await loadOwnedAttempts(input.teacherId, client)).filter((row) => row.isLatestAttempt).sort(compareSubmissionRecency);
  return rows.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 50)).map(({ reviewPolicy: _p, isLatestAttempt: _l, ...row }) => row);
}

export async function listIncompleteForTeacher(input: { teacherId: string; now?: Date }, client: Client = createSupabaseServiceClient()) {
  const result = await client.from("assignment_students").select(`id, status, students!inner(display_name), assignments!inner(id, title, due_at, classes!inner(id, name, teacher_id))`).eq("assignments.classes.teacher_id", input.teacherId).in("status", ["assigned", "started", "missed"]);
  if (result.error) throw new Error(`Unable to load incomplete assignments: ${result.error.message}`);
  const groups = groupIncompleteAssignments(((result.data ?? []) as RawRow[]).map((row) => { const assignment = one(row.assignments); const klass = one(assignment.classes); return { id: row.id, assignmentId: assignment.id, assignmentTitle: assignment.title, status: row.status, dueAt: assignment.due_at, studentName: one(row.students).display_name, classId: klass.id, className: klass.name }; }) as TeacherIncompleteRow[], input.now ?? new Date());
  return { groups, itemCount: countIncompleteItems(groups) };
}

export async function getTeacherQueueSnapshot(input: { teacherId: string }, client?: Client): Promise<TeacherQueueSnapshot> {
  const rows = await listNeedsReviewForTeacher(input, client);
  const newest = rows[0];
  return { version: 1, needsReviewCount: rows.length, unreadCount: rows.filter((row) => row.firstViewedAt === null).length, newest: newest ? { attemptId: newest.attemptId, studentName: newest.studentName, assignmentTitle: newest.assignmentTitle, className: newest.className, href: `/teacher/evidence/${newest.attemptId}` } : null };
}

async function loadOwnedAttempt(input: { teacherId: string; attemptId: string }, client: Client) {
  const result = await client.from("attempts").select(`id, status, assignment_students!attempts_assignment_student_id_fkey!inner(id, status, latest_attempt_id, assignments!inner(classes!inner(teacher_id)))`).eq("id", input.attemptId).eq("assignment_students.assignments.classes.teacher_id", input.teacherId).maybeSingle();
  if (result.error) throw new Error(`Unable to authorize teacher submission: ${result.error.message}`);
  return result.data as RawRow | null;
}

export async function markSubmissionViewed(input: { teacherId: string; attemptId: string }, client: Client = createSupabaseServiceClient()) {
  if (!await loadOwnedAttempt(input, client)) return { ok: false as const, error: "not_found" as const };
  const now = new Date().toISOString();
  const result = await client.from("submission_review_receipts").upsert({ teacher_id: input.teacherId, attempt_id: input.attemptId, first_viewed_at: now }, { onConflict: "teacher_id,attempt_id", ignoreDuplicates: true });
  if (result.error) return { ok: false as const, error: "db_error" as const };
  return { ok: true as const };
}

export async function markSubmissionReviewed(input: { teacherId: string; attemptId: string }, client: Client = createSupabaseServiceClient()) {
  const row = await loadOwnedAttempt(input, client); if (!row) return { ok: false as const, error: "not_found" as const };
  const ast = one(row.assignment_students);
  if (!(["completed", "teacher_review"].includes(ast.status) && ["completed", "teacher_review"].includes(row.status))) return { ok: false as const, error: "invalid_transition" as const };
  const result = await client.rpc("mark_submission_reviewed", { p_teacher_id: input.teacherId, p_attempt_id: input.attemptId });
  return result.error || result.data !== "ok" ? { ok: false as const, error: result.data === "invalid_status" ? "invalid_transition" as const : "db_error" as const } : { ok: true as const };
}

export async function reopenSubmissionReview(input: { teacherId: string; attemptId: string }, client: Client = createSupabaseServiceClient()) {
  if (!await loadOwnedAttempt(input, client)) return { ok: false as const, error: "not_found" as const };
  const result = await client.from("submission_review_receipts").update({ reviewed_at: null }).eq("teacher_id", input.teacherId).eq("attempt_id", input.attemptId);
  return result.error ? { ok: false as const, error: "db_error" as const } : { ok: true as const };
}

export async function requestSubmissionRetry(input: { teacherId: string; attemptId: string; reasonNote?: string }, client: Client = createSupabaseServiceClient()) {
  const row = await loadOwnedAttempt(input, client); if (!row) return { ok: false as const, error: "not_found" as const };
  const ast = one(row.assignment_students);
  try { assertTransitionRequest({ previousStatus: ast.status, nextStatus: "needs_retry", actorType: "teacher", actorId: input.teacherId, reasonCode: "teacher_requested_retry", occurredAt: new Date().toISOString() }); } catch { return { ok: false as const, error: "invalid_transition" as const }; }
  const result = await client.rpc("request_submission_retry", { p_teacher_id: input.teacherId, p_attempt_id: input.attemptId, p_reason_note: input.reasonNote ?? "" });
  return result.error || result.data !== "ok" ? { ok: false as const, error: result.data === "invalid_status" ? "invalid_transition" as const : "db_error" as const } : { ok: true as const };
}

export async function updateClassReviewPolicy(input: { teacherId: string; classId: string; reviewPolicy: ClassReviewPolicy }, client: Client = createSupabaseServiceClient()) {
  const result = await client.from("classes").update({ review_policy: input.reviewPolicy }).eq("id", input.classId).eq("teacher_id", input.teacherId).select("id").maybeSingle();
  return result.error ? { ok: false as const, error: "db_error" as const } : result.data ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
}
