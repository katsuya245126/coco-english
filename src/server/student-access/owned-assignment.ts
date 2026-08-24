import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/db/types";
import { interpretMissionSnapshot } from "@/domain/mission/mission-snapshot";
import type { MissionSnapshot } from "@/domain/mission/schemas";

// Owned-assignment proof seam (T-04-12 / V4 ownership).
//
// The single implementation of the assignment-read half of the student-access
// security invariant: prove ownership by filtering on BOTH the row id and the
// server-verified student_id, guard against canceled assignments, and
// interpret the frozen mission snapshot in exactly one way. Routes derive
// `studentId` from the signed unlock cookie; service-layer entry points pass
// through the value their own caller proved. Caller-supplied IDs alone are
// never authorization — a row only comes back when the database itself
// contains that student_id.
//
// Known exception (documented in issue #67): audio-upload.ts keeps its
// concurrent lookup until its planned restructure lands.
//
// A missing row and a canceled assignment collapse into ONE generic failure
// so cancellation state can never leak to the client. Admission rules that
// are specific to a flow (recordable statuses for entering the mission page,
// started/in_progress for uploads) deliberately stay with each caller as
// explicit policy on the returned `status`.

export type OwnedAssignmentStudent = {
  id: string;
  assignmentId: string;
  status: Database["public"]["Tables"]["assignment_students"]["Row"]["status"];
  latestAttemptId: string | null;
  attemptCount: number | null;
  highestHintLevel: number | null;
  submittedAt: string | null;
  canceledAt: string | null;
  assignmentTitle: string | null;
  /** Parsed only when the stored snapshot interprets as `complete`. */
  snapshot: MissionSnapshot | null;
};

export type OwnedAssignmentStudentResult =
  | { ok: true; owned: OwnedAssignmentStudent }
  | { ok: false; error: "not_found_or_canceled" | "db_error" };

type OwnedAttempt = {
  id: string;
  assignment_student_id: string;
  status: "in_progress";
};

export type OwnedInProgressAttemptResult =
  | { ok: true; owned: OwnedAssignmentStudent; attempt: OwnedAttempt }
  | { ok: false; error: "not_found_or_canceled" | "db_error" };

type AssignmentStudentStatus =
  Database["public"]["Tables"]["assignment_students"]["Row"]["status"];

type OwnedRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  status: AssignmentStudentStatus;
  latest_attempt_id: string | null;
  attempt_count: number | null;
  highest_hint_level: number | null;
  submitted_at: string | null;
  assignments:
    | {
        title: string;
        mission_snapshot?: unknown;
        canceled_at?: string | null;
      }
    | Array<{
        title: string;
        mission_snapshot?: unknown;
        canceled_at?: string | null;
      }>
    | null;
};

const OWNED_ASSIGNMENT_COLUMNS =
  "id, assignment_id, student_id, status, latest_attempt_id, attempt_count, highest_hint_level, submitted_at, assignments(title, mission_snapshot, canceled_at)";

function toOwned(
  row: OwnedRow,
): OwnedAssignmentStudent {
  const assignment = Array.isArray(row.assignments)
    ? row.assignments[0]
    : row.assignments;
  const interpretation = interpretMissionSnapshot(
    assignment?.mission_snapshot,
  );

  return {
    id: row.id,
    assignmentId: row.assignment_id,
    status: row.status,
    latestAttemptId: row.latest_attempt_id,
    attemptCount: row.attempt_count,
    highestHintLevel: row.highest_hint_level,
    submittedAt: row.submitted_at,
    canceledAt: assignment?.canceled_at ?? null,
    assignmentTitle: assignment?.title ?? null,
    snapshot:
      interpretation.kind === "complete" ? interpretation.snapshot : null,
  };
}

/**
 * Prove that this assignment_students row exists, belongs to `studentId`,
 * and is not canceled — then hand back its owned state with the parsed
 * mission snapshot. The one place the ownership query lives. Returns a
 * Result union; despite the `require` prefix it never throws.
 */
export async function requireOwnedAssignmentStudent(input: {
  studentId: string;
  assignmentStudentId: string;
}): Promise<OwnedAssignmentStudentResult> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("assignment_students")
    .select(OWNED_ASSIGNMENT_COLUMNS)
    .eq("id", input.assignmentStudentId)
    .eq("student_id", input.studentId)
    .maybeSingle();

  if (error) return { ok: false, error: "db_error" };
  if (!data) return { ok: false, error: "not_found_or_canceled" };

  const owned = toOwned(data as OwnedRow);
  if (owned.canceledAt) return { ok: false, error: "not_found_or_canceled" };

  return { ok: true, owned };
}

/**
 * Prove assignment ownership and that the requested attempt belongs to it and
 * is still active before an attempt-turn mutation. Missing, foreign, canceled,
 * and stale attempts intentionally share the generic not-found result.
 */
export async function requireOwnedInProgressAttempt(input: {
  studentId: string;
  assignmentStudentId: string;
  attemptId: string;
}): Promise<OwnedInProgressAttemptResult> {
  const ownedResult = await requireOwnedAssignmentStudent(input);
  if (!ownedResult.ok) return ownedResult;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("attempts")
    .select("id, assignment_student_id, status")
    .eq("id", input.attemptId)
    .eq("assignment_student_id", input.assignmentStudentId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (error) return { ok: false, error: "db_error" };
  if (!data || data.status !== "in_progress") {
    return { ok: false, error: "not_found_or_canceled" };
  }

  return {
    ok: true,
    owned: ownedResult.owned,
    attempt: data as OwnedAttempt,
  };
}
