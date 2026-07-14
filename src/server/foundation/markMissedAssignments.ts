import { assertTransitionRequest, shouldMarkMissed } from "@/domain/foundation/status";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export type MarkMissedAssignmentsResult = {
  markedCount: number;
  assignmentStudentIds: string[];
};

export async function markMissedAssignments(): Promise<MarkMissedAssignmentsResult> {
  const supabase = createSupabaseServiceClient();
  const now = new Date();

  const rows = await supabase
    .from("assignment_students")
    .select("id, status, latest_attempt_id, assignments!inner(due_at), latest_attempt:attempts!assignment_students_latest_attempt_fk(status)")
    .in("status", ["assigned", "started"]);

  if (rows.error) {
    throw new Error(`Unable to load overdue assignments: ${rows.error.message}`);
  }

  const candidates = rows.data.filter((row) => {
    const assignment = Array.isArray(row.assignments)
      ? row.assignments[0]
      : row.assignments;
    const latestAttempt = Array.isArray(row.latest_attempt)
      ? row.latest_attempt[0]
      : row.latest_attempt;

    return shouldMarkMissed({
      status: row.status,
      dueAt: assignment?.due_at ?? null,
      latestAttemptStatus: latestAttempt?.status ?? null,
      now,
    });
  });
  const claimedIds: string[] = [];

  for (const row of candidates) {
    assertTransitionRequest({
      previousStatus: row.status,
      nextStatus: "missed",
      actorType: "job",
      reasonCode: "due_date_elapsed",
      occurredAt: now.toISOString(),
    });

    let updateQuery = supabase
      .from("assignment_students")
      .update({ status: "missed" })
      .eq("id", row.id)
      .eq("status", row.status);

    updateQuery = row.latest_attempt_id === null
      ? updateQuery.is("latest_attempt_id", null)
      : updateQuery.eq("latest_attempt_id", row.latest_attempt_id);

    const update = await updateQuery.select("id").maybeSingle();

    if (update.error) {
      throw new Error(
        `Unable to mark assignment student ${row.id} missed: ${update.error.message}`,
      );
    }

    if (!update.data) {
      continue;
    }

    const event = await supabase.from("assignment_status_events").insert({
      assignment_student_id: row.id,
      previous_status: row.status,
      next_status: "missed",
      actor_type: "job",
      reason_code: "due_date_elapsed",
      metadata: { job: "markMissedAssignments", evaluatedAt: now.toISOString() },
    });

    if (event.error) {
      throw new Error(
        `Unable to audit missed assignment student ${row.id}: ${event.error.message}`,
      );
    }

    claimedIds.push(row.id);
  }

  return {
    markedCount: claimedIds.length,
    assignmentStudentIds: claimedIds,
  };
}
