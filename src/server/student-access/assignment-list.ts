import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { missionSnapshotSchema } from "@/domain/mission/schemas";

// Student assignment-list read service (FLOW-01, D-13, D-14).
//
// Pure read — never mutates assignment_students rows. The "closed" display
// status is computed at read-time from due_at without updating the DB status
// column (D-14: closed/expired is a display concern, not a stored transition).
//
// Uses the service-role client because students have no Supabase Auth session.
// SECURITY: server-only by construction (service-role client). Never import
// from a "use client" module.

export type AssignmentDisplayStatus = "start" | "continue" | "done" | "closed";

export type StudentAssignmentListItem = {
  assignmentStudentId: string;
  title: string;
  dueAt: string | null;
  turnCount: number;
  displayStatus: AssignmentDisplayStatus;
};

/**
 * Reads this student's assignment_students rows joined to assignments.
 * Returns a typed array with read-time display status and snapshot-derived
 * turn count. Filters out items whose snapshot cannot be parsed (defensive).
 *
 * @param studentId - The student's UUID from the unlock cookie (T-04-03).
 */
export async function listStudentAssignments(
  studentId: string,
): Promise<StudentAssignmentListItem[]> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("assignment_students")
    .select(
      `
      id,
      status,
      assignments!inner (
        id,
        title,
        mission_snapshot,
        due_at
      )
    `,
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  const now = new Date();
  const items: StudentAssignmentListItem[] = [];

  for (const row of data) {
    // Supabase returns the joined record as an object (inner join, single FK).
    const assignment = row.assignments as unknown as {
      id: string;
      title: string;
      mission_snapshot: unknown;
      due_at: string | null;
    };

    // Parse the snapshot to extract requiredTurns. If parsing fails, skip the
    // item rather than crashing the page — a broken snapshot should not take
    // down the entire list.
    const parsed = missionSnapshotSchema.safeParse(assignment.mission_snapshot);
    if (!parsed.success) {
      continue;
    }

    const turnCount = parsed.data.requiredTurns;
    const dueAt = assignment.due_at;

    // Compute read-time display status (D-14: no row mutation).
    let displayStatus: AssignmentDisplayStatus;

    const isPastDue =
      dueAt !== null && new Date(dueAt).getTime() < now.getTime();

    if (isPastDue && row.status !== "completed") {
      // Expired and not completed -> display as closed (read-only, D-14).
      displayStatus = "closed";
    } else if (row.status === "assigned") {
      displayStatus = "start";
    } else if (row.status === "started") {
      displayStatus = "continue";
    } else if (row.status === "completed") {
      displayStatus = "done";
    } else if (row.status === "needs_retry") {
      // Teacher has sent the assignment for retry — reopen for the student (D-10).
      displayStatus = "start";
    } else {
      // Any other status (missed, teacher_review) that is not past due —
      // display as closed since the student cannot act on it.
      displayStatus = "closed";
    }

    items.push({
      assignmentStudentId: row.id,
      title: assignment.title,
      dueAt,
      turnCount,
      displayStatus,
    });
  }

  return items;
}
